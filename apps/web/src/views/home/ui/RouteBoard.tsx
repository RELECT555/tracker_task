'use client';

import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';
import styles from './route-board.module.css';

type Rotation = { yaw: number; pitch: number };

const initialRotation: Rotation = { yaw: -0.18, pitch: 0 };
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function StaticRoute() {
  return (
    <div className={styles.staticRoute} aria-hidden="true">
      <span /><span /><span />
    </div>
  );
}

export function RouteBoard() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rotation = useRef(initialRotation);
  const drag = useRef<{ id: number; x: number; y: number; start: Rotation } | null>(null);
  const draw = useRef<(() => void) | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let stopped = false;
    let cleanup: (() => void) | undefined;
    void import('./route-board-scene').then(({ createRouteBoard }) => {
      if (stopped) return;
      const board = createRouteBoard(canvas);
      let frame = 0;
      let hasFrame = false;
      const schedule = () => {
        if (frame) return;
        frame = requestAnimationFrame(() => {
          frame = 0;
          let rendered = false;
          try {
            rendered = board.render(rotation.current.yaw, rotation.current.pitch);
          } catch {
            // Keep the static route visible if the browser cannot draw the scene.
          }
          if (rendered !== hasFrame) {
            hasFrame = rendered;
            setReady(rendered);
          }
        });
      };
      const observer = new ResizeObserver(schedule);
      const onLostContext = () => {
        cancelAnimationFrame(frame);
        frame = 0;
        hasFrame = false;
        drag.current = null;
        setReady(false);
      };
      observer.observe(canvas);
      canvas.addEventListener('webglcontextlost', onLostContext);
      canvas.addEventListener('webglcontextrestored', schedule);
      cleanup = () => {
        cancelAnimationFrame(frame);
        observer.disconnect();
        canvas.removeEventListener('webglcontextlost', onLostContext);
        canvas.removeEventListener('webglcontextrestored', schedule);
        board.dispose();
      };
      draw.current = schedule;
      schedule();
    }).catch(() => {
      if (!stopped) setReady(false);
    });

    return () => {
      stopped = true;
      draw.current = null;
      cleanup?.();
    };
  }, []);

  function rotate(next: Rotation) {
    rotation.current = {
      yaw: clamp(next.yaw, -0.82, 0.82),
      pitch: clamp(next.pitch, -0.15, 0.25),
    };
    draw.current?.();
  }

  function startDrag(event: PointerEvent<HTMLCanvasElement>) {
    if (event.button !== 0) return;
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, start: rotation.current };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function move(event: PointerEvent<HTMLCanvasElement>) {
    const gesture = drag.current;
    if (gesture?.id !== event.pointerId) return;
    rotate({
      yaw: gesture.start.yaw + (event.clientX - gesture.x) * 0.007,
      pitch: gesture.start.pitch + (event.clientY - gesture.y) * 0.006,
    });
  }

  function endDrag(event: PointerEvent<HTMLCanvasElement>) {
    if (drag.current?.id === event.pointerId) drag.current = null;
  }

  return (
    <figure className={styles.figure} aria-label="Объёмный маршрут по трём ступеням к мятной арке">
      <div className={styles.stage}>
        {!ready ? <StaticRoute /> : null}
        <canvas
          ref={canvasRef}
          className={styles.canvas}
          data-ready={ready}
          aria-hidden="true"
          onPointerDown={startDrag}
          onPointerMove={move}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onLostPointerCapture={endDrag}
        />
      </div>
      <figcaption className={styles.caption} data-ready={ready}>
        {ready ? (
          <div className={styles.controls} role="group" aria-label="Поворот 3D-модели">
            <button type="button" onClick={() => rotate({ ...rotation.current, yaw: rotation.current.yaw - 0.22 })} aria-label="Повернуть влево"><ChevronLeft aria-hidden="true" /></button>
            <button type="button" onClick={() => rotate(initialRotation)} aria-label="Сбросить ракурс"><RotateCcw aria-hidden="true" /></button>
            <button type="button" onClick={() => rotate({ ...rotation.current, yaw: rotation.current.yaw + 0.22 })} aria-label="Повернуть вправо"><ChevronRight aria-hidden="true" /></button>
          </div>
        ) : null}
      </figcaption>
    </figure>
  );
}
