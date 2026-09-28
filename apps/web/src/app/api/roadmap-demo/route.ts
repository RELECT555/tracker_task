import { get, put } from '@vercel/blob';
import { createInitialDemoState, DEMO_BLOB_PATH, runDemoOperation, type DemoState } from '@/entities/roadmap/api/roadmapDemoStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const writesState = new Set([
  'saveIntegrationSettings', 'createRoleTemplate', 'addRoleFromCatalog', 'createRole',
  'updateRole', 'setRoleMembers', 'setRoleDefaultPerson', 'deleteRole',
  'saveAllocation', 'saveAllocationQuarter',
]);

async function readState(): Promise<{ state: DemoState; etag?: string }> {
  try {
    const blob = await get(DEMO_BLOB_PATH, { access: 'private', useCache: false });
    if (!blob) return { state: createInitialDemoState() };
    if (blob.statusCode !== 200) throw new Error('Данные демо недоступны.');
    const raw = await new Response(blob.stream).text();
    const state = JSON.parse(raw) as DemoState;
    if (state.version !== 1) throw new Error('Неизвестная версия данных демо.');
    return { state, etag: blob.blob.etag };
  } catch (error) {
    if (error instanceof Error && (error.name === 'BlobNotFoundError' || error.message.includes('not found'))) {
      return { state: createInitialDemoState() };
    }
    throw error;
  }
}

export async function POST(request: Request) {
  try {
    const operation = await request.json() as { method?: string; args?: unknown[] };
    if (!operation.method || !Array.isArray(operation.args)) {
      return Response.json({ error: 'Некорректный запрос демо Roadmap.' }, { status: 400 });
    }

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const { state, etag } = await readState();
      const data = await runDemoOperation(state, { method: operation.method, args: operation.args });
      if (etag && !writesState.has(operation.method)) {
        return Response.json({ data }, { headers: { 'Cache-Control': 'no-store' } });
      }
      try {
        const body = JSON.stringify(state);
        await put(DEMO_BLOB_PATH, body, {
          access: 'private',
          contentType: 'application/json; charset=utf-8',
          allowOverwrite: true,
        });
        return Response.json({ data }, { headers: { 'Cache-Control': 'no-store' } });
      } catch (error) {
        if (attempt === 3) throw error;
      }
    }
    return Response.json({ error: 'Не удалось сохранить демо-данные.' }, { status: 503 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Ошибка демо Roadmap.';
    return Response.json({ error: message }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}
