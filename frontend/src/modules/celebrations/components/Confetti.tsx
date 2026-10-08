'use client';

import { useReducedMotion } from 'motion/react';
import { useEffect, useRef } from 'react';

/** Danfo yellow, naira green, ankara, cobalt, paper — the city's colours. */
const COLORS = ['#f6b90b', '#ffd34d', '#0f8a4f', '#c8287a', '#2457d6', '#ffffff', '#e2412e'] as const;

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  spin: number;
  wobble: number;
  width: number;
  height: number;
  color: string;
  /** Naira notes are drawn as little banknotes with a darker band. */
  note: boolean;
}

export interface ConfettiProps {
  /** Change the key to fire a new burst. */
  readonly burstKey: string;
  /** `full` rains across the screen; `small` pops from `origin`. */
  readonly intensity?: 'full' | 'small';
  /** Burst origin in viewport fractions (0-1). */
  readonly origin?: { readonly x: number; readonly y: number };
}

const GRAVITY = 900;
const DRAG = 0.985;

function spawn(width: number, height: number, intensity: 'full' | 'small', origin: { x: number; y: number }): Particle[] {
  const count = intensity === 'full' ? Math.min(220, Math.round(width / 5)) : 60;
  const particles: Particle[] = [];
  for (let i = 0; i < count; i++) {
    const note = Math.random() < (intensity === 'full' ? 0.22 : 0.15);
    const angle = intensity === 'full' ? -Math.PI / 2 + (Math.random() - 0.5) * 1.6 : Math.random() * Math.PI * 2;
    const speed = intensity === 'full' ? 500 + Math.random() * 650 : 180 + Math.random() * 360;
    particles.push({
      x: intensity === 'full' ? width * (0.15 + Math.random() * 0.7) : width * origin.x,
      y: intensity === 'full' ? height * (0.62 + Math.random() * 0.2) : height * origin.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      rotation: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 12,
      wobble: Math.random() * Math.PI * 2,
      width: note ? 18 : 6 + Math.random() * 6,
      height: note ? 9 : 3 + Math.random() * 4,
      color: note ? (Math.random() < 0.5 ? '#0f8a4f' : '#2457d6') : (COLORS[Math.floor(Math.random() * COLORS.length)] ?? '#f6b90b'),
      note,
    });
  }
  return particles;
}

/**
 * Lightweight canvas confetti (with the odd naira note). Runs for a few seconds, then stops its frame loop.
 * Renders nothing when the player prefers reduced motion. Cosmetic only, so `Math.random` is fine here.
 */
export function Confetti({ burstKey, intensity = 'full', origin = { x: 0.5, y: 0.3 } }: ConfettiProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduceMotion = useReducedMotion();
  const originX = origin.x;
  const originY = origin.y;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || reduceMotion) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const resize = (): void => {
      canvas.width = Math.round(window.innerWidth * dpr);
      canvas.height = Math.round(window.innerHeight * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const particles = spawn(window.innerWidth, window.innerHeight, intensity, { x: originX, y: originY });
    let last = performance.now();
    const started = last;
    let frame = 0;

    const draw = (now: number): void => {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      const width = window.innerWidth;
      const height = window.innerHeight;
      context.clearRect(0, 0, width, height);
      let alive = 0;
      const fade = Math.max(0, Math.min(1, 1 - (now - started - 3200) / 900));
      for (const p of particles) {
        p.vx *= DRAG;
        p.vy = p.vy * DRAG + GRAVITY * dt * (p.note ? 0.35 : 0.55);
        p.wobble += dt * 6;
        p.x += (p.vx + Math.sin(p.wobble) * (p.note ? 60 : 30)) * dt;
        p.y += p.vy * dt;
        p.rotation += p.spin * dt;
        if (p.y > height + 40) continue;
        alive++;
        context.save();
        context.globalAlpha = fade;
        context.translate(p.x, p.y);
        context.rotate(p.rotation);
        context.scale(1, Math.cos(p.wobble));
        context.fillStyle = p.color;
        context.fillRect(-p.width / 2, -p.height / 2, p.width, p.height);
        if (p.note) {
          context.fillStyle = 'rgba(255,255,255,0.55)';
          context.fillRect(-p.width / 2 + 3, -1, p.width - 6, 2);
        }
        context.restore();
      }
      if (alive > 0 && fade > 0) frame = requestAnimationFrame(draw);
      else context.clearRect(0, 0, width, height);
    };
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
    };
  }, [burstKey, intensity, originX, originY, reduceMotion]);

  if (reduceMotion) return null;
  return <canvas ref={canvasRef} aria-hidden className="pointer-events-none fixed inset-0 z-[81] h-full w-full" />;
}
