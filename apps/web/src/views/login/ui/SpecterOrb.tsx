'use client';

import { useEffect, useRef, useState } from 'react';
import { createSpecterOrb } from '../lib/create-specter-orb';

export function SpecterOrb() {
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    if (!canvas.current || !host.current) return;
    const instance = createSpecterOrb(canvas.current, host.current, setAvailable);
    return () => instance?.dispose();
  }, []);

  return (
    <div ref={host} className="relative isolate h-[210px] w-full sm:h-[270px] lg:h-full lg:min-h-[300px]" data-specter-orb>
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div
          className="aspect-square h-[62%] max-w-[62%] rounded-full border border-violet-300/50 shadow-[0_0_65px_12px_#7655e533,inset_0_0_45px_#7764ef88]"
          style={{ background: 'radial-gradient(circle at 68% 24%, #82c3ed 0%, #4b52a1 16%, #282049 42%, #100f21 65%, #6955b1 100%)' }}
        />
      </div>
      <canvas
        ref={canvas}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full"
        style={{ opacity: available ? 1 : 0 }}
        data-renderer={available ? 'webgl' : 'fallback'}
      />
      {available ? (
        <div
          aria-hidden="true"
          className="absolute top-1/2 left-1/2 aspect-square h-[80%] max-w-[80%] -translate-x-1/2 -translate-y-1/2 touch-none select-none motion-reduce:touch-auto"
        />
      ) : null}
    </div>
  );
}
