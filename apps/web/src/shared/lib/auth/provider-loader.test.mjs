import assert from 'node:assert/strict';
import test from 'node:test';
import { createProviderLoader } from './provider-loader.ts';

test('loads the provider once and shares it between callers', async () => {
  let fetches = 0;
  const loader = createProviderLoader(
    async () => {
      fetches += 1;
      return { provider: 'local' };
    },
    (config) => ({ kind: config.provider }),
  );
  assert.equal(loader.current(), null);
  const [a, b] = await Promise.all([loader.load(), loader.load()]);
  assert.equal(a, b);
  assert.equal(fetches, 1);
  assert.equal(loader.current(), a);
});

test('a failed config request can be retried', async () => {
  let attempt = 0;
  const loader = createProviderLoader(
    async () => {
      attempt += 1;
      if (attempt === 1) throw new Error('offline');
      return { provider: 'local' };
    },
    (config) => ({ kind: config.provider }),
  );
  await assert.rejects(loader.load(), /offline/);
  assert.equal(loader.current(), null);
  assert.deepEqual(await loader.load(), { kind: 'local' });
  assert.equal(attempt, 2);
});
