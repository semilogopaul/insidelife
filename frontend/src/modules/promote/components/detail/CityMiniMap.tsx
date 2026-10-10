import { useMemo } from 'react';
import { CITY_MAP, type AdSpotGeometry, type WorldPoint } from '@insidelife/shared';

/** Metres shown either side of the spot. */
const RADIUS = 75;

export interface CityMiniMapProps {
  readonly spot: AdSpotGeometry;
  /** Where the GPS takes you (the viewing point in front of the board). */
  readonly standAt: WorldPoint | null;
  /** Accessible description ("Map: … on Herbert Macaulay Way, Yaba"). */
  readonly label: string;
}

/**
 * A small map of the streets around an ad spot, drawn from the same city geometry the 3D world uses (road tiles and
 * lots of `CITY_MAP`), so it follows the city when roads change. The board is the Danfo marker with an arrow for the
 * way it faces; the ring is where the GPS takes you to see it.
 */
export function CityMiniMap({ spot, standAt, label }: CityMiniMapProps) {
  const { x, z } = spot.position;
  const view = useMemo(() => {
    const inView = (minX: number, minZ: number, maxX: number, maxZ: number): boolean => maxX >= x - RADIUS && minX <= x + RADIUS && maxZ >= z - RADIUS && minZ <= z + RADIUS;
    const half = CITY_MAP.cellSize / 2;
    return {
      roads: CITY_MAP.roadTiles.filter((tile) => inView(tile.x - half, tile.z - half, tile.x + half, tile.z + half)),
      lots: CITY_MAP.lots.filter((lot) => inView(lot.footprint.minX, lot.footprint.minZ, lot.footprint.maxX, lot.footprint.maxZ)),
      half,
    };
  }, [x, z]);
  const face = { x: Math.cos(spot.facing), z: Math.sin(spot.facing) };
  const across = { x: -face.z, z: face.x };
  const halfWidth = Math.max(2.5, spot.width / 2);

  return (
    <svg viewBox={`${x - RADIUS} ${z - RADIUS} ${RADIUS * 2} ${RADIUS * 2}`} role="img" aria-label={label} className="aspect-square w-full rounded-card bg-[#e9e4d6] ring-1 ring-line">
      <title>{label}</title>
      {view.lots.map((lot) => (
        <rect
          key={lot.id}
          x={lot.footprint.minX + 0.8}
          y={lot.footprint.minZ + 0.8}
          width={Math.max(0, lot.footprint.maxX - lot.footprint.minX - 1.6)}
          height={Math.max(0, lot.footprint.maxZ - lot.footprint.minZ - 1.6)}
          rx={1.2}
          fill={lot.kind === 'venue' ? '#d6cdb5' : '#ded8c6'}
        />
      ))}
      {view.roads.map((tile) => (
        <rect
          key={`${tile.col}:${tile.row}`}
          x={tile.x - view.half}
          y={tile.z - view.half}
          width={view.half * 2 + 0.2}
          height={view.half * 2 + 0.2}
          fill={tile.roadClass === 'expressway' ? '#5b6067' : tile.roadClass === 'arterial' ? '#767b83' : '#8d9299'}
        />
      ))}
      {standAt && (
        <g aria-hidden>
          <circle cx={standAt.x} cy={standAt.z} r={4.2} fill="none" stroke="#0e2733" strokeWidth={1.4} strokeDasharray="2 1.6" />
          <circle cx={standAt.x} cy={standAt.z} r={1.4} fill="#0e2733" />
        </g>
      )}
      <g aria-hidden>
        <line
          x1={x}
          y1={z}
          x2={x + face.x * 11}
          y2={z + face.z * 11}
          stroke="#0e2733"
          strokeWidth={1.3}
          strokeLinecap="round"
          markerEnd="url(#facing)"
        />
        <line x1={x - across.x * halfWidth} y1={z - across.z * halfWidth} x2={x + across.x * halfWidth} y2={z + across.z * halfWidth} stroke="#f6b90b" strokeWidth={3.4} strokeLinecap="round" />
        <circle cx={x} cy={z} r={7.5} fill="#f6b90b" fillOpacity={0.25} stroke="#f6b90b" strokeWidth={1.2} />
      </g>
      <defs>
        <marker id="facing" viewBox="0 0 6 6" refX="3" refY="3" markerWidth="4" markerHeight="4" orient="auto">
          <path d="M0,0 L6,3 L0,6 z" fill="#0e2733" />
        </marker>
      </defs>
      <text x={x + RADIUS - 4} y={z - RADIUS + 9} textAnchor="end" fontSize={7} fontWeight={800} fill="#0e2733" aria-hidden>
        N ↑
      </text>
    </svg>
  );
}
