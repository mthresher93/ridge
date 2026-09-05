/** Meridian mark — sun arc + site meridian + module grid. */
export function BrandMark({ className = "az-brand-mark" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect x="2" y="2" width="28" height="28" rx="4" stroke="currentColor" strokeWidth="1.2" opacity="0.35" />
      <path
        d="M7.5 18.2 C9.2 12.8 12.4 9.5 16 9.5 C19.6 9.5 22.8 12.8 24.5 18.2"
        stroke="currentColor"
        strokeWidth="1.55"
        strokeLinecap="round"
      />
      <path d="M16 7.2 V24.6" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" />
      <path d="M11.2 20.4 H20.8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.85" />
      <path d="M12.4 22.6 H19.6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.7" />
      <circle cx="16" cy="9.5" r="1.35" fill="currentColor" />
    </svg>
  );
}
