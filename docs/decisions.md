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
- **Verified live (Phase 0, 29 Oct, `smoke:transcribe` on the three fixtures):** the native
  protocol below, from Meta's docs (dev.meta.ai voice reference and schemas), which settles
  the disagreement above. LiteLLM's events are its own OpenAI-style translation of it.
  What the live run added to the docs:
  - `turnId` starts at **0**. Partials always have `final: false`; the final text only comes in
    `speechComplete`, which arrives in the same instant as `speechEnd`.
  - Partials trail the audio by about 300 to 400 ms.
  - **End of speech → `speechComplete`: 960 ms (English), 830 and 762 ms (Hinglish), within
    D-011's 1.0 s.** For the Hindi fixture, endpointing did *not* fire within 2 s of silence;
    the turn only completed when we sent `endStream` (2.5 s). One synthetic sample, so
    re-measure with real voices in Phase 1. **Phase 1, real voice (Yash, Android, 29 Oct):**
    real Hindi speech ends turns on a pause as expected, so this was the synthetic voice and we
    don't need our own silence cut-off. Either way, **`endStream` forces the open turn to
    complete at once**, which gives us a "commit" when the mic button is released.
  - After `endStream` and the final events, the socket closes with **1006** (no close frame),
    not the documented 1000. Treat a 1006 after `endStream` as a normal end.
  - `emitAudioProgress` defaults to on and sends an `audioProgress` per 80 ms frame. The API
    turns it off.
  - **Code-switching:** with the bias `["Hindi", "English"]`, the Hinglish fixture comes back
    all in Devanagari ("ब्लू पॉटरी की प्राइस पर पीस"), English words included. The English
    fixture comes back in Latin script, with numbers as digits ("200"). **Keywords** are
    accepted, but `["blue pottery", "price per piece"]` didn't change that output.
  - **Bias order doesn't matter:** `["Hindi","English"]` and `["English","Hindi"]` gave the
    same scripts for all three fixtures. Speech in a language *outside* the bias list is
    written as one of the listed languages, so the table's two languages must be the two
    actually spoken. The picker says so.
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
- **Verified live (Phase 0, 29 Oct, `smoke:translate`):**
  `POST https://api.meta.ai/v1/chat/completions` with `Authorization: Bearer <key>`,
  OpenAI-compatible. **We use `muse-spark-1.3`.** `1.2` and `1.1` also work and are no
  faster. The cheaper `-contributor` variants let Meta train on the prompts, so we don't use
  them for people's conversations. Streaming is SSE: `data: {chunk}` lines, text in
  `choices[0].delta.content` (the first chunk also has `role`), then a chunk with
  `finish_reason: "stop"` and a `usage` chunk, then `data: [DONE]`. No reasoning text is
  streamed; it only shows up as `usage.completion_tokens_details.reasoning_tokens`.
  Muse Spark always reasons (`"none"` is a 400), so we send `reasoning_effort: "minimal"`.
- **Latency, measured live:** reasoning (60 to 250 tokens) happens before the first word, and
  the response headers only arrive when it's done. Then the whole sentence streams in about
  100 ms. Time to first word on a Hindi sentence:

  | Setup | Time to first word |
  |-------|--------------------|
  | New connection per request, `minimal`, any of 1.1 / 1.2 / 1.3 | 1.4 to 2.5 s |
  | `reasoning_effort: "low"` | 2.3 s (255 reasoning tokens): slower |
  | Reused connection, our interpreter prompt | 1.1 to 1.8 s |
  | Reused connection, a terse "don't deliberate, answer immediately" prompt | 0.7 to 1.3 s |

  So D-011's 0.8 s for this step doesn't hold. See D-014.

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
  **Answered in Phase 0 (verified live):** the transcriber reports no language, in the docs
  or on the wire. **Table mode uses the Muse Spark fallback:** the prompt gets both
  languages and translates into whichever one the utterance is not. The script isn't a
  reliable signal either, because Hinglish comes back in Devanagari (D-005).

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
- **Revised by D-014** after Phase 0 measured Muse Spark.

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

## D-014 — Latency budget revised: Muse Spark's first word takes about 1 s, not 0.8 s

- **Decision:** The translation step's budget goes from 0.8 s to **1.2 s**, and the API does
  three things to stay inside it:
  1. **Keeps one warm HTTPS connection to `api.meta.ai`** (Bun's `fetch` reuses connections),
     and warms it when a session starts, so no utterance pays for a TLS handshake.
  2. **A terse system prompt** that says the task is simple and to answer immediately.
     Measured 0.7 to 1.3 s to the first word, against 1.1 to 1.8 s for a chattier prompt.
  3. **`reasoning_effort: "minimal"`**. `"low"` doubled the reasoning and the wait.

  | Step | D-011 | Now | Measured in Phase 0 |
  |------|-------|-----|---------------------|
  | Speech ends → final transcript | ≤ 1.0 s | ≤ 1.0 s | 0.76 to 0.96 s (one outlier, see D-005) |
  | Final transcript → first translated words | ≤ 0.8 s | ≤ 1.2 s | 0.7 to 1.3 s warm |
  | Full translation → speech starts | ≤ 0.5 s | ≤ 0.5 s | Phase 3 |
  | Network both ways | ≤ 0.2 s | ≤ 0.2 s | Phase 4 |
  | **Total** | **≤ 2.5 s** | **≤ 2.9 s** | |

- **Why:** Muse Spark always reasons before it answers, and the reasoning can't be turned off.
  Translation must stay on Muse Spark: it's the "Use of Meta AI tooling" score, and the
  context-aware translation in Phase 5 is the point of the product.
- **Trade-off:** The 2.5 s median in `MVP.md` §7 is now at risk. **Yash to decide** whether
  "done" becomes ≤ 3.0 s, or whether we keep 2.5 s and build the speculative step below.
- **Measured in Phase 2 (29 Oct, 11 utterances, real Meta, synthetic voices):** speech end
  → final transcript 0.82 to 0.92 s (on budget). Final transcript → first translated word
  1.0 to 2.8 s, **median ≈ 1.4 s, over the 1.2 s budget**. Speech end → translation
  complete: **median ≈ 2.5 s**, range 1.6 to 3.8 s. Browser speech (Phase 3) comes on top.
  The slow step is Muse Spark reasoning before its first word. Fixes to try, in order:
  1. Log `usage.completion_tokens_details.reasoning_tokens` per utterance, and trim the
     prompt if the code-line instruction makes it reason more.
  2. Speculative translation of stable partials (below).
  3. A model or effort change, if Meta ships a non-reasoning option.
- **Revisit when:** Phase 2 measures real conversations. If the median is over budget,
  translate the partial transcript once it has been stable for ~300 ms, and keep the result
  if the final transcript matches (D-006's "revisit"). Phase 7 can also measure whether the
  open-weights Muse Spark Open, self-hosted, answers faster.
