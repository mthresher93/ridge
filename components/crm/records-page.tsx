"use client";

import { useMemo, useState, type ReactNode } from "react";
import { PageHeader } from "./page-header";

export type RecordRow = {
  id: string;
  cells: ReactNode[];
  onOpen?: () => void;
};

export function RecordsPage({
  title,
  subtitle,
  columns,
  rows,
  primary,
  secondary,
  empty,
}: {
  title: string;
  subtitle: string;
  columns: string[];
  rows: RecordRow[];
  primary?: ReactNode;
  secondary?: ReactNode;
  empty: string;
}) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) =>
      row.cells.some((cell) => String(typeof cell === "string" || typeof cell === "number" ? cell : "").toLowerCase().includes(q) || (typeof cell !== "string" && JSON.stringify(cell).toLowerCase().includes(q))),
    );
  }, [query, rows]);

  return (
    <div className="cd-page fill">
      <div className="az-fill crm-desk">
        <PageHeader
          title={title}
          subtitle={subtitle}
          controls={
            <>
              {secondary}
              {primary}
            </>
          }
          filters={
            <>
              <label className="crm-filter">
                <span>Search</span>
                <input className="az-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter this list" />
              </label>
              <span className="az-chip tabular-nums">{filtered.length} shown</span>
            </>
          }
        />
        <div className="az-panel overflow-auto min-h-0 crm-table-wrap">
          <table className="az-table min-w-[880px]">
            <thead>
              <tr>
                {columns.map((col) => (
                  <th key={col}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr className="cursor-default">
                  <td colSpan={columns.length} className="py-10 text-center text-[var(--vx-text-3)]">
                    {empty}
                  </td>
                </tr>
              ) : null}
              {filtered.map((row) => (
                <tr key={row.id} onClick={row.onOpen}>
                  {row.cells.map((cell, index) => (
                    <td key={index}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
