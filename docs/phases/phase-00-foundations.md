# Phase 0 — Foundations and API check

**Planned:** Thu 29 Oct (IST) · **Size:** S

**Goal:** an empty but correctly shaped monorepo where every package builds, typechecks,
lints and tests, plus **proof that Meta's two APIs behave the way the docs claim**. Every
later phase rests on Muse Voice Transcribe and Muse Spark, so we confirm them on the first day.

**Read first:** `architecture/system-overview.md`, `architecture/repository-structure.md`,
`conventions/coding-standards.md`, `decisions.md` (D-002, D-003, D-005, D-006, D-009).

**Blocked by:** a working Meta Model API key with the $150 credit applied (Billing page),
and a spend limit alert set.

## Deliverables

### Root
- `package.json` with Bun workspaces (`apps/*`, `packages/*`) and scripts: `dev:api`,
  `dev:web`, `typecheck`, `lint`, `format`, `test`, `smoke:transcribe`, `smoke:translate`.
- `tsconfig.base.json` with the strict flags from `coding-standards.md` §3, `biome.json`,
  `.gitignore` (node_modules, `.env*` except `.env.example`, `.next/`).
- `README.md`: prerequisites, setup, how to run each piece.

### `scripts/` — the API check
- `smoke-translate.ts`: sends one Hindi sentence to Muse Spark with `stream: true` and prints
  each delta with its arrival time. Records: the model id that works (`muse-spark-1.3`?
  `1.2`?), the auth header, time to first token, total time.
- `smoke-transcribe.ts`: streams a WAV file from `scripts/fixtures/` to Muse Voice
  Transcribe **at real-time pace** and prints every event with its arrival time. Records:
  - The handshake: is the key an HTTP header or a first frame?
  - The audio framing: binary or base64 JSON? Which sample rates are accepted?
  - The event names for partial, speech end and final transcripts.
  - How to set the language and a **language bias list** (Hindi + English).
  - **Does a final transcript say which language was spoken?** (decides D-008's table mode)
  - Do keywords work (for Phase 5's glossary)?
  - Time from the end of speech in the file to the final transcript.
- `scripts/fixtures/`: three short recordings in our own voices: Hindi, English, and
  Hinglish (mixed in one sentence). 16 kHz mono WAV.
- **Write the findings into `decisions.md`**: update D-005 and D-006 with what is now
  verified, and replace "unverified" with the real event names. Add a decision if anything
  changes the plan.

### `packages/shared`
- Package skeleton with `zod`.
- `languages/supported-languages.ts`: the languages both Meta's transcriber and a browser
  voice are likely to support, each with `languageCode`, `englishName`, `nativeName` and
  `speechSynthesisLanguageTag` (`hi-IN`, `en-IN`, …). Start with Hindi, English, Tamil,
  Telugu, Kannada, Marathi, Bengali, Spanish, French, German, Japanese, Arabic.
- `audio/audio-format.ts`: `SAMPLE_RATE_HERTZ = 16_000`, `FRAME_DURATION_MILLISECONDS = 80`,
  `SAMPLES_PER_FRAME`, `BYTES_PER_SAMPLE` (as verified).
- `domain/error-code.ts`: `INVALID_MESSAGE | UPSTREAM_UNAVAILABLE | INTERNAL_ERROR`.
- One real test.

### `apps/api`
- `index.ts`, `build-server.ts`, plugins `env` (zod: `META_API_KEY`, `PORT`,
  `ALLOWED_WEB_ORIGINS`), `websocket`, `error-handler`.
- `GET /health` → `{ status: 'ok' }`.
- `GET /v1/conversation` as a WebSocket that, for now, echoes JSON messages. Proves the
  socket path end to end.
- `.env.example`. Test: `fastify.inject` against `/health`.

### `apps/web`
- Next.js 16 + React 19 + Tailwind v4 + Biome, `transpilePackages: ['@samvaad/shared']`.
- `src/config/env.ts` (zod: `NEXT_PUBLIC_API_BASE_URL`).
- One page that calls `/health` and opens the echo WebSocket, and shows both results.

## Out of scope
Microphone, captions, translation in the app, rooms.

## Definition of done
- [x] `bun install` from a clean folder works.
- [x] `bun run typecheck`, `bun run lint` and `bun run test` pass across all workspaces.
- [x] The web page shows "API ok" and "WebSocket ok".
- [ ] `bun run smoke:translate` prints a streamed English translation of a Hindi sentence.
  *(Script written; needs the Meta API key in `apps/api/.env`.)*
- [ ] `bun run smoke:transcribe` prints partial and final transcripts for all three fixtures.
  *(Script written; needs the key.)*
- [ ] D-005 and D-006 are updated with the verified protocol, and the table-mode language
  detection question in D-008 is answered. *(Updated from Meta's own docs; the live runs
  confirm or correct them.)*
- [x] The API stops at boot with a clear message when `META_API_KEY` is missing.

## Demo check
Run both smoke scripts and see Hindi audio become Hindi text, and Hindi text become English.

## Build notes (29 Oct)

Where the build differs from, or adds to, the deliverables above:

- **Fixtures are placeholders.** `scripts/fixtures/*.wav` were made with macOS voices
  (`say -v Lekha`, `say -v "Aman (English (India))"`) so the API check isn't blocked on
  recording. Replace them with our own voices; `scripts/fixtures/README.md` has the command.
- **Ports:** web on `3400`, API on `4400`, so they don't collide with other local projects.
  The API listens on `127.0.0.1` only: a tunnel or reverse proxy always sits in front of it.
- **CORS and Origin check:** `ALLOWED_WEB_ORIGINS` feeds `@fastify/cors` for HTTP, and the
  socket route checks `Origin` itself, because browsers don't apply CORS to WebSockets.
- **Echo:** the web page sends `{ type: 'ping', sentAtEpochMilliseconds }` and shows the
  round trip. Text that isn't JSON gets `{ type: 'error', code: 'INVALID_MESSAGE' }`.
- **The smoke scripts** load `apps/api/.env` (`bun --env-file`), so the key lives in one place.
  `smoke:transcribe` appends 2 s of silence so endpointing can hear the pause, measures
  where speech ends in each file, and reports "end of speech → final transcript".
- **Biome skips Markdown.** Biome 2.6 formats `.md` files, which would rewrite these docs
  and `about.md`.
