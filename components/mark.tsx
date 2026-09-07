export function BrandMark({ className = "az-brand-mark" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" width={28} height={28} aria-hidden="true">
      <circle cx="16" cy="16" r="11.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <rect x="14.55" y="7.2" width="2.9" height="17.6" rx="1.45" fill="currentColor" />
    </svg>
  );
}
