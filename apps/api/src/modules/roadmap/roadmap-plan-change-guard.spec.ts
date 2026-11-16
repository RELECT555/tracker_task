import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/**
 * Guard for the plan change log (docs/specs/plan-change-log.md §6).
 *
 * Scans the API sources for writes to `roadmapAllocation` / `roadmapPeriodAllocation`
 * that can touch hours, the person, the quarter or the months, and requires every such
 * place (file + enclosing method) to be listed either as LOGGED (reaches the journal) or
 * as SYNC_ONLY (does not change the plan). A new write that is in neither list fails.
 */

/** `<file relative to modules/>#<method>` of places whose writes reach the journal. */
const LOGGED = new Set([
  // Paths 1, 2: PUT /roadmap/allocations and AI apply.
  'roadmap/roadmap-allocation.service.ts#saveAllocation',
  // Path 3: monthly split of a quarter.
  'roadmap/roadmap-allocation.service.ts#saveAllocationQuarter',
  // Path 4: rebalance.
  'roadmap/roadmap-allocation.service.ts#rebalanceAllocations',
  // Path 5: role hours of a Feature cell, divided between the role allocations.
  'roadmap/roadmap-azure-sync.service.ts#setRoleHours',
  // Path 6: DELETE /roadmap/allocations/:id.
  'roadmap/roadmap-allocation-azure.service.ts#deleteAllocation',
  // Paths 7, 8: Azure edits applied to the plan (accept button, import reconcile).
  'roadmap/roadmap-allocation-azure.service.ts#applyAzure',
  // Path 9: the estimate Azure corrected on push (`finish` with acceptedHours inside
  // syncAllocation) is logged by recordEstimateFromAzure; so are the months of shrinkPeriods.
  'roadmap/roadmap-azure-sync.service.ts#syncAllocation',
  'roadmap/roadmap-azure-sync.service.ts#shrinkPeriods',
]);

/** Writes that only touch synchronization fields; the reason is the value. */
const SYNC_ONLY = new Map<string, string>([
  // Add an entry only when the write cannot change hours, person, quarter or months.
  // The scan also reads `data: { ...this.pendingUpdate }` as "cannot be proven" and lists these.
  [
    'roadmap/roadmap-azure-sync.service.ts#pushProject',
    'marks allocations pending for sending (pendingUpdate), plan fields untouched',
  ],
  [
    'roadmap/roadmap-azure-sync.service.ts#pushAllocation',
    'marks one allocation pending for sending (pendingUpdate), plan fields untouched',
  ],
  [
    'roadmap/roadmap-azure-sync.service.ts#recoverPending',
    'releases stale claims and re-queues sending, plan fields untouched',
  ],
  [
    'roadmap/roadmap-azure-sync.service.ts#createAllocationTask',
    'marks the allocation pending before creating its Task, plan fields untouched',
  ],
  // Not listed because the scan sees only literal sync fields in them: the claim and the
  // acceptedHours-free `finish` (both inside syncAllocation, which is LOGGED above) and
  // handleDeletedWorkItem (clears azureTaskId / sync status only).
]);

const MODULES_DIR = join(__dirname, '..');
const WRITE_CALL =
  /\.(roadmapAllocation|roadmapPeriodAllocation)\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\(/g;
const PLAN_FIELDS = /estimatedHours|personExternalId|quarterKey|hours:/;
const METHOD_START =
  /^ {2}(?:(?:public|private|protected|static|async)\s+)*([A-Za-z_$][\w$]*)\s*(?:<[^>]*>)?\(/;
const FUNCTION_START = /^(?:export\s+)?(?:async\s+)?function\s+([\w$]+)/;

interface WriteSite {
  key: string;
  location: string;
  method: string;
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')
      ? [path]
      : [];
  });
}

/** Text inside the bracket at `open` up to its match (brackets in strings are not special-cased). */
function balanced(text: string, open: number): string {
  const closing = text[open] === '(' ? ')' : '}';
  let depth = 0;
  for (let index = open; index < text.length; index += 1) {
    if (text[index] === text[open]) depth += 1;
    if (text[index] === closing) depth -= 1;
    if (depth === 0) return text.slice(open + 1, index);
  }
  return text.slice(open + 1);
}

/**
 * True when the write cannot be proven to leave the plan alone: its `data` is not an object
 * literal, or the literal spreads something into it (`finish` takes `estimatedHours` this way).
 */
function hasOpaqueData(args: string): boolean {
  const data = /\bdata\b\s*(:\s*)?/.exec(args);
  if (!data) return false;
  const next = data.index + data[0].length;
  if (!data[1] || args[next] !== '{') return true;
  return /\.\.\.\s*[\w$]/.test(balanced(args, next));
}

function enclosingMethod(lines: string[], line: number): string {
  for (let index = line; index >= 0; index -= 1) {
    const match =
      METHOD_START.exec(lines[index]) ?? FUNCTION_START.exec(lines[index]);
    if (match) return match[1];
  }
  return '<top level>';
}

function findWriteSites(): WriteSite[] {
  const sites: WriteSite[] = [];
  for (const file of sourceFiles(MODULES_DIR)) {
    const source = readFileSync(file, 'utf8');
    const lines = source.split(/\r?\n/);
    const name = relative(MODULES_DIR, file).split(sep).join('/');
    for (const match of source.matchAll(WRITE_CALL)) {
      const [call, model, operation] = match;
      const args = balanced(source, match.index + call.length - 1);
      const removesAllocation =
        model === 'roadmapAllocation' && operation.startsWith('delete');
      // A period write always concerns months; an allocation write only when it can touch the plan.
      const relevant =
        model === 'roadmapPeriodAllocation' ||
        removesAllocation ||
        PLAN_FIELDS.test(args) ||
        hasOpaqueData(args);
      if (!relevant) continue;
      const line = source.slice(0, match.index).split(/\r?\n/).length - 1;
      const method = enclosingMethod(lines, line);
      sites.push({
        key: `${name}#${method}`,
        location: `${name}:${line + 1}`,
        method,
      });
    }
  }
  return sites;
}

describe('plan change log guard', () => {
  const sites = findWriteSites();

  it('finds the known write sites (the scan itself works)', () => {
    expect(sites.length).toBeGreaterThan(0);
    expect(sites.map((site) => site.key)).toContain(
      'roadmap/roadmap-allocation.service.ts#saveAllocation',
    );
  });

  it('every allocation write is either logged or sync-only', () => {
    const unknown = sites
      .filter((site) => !LOGGED.has(site.key) && !SYNC_ONLY.has(site.key))
      .map(
        (site) =>
          `Новое изменение назначений без журнала: ${site.location} (${site.method})`,
      );
    expect(unknown).toEqual([]);
  });

  it('has no stale entries in LOGGED or SYNC_ONLY', () => {
    const found = new Set(sites.map((site) => site.key));
    const stale = [...LOGGED, ...SYNC_ONLY.keys()].filter(
      (key) => !found.has(key),
    );
    expect(stale).toEqual([]);
  });

  it('does not list a place as both logged and sync-only', () => {
    expect([...SYNC_ONLY.keys()].filter((key) => LOGGED.has(key))).toEqual([]);
  });
});
