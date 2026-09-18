import type { HonestStatus } from "@/lib/integration-status";

export function StatusPill({
  status,
  label,
  title,
}: {
  status: HonestStatus | "ok" | "warn" | "bad";
  label: string;
  title?: string;
}) {
  return (
    <span className={`status-pill status-${status}`} title={title || label}>
      {label}
    </span>
  );
}
