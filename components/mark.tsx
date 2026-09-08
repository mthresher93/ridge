import { PRODUCT_NAME, PRODUCT_SUB, PRODUCT_WORD } from "@/lib/brand";

export function BrandMark({ className = "az-brand-mark" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" width={36} height={36} aria-hidden="true">
      <path d="M2.4 9.6 8 16 2.4 22.4" fill="none" stroke="currentColor" strokeWidth="2.15" strokeLinejoin="miter" />
      <path
        d="M7.1 9.6 12.7 16 7.1 22.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.15"
        opacity="0.38"
      />
      <rect x="13.4" y="8.2" width="11.1" height="11.4" rx="1.35" fill="currentColor" />
      <path d="M24.5 11.1h3.5c.8 0 1.4.6 1.4 1.4v7.1H24.5z" fill="currentColor" />
      <rect x="26.3" y="12.5" width="2.5" height="3.2" rx="0.35" fill="#08090b" />
      <circle cx="17.2" cy="22.7" r="2.45" fill="none" stroke="currentColor" strokeWidth="1.85" />
      <circle cx="24.7" cy="22.7" r="2.45" fill="none" stroke="currentColor" strokeWidth="1.85" />
      <circle cx="17.2" cy="22.7" r="0.85" fill="currentColor" />
      <circle cx="24.7" cy="22.7" r="0.85" fill="currentColor" />
    </svg>
  );
}

export function BrandLockup() {
  return (
    <>
      <BrandMark />
      <div>
        <div className="az-brand-name" aria-label={PRODUCT_NAME}>
          {PRODUCT_WORD}
          <span className="az-brand-tick">'</span>
        </div>
        <div className="az-brand-sub">{PRODUCT_SUB}</div>
      </div>
    </>
  );
}
