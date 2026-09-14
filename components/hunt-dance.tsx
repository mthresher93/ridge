"use client";

import { useRouter } from "next/navigation";
import type { DayHunt } from "@/lib/desk";
import { bookCensus } from "@/lib/book";

type Census = ReturnType<typeof bookCensus>;

export function HuntDance({
  hunt,
}: {
  hunt: DayHunt;
  census?: Census;
}) {
  const router = useRouter();
  return (
    <section className="hunt-strip">
      <div className="hunt-strip-copy">
        <div className="home-kicker">
          {hunt.weekday} · {hunt.place}
        </div>
        <strong>{hunt.play.title}</strong>
        <span>{hunt.doThis}</span>
      </div>
      <div className="hunt-strip-actions">
        {hunt.links.slice(0, 3).map((item) => (
          <a key={item.id} className="hunt-chip" href={item.url} target="_blank" rel="noreferrer">
            {item.name}
          </a>
        ))}
        <button className="az-btn gold sm" type="button" onClick={() => router.push(hunt.href)}>
          Hunt {hunt.place}
        </button>
      </div>
    </section>
  );
}
