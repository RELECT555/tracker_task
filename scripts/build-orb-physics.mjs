import { mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'apps/web/public/effects/orb-physics.wasm');
mkdirSync(dirname(output), { recursive: true });

// Pass a portable Zig executable as the first argument, or use Zig on PATH.
const result = spawnSync(process.argv[2] ?? 'zig', [
  'cc', '-target', 'wasm32-freestanding', '-O2', '-nostdlib', '-fno-builtin',
  '-Wl,--no-entry', '-Wl,--export=reset', '-Wl,--export=step',
  '-Wl,--export=get_state', '-Wl,--strip-all',
  '-o', output, resolve(root, 'native/specter-orb/physics.c'),
], { stdio: 'inherit' });

if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
console.log('Built apps/web/public/effects/orb-physics.wasm');
