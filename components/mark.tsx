export function BrandMark({ className = "az-brand-mark" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect x="2.5" y="2.5" width="27" height="27" rx="3" stroke="#d4f25a" strokeWidth="1.2" />
      <path d="M7 20.5 L16 8.5 L25 20.5" stroke="#d4f25a" strokeWidth="1.6" strokeLinejoin="miter" />
      <path d="M11.2 20.5 V24.2 H20.8 V20.5" stroke="#d4f25a" strokeWidth="1.3" />
      <path d="M16 8.5 V24.2" stroke="#d4f25a" strokeWidth="1.1" strokeOpacity="0.55" />
    </svg>
  );
}
