/**
 * Sparse before/after map for audit payloads.
 * Skips keys whose JSON serialization is unchanged.
 */
export function buildAuditChanges(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): Record<string, { from: unknown; to: unknown }> | undefined {
  const changes: Record<string, { from: unknown; to: unknown }> = {};

  for (const key of Object.keys(after)) {
    const fromValue = before[key];
    const toValue = after[key];
    if (stableStringify(fromValue) === stableStringify(toValue)) {
      continue;
    }
    changes[key] = { from: fromValue ?? null, to: toValue ?? null };
  }

  return Object.keys(changes).length > 0 ? changes : undefined;
}

function stableStringify(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (Array.isArray(value)) {
    return JSON.stringify(value);
  }
  return JSON.stringify(value);
}
