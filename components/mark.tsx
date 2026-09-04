export function AzimuthMark({ className = "az-brand-mark" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <circle cx="16" cy="16" r="13.4" stroke="#c45c26" strokeWidth="1.2" />
      <path d="M16 4.6 V8.2 M16 23.8 V27.4 M4.6 16 H8.2 M23.8 16 H27.4" stroke="#c45c26" strokeOpacity=".55" strokeWidth="1.1" />
      <path d="M16 6.4 L17.7 16 L16 25.6 L14.3 16 Z" fill="#c45c26" />
      <circle cx="16" cy="16" r="1.55" fill="#1c1812" />
    </svg>
  );
}
