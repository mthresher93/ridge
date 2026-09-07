"use client";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="cd-page">
      <header className="crm-desk-head">
        <div>
          <h1>Page error</h1>
          <p>This view failed. Your saved workspace is still on disk.</p>
        </div>
      </header>
      <p className="rec-warn">{error.message}</p>
      <button className="az-btn pri" type="button" onClick={() => reset()}>
        Try again
      </button>
    </div>
  );
}
