import { PRODUCT_SUB, PRODUCT_WORD } from "@/lib/brand";

export function BrandMark({ className = "az-brand-mark" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" width={44} height={44} aria-hidden="true">
      {Array.from({ length: 12 }, (_, i) => (
        <rect
          key={i}
          x="22.15"
          y="0.55"
          width="3.7"
          height="4.35"
          rx="0.85"
          fill="currentColor"
          transform={`rotate(${i * 30} 24 24)`}
        />
      ))}
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M24 3.15a20.85 20.85 0 1 1 0 41.7 20.85 20.85 0 0 1 0-41.7Zm0 5.35a15.5 15.5 0 1 0 0 31 15.5 15.5 0 0 0 0-31Z"
      />
      <circle cx="24" cy="24" r="13.85" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <g stroke="currentColor" strokeWidth="1.05" strokeLinecap="round">
        <path d="M24 11.4v5.4" />
        <path d="M24 31.2v5.4" />
        <path d="M11.4 24h5.4" />
        <path d="M31.2 24h5.4" />
      </g>
      <circle cx="24" cy="24" r="3.15" fill="none" stroke="currentColor" strokeWidth="1.25" />
      <circle cx="24" cy="24" r="1.25" fill="currentColor" />
      <g transform="translate(24 23.2) scale(0.5) translate(-24 -16.2)" fill="currentColor">
        <rect x="22.15" y="2.15" width="2.05" height="1.15" rx="0.45" />
        <rect x="22.45" y="3.1" width="1.45" height="8.35" rx="0.45" />
        <rect x="24.85" y="2.95" width="2.05" height="1.15" rx="0.45" />
        <rect x="25.15" y="3.9" width="1.45" height="7.55" rx="0.45" />
        <rect x="1.15" y="10.05" width="20.7" height="11.15" rx="1.2" />
        <path d="M21.85 10.05h4.2l2.35-3.05h6.05v3.05H21.85z" />
        <path
          fillRule="evenodd"
          d="M21.85 7.05h7.35l1.55 2.95.45.05L45.9 13.55c.7.22 1.15.88 1.15 1.6v6.55h-2.35v-1.2c0-.4-.33-.72-.74-.72h-3.05c-.4 0-.74.32-.74.72v1.2H21.85V7.05Zm8.55 5.35 11.7 1.55v4.55H30.4V12.4Zm-5.55.45h4.05v3.35h-4.05V12.85Z"
        />
        <rect x="30.15" y="20.85" width="16.55" height="1.7" rx="0.4" />
        <circle cx="6.05" cy="23.35" r="2.55" />
        <circle cx="12.85" cy="23.35" r="2.55" />
        <circle cx="25.15" cy="23.35" r="2.75" />
        <circle cx="39.35" cy="23.35" r="2.5" />
      </g>
    </svg>
  );
}

export function BrandLockup() {
  return (
    <>
      <BrandMark />
      <div className="az-brand-copy">
        <div className="az-brand-name">{PRODUCT_WORD}</div>
        <div className="az-brand-sub">{PRODUCT_SUB}</div>
      </div>
    </>
  );
}
