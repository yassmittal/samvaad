# Samvaad

**Speak your language. Hear theirs.** A real-time two-way speech translator: two people who
don't share a language each speak their own and hear the other in theirs, a sentence behind.
Built for the Meta Global AI Developer Hackathon with **Muse Voice Transcribe** (speech to text)
and **Muse Spark** (context-aware translation).

- [`MVP.md`](MVP.md): what it is and why.
- [`docs/`](docs/README.md): architecture, decisions, coding standards and the phased plan.

> Status: Phase 1, table mode with live captions. See [`docs/README.md`](docs/README.md).

## Layout

```text
apps/web         Next.js 16 + React 19 + Tailwind v4: the page people open on their phones
apps/api         Fastify 5 on Bun: WebSocket rooms, the only place that talks to Meta
packages/shared  zod schemas and constants shared by both (languages, audio format, errors)
scripts/         smoke scripts that call the real Meta API by hand
```

## Prerequisites

- [Bun](https://bun.sh) 1.4 or newer.
- A Meta Model API key from [dev.meta.ai](https://dev.meta.ai) with credit on the Billing page.

## Setup

```sh
bun install
cp apps/api/.env.example apps/api/.env          # then set META_API_KEY
cp apps/web/.env.example apps/web/.env.local
```

The key lives only in `apps/api/.env`. The browser never sees it: it only talks to `apps/api`.

## Run

```sh
bun run dev:api      # http://localhost:4400  (GET /health, WebSocket /v1/conversation)
bun run dev:web      # http://localhost:3400
```

Open http://localhost:3400 and pick **Table mode** (or go straight to http://localhost:3400/table).
Choose the two languages, tap the microphone and speak.

## On a phone

Browsers only allow the microphone over HTTPS, so the phone reaches your laptop through two
Cloudflare quick tunnels (`brew install cloudflared`). One command starts the tunnels and
both dev servers, with the tunnel URLs wired in:

```sh
bun run dev:phone    # prints https://<random>.trycloudflare.com/table to open on the phone
```

The tunnel URLs change on every run. Anyone with the URL can use the app, and your Meta
credit, while it runs, so stop it (Ctrl+C) when you're done.

## Check Meta's APIs (Phase 0)

Both scripts read `META_API_KEY` from `apps/api/.env` and print every event with its arrival
time. They spend real credit, a fraction of a cent per run.

```sh
bun run smoke:translate                     # Hindi sentence → streamed English (Muse Spark)
bun run smoke:translate --model muse-spark-1.2 --reasoning-effort low --text "..."

bun run smoke:transcribe                    # all fixtures, biased to Hindi + English
bun run smoke:transcribe scripts/fixtures/hindi.wav --language-bias Hindi
bun run smoke:transcribe --keyword "Blue Pottery" --keyword Jaipur --verbose
```

The fixtures in `scripts/fixtures/` are placeholders made with macOS voices. See the
[README there](scripts/fixtures/README.md) to swap in real recordings.

## Checks

```sh
bun run typecheck    # every workspace, plus scripts/
bun run lint         # Biome
bun run format       # Biome, writes fixes
bun run test         # bun test in scripts/, packages/shared and apps/api
```

No test calls the real Meta API; only the smoke scripts do.
