import { specterOrbFragment, specterOrbVertex } from './specter-orb-shader';
import { loadOrbPhysics, type OrbPhysics } from './orb-physics';

function createPipeline(gl: WebGLRenderingContext) {
  const shaders: WebGLShader[] = [];
  const program = gl.createProgram();
  const buffer = gl.createBuffer();
  function dispose() {
    shaders.forEach((shader) => gl.deleteShader(shader));
    gl.deleteBuffer(buffer);
    gl.deleteProgram(program);
  }
  if (!program || !buffer) { dispose(); return null; }

  for (const [kind, source] of [[gl.VERTEX_SHADER, specterOrbVertex], [gl.FRAGMENT_SHADER, specterOrbFragment]] as const) {
    const shader = gl.createShader(kind);
    if (!shader) { dispose(); return null; }
    shaders.push(shader);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) { dispose(); return null; }
    gl.attachShader(program, shader);
  }
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) { dispose(); return null; }
  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, 'a_position');
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

  return {
    resolution: gl.getUniformLocation(program, 'u_resolution'),
    time: gl.getUniformLocation(program, 'u_time'),
    pointer: gl.getUniformLocation(program, 'u_pointer'),
    body: gl.getUniformLocation(program, 'u_body'),
    dynamics: gl.getUniformLocation(program, 'u_dynamics'),
    ripples: gl.getUniformLocation(program, 'u_ripples[0]'),
    dispose,
  };
}

/** Owns the canvas until the component unmounts. */
export function createSpecterOrb(
  canvas: HTMLCanvasElement,
  host: HTMLElement,
  onAvailability: (available: boolean) => void,
) {
  const gl = (() => {
    try {
      return canvas.getContext('webgl', {
        alpha: false, antialias: false, depth: false, stencil: false, powerPreference: 'low-power',
      });
    } catch { return null; }
  })();
  if (!gl) return null;
  let pipeline = createPipeline(gl);
  if (!pipeline) return null;

  const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
  const maxViewport = gl.getParameter(gl.MAX_VIEWPORT_DIMS) as Int32Array;
  const abortController = new AbortController();
  const body = new Float32Array(4);
  const dynamics = new Float32Array(4);
  const ripples = new Float32Array(16);
  for (let index = 0; index < 4; index++) ripples[index * 4 + 2] = 10;
  let physics: OrbPhysics | null = null;
  let bounds = canvas.getBoundingClientRect();
  let disposed = false;
  let intersecting = false;
  let frame = 0;
  let previousTime = 0;
  let elapsed = 5;
  let targetX = 0.5;
  let targetY = 0.5;
  let pointerX = 0.5;
  let pointerY = 0.5;
  let hover = false;
  let influence = 0;
  let impulse = 0;
  let activePointer: number | null = null;
  let pressedAt = 0;
  let nextRipple = 0;

  canvas.dataset.physics = 'loading';
  void loadOrbPhysics(abortController.signal).then((module) => {
    if (disposed) return;
    physics = module;
    physics.reset();
    canvas.dataset.physics = 'wasm';
  }).catch(() => {
    if (!disposed) canvas.dataset.physics = 'fallback';
  });

  function canAnimate() {
    return !disposed && pipeline !== null && !motionPreference.matches
      && !document.hidden && intersecting;
  }

  function draw() {
    if (!pipeline || disposed || !gl) return;
    gl.uniform1f(pipeline.time, elapsed);
    gl.uniform4f(pipeline.pointer, pointerX, pointerY, influence, Number(activePointer !== null));
    gl.uniform4fv(pipeline.body, body);
    gl.uniform4fv(pipeline.dynamics, dynamics);
    gl.uniform4fv(pipeline.ripples, ripples);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function stop() {
    cancelAnimationFrame(frame);
    frame = 0;
    previousTime = 0;
  }

  function schedule() {
    if (!canAnimate()) { stop(); return; }
    if (!frame) frame = requestAnimationFrame(tick);
  }

  function tick(now: number) {
    frame = 0;
    if (!canAnimate()) { stop(); return; }
    const dt = previousTime ? Math.min((now - previousTime) / 1000, 0.05) : 0;
    previousTime = now;
    elapsed += dt;
    const follow = 1 - Math.exp(-dt * 7);
    pointerX += (targetX - pointerX) * follow;
    pointerY += (targetY - pointerY) * follow;
    influence += (Number(hover) - influence) * follow;
    const size = Math.max(1, Math.min(bounds.width, bounds.height));
    const attraction = activePointer !== null ? 0.3 : 0.16;
    const goalX = hover ? Math.max(-0.12, Math.min(0.12, (targetX - 0.5) * bounds.width / size * attraction)) : 0;
    const goalY = hover ? Math.max(-0.12, Math.min(0.12, (targetY - 0.5) * bounds.height / size * attraction)) : 0;
    if (physics) {
      physics.step(dt, goalX, goalY, Number(activePointer !== null), impulse);
      for (let index = 0; index < 4; index++) {
        body[index] = physics.get_state(index);
        dynamics[index] = physics.get_state(index + 4);
      }
    } else {
      // Keep the visual responsive if WebAssembly is blocked or still loading.
      body[0] += (goalX - body[0]) * follow;
      body[1] += (goalY - body[1]) * follow;
      dynamics[0] += (Number(activePointer !== null) - dynamics[0]) * follow;
      dynamics[2] = Math.min(1, dynamics[2] * Math.exp(-dt * 2) + impulse);
      dynamics[3] += dt;
    }
    impulse = 0;
    for (let index = 0; index < 4; index++) ripples[index * 4 + 2] += dt;
    draw();
    schedule();
  }

  function resize() {
    if (!pipeline || disposed || !gl) return;
    bounds = canvas.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const scale = Math.min(window.devicePixelRatio || 1, 1.5,
      Math.sqrt(700_000 / (bounds.width * bounds.height)),
      maxViewport[0] / bounds.width, maxViewport[1] / bounds.height);
    const width = Math.max(1, Math.floor(bounds.width * scale));
    const height = Math.max(1, Math.floor(bounds.height * scale));
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    gl.viewport(0, 0, width, height);
    gl.uniform2f(pipeline.resolution, width, height);
    draw();
  }

  function move(event: PointerEvent) {
    if (!canAnimate() || !bounds.width || !bounds.height) return;
    if (activePointer !== null && event.pointerId !== activePointer) return;
    if (event.pointerType === 'touch' && activePointer === null) return;
    targetX = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
    targetY = Math.max(0, Math.min(1, 1 - (event.clientY - bounds.top) / bounds.height));
    hover = true;
  }

  function enter(event: PointerEvent) {
    bounds = canvas.getBoundingClientRect();
    move(event);
  }

  function leave() {
    if (activePointer === null) hover = false;
  }

  function addRipple(strength: number) {
    const size = Math.max(1, Math.min(bounds.width, bounds.height));
    const offset = nextRipple * 4;
    ripples[offset] = (targetX - 0.5) * bounds.width / size;
    ripples[offset + 1] = (targetY - 0.5) * bounds.height / size;
    ripples[offset + 2] = 0;
    ripples[offset + 3] = strength;
    nextRipple = (nextRipple + 1) % 4;
  }

  function press(event: PointerEvent) {
    if (!canAnimate() || event.button !== 0 || activePointer !== null) return;
    if (event.target instanceof Element && event.target.closest('button, a, input, textarea, select')) return;
    bounds = canvas.getBoundingClientRect();
    const size = Math.max(1, Math.min(bounds.width, bounds.height));
    const x = (event.clientX - bounds.left - bounds.width / 2) / size;
    const y = (bounds.height / 2 - event.clientY + bounds.top) / size;
    if (Math.hypot(x - body[0], y - body[1]) > 0.36) return;
    activePointer = event.pointerId;
    pressedAt = performance.now();
    move(event);
    host.setPointerCapture(event.pointerId);
    canvas.dataset.interaction = 'held';
    addRipple(0.35);
  }

  function release(event: PointerEvent) {
    if (event.pointerId !== activePointer) return;
    impulse = Math.min(1, 0.4 + (performance.now() - pressedAt) / 1400);
    addRipple(impulse);
    clearInteraction();
  }

  function clearInteraction() {
    const pointer = activePointer;
    activePointer = null;
    hover = false;
    canvas.dataset.interaction = 'idle';
    if (pointer !== null && host.hasPointerCapture(pointer)) host.releasePointerCapture(pointer);
  }

  function cancel(event: PointerEvent) {
    if (event.pointerId === activePointer) clearInteraction();
  }

  function visibilityChanged() {
    if (document.hidden) clearInteraction();
    schedule();
  }

  function refreshBounds() {
    bounds = canvas.getBoundingClientRect();
  }

  function updateMotionPreference() {
    if (motionPreference.matches) {
      clearInteraction();
      influence = 0;
      impulse = 0;
      physics?.reset();
      body.fill(0);
      dynamics.fill(0);
      for (let index = 0; index < 4; index++) ripples[index * 4 + 2] = 10;
      pointerX = targetX = 0.5;
      pointerY = targetY = 0.5;
      draw();
    }
    schedule();
  }

  function loseContext(event: Event) {
    event.preventDefault();
    clearInteraction();
    stop();
    pipeline?.dispose();
    pipeline = null;
    onAvailability(false);
  }

  function restoreContext() {
    if (disposed || !gl) return;
    pipeline = createPipeline(gl);
    resize();
    onAvailability(Boolean(pipeline));
    schedule();
  }

  const resizeObserver = new ResizeObserver(resize);
  const intersectionObserver = new IntersectionObserver(([entry]) => {
    intersecting = entry.isIntersecting;
    if (!intersecting) clearInteraction();
    schedule();
  });
  resizeObserver.observe(canvas);
  intersectionObserver.observe(canvas);
  motionPreference.addEventListener('change', updateMotionPreference);
  document.addEventListener('visibilitychange', visibilityChanged);
  window.addEventListener('resize', resize);
  window.addEventListener('blur', clearInteraction);
  window.addEventListener('scroll', refreshBounds, { passive: true });
  host.addEventListener('pointerenter', enter);
  host.addEventListener('pointermove', move);
  host.addEventListener('pointerleave', leave);
  host.addEventListener('pointercancel', cancel);
  host.addEventListener('pointerdown', press);
  host.addEventListener('pointerup', release);
  host.addEventListener('lostpointercapture', cancel);
  canvas.addEventListener('webglcontextlost', loseContext);
  canvas.addEventListener('webglcontextrestored', restoreContext);
  resize();
  onAvailability(true);

  return {
    dispose() {
      disposed = true;
      abortController.abort();
      clearInteraction();
      stop();
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      motionPreference.removeEventListener('change', updateMotionPreference);
      document.removeEventListener('visibilitychange', visibilityChanged);
      window.removeEventListener('resize', resize);
      window.removeEventListener('blur', clearInteraction);
      window.removeEventListener('scroll', refreshBounds);
      host.removeEventListener('pointerenter', enter);
      host.removeEventListener('pointermove', move);
      host.removeEventListener('pointerleave', leave);
      host.removeEventListener('pointercancel', cancel);
      host.removeEventListener('pointerdown', press);
      host.removeEventListener('pointerup', release);
      host.removeEventListener('lostpointercapture', cancel);
      canvas.removeEventListener('webglcontextlost', loseContext);
      canvas.removeEventListener('webglcontextrestored', restoreContext);
      pipeline?.dispose();
      pipeline = null;
      // Keep StrictMode's connected canvas reusable; release only detached canvases.
      queueMicrotask(() => {
        if (!canvas.isConnected) gl.getExtension('WEBGL_lose_context')?.loseContext();
      });
    },
  };
}
