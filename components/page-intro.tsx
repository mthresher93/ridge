import type { ReactNode } from "react";

export function Station({
  n,
  title,
  lede,
  chip,
  actions,
  children,
  fill,
  compact,
}: {
  n: string;
  title: string;
  lede: ReactNode;
  chip?: string;
  actions?: ReactNode;
  children: ReactNode;
  fill?: boolean;
  /** Single dense row: title, lede, and actions share one line. For tool-like stations. */
  compact?: boolean;
}) {
  return (
    <div className={`cd-page${fill ? " fill" : ""}`}>
      <header className={`cd-intro${compact ? " compact" : ""}`}>
        <div>
          <h1>
            <span className="lyr">{n}</span>
            {title}
          </h1>
          <p>{lede}</p>
        </div>
        <div className="cd-intro-r">
          {chip ? <span className="cd-chip inf">{chip}</span> : null}
          {actions}
        </div>
      </header>
      <div className={`cd-body${fill ? " fill" : ""}`}>{children}</div>
    </div>
  );
}
