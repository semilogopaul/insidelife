import { BETTING_APP_NAME } from '@insidelife/shared';
import type { PhoneApp } from '@/common/game/ui-store';
import { Linear, naira, type AppIconArt } from './art-kit';

/**
 * The phone's app icons, hand-drawn in a 64×64 box: a gradient tile, one clear motif with a little Lagos in it,
 * soft light from the top and a shadow under the motif. Kept bold enough to read at 40 px; `compact` drops the
 * fine detail at header sizes.
 */
export type AppIconId = Exclude<PhoneApp, 'home'>;

const INK = '#0e2733';
const DANFO = '#f6b90b';
const SKIN = ['#6b3e22', '#7b4a2b', '#8a5532'] as const;

const map: AppIconArt = {
  name: 'Map',
  tile: ['#22a0ad', '#0c4f5a'],
  backdrop: ({ id, url, compact }) => (
    <>
      <defs>
        <Linear
          id={id('land')}
          stops={[
            [0, '#f7eed6'],
            [1, '#e4d0a0'],
          ]}
        />
      </defs>
      {/* Mainland, the island and Lekki across the lagoon, joined by Third Mainland Bridge. */}
      <path
        d="M0 0H64V6C53 8.5 47 14.5 37 15.6 27 16.7 19 21.5 10 22.6 5.5 23.2 2.5 24 0 25Z"
        fill={url('land')}
      />
      <path d="M64 40C56 39.5 50.5 43 47.5 48.5 45.2 52.8 44.6 58.5 45.5 64H64Z" fill={url('land')} />
      <path d="M0 49C6 46.5 12 47.5 15.5 51.5 18.2 54.6 18.4 59.5 17.5 64H0Z" fill={url('land')} />
      {!compact && <path d="M0 13.5 29 9.5 64 2.5" stroke="#ffcf4d" strokeWidth={1.8} fill="none" />}
      <path
        d="M12 22.5C20 34 33 43 50 50"
        stroke="#073740"
        strokeOpacity={0.35}
        strokeWidth={4.6}
        fill="none"
      />
      <path d="M12 22.5C20 34 33 43 50 50" stroke="#fffdf6" strokeWidth={2.4} fill="none" />
      {!compact && (
        <path
          d="M5 35.5q2.5-1.8 5 0t5 0M50 27.5q2.5-1.8 5 0t5 0"
          stroke="#ffffff"
          strokeOpacity={0.35}
          strokeWidth={1.3}
          fill="none"
          strokeLinecap="round"
        />
      )}
      <ellipse cx={32} cy={51.6} rx={7.5} ry={2.1} fill="#06262c" opacity={0.4} />
    </>
  ),
  subject: ({ id, url }) => (
    <>
      <defs>
        <Linear
          id={id('pin')}
          x2={1}
          stops={[
            [0, '#ffdc55'],
            [0.55, DANFO],
            [1, '#d98a00'],
          ]}
        />
      </defs>
      <path
        d="M32 51.5C32 51.5 17.5 37.2 17.5 26.5A14.5 14.5 0 0 1 46.5 26.5C46.5 37.2 32 51.5 32 51.5Z"
        fill={url('pin')}
      />
      <circle cx={32} cy={26.5} r={6} fill={INK} />
      <circle cx={32} cy={26.5} r={2.3} fill="#ffffff" />
      <path
        d="M22 23.5A10.5 10.5 0 0 1 29.5 15.6"
        stroke="#ffffff"
        strokeOpacity={0.75}
        strokeWidth={2.2}
        strokeLinecap="round"
        fill="none"
      />
    </>
  ),
};

const bank: AppIconArt = {
  name: 'Bank',
  tile: ['#24b56f', '#0a6a3b'],
  subject: ({ id, url, compact }) => (
    <>
      <defs>
        <Linear
          id={id('note')}
          x2={1}
          stops={[
            [0, '#f3fcf6'],
            [1, '#c6ead4'],
          ]}
        />
        <Linear
          id={id('back')}
          stops={[
            [0, '#9fd9b6'],
            [1, '#6dbb8e'],
          ]}
        />
        <Linear
          id={id('coin')}
          x2={1}
          stops={[
            [0, '#ffe88f'],
            [0.5, DANFO],
            [1, '#cf8400'],
          ]}
        />
      </defs>
      <g transform="rotate(-15 30 27)">
        <rect x={9} y={16} width={42} height={23} rx={3} fill={url('back')} />
        <rect
          x={11.5}
          y={18.5}
          width={37}
          height={18}
          rx={2}
          fill="none"
          stroke="#0a6a3b"
          strokeOpacity={0.45}
          strokeWidth={1.2}
        />
      </g>
      <g transform="rotate(-4 30 34)">
        <rect x={7} y={22} width={44} height={25} rx={3} fill={url('note')} />
        <rect
          x={9.6}
          y={24.6}
          width={38.8}
          height={19.8}
          rx={2}
          fill="none"
          stroke="#0f8a4f"
          strokeWidth={1.3}
        />
        <circle cx={19} cy={34.5} r={5.8} fill="#bfe4cd" stroke="#0f8a4f" strokeWidth={1.2} />
        {!compact && (
          <path
            d="M19 31a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM15.2 39.6c.5-2.3 2-3.6 3.8-3.6s3.3 1.3 3.8 3.6z"
            fill="#0f8a4f"
            opacity={0.7}
          />
        )}
        <path d={naira(37.5, 34.5, 11)} fill="#0b6b3d" />
      </g>
      <circle cx={46} cy={46} r={10.5} fill={url('coin')} />
      <circle cx={46} cy={46} r={8} fill="none" stroke="#b47400" strokeWidth={1.3} />
      <path d={naira(46, 46, 8.8)} fill="#8f5a00" />
      <path
        d="M39.3 41.6A8.5 8.5 0 0 1 44.6 37.6"
        stroke="#fff7d1"
        strokeWidth={1.6}
        strokeLinecap="round"
        fill="none"
      />
    </>
  ),
};

const jobs: AppIconArt = {
  name: 'Jobs',
  tile: ['#4c82f5', '#1b40a8'],
  subject: ({ id, url, compact }) => (
    <>
      <defs>
        <Linear
          id={id('case')}
          stops={[
            [0, '#d69a5c'],
            [1, '#8f5424'],
          ]}
        />
        <Linear
          id={id('clasp')}
          stops={[
            [0, '#ffe680'],
            [1, '#d99c00'],
          ]}
        />
      </defs>
      <path
        d="M23.5 24.5V19.5A4.5 4.5 0 0 1 28 15H36A4.5 4.5 0 0 1 40.5 19.5V24.5H36.4V20.4A1.5 1.5 0 0 0 34.9 18.9H29.1A1.5 1.5 0 0 0 27.6 20.4V24.5Z"
        fill="#5a3315"
      />
      <rect x={9} y={23} width={46} height={30} rx={5} fill={url('case')} />
      <path d="M9 33.5H55V37H9Z" fill="#6a3b14" opacity={0.5} />
      <path d="M14 23H50A5 5 0 0 1 55 28H9A5 5 0 0 1 14 23Z" fill="#ffffff" opacity={0.2} />
      {!compact && (
        <rect
          x={12}
          y={26}
          width={40}
          height={24}
          rx={3}
          fill="none"
          stroke="#f6cd98"
          strokeOpacity={0.75}
          strokeWidth={0.8}
          strokeDasharray="1.6 1.4"
        />
      )}
      <rect x={27} y={30.5} width={10} height={9} rx={2} fill={url('clasp')} />
      <rect x={30.4} y={34.2} width={3.2} height={2.8} rx={0.6} fill="#7a4a00" />
    </>
  ),
};

const school: AppIconArt = {
  name: 'School',
  tile: ['#a46ae8', '#5a29a0'],
  subject: ({ id, url, compact }) => (
    <>
      <defs>
        <Linear
          id={id('cap')}
          stops={[
            [0, '#33596c'],
            [1, INK],
          ]}
        />
        <Linear
          id={id('pages')}
          stops={[
            [0, '#fffaf0'],
            [1, '#ecdfc2'],
          ]}
        />
      </defs>
      <rect x={10} y={43} width={44} height={9.5} rx={2} fill="#e2412e" />
      <rect x={44} y={44.7} width={8.4} height={6.1} rx={1} fill={url('pages')} />
      {!compact && <rect x={13} y={47} width={27} height={1.5} rx={0.75} fill="#ffffff" opacity={0.4} />}
      <rect x={14} y={34.5} width={38} height={9} rx={2} fill="#16a05c" />
      <rect x={15.6} y={36.1} width={7.6} height={5.8} rx={1} fill={url('pages')} />
      {!compact && <rect x={27} y={38.3} width={21} height={1.5} rx={0.75} fill="#ffffff" opacity={0.4} />}
      <path d="M20 24.5 32 29.6 44 24.5V31.8C44 34.4 38.6 36.4 32 36.4S20 34.4 20 31.8Z" fill="#0a1d26" />
      <path d="M32 10.5 56 20.3 32 30.1 8 20.3Z" fill={url('cap')} />
      <path
        d="M32 20.3 49.8 23.4V32.5"
        stroke={DANFO}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path d="M47.8 31.8H51.8L52.8 38.6H46.8Z" fill={DANFO} />
      <ellipse cx={32} cy={20.3} rx={2.6} ry={1.5} fill={DANFO} />
    </>
  ),
};

const homes: AppIconArt = {
  name: 'Homes',
  tile: ['#fba856', '#cf5418'],
  subject: ({ id, url, compact }) => (
    <>
      <defs>
        <Linear
          id={id('wall')}
          stops={[
            [0, '#fff8ea'],
            [1, '#f0d9b0'],
          ]}
        />
        <Linear
          id={id('roof')}
          stops={[
            [0, '#cf4630'],
            [1, '#8c2416'],
          ]}
        />
        <Linear
          id={id('fence')}
          stops={[
            [0, '#f6ead0'],
            [1, '#d8c296'],
          ]}
        />
        <Linear
          id={id('gate')}
          stops={[
            [0, '#2e414b'],
            [1, '#111a20'],
          ]}
        />
      </defs>
      {/* A bungalow behind its compound wall and black sheet gate (spikes on top, gold knobs). */}
      <rect x={13} y={24} width={38} height={20} fill={url('wall')} />
      <path d="M6.5 26.5 32 8.5 57.5 26.5Z" fill={url('roof')} />
      <path d="M11 26.5H53V29.2H11Z" fill="#6e1c10" opacity={0.3} />
      <rect x={17} y={30.5} width={8.5} height={7} rx={1} fill="#2c5566" />
      <rect x={38.5} y={30.5} width={8.5} height={7} rx={1} fill="#2c5566" />
      {!compact && <path d="M21.25 30.5V37.5M42.75 30.5V37.5" stroke="#f0d9b0" strokeWidth={1} />}
      <rect x={5} y={42.5} width={54} height={13} fill={url('fence')} />
      <rect x={4} y={40.8} width={56} height={3} rx={1} fill="#ad9264" />
      <path
        d="M21.5 39.6 23.1 36.4 24.7 39.6ZM26.5 39.6 28.1 36.4 29.7 39.6ZM34.3 39.6 35.9 36.4 37.5 39.6ZM39.3 39.6 40.9 36.4 42.5 39.6Z"
        fill="#141f26"
      />
      <rect x={21} y={39} width={22} height={16.5} rx={1} fill={url('gate')} />
      <rect x={23.2} y={41.4} width={7.6} height={11.8} rx={0.8} fill="#ffffff" opacity={0.1} />
      <rect x={33.2} y={41.4} width={7.6} height={11.8} rx={0.8} fill="#ffffff" opacity={0.1} />
      <circle cx={30} cy={47.6} r={0.95} fill={DANFO} />
      <circle cx={34} cy={47.6} r={0.95} fill={DANFO} />
      {!compact && <rect x={47} y={46} width={6} height={3.6} rx={0.6} fill={DANFO} />}
    </>
  ),
};

const shop: AppIconArt = {
  name: 'Shop',
  tile: ['#f0559f', '#a6165e'],
  subject: ({ id, url }) => (
    <>
      <defs>
        <pattern
          id={id('ankara')}
          width={10}
          height={10}
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(-10)"
        >
          <rect width={10} height={10} fill="#1d55a6" />
          <circle cx={5} cy={5} r={3.4} fill={DANFO} />
          <circle cx={5} cy={5} r={1.6} fill="#e2412e" />
          <circle cx={0} cy={0} r={1.5} fill="#ffffff" />
          <circle cx={10} cy={0} r={1.5} fill="#ffffff" />
          <circle cx={0} cy={10} r={1.5} fill="#ffffff" />
          <circle cx={10} cy={10} r={1.5} fill="#ffffff" />
        </pattern>
        <Linear
          id={id('shade')}
          x2={1}
          y2={0}
          stops={[
            [0, '#ffffff', 0.12],
            [0.45, '#ffffff', 0],
            [1, '#000000', 0.28],
          ]}
        />
      </defs>
      <path
        d="M22.5 27V20A9.5 9.5 0 0 1 41.5 20V27"
        stroke="#ffe4b8"
        strokeWidth={3.4}
        strokeLinecap="round"
        fill="none"
      />
      <path d="M14 25.5H50L53 51.5A3.5 3.5 0 0 1 49.5 55H14.5A3.5 3.5 0 0 1 11 51.5Z" fill={url('ankara')} />
      <path d="M14 25.5H50L53 51.5A3.5 3.5 0 0 1 49.5 55H14.5A3.5 3.5 0 0 1 11 51.5Z" fill={url('shade')} />
      <path d="M14 25.5H50L50.5 30H13.5Z" fill="#0f3a78" />
      <circle cx={22.5} cy={27.8} r={1.5} fill="#ffe4b8" />
      <circle cx={41.5} cy={27.8} r={1.5} fill="#ffe4b8" />
    </>
  ),
};

const motors: AppIconArt = {
  name: 'Motors',
  tile: ['#4f5d69', '#182027'],
  backdrop: ({ compact }) => (
    <>
      {!compact && (
        <path
          d="M0 44V36H4.5V31H8V38H11V27H16V40H19.5V33H23V40H41V30H45V24H49V35H52V29H56.5V38H60V33H64V44Z"
          fill="#ffffff"
          opacity={0.07}
        />
      )}
      <rect y={50.5} width={64} height={13.5} fill="#000000" opacity={0.22} />
      <path d="M0 58H9M17 58H26M38 58H47M55 58H64" stroke={DANFO} strokeWidth={1.6} />
      <ellipse cx={32} cy={53.6} rx={23} ry={2.6} fill="#000000" opacity={0.35} />
    </>
  ),
  subject: ({ id, url, compact }) => (
    <>
      <defs>
        <Linear
          id={id('body')}
          stops={[
            [0, '#f45f49'],
            [1, '#b1261a'],
          ]}
        />
        <Linear
          id={id('glass')}
          stops={[
            [0, '#d2eef7'],
            [1, '#5ea6c2'],
          ]}
        />
      </defs>
      <path
        d="M8 27.5H12.8V31.8H9.6A1.6 1.6 0 0 1 8 30.2ZM56 27.5H51.2V31.8H54.4A1.6 1.6 0 0 0 56 30.2Z"
        fill="#a52418"
      />
      <path
        d="M16.2 30.5 20.4 18.8C21.1 16.9 22.9 15.7 24.9 15.7H39.1C41.1 15.7 42.9 16.9 43.6 18.8L47.8 30.5Z"
        fill={url('body')}
      />
      <path
        d="M20.6 29.5 23.6 20.9C24 19.8 25 19 26.1 19H37.9C39 19 40 19.8 40.4 20.9L43.4 29.5Z"
        fill={url('glass')}
      />
      <path d="M27.4 19.6H31.6L26.3 29H22.1Z" fill="#ffffff" opacity={0.4} />
      <path
        d="M9.5 35.5C9.5 31.9 12.4 29 16 29H48C51.6 29 54.5 31.9 54.5 35.5V46.4A3 3 0 0 1 51.5 49.4H12.5A3 3 0 0 1 9.5 46.4Z"
        fill={url('body')}
      />
      <path
        d="M16 29H48C50.3 29 52.3 30.2 53.4 32H10.6C11.7 30.2 13.7 29 16 29Z"
        fill="#ffffff"
        opacity={0.28}
      />
      <ellipse cx={17.3} cy={36.4} rx={4.5} ry={3} fill="#fff7cf" />
      <ellipse cx={46.7} cy={36.4} rx={4.5} ry={3} fill="#fff7cf" />
      <ellipse cx={17.3} cy={36.4} rx={2.2} ry={1.5} fill="#ffe27a" />
      <ellipse cx={46.7} cy={36.4} rx={2.2} ry={1.5} fill="#ffe27a" />
      <rect x={25} y={33.6} width={14} height={5.6} rx={1.6} fill="#3a0f0a" />
      {!compact && <path d="M26.6 35.6H37.4M26.6 37.3H37.4" stroke="#7d2c22" strokeWidth={0.8} />}
      <rect x={25.2} y={41} width={13.6} height={5.6} rx={1} fill="#ffffff" />
      <rect x={25.9} y={41.6} width={12.2} height={1.3} fill="#0f8a4f" />
      {!compact && (
        <path
          d="M27.2 43.9H29.6V45.3H27.2ZM30.6 43.9H33.4V45.3H30.6ZM34.4 43.9H36.8V45.3H34.4Z"
          fill="#2457d6"
        />
      )}
      <rect x={12.5} y={48.6} width={8} height={5.6} rx={1.8} fill="#0b1418" />
      <rect x={43.5} y={48.6} width={8} height={5.6} rx={1.8} fill="#0b1418" />
    </>
  ),
};

const health: AppIconArt = {
  name: 'Health',
  tile: ['#fa6b55', '#c2261a'],
  subject: ({ id, url, compact }) => (
    <>
      <defs>
        <Linear
          id={id('heart')}
          stops={[
            [0, '#ffffff'],
            [1, '#ffe0da'],
          ]}
        />
        <Linear
          id={id('plus')}
          stops={[
            [0, '#f6604a'],
            [1, '#c4261a'],
          ]}
        />
      </defs>
      <path
        d="M32 53C32 53 9.5 39.8 9.5 24.6 9.5 17.5 15 12 22 12 26.3 12 30 14.4 32 18 34 14.4 37.7 12 42 12 49 12 54.5 17.5 54.5 24.6 54.5 39.8 32 53 32 53Z"
        fill={url('heart')}
      />
      <path
        d="M29.6 21H34.4A1.2 1.2 0 0 1 35.6 22.2V27.4H40.8A1.2 1.2 0 0 1 42 28.6V33.4A1.2 1.2 0 0 1 40.8 34.6H35.6V39.8A1.2 1.2 0 0 1 34.4 41H29.6A1.2 1.2 0 0 1 28.4 39.8V34.6H23.2A1.2 1.2 0 0 1 22 33.4V28.6A1.2 1.2 0 0 1 23.2 27.4H28.4V22.2A1.2 1.2 0 0 1 29.6 21Z"
        fill={url('plus')}
      />
      {!compact && (
        <path
          d="M14.5 23.5C14.9 19.6 17.9 16.8 21.8 16.6"
          stroke="#f6c3ba"
          strokeWidth={1.6}
          strokeLinecap="round"
          fill="none"
        />
      )}
    </>
  ),
};

const family: AppIconArt = {
  name: 'Family',
  tile: ['#56c4f0', '#1872b2'],
  subject: ({ id, url, compact }) => (
    <>
      <defs>
        <Linear
          id={id('kaftan')}
          stops={[
            [0, '#ffffff'],
            [1, '#d9e6ee'],
          ]}
        />
        <Linear
          id={id('wrapper')}
          stops={[
            [0, '#de3f8e'],
            [1, '#a3175d'],
          ]}
        />
        <Linear
          id={id('kid')}
          stops={[
            [0, '#ffd54a'],
            [1, '#e6a100'],
          ]}
        />
      </defs>
      <path d="M7.5 64V48.5C7.5 41 13.6 35 21 35S34.5 41 34.5 48.5V64Z" fill={url('kaftan')} />
      {!compact && <path d="M21 35.5V45" stroke="#b9c9d3" strokeWidth={1.2} />}
      <circle cx={21} cy={25.2} r={6.8} fill={SKIN[0]} />
      <path
        d="M14.3 23.2C14.6 18.2 17.4 15.4 21.2 15.4S27.6 17.8 27.9 22.2C24.2 20.9 18.6 21 14.3 23.2Z"
        fill={INK}
      />
      <path d="M29.5 64V48.5C29.5 41 35.6 35 43 35S56.5 41 56.5 48.5V64Z" fill={url('wrapper')} />
      {!compact && (
        <path
          d="M33 47c3 1.5 7 1.5 10 0s7-1.5 10 0M32 54c3.5 1.5 7.5 1.5 11 0s7.5-1.5 11 0"
          stroke={DANFO}
          strokeWidth={1.4}
          fill="none"
        />
      )}
      <circle cx={43} cy={25.6} r={6.4} fill={SKIN[1]} />
      <path
        d="M35 23.4C34.4 17.2 38 12.8 43 12.8S51.8 16.2 51.2 22.6C48.6 21 45.8 20.4 42.9 20.4S37.4 21.4 35 23.4Z"
        fill="#c8287a"
      />
      <path
        d="M38 17.6C41.4 15.8 45.6 15.8 48.6 17.6"
        stroke={DANFO}
        strokeWidth={1.3}
        strokeLinecap="round"
        fill="none"
      />
      <path d="M21.5 64V56.5C21.5 50.7 26.2 46.4 32 46.4S42.5 50.7 42.5 56.5V64Z" fill={url('kid')} />
      <circle cx={32} cy={40.4} r={5.3} fill={SKIN[2]} />
      <path
        d="M32 13.2C32 13.2 27.6 10.6 27.6 7.6A2.4 2.4 0 0 1 32 6.3 2.4 2.4 0 0 1 36.4 7.6C36.4 10.6 32 13.2 32 13.2Z"
        fill="#e2412e"
      />
    </>
  ),
};

const invest: AppIconArt = {
  name: 'Invest',
  tile: ['#2f4f8c', '#0d1a38'],
  backdrop: ({ compact }) => (
    <>
      {!compact && (
        <path d="M10 22H54M10 31H54M10 40H54" stroke="#ffffff" strokeOpacity={0.08} strokeWidth={1} />
      )}
      <rect x={9} y={49} width={46} height={2} rx={1} fill="#ffffff" opacity={0.35} />
    </>
  ),
  subject: ({ id, url }) => (
    <>
      <defs>
        <Linear
          id={id('bar')}
          stops={[
            [0, '#8ff5c0'],
            [1, '#1fae69'],
          ]}
        />
        <Linear
          id={id('coin')}
          x2={1}
          stops={[
            [0, '#ffe88f'],
            [0.5, DANFO],
            [1, '#cf8400'],
          ]}
        />
      </defs>
      <rect x={14} y={39} width={8} height={10} rx={1.6} fill={url('bar')} />
      <rect x={26} y={32} width={8} height={17} rx={1.6} fill={url('bar')} />
      <rect x={38} y={24} width={8} height={25} rx={1.6} fill={url('bar')} />
      <path
        d="M12 36.5 23.5 26 30.5 30.5 45.5 15.5"
        stroke="#ffd84a"
        strokeWidth={3.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M41.5 11.6H49.4A1.6 1.6 0 0 1 51 13.2V21.1C51 22.5 49.3 23.2 48.3 22.2L40.4 14.3C39.4 13.3 40.1 11.6 41.5 11.6Z"
        fill="#ffd84a"
      />
      <circle cx={17} cy={16.5} r={7.5} fill={url('coin')} />
      <path d={naira(17, 16.5, 7.4)} fill="#8f5a00" />
    </>
  ),
};

const messages: AppIconArt = {
  name: 'Messages',
  tile: ['#5aa9ff', '#1b5fd6'],
  subject: ({ id, url, compact }) => (
    <>
      <defs>
        <Linear
          id={id('bubble')}
          stops={[
            [0, '#ffffff'],
            [1, '#dceaff'],
          ]}
        />
      </defs>
      <path
        d="M20 13H44A10 10 0 0 1 54 23V36A10 10 0 0 1 44 46H31L19.5 54.5 21.7 46H20A10 10 0 0 1 10 36V23A10 10 0 0 1 20 13Z"
        fill={url('bubble')}
      />
      <rect x={18} y={22.5} width={28} height={4} rx={2} fill="#2a6fe0" />
      <rect x={18} y={31} width={20} height={4} rx={2} fill="#2a6fe0" opacity={0.75} />
      {!compact && <rect x={18} y={39.5} width={12} height={3} rx={1.5} fill="#8fb6f2" />}
    </>
  ),
};

const gist: AppIconArt = {
  name: 'Gist',
  tile: ['#3fd481', '#0f8f4a'],
  subject: ({ id, url }) => (
    <>
      <defs>
        <Linear
          id={id('front')}
          stops={[
            [0, '#ffffff'],
            [1, '#e3f8ec'],
          ]}
        />
      </defs>
      <path
        d="M28 10.5H46.5A9 9 0 0 1 55.5 19.5V26A9 9 0 0 1 46.5 35H46.2L49.6 41.6 40.6 35H28A9 9 0 0 1 19 26V19.5A9 9 0 0 1 28 10.5Z"
        fill="#c4f3d6"
      />
      <path
        d="M18.5 22.5H35.5A10 10 0 0 1 45.5 32.5V39.5A10 10 0 0 1 35.5 49.5H23.5L13.6 56 15.9 48.9A10 10 0 0 1 8.5 39.5V32.5A10 10 0 0 1 18.5 22.5Z"
        fill={url('front')}
      />
      <circle cx={19} cy={36} r={2.7} fill="#139a52" />
      <circle cx={27} cy={36} r={2.7} fill="#139a52" />
      <circle cx={35} cy={36} r={2.7} fill="#139a52" />
    </>
  ),
};

/** The rich list: a gold crown over a bold gold F on a deep green-black tile. */
const fobes: AppIconArt = {
  name: 'Fobes',
  tile: ['#1f4d38', '#06110c'],
  backdrop: ({ compact }) => (compact ? null : <path d="M10 58.5H54" stroke="#d4a63a" strokeOpacity={0.45} strokeWidth={1} />),
  subject: ({ id, url, compact }) => (
    <>
      <defs>
        <Linear
          id={id('gold')}
          x2={1}
          stops={[
            [0, '#fff0b3'],
            [0.45, '#e8b64a'],
            [1, '#9c6c12'],
          ]}
        />
      </defs>
      <path d="M17.5 25.5 15.5 12.5 24 19 32 9 40 19 48.5 12.5 46.5 25.5Z" fill={url('gold')} />
      <circle cx={15.5} cy={12.5} r={2.1} fill={url('gold')} />
      <circle cx={32} cy={9} r={2.1} fill={url('gold')} />
      <circle cx={48.5} cy={12.5} r={2.1} fill={url('gold')} />
      <rect x={17.5} y={24.5} width={29} height={4.2} rx={1.2} fill="#b9891f" />
      {!compact && <circle cx={32} cy={26.6} r={1.3} fill="#2fcf83" />}
      <path d="M21 32.5H45V39H30.5V42.5H41V48.5H30.5V55.5H21Z" fill={url('gold')} />
      {!compact && <path d="M21 32.5H45V34H21Z" fill="#fff6d6" opacity={0.6} />}
    </>
  ),
};

/** The betting app: a floodlit, mown pitch, a Danfo-yellow bet slip and a match ball in front of it. */
const betting: AppIconArt = {
  name: BETTING_APP_NAME,
  tile: ['#17a463', '#05402a'],
  backdrop: ({ compact }) => (
    <>
      {!compact && (
        <g fill="#ffffff" opacity={0.07}>
          <rect x={0} y={0} width={8} height={64} />
          <rect x={16} y={0} width={8} height={64} />
          <rect x={32} y={0} width={8} height={64} />
          <rect x={48} y={0} width={8} height={64} />
        </g>
      )}
      <path d="M0 47H64" stroke="#ffffff" strokeOpacity={0.35} strokeWidth={1.2} />
      <circle cx={47} cy={47} r={9} stroke="#ffffff" strokeOpacity={0.3} strokeWidth={1.2} fill="none" />
    </>
  ),
  subject: ({ id, url, compact }) => (
    <>
      <defs>
        <Linear
          id={id('slip')}
          stops={[
            [0, '#ffe17a'],
            [1, DANFO],
          ]}
        />
        <radialGradient id={id('ball-shade')} cx={0.38} cy={0.32} r={0.75}>
          <stop offset={0} stopColor="#ffffff" />
          <stop offset={0.7} stopColor="#e9eef0" />
          <stop offset={1} stopColor="#b9c6cc" />
        </radialGradient>
        <clipPath id={id('ball')}>
          <circle cx={24} cy={41} r={12.5} />
        </clipPath>
      </defs>
      <g transform="rotate(-12 40 26)">
        <rect x={27} y={7.5} width={25} height={35} rx={2.6} fill={url('slip')} />
        <rect x={31} y={12} width={17} height={3} rx={1.5} fill={INK} />
        {!compact && (
          <>
            <rect x={31} y={19} width={11} height={2} rx={1} fill={INK} opacity={0.55} />
            <rect x={44} y={19} width={4} height={2} rx={1} fill={INK} />
            <rect x={31} y={24} width={9} height={2} rx={1} fill={INK} opacity={0.55} />
            <rect x={44} y={24} width={4} height={2} rx={1} fill={INK} />
          </>
        )}
        <rect x={31} y={31} width={17} height={6.5} rx={2} fill="#0b6b43" />
        <path d={naira(35.2, 34.25, 4.2)} fill="#ffffff" />
        {!compact && <rect x={39} y={33.2} width={7} height={2.1} rx={1} fill="#ffffff" />}
      </g>
      <circle cx={24} cy={41} r={12.5} fill={url('ball-shade')} />
      <g clipPath={url('ball')} fill={INK}>
        <path d="M24 36.6 28.18 39.64 26.59 44.56 21.41 44.56 19.82 39.64Z" />
        <path d="M24 33.6 20.01 30.7 21.53 26 26.47 26 27.99 30.7Z" />
        <path d="M31.04 38.71 32.56 34.02 37.5 34.02 39.03 38.71 35.03 41.62Z" />
        <path d="M28.35 46.99 33.29 46.99 34.81 51.68 30.82 54.58 26.82 51.68Z" />
        <path d="M19.65 46.99 21.18 51.68 17.18 54.58 13.19 51.68 14.71 46.99Z" />
        <path d="M16.96 38.71 12.97 41.62 8.97 38.71 10.5 34.02 15.44 34.02Z" />
      </g>
      {!compact && (
        <path
          d="M24 36.6V33.4M28.18 39.64 31.23 38.65M26.59 44.56 28.47 47.15M21.41 44.56 19.53 47.15M19.82 39.64 16.77 38.65"
          stroke={INK}
          strokeWidth={1}
          strokeLinecap="round"
        />
      )}
    </>
  ),
};

const promote: AppIconArt = {
  name: 'Promote',
  tile: ['#ffd84e', '#eb9e00'],
  subject: ({ id, url }) => (
    <>
      <defs>
        <Linear
          id={id('cone')}
          stops={[
            [0, '#ffffff'],
            [1, '#d3dde2'],
          ]}
        />
        <Linear
          id={id('red')}
          stops={[
            [0, '#f45f49'],
            [1, '#b8271a'],
          ]}
        />
      </defs>
      <path d="M21 36H27.6L26.5 46.3A2 2 0 0 1 24.5 48.1H23.7A2 2 0 0 1 21.7 46.3Z" fill={INK} />
      <rect x={8.5} y={24} width={11.5} height={14} rx={3} fill={url('red')} />
      <path
        d="M19 24.2 39.4 13.7C41.6 12.6 44 14.1 44 16.5V45.5C44 47.9 41.6 49.4 39.4 48.3L19 37.8Z"
        fill={url('cone')}
      />
      <path d="M33.6 16.7 37 14.9V49.1L33.6 47.3Z" fill={url('red')} />
      <ellipse cx={43.6} cy={31} rx={2.7} ry={16.2} fill="#24414f" />
      <path
        d="M49.5 24.6A9.5 9.5 0 0 1 49.5 37.4"
        stroke={INK}
        strokeWidth={3}
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M54.2 19.5A16.5 16.5 0 0 1 54.2 42.5"
        stroke={INK}
        strokeOpacity={0.55}
        strokeWidth={3}
        strokeLinecap="round"
        fill="none"
      />
    </>
  ),
};

const goals: AppIconArt = {
  name: 'Goals',
  tile: ['#ffffff', '#e4ebe7'],
  rim: { color: INK, opacity: 0.14 },
  subject: ({ id, url }) => (
    <>
      <defs>
        <Linear
          id={id('ring')}
          stops={[
            [0, '#f05540'],
            [1, '#c4261a'],
          ]}
        />
      </defs>
      <circle cx={29.5} cy={35} r={19.5} fill={url('ring')} />
      <circle cx={29.5} cy={35} r={14.8} fill="#ffffff" />
      <circle cx={29.5} cy={35} r={10.2} fill={url('ring')} />
      <circle cx={29.5} cy={35} r={5.6} fill="#ffffff" />
      <circle cx={29.5} cy={35} r={2.4} fill={url('ring')} />
      <path d="M30.5 34 47.5 17" stroke={INK} strokeWidth={2.8} strokeLinecap="round" />
      <path d="M46.2 18.3 47.4 9.6 51.4 5.6 51.6 12.4Z" fill={DANFO} />
      <path d="M46.2 18.3 54.9 17.1 58.9 13.1 52.1 12.9Z" fill="#d99c00" />
    </>
  ),
};

const me: AppIconArt = {
  name: 'Me',
  tile: ['#2b667c', INK],
  subject: ({ id, url, compact }) => (
    <>
      <defs>
        <Linear
          id={id('card')}
          stops={[
            [0, '#ffffff'],
            [1, '#e1eaed'],
          ]}
        />
        <clipPath id={id('photo')}>
          <rect x={21.5} y={21.5} width={21} height={18.5} rx={3} />
        </clipPath>
      </defs>
      <path d="M21 0 29.3 14.5H34.7L43 0H37.8L32 10.2 26.2 0Z" fill={DANFO} />
      <rect x={16} y={15} width={32} height={41} rx={4.5} fill={url('card')} />
      <rect x={27.2} y={10.5} width={9.6} height={8} rx={1.8} fill="#9fb3bb" />
      <rect x={29.6} y={13.2} width={4.8} height={2} rx={1} fill="#5d7480" />
      <rect x={21.5} y={21.5} width={21} height={18.5} rx={3} fill="#cde8ee" />
      <g clipPath={url('photo')}>
        <path d="M23 40.5C23 35.4 27 32.7 32 32.7S41 35.4 41 40.5Z" fill="#2457d6" />
        <circle cx={32} cy={28.4} r={4.9} fill={SKIN[0]} />
      </g>
      <rect x={21.5} y={44} width={21} height={2.8} rx={1.4} fill={INK} />
      {!compact && <rect x={24.5} y={49.2} width={15} height={2} rx={1} fill="#9fb3bb" />}
    </>
  ),
};

const hangar: AppIconArt = {
  name: 'Hangar',
  tile: ['#4aa8e8', '#14407a'],
  backdrop: ({ compact }) => (
    <>
      {!compact && <path d="M0 22C12 18 20 24 32 20S52 16 64 21V0H0Z" fill="#ffffff" opacity={0.16} />}
      <rect y={49} width={64} height={15} fill="#0b2a52" opacity={0.45} />
      <path d="M0 56.5H64" stroke="#ffffff" strokeOpacity={0.4} strokeWidth={1.4} strokeDasharray="5 4" />
    </>
  ),
  subject: ({ id, url, compact }) => (
    <>
      <defs>
        <Linear
          id={id('hull')}
          stops={[
            [0, '#ffffff'],
            [1, '#cfdbe5'],
          ]}
        />
      </defs>
      <ellipse cx={32} cy={53} rx={19} ry={2.4} fill="#000000" opacity={0.3} />
      {/* A private jet seen from the side, climbing out of Lagos. */}
      <g transform="rotate(-9 32 32)">
        <path d="M10 25 7.5 13.5H14.5L24 25Z" fill="#f6b90b" />
        <path d="M8 31C8 26 14 24.2 24 24.2H45C52 24.2 57.5 27.5 57.5 31S52 37.8 45 37.8H21C13 37.8 8 35.5 8 31Z" fill={url('hull')} />
        <path d="M10 33.4H52L50.5 36H11Z" fill="#f6b90b" />
        <path d="M43.5 26.2C48 26.2 52.4 27.6 54.4 30.4H43.5Z" fill="#2b7fb1" />
        {!compact && (
          <>
            <rect x={20} y={27.2} width={3.2} height={2.6} rx={1} fill="#2b7fb1" />
            <rect x={25.5} y={27.2} width={3.2} height={2.6} rx={1} fill="#2b7fb1" />
            <rect x={31} y={27.2} width={3.2} height={2.6} rx={1} fill="#2b7fb1" />
          </>
        )}
        <path d="M27 36 20 49H29L40 36Z" fill="#e3ecf2" />
        <rect x={13} y={30.5} width={9} height={5.2} rx={2.6} fill="#14407a" />
      </g>
    </>
  ),
};

export const APP_ICON_ART: Readonly<Record<AppIconId, AppIconArt>> = {
  map,
  messages,
  bank,
  jobs,
  school,
  homes,
  shop,
  motors,
  hangar,
  health,
  family,
  invest,
  gist,
  fobes,
  betting,
  promote,
  goals,
  me,
};
