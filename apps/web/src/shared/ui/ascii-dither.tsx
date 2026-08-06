'use client';

import { useEffect, useRef } from 'react';
import { cn } from '@/shared/lib/utils';

/**
 * "ASCII / dither" raster effect — 21st.dev community recipe, Canvas2D only.
 *
 * Pipeline per frame: solid background → grid of cells sampled from a source
 * image → ordered-dither primitive per cell → post-effects (bloom, chromatic,
 * scan lines, grain, glitch, vignette). RAF pauses while the tab is hidden.
 *
 * The recipe's source photo was not recorded, so `src` is optional: without it
 * the component rasterises the Wayo waypoint mark as the subject.
 */

/** Recipe parameters, 21st.dev "HS Office" preset (dither / solid bg). */
const CELL_SIZE = 7;
const COVERAGE = 92;
const DENSITY = 55;
const BRIGHTNESS = -32;
const CONTRAST = 10;
const SATURATION = 102;
const EDGE_EMPHASIS = 55;
const INVERT = false;
const BG_COLOR = '#0b0f1a';
const BG_OPACITY = 90;
const PFX = {
  vignette: 15,
  scanLines: 28,
  chromatic: 40,
  bloom: 60,
  filmGrain: 40,
  glitch: 20,
} as const;
/** animStyle "flicker" at animIntensity 4 — barely-there luminance jitter. */
const ANIM_INTENSITY = 4;
const ANIM_SPEED = 1;
const REDUCED_MOTION_SCALE = 0.3;
const MAX_DPR = 2;

/** Bayer 4×4 ordered-dither thresholds, normalised to 0..1. */
const BAYER = [
  0, 8, 2, 10, //
  12, 4, 14, 6, //
  3, 11, 1, 9, //
  15, 7, 13, 5,
].map((v) => (v + 0.5) / 16);

/** Stable per-cell noise — coverage must not reshuffle between frames. */
function hash2(x: number, y: number) {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

/** Wayo's W waypoints, in the 24×24 viewBox of `WayoMark`. */
const NODES = [
  [4, 5],
  [8.5, 19],
  [12, 7],
  [15.5, 19],
  [20, 5],
] as const;

/** Stand-in for the recipe's source photo: a lit subject on a dark field. */
function paintSource(ctx: CanvasRenderingContext2D, width: number, height: number) {
  ctx.clearRect(0, 0, width, height);

  const glow = ctx.createRadialGradient(
    width * 0.32,
    height * 0.45,
    0,
    width * 0.32,
    height * 0.45,
    Math.max(width, height) * 0.7,
  );
  glow.addColorStop(0, '#4a437a');
  glow.addColorStop(0.45, '#25264f');
  glow.addColorStop(1, '#05070f');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);

  // The mark itself, scaled to fill most of the band and centred on the glow.
  const scale = (height * 1.15) / 24;
  ctx.save();
  ctx.translate(width * 0.32 - 12 * scale, (height - 24 * scale) / 2);
  ctx.scale(scale, scale);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 5.5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  NODES.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  for (const [x, y] of NODES) {
    ctx.beginPath();
    ctx.arc(x, y, 2.15, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** 128×128 monochrome noise tile, reused for every film-grain draw. */
function makeGrain() {
  const tile = document.createElement('canvas');
  tile.width = 128;
  tile.height = 128;
  const ctx = tile.getContext('2d');
  if (!ctx) return tile;
  const image = ctx.createImageData(128, 128);
  for (let i = 0; i < image.data.length; i += 4) {
    const v = Math.random() * 255;
    image.data[i] = v;
    image.data[i + 1] = v;
    image.data[i + 2] = v;
    image.data[i + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  return tile;
}

type AsciiDitherProps = {
  className?: string;
  /** Optional source photo; falls back to the rasterised brand mark. */
  src?: string;
};

export function AsciiDither({ className, src }: AsciiDitherProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const source = document.createElement('canvas');
    const sourceCtx = source.getContext('2d');
    // Cell averages come from a cols×rows downscale — the browser does the
    // box-filtering, so sampling costs one getImageData per resize, not per cell.
    const sample = document.createElement('canvas');
    const sampleCtx = sample.getContext('2d', { willReadFrequently: true });
    // Cells are drawn to their own layer so bloom and chromatic aberration can
    // re-composite them without re-running the grid.
    const layer = document.createElement('canvas');
    const layerCtx = layer.getContext('2d');
    if (!sourceCtx || !sampleCtx || !layerCtx) return;

    const grain = makeGrain();
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    let photo: HTMLImageElement | null = null;
    let cells: Float32Array = new Float32Array(0);
    let colors: Uint8ClampedArray = new Uint8ClampedArray(0);
    let cols = 0;
    let rows = 0;
    let width = 0;
    let height = 0;
    let dpr = 1;
    let elapsed = 0;
    let lastNow = performance.now();
    let rafId: number | null = null;

    /** Steps 1–2 + step 4's colour adjustments, cached until the next resize. */
    const resample = () => {
      cols = Math.max(1, Math.ceil(width / CELL_SIZE));
      rows = Math.max(1, Math.ceil(height / CELL_SIZE));

      source.width = Math.max(1, Math.round(width));
      source.height = Math.max(1, Math.round(height));
      if (photo) {
        // cover-fit the photo into the band
        const scale = Math.max(source.width / photo.width, source.height / photo.height);
        const w = photo.width * scale;
        const h = photo.height * scale;
        sourceCtx.clearRect(0, 0, source.width, source.height);
        sourceCtx.drawImage(photo, (source.width - w) / 2, (source.height - h) / 2, w, h);
      } else {
        paintSource(sourceCtx, source.width, source.height);
      }

      sample.width = cols;
      sample.height = rows;
      sampleCtx.clearRect(0, 0, cols, rows);
      sampleCtx.drawImage(source, 0, 0, cols, rows);
      const data = sampleCtx.getImageData(0, 0, cols, rows).data;

      const raw = new Float32Array(cols * rows);
      colors = new Uint8ClampedArray(cols * rows * 3);
      const brightness = BRIGHTNESS / 100;
      const contrast = 1 + CONTRAST / 100;
      const saturation = SATURATION / 100;

      for (let i = 0; i < cols * rows; i++) {
        let r = data[i * 4] / 255;
        let g = data[i * 4 + 1] / 255;
        let b = data[i * 4 + 2] / 255;
        const luma = 0.299 * r + 0.587 * g + 0.114 * b;
        r = luma + (r - luma) * saturation;
        g = luma + (g - luma) * saturation;
        b = luma + (b - luma) * saturation;
        colors[i * 3] = r * 255;
        colors[i * 3 + 1] = g * 255;
        colors[i * 3 + 2] = b * 255;
        let l = 0.299 * r + 0.587 * g + 0.114 * b;
        l = (l - 0.5) * contrast + 0.5 + brightness;
        raw[i] = Math.min(1, Math.max(0, l));
      }

      // edgeEmphasis: add the local gradient back, so the subject's outline
      // survives the heavy negative brightness/contrast of this preset.
      cells = new Float32Array(cols * rows);
      const edge = EDGE_EMPHASIS / 100;
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const i = y * cols + x;
          const l = raw[i];
          const dx = Math.abs(l - raw[y * cols + Math.min(cols - 1, x + 1)]);
          const dy = Math.abs(l - raw[Math.min(rows - 1, y + 1) * cols + x]);
          const v = l + (dx + dy) * edge * 2;
          cells[i] = Math.min(1, Math.max(0, INVERT ? 1 - v : v));
        }
      }
    };

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (w === width && h === height) return false;
      width = w;
      height = h;
      for (const c of [canvas, layer]) {
        c.width = Math.max(1, Math.round(width * dpr));
        c.height = Math.max(1, Math.round(height * dpr));
      }
      resample();
      return true;
    };

    /** Step 3 — one dithered primitive per cell, onto the transparent layer. */
    const drawCells = (time: number) => {
      layerCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      layerCtx.clearRect(0, 0, width, height);
      const coverage = COVERAGE / 100;
      const density = 0.35 + (DENSITY / 100) * 0.65;
      const flicker = ANIM_INTENSITY / 100;

      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const i = y * cols + x;
          const pick = hash2(x, y);
          if (pick > coverage) continue;

          // animStyle "flicker": per-cell luminance jitter on its own phase.
          const jitter =
            flicker * Math.sin(time * 6 * ANIM_SPEED + pick * Math.PI * 2) * 0.5;
          const l = Math.min(1, Math.max(0, cells[i] + jitter));
          const threshold = BAYER[(y % 4) * 4 + (x % 4)];
          if (l <= threshold) continue;

          // Above threshold, the dot grows with how far past it the cell sits.
          const size = CELL_SIZE * density * (0.45 + 0.55 * (l - threshold));
          const offset = (CELL_SIZE - size) / 2;
          layerCtx.fillStyle = `rgb(${colors[i * 3]},${colors[i * 3 + 1]},${colors[i * 3 + 2]})`;
          layerCtx.fillRect(x * CELL_SIZE + offset, y * CELL_SIZE + offset, size, size);
        }
      }
    };

    /** Steps 5–6 — composite the layer and stack the post-effects. */
    const compose = (time: number) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.clearRect(0, 0, width, height);

      ctx.globalAlpha = BG_OPACITY / 100;
      ctx.fillStyle = BG_COLOR;
      ctx.fillRect(0, 0, width, height);
      ctx.globalAlpha = 1;

      // chromatic: red/cyan copies either side of the true layer
      const shift = (PFX.chromatic / 100) * 3;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.5;
      ctx.drawImage(layer, -shift, 0, width, height);
      ctx.drawImage(layer, shift, 0, width, height);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(layer, 0, 0, width, height);

      // bloom: blurred additive copy
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = (PFX.bloom / 100) * 0.55;
      ctx.filter = `blur(${(PFX.bloom / 100) * 8}px)`;
      ctx.drawImage(layer, 0, 0, width, height);
      ctx.filter = 'none';
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';

      // glitch: rare horizontal slice displacement
      if (hash2(Math.floor(time * 4), 7) < PFX.glitch / 100) {
        const bandY = hash2(Math.floor(time * 4), 11) * height;
        const bandH = 4 + hash2(Math.floor(time * 4), 13) * 10;
        const dx = (hash2(Math.floor(time * 4), 17) - 0.5) * 40;
        ctx.drawImage(
          canvas,
          0,
          bandY * dpr,
          canvas.width,
          bandH * dpr,
          dx,
          bandY,
          width,
          bandH,
        );
      }

      // scanLines
      ctx.fillStyle = `rgba(0,0,0,${(PFX.scanLines / 100) * 0.55})`;
      for (let y = 0; y < height; y += 3) ctx.fillRect(0, y, width, 1);

      // filmGrain
      ctx.globalAlpha = (PFX.filmGrain / 100) * 0.18;
      const gx = -Math.floor(hash2(Math.floor(time * 24), 3) * 128);
      const gy = -Math.floor(hash2(Math.floor(time * 24), 5) * 128);
      for (let y = gy; y < height; y += 128) {
        for (let x = gx; x < width; x += 128) ctx.drawImage(grain, x, y);
      }
      ctx.globalAlpha = 1;

      // vignette
      const vignette = ctx.createRadialGradient(
        width / 2,
        height / 2,
        Math.min(width, height) * 0.25,
        width / 2,
        height / 2,
        Math.max(width, height) * 0.75,
      );
      vignette.addColorStop(0, 'rgba(0,0,0,0)');
      vignette.addColorStop(1, `rgba(0,0,0,${(PFX.vignette / 100) * 2.2})`);
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, width, height);
    };

    const draw = () => {
      resize();
      if (!cells.length) return;
      drawCells(elapsed);
      compose(elapsed);
    };

    const frame = (now: number) => {
      const scale = reduceMotion.matches ? REDUCED_MOTION_SCALE : 1;
      elapsed += ((now - lastNow) / 1000) * scale;
      lastNow = now;
      draw();
      rafId = requestAnimationFrame(frame);
    };

    const stop = () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    };
    const start = () => {
      if (rafId !== null) return;
      lastNow = performance.now();
      rafId = requestAnimationFrame(frame);
    };

    if (src) {
      const image = new Image();
      image.crossOrigin = 'anonymous';
      image.onload = () => {
        photo = image;
        // Force a resample: the cached grid was built from the fallback art.
        width = 0;
        draw();
      };
      image.src = src;
    }

    draw();
    start();

    const onVisibility = () => (document.hidden ? stop() : start());
    document.addEventListener('visibilitychange', onVisibility);
    const observer = new ResizeObserver(() => draw());
    observer.observe(canvas);

    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
      observer.disconnect();
    };
  }, [src]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={cn('pointer-events-none absolute inset-0 h-full w-full', className)}
    />
  );
}
