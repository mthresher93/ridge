export function BrandMark({ className = "az-brand-mark" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect x="2.5" y="2.5" width="27" height="27" rx="2" stroke="#5ec8ff" strokeWidth="1.15" />
      <path d="M7 20 L16 9 L25 20" stroke="#5ec8ff" strokeWidth="1.45" />
      <path d="M11 20 L16 13.5 L21 20" stroke="#5ec8ff" strokeWidth="1.15" strokeOpacity="0.45" />
      <path d="M9.5 22.5 H22.5" stroke="#5ec8ff" strokeWidth="1.2" />
    </svg>
  );
}
