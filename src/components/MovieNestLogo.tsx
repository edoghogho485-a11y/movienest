// Inline SVG logo: two play triangles side by side (amber + cream, slightly offset) next to "MovieNest"
interface MovieNestLogoProps {
  compact?: boolean;
  className?: string;
}

export function MovieNestLogo({ compact = false, className = '' }: MovieNestLogoProps) {
  return (
    <span className={`inline-flex items-center gap-2 select-none ${className}`}>
      <svg
        width={compact ? 26 : 30}
        height={compact ? 22 : 24}
        viewBox="0 0 32 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className="shrink-0"
      >
        {/* Amber play triangle (back/left) */}
        <path
          d="M3 2.5C3 1.7 3.9 1.2 4.6 1.6L18.4 9.6C19.1 10 19.1 11 18.4 11.4L4.6 19.4C3.9 19.8 3 19.3 3 18.5V2.5Z"
          fill="#f2a33a"
        />
        {/* Cream play triangle (front/right, slightly offset down and right) */}
        <path
          d="M13 5.5C13 4.7 13.9 4.2 14.6 4.6L28.4 12.6C29.1 13 29.1 14 28.4 14.4L14.6 22.4C13.9 22.8 13 22.3 13 21.5V5.5Z"
          fill="#f4ece1"
        />
      </svg>
      <span
        className={`font-bold tracking-tight text-[#f4ece1] whitespace-nowrap ${
          compact ? 'text-base sm:text-lg' : 'text-lg'
        }`}
      >
        MovieNest
      </span>
    </span>
  );
}
