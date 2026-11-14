import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const bytes = readFileSync(new URL('../../apps/web/public/effects/orb-physics.wasm', import.meta.url));
const module = new WebAssembly.Module(bytes);
function createPhysics() {
  return new WebAssembly.Instance(module).exports;
}
function snapshot(physics) {
  return Array.from({ length: 8 }, (_, index) => physics.get_state(index));
}

test('binary is self-contained and the spring settles at its target', () => {
  assert.deepEqual(WebAssembly.Module.imports(module), []);
  const physics = createPhysics();
  for (let frame = 0; frame < 300; frame++) physics.step(1 / 60, 0.1, -0.08, 0, 0);
  assert.ok(Math.abs(physics.get_state(0) - 0.1) < 0.00001);
  assert.ok(Math.abs(physics.get_state(1) + 0.08) < 0.00001);
  physics.reset();
  assert.deepEqual(snapshot(physics), Array(8).fill(0));
});

test('release produces a rebound then settles', () => {
  const physics = createPhysics();
  for (let frame = 0; frame < 120; frame++) physics.step(1 / 60, 0, 0, 1, 0);
  assert.ok(physics.get_state(4) > 0.99);
  physics.step(1 / 60, 0, 0, 0, 1);
  assert.ok(physics.get_state(5) < 0);
  let minimumSqueeze = 1;
  for (let frame = 0; frame < 360; frame++) {
    physics.step(1 / 60, 0, 0, 0, 0);
    minimumSqueeze = Math.min(minimumSqueeze, physics.get_state(4));
  }
  assert.ok(minimumSqueeze < -0.05, 'spring must visibly overshoot');
  assert.ok(Math.abs(physics.get_state(4)) < 0.00001);
  assert.ok(physics.get_state(6) < 0.00001);
});

test('simulation agrees across 30, 60 and 144 Hz frame rates', () => {
  const results = [30, 60, 144].map(rate => {
    const physics = createPhysics();
    for (let frame = 0; frame < rate; frame++) physics.step(1 / rate, 0.08, -0.12, 1, 0);
    return snapshot(physics);
  });
  for (const state of results) {
    state.forEach((value, index) => assert.ok(Math.abs(value - results[0][index]) < 1e-9));
  }
});

test('long rapid input and malformed values remain finite and bounded', () => {
  const physics = createPhysics();
  const deltas = [0, -1, NaN, Infinity, 1 / 30, 1 / 144];
  for (let frame = 0; frame < 20000; frame++) {
    const target = frame % 2 ? Infinity : -Infinity;
    physics.step(deltas[frame % deltas.length], target, -target, frame % 3 ? 1 : NaN, 1);
    const state = snapshot(physics);
    assert.ok(state.every(Number.isFinite));
    assert.ok(Math.abs(state[0]) <= 0.24 && Math.abs(state[1]) <= 0.24);
    assert.ok(state[4] >= -0.45 && state[4] <= 1.2);
    assert.ok(state[6] >= 0 && state[6] <= 1);
    assert.ok(state[7] >= 0 && state[7] < Math.PI * 2);
  }
  assert.equal(physics.get_state(-1), 0);
  assert.equal(physics.get_state(8), 0);
});
