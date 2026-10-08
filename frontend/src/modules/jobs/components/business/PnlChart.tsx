'use client';

import { useState } from 'react';
import { formatNaira, formatNairaCompact, type BusinessPnlDto } from '@insidelife/shared';
import { pnlBars } from '../../services/job-rules';

const HEIGHT = 92;
const LABEL_SPACE = 16;
const WIDTH = 320;
const BAR = 22;
const RADIUS = 4;

/** Column with a 4px rounded data-end and a square base on the zero line (up for profit, down for loss). */
function columnPath(x: number, baseline: number, length: number, up: boolean): string {
  const r = Math.min(RADIUS, length);
  const w = BAR;
  if (length <= 0) return '';
  if (up) {
    const top = baseline - length;
    return `M${x},${baseline} V${top + r} Q${x},${top} ${x + r},${top} H${x + w - r} Q${x + w},${top} ${x + w},${top + r} V${baseline} Z`;
  }
  const bottom = baseline + length;
  return `M${x},${baseline} V${bottom - r} Q${x},${bottom} ${x + r},${bottom} H${x + w - r} Q${x + w},${bottom} ${x + w},${bottom - r} V${baseline} Z`;
}

/**
 * Last six months of profit as columns on a zero baseline: green up for profit, red down for loss (the sign is also
 * in every label, so colour is never the only cue). Hover or focus a column for the exact figure; a table carries
 * the same numbers for screen readers.
 */
export function PnlChart({ history }: { readonly history: readonly BusinessPnlDto[] }) {
  const bars = pnlBars(history);
  const [active, setActive] = useState<number | null>(null);
  if (bars.length === 0)
    return <p className="text-sm text-text-soft">The first month’s numbers land at month end.</p>;

  const hasLoss = bars.some((bar) => bar.profit < 0);
  const hasProfit = bars.some((bar) => bar.profit > 0);
  const plot = HEIGHT - LABEL_SPACE;
  const baseline = hasLoss && hasProfit ? plot / 2 : hasLoss ? 4 : plot;
  const span = hasLoss && hasProfit ? plot / 2 - 4 : plot - 4;
  const width = WIDTH;
  const slot = WIDTH / Math.max(bars.length, 1);
  const latest = bars[bars.length - 1];
  const shown = active !== null ? bars[active] : latest;

  return (
    <figure className="flex flex-col gap-1.5">
      <figcaption className="flex items-baseline justify-between text-xs text-text-soft">
        <span>Profit after costs and tax</span>
        {shown && (
          <span className="tabular font-bold text-text" aria-live="polite">
            {shown.label}: {shown.profit > 0 ? '+' : shown.profit < 0 ? '−' : ''}
            {formatNairaCompact(Math.abs(shown.profit))}
          </span>
        )}
      </figcaption>
      <svg
        viewBox={`0 0 ${width} ${HEIGHT}`}
        className="h-auto w-full"
        role="group"
        aria-label="Monthly profit, last six months"
        preserveAspectRatio="xMinYMid meet"
      >
        <line x1={0} x2={width} y1={baseline} y2={baseline} stroke="var(--color-line)" strokeWidth={1} />
        {bars.map((bar, index) => {
          const x = index * slot + (slot - BAR) / 2;
          const length = Math.max(bar.profit === 0 ? 0 : 2, bar.ratio * span);
          const up = bar.profit >= 0;
          return (
            <g
              key={bar.monthIndex}
              tabIndex={0}
              role="img"
              aria-label={`${bar.label}: ${bar.profit < 0 ? 'loss' : 'profit'} ${formatNaira(Math.abs(bar.profit))}`}
              onMouseEnter={() => setActive(index)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(index)}
              onBlur={() => setActive(null)}
              className="cursor-default outline-none"
            >
              <rect x={index * slot} y={0} width={slot} height={plot} fill="transparent" />
              <path
                d={columnPath(x, baseline, length, up)}
                fill={up ? 'var(--color-naira)' : 'var(--color-okada)'}
                opacity={active === null || active === index ? 1 : 0.45}
              />
              <text
                x={index * slot + slot / 2}
                y={HEIGHT - 3}
                textAnchor="middle"
                fontSize={11}
                fontWeight={active === index ? 700 : 400}
                fill="var(--color-text-soft)"
              >
                {bar.label}
              </text>
            </g>
          );
        })}
      </svg>
      <table className="sr-only">
        <caption>Monthly profit</caption>
        <thead>
          <tr>
            <th scope="col">Month</th>
            <th scope="col">Profit</th>
          </tr>
        </thead>
        <tbody>
          {bars.map((bar) => (
            <tr key={bar.monthIndex}>
              <th scope="row">{bar.label}</th>
              <td>{formatNaira(bar.profit)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
