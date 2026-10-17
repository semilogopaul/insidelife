import { cn } from '@/common/utils/cn';

/**
 * Hero illustration: a private jet climbing away from the Lagos skyline toward Abuja (Aso Rock on the horizon), in the
 * brand's ink and danfo colours. Decorative by default; pass `label` to give it a text alternative.
 */
export function JetHero({ className, label }: { readonly className?: string; readonly label?: string }) {
  return (
    <svg
      viewBox="0 0 400 200"
      preserveAspectRatio="xMidYMid slice"
      className={cn('block w-full', className)}
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    >
      <defs>
        <linearGradient id="jet-hero-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0e2733" />
          <stop offset="0.6" stopColor="#1f4a5c" />
          <stop offset="1" stopColor="#d99c00" />
        </linearGradient>
      </defs>
      <rect width="400" height="200" fill="url(#jet-hero-sky)" />
      <circle cx="320" cy="140" r="30" fill="#f6b90b" opacity="0.85" />
      {/* Lagos towers (left) */}
      <g fill="#0e2733">
        <rect x="10" y="130" width="22" height="70" />
        <rect x="36" y="112" width="18" height="88" />
        <rect x="58" y="138" width="26" height="62" />
        <rect x="88" y="124" width="16" height="76" />
      </g>
      {/* Aso Rock outcrop (right) */}
      <path d="M230 200 C250 150 275 135 305 128 C335 122 360 150 400 160 L400 200 Z" fill="#153645" />
      <path d="M0 200 L0 186 C80 178 160 190 400 184 L400 200 Z" fill="#0e2733" />
      {/* Contrail */}
      <path d="M40 150 C110 140 170 110 232 76" stroke="#ffffff" strokeOpacity="0.35" strokeWidth="3" strokeLinecap="round" fill="none" strokeDasharray="2 7" />
      {/* Jet, nose up and to the right */}
      <g transform="translate(250 62) rotate(-24)">
        <path d="M-46 0 C-46 -9 -30 -12 0 -12 L36 -8 C48 -5 52 0 52 0 C52 0 48 5 36 8 L0 12 C-30 12 -46 9 -46 0 Z" fill="#ffffff" />
        <path d="M-6 -2 L-30 -34 L-20 -34 L10 -2 Z" fill="#f6b90b" />
        <path d="M-6 2 L-30 34 L-20 34 L10 2 Z" fill="#d99c00" />
        <path d="M-44 -2 L-52 -22 L-42 -22 L-30 -2 Z" fill="#f6b90b" />
        <rect x="14" y="-6" width="5" height="4" rx="1" fill="#0e2733" />
        <rect x="23" y="-5.5" width="5" height="4" rx="1" fill="#0e2733" />
        <path d="M-46 3 L48 3" stroke="#f6b90b" strokeWidth="2.5" />
      </g>
    </svg>
  );
}
