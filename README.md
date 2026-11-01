# Samvaad

**Speak your language. Hear theirs.** A real-time two-way speech translator: two people who
don't share a language each speak their own and hear the other in theirs, a sentence behind.
Built for the Meta Global AI Developer Hackathon with **Muse Voice Transcribe** (speech to text)
and **Muse Spark** (context-aware translation).

- [`MVP.md`](MVP.md): what it is and why.
- [`docs/`](docs/README.md): architecture, decisions, coding standards and the phased plan.

> Status: Phases 0 to 5 built: table mode, two-phone rooms, context-aware translation and the
> end-of-conversation recap. Phase 6: hosted at https://samvaad.yashmittal.xyz, with reconnects,
> a room time limit, a screen wake lock and dark mode. Submission comes later. See
> [`docs/README.md`](docs/README.md).

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
Choose the two languages, tap the microphone and speak. Each sentence appears as you say it,
then its translation into the other language streams in under it, with the delay it took.

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

## Why context matters (Phase 5)

Muse Spark translates each sentence knowing the setting, a glossary of names and terms, and
the last eight sentences (D-016). `compare:context` translates the scripted demo conversation
(a Jaipur blue pottery exporter speaking Hindi, a London buyer speaking English) twice, with
the plain Phase 4 prompt and with context, and prints both. It makes 20 Muse Spark calls, 22
with `--recap`.

```sh
bun run compare:context              # side by side, with time to the first word
bun run compare:context --markdown   # as a table
bun run compare:context --recap      # plus the recap in Hindi and English
```

From one run (30 Oct 2026, `muse-spark-1.3`):

| Said | Without context | With context |
|------|-----------------|--------------|
| नमस्ते शिवॉन जी … हमारी ब्लू पाचरी की नई रेंज तैयार है। (the transcriber misheard "blue pottery") | Hello Shivan ji … Our new range of blue pachari is ready. | Hello Ms. Siobhan … Our new range of blue pottery is ready. |
| जी, बड़ी थाली हमारा सबसे ज़्यादा बिकने वाला पीस है … | Yes, the large thali is our best-selling piece … | Yes, the large platter is our best-selling piece … |
| Could you do four twenty-five if I take three hundred? | क्या आप four twenty-five कर देंगे अगर मैं three hundred लूँ? | अगर मैं तीन सौ लूँ तो क्या आप चार सौ पच्चीस कर देंगे? |
| Please send the invoice to Siobhan Doyle at Doyle Home, and I'll pay thirty percent upfront. | कृपया invoice Siobhan Doyle को Doyle Home पर भेज दीजिए, और मैं thirty percent upfront pay करूंगा। | कृपया इनवॉइस डॉयल होम में शिवॉन डॉयल को भेज दीजिए, और मैं तीस प्रतिशत एडवांस में पे कर दूँगी। |

The last row also shows the speaker's name at work: Hindi verbs agree with the speaker's
gender, and with context Siobhan says "दूँगी".

## Checks

```sh
bun run typecheck    # every workspace, plus scripts/
bun run lint         # Biome
bun run format       # Biome, writes fixes
bun run test         # bun test in scripts/, packages/shared and apps/api
```

No test calls the real Meta API; only the smoke scripts do.
