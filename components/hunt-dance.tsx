"use client";

import { useRouter } from "next/navigation";
import type { DayHunt } from "@/lib/desk";
import { bookCensus } from "@/lib/book";

type Census = ReturnType<typeof bookCensus>;

export function HuntDance({
  hunt,
  census,
}: {
  hunt: DayHunt;
  census?: Census;
}) {
  const router = useRouter();
  return (
    <section className="hunt-dance">
      <header>
        <div>
          <div className="home-kicker">How you add more</div>
          <h3>Open a page. Paste it. Label it.</h3>
        </div>
        <button className="az-btn pri sm" type="button" onClick={() => router.push(hunt.href)}>
          Today: {hunt.play.title} · {hunt.place}
        </button>
      </header>
      <p className="desk-why">
        Haul does not scrape Marketplace, Craigslist, or DAT. You open the search. You copy what was published. Dealers and rental yards are the book. Private sellers and LinkedIn people are extra — quieter, usually one-shot.
      </p>
      <ol className="hunt-dance-steps">
        <li>
          <b>1</b>
          <div>
            <strong>Stay in one metro</strong>
            <p>{hunt.place} until that list is called.</p>
          </div>
        </li>
        <li>
          <b>2</b>
          <div>
            <strong>Open a public search</strong>
            <p>{hunt.doThis}</p>
          </div>
        </li>
        <li>
          <b>3</b>
          <div>
            <strong>Paste the page</strong>
            <p>Bookmarklet or paste. Phone only if it was on the page.</p>
          </div>
        </li>
        <li>
          <b>4</b>
          <div>
            <strong>Label how you found them</strong>
            <p>Dealer / rental vs private seller. Source and city stay on the record.</p>
          </div>
        </li>
      </ol>
      <div className="hunt-dance-links">
        {hunt.links.map((item) => (
          <a key={item.id} className="az-btn sm" href={item.url} target="_blank" rel="noreferrer">
            {item.name}
          </a>
        ))}
        <button className="az-btn sm" type="button" onClick={() => router.push("/discover?tab=finder")}>
          Customer finder
        </button>
        <button className="az-btn sm" type="button" onClick={() => router.push("/discover?play=sellers")}>
          Private sellers
        </button>
        <button className="az-btn sm" type="button" onClick={() => router.push("/discover?play=people")}>
          People at yards
        </button>
        <button className="az-btn sm" type="button" onClick={() => router.push("/discover?play=jobsites")}>
          Jobsite movers
        </button>
        <button className="az-btn sm" type="button" onClick={() => router.push("/discover?play=oem")}>
          OEM locators
        </button>
      </div>
      {census ? (
        <div className="hunt-census">
          <span>{census.live} on file</span>
          <span>{census.withPhone} callable</span>
          <span>{census.yards} yards</span>
          <span>{census.sellers} private / marketplace</span>
          <span>{census.unlabeled} unlabeled</span>
          {census.metros.slice(0, 6).map((metro) => (
            <span key={metro.id}>
              {metro.label} {metro.count}
            </span>
          ))}
        </div>
      ) : null}
    </section>
  );
}
