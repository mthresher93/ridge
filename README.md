# Lumen

Freight prospecting OS: you open live public listings, capture them, score them, and send the message yourself.

## Run locally

```bash
npm install
npx prisma db push
npm run dev
```

Open [http://localhost:6793](http://localhost:6793).

## How you actually get prospects (legal)

Lumen does not scrape Facebook, Craigslist, or Messenger. You hunt. It classifies.

1. Open **Discover → Hunt lanes**.
2. Set keywords (`forklift`, `skid steer`, `CNC`) and an area.
3. Click **Open live search** on a lane. Best first:
   - **Machinery Trader / Equipment Trader / TractorHouse** — dealers with phones. Highest reply odds.
   - **Google Maps dealers** — live yards. Copy the business phone from Maps or their Contact page.
   - **Ritchie Bros** — auction lots that will need transport.
   - **Facebook Marketplace** — only while logged into **your** account. Open an ad, capture it, message from your profile. No bots, no fake accounts.
   - **Craigslist heavy equipment** — open the ad, copy it. No harvesters.
4. Capture:
   - **Paste listing** in Discover, or
   - **Capture bookmarklet** (Discover or Settings → AI). Click it on a page you already opened.
5. Work **Outreach**. Copy the opener. You hit send on Facebook / you dial the dealer.

A phone or email is stored only if it was on the page you captured.

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
