import Link from "next/link";

export default function NotFound() {
  return (
    <div className="cd-page">
      <header className="crm-desk-head">
        <div>
          <h1>Not found</h1>
          <p>That route is not part of this workspace.</p>
        </div>
      </header>
      <Link className="az-btn pri" href="/">
        Dashboard
      </Link>
    </div>
  );
}
