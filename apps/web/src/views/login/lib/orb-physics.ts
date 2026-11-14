export type OrbPhysics = {
  reset(): void;
  step(dt: number, targetX: number, targetY: number, pressed: number, impulse: number): void;
  get_state(index: number): number;
};

export async function loadOrbPhysics(signal: AbortSignal): Promise<OrbPhysics> {
  const response = await fetch('/effects/orb-physics.wasm', { signal });
  if (!response.ok) throw new Error('Orb physics is unavailable');
  // A small standalone module also works when a proxy serves a generic MIME type.
  const { instance } = await WebAssembly.instantiate(await response.arrayBuffer());
  const exports = instance.exports;
  if (typeof exports.reset !== 'function' || typeof exports.step !== 'function' || typeof exports.get_state !== 'function') {
    throw new Error('Invalid orb physics module');
  }
  return exports as OrbPhysics;
}
