const SPOKES = [0, 60, 120, 180, 240, 300];
const LUGS = [30, 90, 150, 210, 270, 330];

export function BrandMark({ className = "az-brand-mark" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" width={30} height={30} aria-hidden="true">
      <circle cx="16" cy="16" r="13.2" fill="none" stroke="currentColor" strokeWidth="2.8" />
      <circle cx="16" cy="16" r="9.7" fill="none" stroke="currentColor" strokeWidth="1.25" />
      {SPOKES.map((deg) => (
        <path
          key={deg}
          d="M15.28 7.55h1.44l.58 4.15h-2.6z"
          fill="currentColor"
          transform={`rotate(${deg} 16 16)`}
        />
      ))}
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M16 19.85a3.85 3.85 0 1 0 0-7.7 3.85 3.85 0 0 0 0 7.7Zm0-2.5a1.35 1.35 0 1 0 0-2.7 1.35 1.35 0 0 0 0 2.7Z"
      />
      {LUGS.map((deg) => (
        <circle key={deg} cx="16" cy="10.35" r="0.7" fill="currentColor" transform={`rotate(${deg} 16 16)`} />
      ))}
    </svg>
  );
}
