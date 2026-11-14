# Specter orb physics

The login orb uses a freestanding C spring simulation compiled to WebAssembly.
The checked-in `apps/web/public/effects/orb-physics.wasm` needs no native compiler
for regular frontend builds. Rebuild after editing `physics.c` with Zig 0.14.1.

```sh
node scripts/build-orb-physics.mjs /absolute/path/to/zig
node --test native/specter-orb/physics.test.mjs
```

The optional argument selects a portable Zig executable. Without it, the script
uses `zig` from PATH. Official archives and SHA256 hashes are published at
https://ziglang.org/download/index.json.

Exports are `reset()`, `step(dt, targetX, targetY, pressed, impulse)` and
`get_state(index)`. The eight state values are x, y, velocityX, velocityY,
squeeze, squeezeVelocity, energy and phase. Coordinates use the canvas' shorter
dimension. Targets are clamped to ±0.12, held pressure to 0–1. Pass a release
impulse once, then zero on subsequent frames. Integration uses 1/120-second
substeps and caps a frame's elapsed time at 0.1 seconds.
