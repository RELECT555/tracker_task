import { BlobError, BlobNotFoundError, BlobPreconditionFailedError, get, put } from '@vercel/blob';
import { createInitialDemoState, DEMO_BLOB_PATH, runDemoOperation, type DemoState } from '@/entities/roadmap/api/roadmapDemoStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const writesState = new Set([
  'saveIntegrationSettings', 'createRoleTemplate', 'deleteRoleTemplate', 'addRoleFromCatalog', 'createRole',
  'updateRole', 'setRoleMembers', 'setRoleDefaultPerson', 'deleteRole',
  'saveAllocation', 'saveAllocationQuarter', 'rebalanceAllocations',
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
    if (error instanceof BlobNotFoundError) {
      return { state: createInitialDemoState() };
    }
    throw error;
  }
}

export async function POST(request: Request) {
  if (process.env.NEXT_PUBLIC_ROADMAP_DEMO !== 'true') return new Response(null, { status: 404 });

  try {
    const authorization = request.headers.get('authorization');
    if (!authorization) return new Response(null, { status: 401 });
    const origin = process.env.API_PROXY_ORIGIN ?? 'http://localhost:3001';
    const profile = await fetch(new URL('/api/v1/auth/me', origin), {
      headers: { authorization }, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(5_000),
    });
    if (!profile.ok) return new Response(null, { status: profile.status === 401 ? 401 : 503 });
    const { user } = await profile.json() as { user: { roles: string[] } };
    if (!user.roles.includes('admin')) return new Response(null, { status: 403 });

    const operation = await request.json() as { method?: string; args?: unknown[] };
    if (!operation.method || !Array.isArray(operation.args)) {
      return Response.json({ message: 'Некорректный запрос демо Roadmap.' }, { status: 400 });
    }

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const { state, etag } = await readState();
      const data = await runDemoOperation(state, { method: operation.method, args: operation.args });
      if (!writesState.has(operation.method)) {
        return Response.json({ data }, { headers: { 'Cache-Control': 'no-store' } });
      }
      try {
        const body = JSON.stringify(state);
        await put(DEMO_BLOB_PATH, body, {
          access: 'private',
          addRandomSuffix: false,
          contentType: 'application/json; charset=utf-8',
          ...(etag ? { ifMatch: etag } : { allowOverwrite: false }),
        });
        return Response.json({ data }, { headers: { 'Cache-Control': 'no-store' } });
      } catch (error) {
        const conflict = error instanceof BlobPreconditionFailedError
          || (!etag && error instanceof BlobError && /already exists|allowOverwrite/i.test(error.message));
        if (!conflict) throw error;
      }
    }
    return Response.json({ message: 'Демо-данные изменились одновременно. Повторите действие.' }, { status: 409 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Ошибка демо Roadmap.';
    return Response.json({ message }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}
