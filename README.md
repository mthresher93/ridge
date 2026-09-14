# Haul

Freight prospecting OS: you open live public listings, capture them, score them, and send the message yourself.

## Run locally

```bash
npm install
npx prisma db push
npm run dev
```

Open [http://localhost:6793](http://localhost:6793).

## How this job actually finds customers

Load boards (DAT, Truckstop, uShip) fill empty miles. They are not the book of business.

The customers worth keeping are yards that already move machines:

- **Equipment dealers** with a lot — they deliver sold iron every week. Best.
- **Rental houses** — constant inbound/outbound. Recurring by design.
- **Auction lots** — after the hammer, someone has a removal deadline.
- **Jobsite / private sellers** — one-shots. Marketplace and Craigslist are volume, mixed quality.

Talk to the yard manager or whoever books outbound freight. Ask to be **backup**, not their new exclusive. One dealer shipping a few loads a week beats fifty Marketplace ads.

Phone and showing up still win. LinkedIn is for people at those yards, from your own account. ImportYeti is public import records — you type a **legal company name** you already have. FMCSA SAFER is for carriers, the wrong direction for finding shippers.

## How Haul hunts (legal)

Haul does not scrape Facebook, Craigslist, DAT, LinkedIn, or ImportYeti. It builds public search URLs you open yourself.

1. Open **Discover → Hunt**.
2. Set keywords (`forklift`, `skid steer`, `CNC`) and an area.
3. Click **Open top searches** (dealer directory, Maps dealers, Machinery Trader, rental yards, Ritchie). Your browser may block extra tabs — use the leftover Open buttons or **Copy hunt links**.
4. Work the plays in order: recurring yards → live inventory → auctions → people at those yards → volume ads → load boards last.
5. Capture:
   - **Paste listing** in Discover, or
   - **Capture bookmarklet** (Discover or Settings → AI) on a page you already opened.
6. Label the client. Work **Outreach**. Copy the opener. You hit send. You dial.

A phone or email is stored only if it was on the page you captured. No bots, no fake accounts, no invented rates.

## Qwen / Ollama (free, local)

```bash
# https://ollama.com
ollama pull qwen3-coder:30b
```

Copy `.env.example` to `.env`. Defaults:

```
OLLAMA_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen3-coder:30b
```

This machine already has `qwen3-coder:30b`. If Ollama is not answering on port 11434, run `ollama serve`.

Lighter box: `ollama pull qwen2.5-coder:14b` and set `OLLAMA_MODEL=qwen2.5-coder:14b`.

Optional cloud fallback: `OPENROUTER_API_KEY` (OpenRouter). If neither is up, local scoring rules still run.

Check: Settings → AI, or `GET /api/health`.

## Capture API / bookmarklet

`POST /api/prospects/capture` with `{ source, url, title, description, pageText, ... }`.

CORS is open so a bookmarklet on a listing page can post into localhost. If you set `APP_PASSWORD` or `CAPTURE_TOKEN`, the bookmarklet needs `x-capture-token`.

## Tests

```bash
npm test
```
