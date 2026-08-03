'use client';

import { MeshGradient } from '@paper-design/shaders-react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { cn } from '@/shared/lib/utils';

/** Visible motion, still cooler than purple-hero neuroslop */
const LIGHT_COLORS = ['#e8eef8', '#d4dff2', '#b8c7e8', '#9bb0e0', '#7c92d4'];
const DARK_COLORS = ['#09090b', '#111118', '#1a1a28', '#2a2a48', '#3f3f72'];

type ShaderBackgroundProps = {
  className?: string;
};

/**
 * Animated mesh gradient background (21st.dev / Paper Shaders).
 * @see https://21st.dev/@paper-design/components/mesh-gradient
 */
export function ShaderBackground({ className }: ShaderBackgroundProps) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    setMounted(true);
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduceMotion(mq.matches);
    const onChange = (event: MediaQueryListEvent) => setReduceMotion(event.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const isDark = mounted && resolvedTheme === 'dark';
  const colors = isDark ? DARK_COLORS : LIGHT_COLORS;

  return (
    <div
      aria-hidden
      className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)}
    >
      {mounted ? (
        <MeshGradient
          colors={colors}
          distortion={0.4}
          swirl={0.1}
          grainMixer={0.06}
          grainOverlay={0.08}
          speed={reduceMotion ? 0 : 0.3}
          style={{ width: '100%', height: '100%' }}
        />
      ) : (
        <div className="h-full w-full bg-background" />
      )}
      {/* Light veil — keeps the form readable without killing the shader */}
      <div
        className={cn(
          'absolute inset-0',
          isDark
            ? 'bg-[radial-gradient(ellipse_at_center,transparent_20%,hsl(0_0%_5%/0.45)_100%)]'
            : 'bg-[radial-gradient(ellipse_at_center,transparent_25%,hsl(214_22%_91%/0.4)_100%)]',
        )}
      />
    </div>
  );
}
