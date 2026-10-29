# Decision Log

Every significant choice, why it was made, and what it costs. When a decision changes,
add a new entry that supersedes the old one. Don't rewrite history.

Format: **Decision**, **Why**, **Trade-off**, **Revisit when**.

---

## D-001 — A web app, not a native app

- **Decision:** A Next.js 16 + React 19 + Tailwind v4 web app that works in a phone's
  browser. No Expo, no app store builds.
- **Why:** Six days. Judges and the community vote can open a link and try it with no
  install. `getUserMedia` and `speechSynthesis` work in mobile Chrome and Safari over HTTPS.
- **Trade-off:** No background audio and no lock-screen controls. The screen has to stay
  on during a conversation (we ask for a wake lock in Phase 6).
- **Revisit when:** after the hackathon, if it becomes a product.

## D-002 — A separate realtime server on Fastify, not Next.js route handlers

- **Decision:** `apps/api` is Fastify 5 on Bun with `@fastify/websocket`. It holds the
  browser WebSockets, the upstream Meta transcription WebSockets and the rooms. The
  layering (`routes → handlers → lib/services`) is the one used in StrideMon and `meAsAgent`.
- **Why:** The core of the app is long-lived WebSockets. Vercel functions can't hold them,
  and the Meta API key must stay on a server (the browser can't open Meta's socket itself
  without exposing the key).
- **Trade-off:** Two deploys (web and API) instead of one.

## D-003 — Bun workspaces monorepo

- **Decision:** `apps/web`, `apps/api`, `packages/shared`. Bun is the package manager and
  the API runtime. Biome for lint and format.
- **Why:** The browser and the server speak one WebSocket protocol. Defining it once in
  zod, in `packages/shared`, and importing it on both sides removes a whole class of bugs.
  Same shape as StrideMon.
- **Trade-off:** Next.js needs `transpilePackages: ['@samvaad/shared']`.

## D-004 — No database in the MVP

- **Decision:** Rooms, participants and the conversation so far live in memory in
  `apps/api`. Nothing is saved after a room closes.
- **Why:** Nothing in the MVP needs to survive a restart. It's also the honest privacy
  story: we don't keep anyone's conversation.
- **Trade-off:** Restarting the API ends every conversation. One API process only.
- **Revisit when:** saved recaps or accounts are wanted (after the hackathon).

## D-005 — Speech to text: Muse Voice Transcribe, one upstream socket per speaker

- **Decision:** For each participant whose microphone is on, `apps/api` opens one
  WebSocket to Muse Voice Transcribe (`wss://api.meta.ai/v1/asr/realtime`, model
  `muse-voice-transcribe-1.0`) in **endpointing** mode, so the server tells us when a
  sentence ended. The participant's language is set as the language bias. For Hinglish
  speakers, the bias is a list (Hindi and English) for code-switching.
- **Why:** It's the Meta model built for exactly this, and its endpointing gives us the
  "sentence finished, translate it now" signal for free. One socket per speaker keeps
  speakers apart without relying on diarization.
- **Trade-off:** The configuration is fixed at the handshake, so changing language means a
  reconnect. Sessions are capped at 60 minutes, so we reconnect before that.
- **Unverified until Phase 0:** the exact native protocol. Third-party docs disagree:
  LiteLLM shows OpenAI-style events (`conversation.item.input_audio_transcription.delta` /
  `.completed`), Pipecat shows native ones (`speechStart`, partials, `speechEnd`,
  `speechComplete`) with the key sent in a handshake frame. Phase 0 records the truth here.
- **Documented by Meta (dev.meta.ai voice reference and schemas, read 29 Oct):** the native
  protocol, which settles the disagreement above. LiteLLM's events are its own OpenAI-style
  translation of it. `scripts/smoke-transcribe.ts` is built on this. **Live check pending:**
  it has not yet been run against the real API (waiting on the key).
  - **Handshake:** the first text frame, within 10 s. The key is *not* an HTTP header:
    `{ authorization: { accessToken: "Bearer <key>" }, model, audioEncoding, mode,
    languageBias?, keywords?, partialMode?, emitAudioProgress? }`. The server answers with
    `{ sessionId }`, the only frame without a `type`.
  - **Audio:** binary frames of raw PCM16 little-endian mono. `audioEncoding` is
    `PCM_16KHZ` or `PCM_24KHZ` (native; 16 kHz is resampled by Meta). Paced in real time:
    audio sent too far ahead, or too slowly, closes the socket with `1008`.
  - **Modes:** `PUSH_TO_TALK` (default), `ENDPOINTING`, `DIARIZATION`. We use `ENDPOINTING`.
  - **Events, dispatched on `type`:** `speechStart { turnId }` → `transcript { transcript,
    final }` (cumulative partials, no `turnId`: they belong to the latest `speechStart`) →
    `speechEnd { turnId }` → `speechComplete { turnId, transcript }` (the final text, with
    punctuation). Also `speaker`, `audioProgress` and `error { message, errorCode? }`.
    Every event carries `audioProcessedMs`. Unknown types are to be ignored.
  - **Language bias** is a list of English language *names* (`["Hindi", "English"]`), not
    ISO codes, so `englishName` in `supported-languages.ts` doubles as the bias value.
    Omitting it means auto-detect. **Keywords** are a list of strings, set at the handshake.
  - **Ending:** send `{ "type": "endStream" }`, then keep reading until Meta closes with
    `1000`. Close codes: `1008` bad request or pacing (don't retry as is), `1011` server
    failure or "Max session duration reached" (reconnect), `1013` rate limited (back off).

## D-006 — Translation: Muse Spark, one finished utterance at a time, streamed

- **Decision:** When the transcriber marks an utterance final, `apps/api` asks Muse Spark
  (Chat Completions, `stream: true`) to translate it into every other participant's
  language and streams the result to them as it arrives.
- **Why:** Translating partial transcripts means translating text that is about to change,
  which costs tokens and makes captions jump. One utterance at a time is predictable and
  fast enough (D-011).
- **Trade-off:** You hear nothing until the speaker pauses. Long monologues feel slow.
- **Revisit when:** latency is measured in Phase 2. If utterances are long, translate
  at clause boundaries in the partials.
- **Documented by Meta (dev.meta.ai, read 29 Oct), live check pending:**
  `POST https://api.meta.ai/v1/chat/completions` with `Authorization: Bearer <key>`,
  OpenAI-compatible. Model ids: `muse-spark-1.3` (recommended, the smoke script's default),
  `1.2`, `1.1` and cheaper `-contributor` variants, which let Meta train on the prompts, so we
  don't use them for people's conversations. Streaming is SSE: `data: {chunk}` lines with
  the text in `choices[0].delta.content`, ending with `data: [DONE]`. Muse Spark always
  reasons: `reasoning_effort: "none"` is a 400, so we ask for `"minimal"` to keep latency
  down. The output cap is `max_completion_tokens`.

## D-007 — Text to speech: the browser's `speechSynthesis` first

- **Decision:** The listener's own browser speaks the translation with `speechSynthesis`,
  choosing a voice for the target language.
- **Why:** Meta's API has no speech output model. The browser voice is free, has no network
  round trip, and has Hindi and English voices on Android and iOS.
- **Trade-off:** Voices sound robotic and vary by device. iOS Safari only speaks after a user
  gesture, so the first tap must "unlock" speech. Some languages have no voice on some phones.
- **Revisit when:** Phase 7, if there is time for a better voice (an open model such as
  Kokoro or a paid voice API). The hackathon rule is that Meta's models must be *used*,
  not used exclusively.

## D-008 — Two modes: table mode first, then two-phone rooms

- **Decision:** **Table mode** (one phone, two languages) is built first, in Phases 1 to 3.
  **Two-phone rooms** come in Phase 4 and are the headline of the demo.
- **Why:** Table mode needs no rooms, so the audio → text → translation → speech pipeline is
  proven before the networking. Two phones with earbuds have no echo problem and look best
  on video.
- **Trade-off:** In table mode the phone hears its own voice. While it speaks, the
  microphone is muted, so the people must take turns.
- **Which language was spoken (table mode):** the transcriber is biased to both languages.
  If Phase 0 shows it reports the detected language, we use that. If not, Muse Spark is
  asked to translate "into whichever of the two languages this is not".
  **Phase 0, from Meta's docs:** no event schema has a language field, so expect the Muse
  Spark fallback. `smoke:transcribe` prints any undocumented field it sees, so the live run
  will show if a language field exists anyway.

## D-009 — Audio path: AudioWorklet → 16 kHz mono PCM16 → binary WebSocket frames

- **Decision:** The browser captures the mic with an `AudioWorklet`, downsamples to 16 kHz
  mono, converts to signed 16-bit PCM and sends ~80 ms binary frames over our WebSocket.
  The API forwards them to Meta in the format Meta wants.
- **Why:** Muse Voice Transcribe takes 16 or 24 kHz PCM16. Sending binary instead of base64
  JSON saves a third of the bandwidth on mobile data, and 80 ms frames match the pacing used
  by LiteLLM's proxy.
- **Trade-off:** We write a small resampler. `MediaRecorder` (Opus) would be less code but
  would need decoding on the server.

## D-010 — Hosting: web on Vercel, API on the EC2 instance under PM2

- **Decision:** `apps/web` on Vercel. `apps/api` on Yash's EC2 instance under PM2 behind
  TLS (`wss://`), the same setup as StrideMon's API. During development, phones reach the
  laptop through a Cloudflare quick tunnel, because the microphone needs HTTPS.
- **Why:** Long-lived WebSockets need a long-lived process. The instance and the PM2 setup
  already exist.
- **Trade-off:** One more service on the instance. Confirm with Yash before deploying (Phase 6).

## D-011 — A latency budget, measured from Phase 2

- **Decision:** The target is a median **≤ 2.5 s** from the end of a sentence to the listener
  hearing its first word. Every translated utterance carries timings, and the app shows them.

  | Step | Budget |
  |------|--------|
  | Speech ends → final transcript (Meta endpointing) | ≤ 1.0 s |
  | Final transcript → first translated words (Muse Spark, streamed) | ≤ 0.8 s |
  | Full translation → speech starts (browser) | ≤ 0.5 s |
  | Network both ways | ≤ 0.2 s |

- **Why:** "Real time" is the claim. A number on screen backs it up in the demo video and
  tells us which step to fix.
- **Trade-off:** A few timestamp fields in the protocol.

## D-012 — Tests: `bun test` for pure logic and a fake Meta server

- **Decision:** `bun test` in `packages/shared` and `apps/api`. The API's socket handling is
  tested against a **fake Meta transcription server** and a **fake Muse Spark endpoint**, so
  tests are fast, free and run offline. The web app is checked by hand on real phones.
- **Why:** Tests that call the real API cost credits and fail when the network does.
- **Trade-off:** The fakes can drift from the real API. Phase 0's smoke scripts are the check.
- **Phase 0 note:** the API's socket tests open a real listening server on a random port and
  use Bun's built-in `WebSocket`. `@fastify/websocket`'s `injectWS` doesn't work under Bun,
  because it relies on internals of the `ws` package, which Bun replaces.

## D-013 — TypeScript 5.9, not 7

- **Decision:** Every workspace pins `typescript ~5.9.3`, although npm's `latest` is 7.0.
- **Why:** TypeScript 7 is the native (Go) compiler. `next build` and `next typegen` call
  TypeScript's JavaScript API, and 5.9 is what Next.js 16 is built and tested against. Six
  days is not the time to find out.
- **Trade-off:** Slower typechecks than tsgo. Irrelevant at this size.
- **Revisit when:** after the hackathon, once Next.js documents TypeScript 7 support.
