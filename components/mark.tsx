export function BrandMark({ className = "az-brand-mark" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="currentFlow" x1="5" y1="26" x2="28" y2="6">
          <stop stopColor="#7C4DFF" />
          <stop offset=".52" stopColor="#00E5FF" />
          <stop offset="1" stopColor="#D9FBFF" />
        </linearGradient>
      </defs>
      <path
        d="M26 8.5h-8C11.6 8.5 7.5 11.5 7.5 16S11.6 23.5 18 23.5h8"
        stroke="url(#currentFlow)"
        strokeWidth="5.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M26 8.5h-8C11.6 8.5 7.5 11.5 7.5 16S11.6 23.5 18 23.5h8"
        stroke="#0A1730"
        strokeWidth="3.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M26 8.5h-8C11.6 8.5 7.5 11.5 7.5 16S11.6 23.5 18 23.5h8"
        stroke="url(#currentFlow)"
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="26" cy="8.5" r="2.8" fill="#0A1730" stroke="#D9FBFF" strokeWidth="1.2" />
      <circle cx="26" cy="23.5" r="2.8" fill="#0A1730" stroke="#7C4DFF" strokeWidth="1.2" />
      <circle cx="26" cy="8.5" r=".9" fill="#D9FBFF" />
      <circle cx="26" cy="23.5" r=".9" fill="#9B77FF" />
    </svg>
  );
}
