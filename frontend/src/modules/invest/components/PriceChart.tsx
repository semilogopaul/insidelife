'use client';

import { useId, useMemo, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { formatDate, formatNairaCompact, MINUTES_PER_DAY, type PricePointDto } from '@insidelife/shared';
import { cn } from '@/common/utils/cn';
import { useElementWidth } from '../hooks/use-element-width';
import { buildLine, nearestIndex, type ChartBox } from '../services/chart';
import { formatChange, formatUnitPrice } from '../services/invest-math';

const HEIGHT = 176;
/** Series colour: cobalt passes the dataviz lightness/chroma/contrast checks on Paper (Lagoon reads grey). */
const SERIES = 'var(--color-cobalt)';

export interface PriceChartProps {
  readonly points: readonly PricePointDto[];
  readonly label: string;
  /** Dim while a new range loads (keep the frame, no skeleton flash). */
  readonly stale?: boolean;
}

/** Axis labels stay short: kobo for cheap stocks, compact for six-figure crypto. */
const axisPrice = (price: number): string => (price >= 10_000 ? formatNairaCompact(price) : formatUnitPrice(price));

const shortDate = (dayIndex: number): string => formatDate(dayIndex * MINUTES_PER_DAY).replace(/^\w+ /, '');

/**
 * Single-series price line: 2px line, 10% wash, hairline grid, right-hand axis with the latest price pinned, a
 * crosshair + tooltip on hover/touch/keyboard (← → Home End), and a table view for screen readers and precision.
 */
export function PriceChart({ points, label, stale = false }: PriceChartProps) {
  const [wrapper, width] = useElementWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const gradientId = useId();
  const box: ChartBox = useMemo(() => ({ width, height: HEIGHT, top: 10, right: 62, bottom: 24, left: 2 }), [width]);
  const values = useMemo(() => points.map((point) => point.price), [points]);
  const geometry = useMemo(() => buildLine(values, box, 4), [values, box]);

  if (!geometry || points.length < 2) {
    return <div ref={wrapper} className="grid h-44 place-items-center rounded-card bg-paper-2 text-sm text-text-soft">Not enough price history yet.</div>;
  }

  const first = points[0]!;
  const last = points.at(-1)!;
  const end = geometry.points.at(-1)!;
  const change = first.price === 0 ? 0 : last.price / first.price - 1;
  const focus = active === null ? null : { point: points[active]!, at: geometry.points[active]! };
  const plotBottom = HEIGHT - box.bottom;

  const onPointer = (event: PointerEvent<SVGRectElement>): void => {
    const rect = event.currentTarget.ownerSVGElement?.getBoundingClientRect();
    if (!rect) return;
    setActive(nearestIndex(event.clientX - rect.left, points.length, box));
  };
  const onKey = (event: KeyboardEvent<SVGSVGElement>): void => {
    const current = active ?? points.length - 1;
    const next =
      event.key === 'ArrowLeft' ? current - 1 : event.key === 'ArrowRight' ? current + 1 : event.key === 'Home' ? 0 : event.key === 'End' ? points.length - 1 : event.key === 'Escape' ? null : undefined;
    if (next === undefined) return;
    event.preventDefault();
    setActive(next === null ? null : Math.max(0, Math.min(points.length - 1, next)));
  };

  const summary = `${label}: ${formatUnitPrice(first.price)} ${points.length} days ago, ${formatUnitPrice(last.price)} today (${formatChange(change)}). Low ${formatUnitPrice(geometry.min.value)}, high ${formatUnitPrice(geometry.max.value)}.`;

  return (
    <figure className="flex flex-col gap-2">
      <div ref={wrapper} className={cn('relative transition-opacity', stale && 'opacity-50')}>
        <svg
          width={width}
          height={HEIGHT}
          role="img"
          aria-label={summary}
          tabIndex={0}
          onKeyDown={onKey}
          onBlur={() => setActive(null)}
          className="block touch-pan-y select-none overflow-visible rounded-card focus-visible:outline-offset-4"
        >
          <defs>
            <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={SERIES} stopOpacity={0.14} />
              <stop offset="100%" stopColor={SERIES} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          {geometry.yTicks.map((tick) => (
            <g key={tick.value}>
              <line x1={box.left} x2={width - box.right} y1={tick.y} y2={tick.y} stroke="var(--color-paper-3)" strokeWidth={1} shapeRendering="crispEdges" />
              <text x={width - box.right + 8} y={tick.y} dy="0.32em" className="fill-text-faint text-[10px] tabular-nums">
                {axisPrice(tick.value)}
              </text>
            </g>
          ))}
          <path d={geometry.area} fill={`url(#${gradientId})`} />
          <path d={geometry.line} fill="none" stroke={SERIES} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          <text x={box.left} y={HEIGHT - 6} className="fill-text-faint text-[10px]">
            {shortDate(first.dayIndex)}
          </text>
          <text x={width - box.right} y={HEIGHT - 6} textAnchor="end" className="fill-text-faint text-[10px]">
            Today
          </text>

          {focus ? (
            <g pointerEvents="none">
              <line x1={focus.at.x} x2={focus.at.x} y1={box.top} y2={plotBottom} stroke="var(--color-text-faint)" strokeWidth={1} shapeRendering="crispEdges" />
              <circle cx={focus.at.x} cy={focus.at.y} r={5} fill={SERIES} stroke="var(--color-paper)" strokeWidth={2} />
            </g>
          ) : (
            <g pointerEvents="none">
              <circle cx={end.x} cy={end.y} r={4.5} fill={SERIES} stroke="var(--color-paper)" strokeWidth={2} />
              <rect x={width - box.right + 4} y={end.y - 10} width={box.right - 4} height={20} rx={5} fill="var(--color-ink)" />
              <text x={width - box.right + 4 + (box.right - 4) / 2} y={end.y} dy="0.33em" textAnchor="middle" className="fill-white text-[10px] font-bold tabular-nums">
                {axisPrice(last.price)}
              </text>
            </g>
          )}
          <rect
            x={box.left}
            y={0}
            width={Math.max(0, width - box.left - box.right)}
            height={HEIGHT}
            fill="transparent"
            onPointerMove={onPointer}
            onPointerDown={onPointer}
            onPointerLeave={() => setActive(null)}
          />
        </svg>
        {focus && (
          <div
            role="status"
            className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-chip bg-ink px-2.5 py-1.5 text-center text-on-ink shadow-[var(--shadow-lift)]"
            style={{ left: Math.min(Math.max(focus.at.x, 56), width - box.right - 40) }}
          >
            <span className="block text-sm font-bold tabular-nums">{formatUnitPrice(focus.point.price)}</span>
            <span className="block text-2xs text-on-ink-soft">{focus.point.dayIndex === last.dayIndex ? 'Today' : shortDate(focus.point.dayIndex)}</span>
          </div>
        )}
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer select-none text-xs font-bold text-text-soft">Show prices as a table</summary>
        <div className="mt-2 max-h-48 overflow-y-auto rounded-card ring-1 ring-line">
          <table className="w-full text-left text-xs">
            <caption className="sr-only">{label}, weekly closing prices</caption>
            <thead className="sticky top-0 bg-paper-2">
              <tr>
                <th scope="col" className="px-3 py-1.5 font-bold">Day</th>
                <th scope="col" className="px-3 py-1.5 text-right font-bold">Price</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {points
                .filter((_, index) => (points.length - 1 - index) % 7 === 0)
                .reverse()
                .map((point) => (
                  <tr key={point.dayIndex} className="border-t border-line">
                    <td className="px-3 py-1.5">{point.dayIndex === last.dayIndex ? 'Today' : shortDate(point.dayIndex)}</td>
                    <td className="px-3 py-1.5 text-right">{formatUnitPrice(point.price)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
