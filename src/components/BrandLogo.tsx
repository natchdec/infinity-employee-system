export function BrandLogo({ compact = false }: { compact?: boolean }) {
  return (
    <svg
      className={compact ? 'brand-logo brand-logo-compact' : 'brand-logo'}
      viewBox="0 0 230 58"
      role="img"
      aria-label="Infinity Solution Service"
    >
      <defs>
        <linearGradient id="infinity-orange" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ff7a21" />
          <stop offset="100%" stopColor="#f04b16" />
        </linearGradient>
      </defs>

      <g
        transform="translate(3 7)"
        fill="none"
        stroke="url(#infinity-orange)"
        strokeWidth="6.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4 21 C4 9 14 4 24 7 C31 9 36 16 41 22 C46 28 51 35 59 35 C69 35 77 28 77 20 C77 11 70 6 62 6 C54 6 49 12 43 19 L32 31 C25 38 15 38 9 33 C6 30 4 26 4 21 Z" />
      </g>
      <circle cx="78" cy="6.5" r="3.8" fill="#f04b16" />

      <text
        x="94"
        y="28"
        fill="#0d1d35"
        fontFamily="Arial, Helvetica, sans-serif"
        fontSize="24"
        fontWeight="700"
        letterSpacing="-0.5"
      >
        Infinity
      </text>
      <text
        x="96"
        y="41"
        fill="#1f2b3a"
        fontFamily="Arial, Helvetica, sans-serif"
        fontSize="7.6"
        fontWeight="600"
        letterSpacing="1.45"
      >
        SOLUTION SERVICE
      </text>
    </svg>
  );
}
