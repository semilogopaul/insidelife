'use client';

import { motion, useReducedMotion } from 'motion/react';

const PIECES = Array.from({ length: 16 }, (_, index) => {
  const angle = (index / 16) * Math.PI * 2;
  const distance = 90 + (index % 3) * 28;
  return {
    x: Math.cos(angle) * distance,
    y: Math.sin(angle) * distance * 0.7 - 20,
    rotate: (index % 2 === 0 ? 1 : -1) * (40 + index * 9),
    color: index % 3 === 0 ? 'var(--color-danfo)' : index % 3 === 1 ? 'var(--color-naira)' : 'var(--color-ankara)',
    wide: index % 2 === 0,
  };
});

/** One celebratory burst of naira-note confetti behind the success icon. Skipped entirely for reduced motion. */
export function CashBurst() {
  const reduceMotion = useReducedMotion();
  if (reduceMotion) return null;
  return (
    <span aria-hidden className="pointer-events-none absolute left-1/2 top-1/2">
      {PIECES.map((piece, index) => (
        <motion.span
          key={index}
          className="absolute block rounded-[2px]"
          style={{ background: piece.color, width: piece.wide ? 14 : 8, height: piece.wide ? 7 : 8, marginLeft: -5, marginTop: -4 }}
          initial={{ x: 0, y: 0, opacity: 0, rotate: 0, scale: 0.4 }}
          animate={{ x: piece.x, y: [0, piece.y, piece.y + 40], opacity: [0, 1, 0], rotate: piece.rotate, scale: 1 }}
          transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1], delay: 0.15 + (index % 4) * 0.03 }}
        />
      ))}
    </span>
  );
}
