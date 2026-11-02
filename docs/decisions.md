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
- **Hosts (Yash, 1 Nov):** the API at **`https://samvaad-api.yashmittal.xyz`** (nginx + certbot →
  `127.0.0.1:3030`, PM2 `samvaad-api`), next to StrideMon (3020) and meAsAgent (3010). The web
  app on Vercel at **`https://samvaad.yashmittal.xyz`**. `yashmittal.xyz`'s DNS is already on
  Vercel. The API runs on StrideMon's pinned `~/.bun-1.4.2`, the same version as `bun.lock`'s.
  Every step is in [`deployment.md`](deployment.md); Yash runs them.

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

## D-015 — Rooms: the speaker's language is known, so no detection

- **Decision:** In a two-phone room each participant picks one language. `transcript_final`
  carries it as `languageCode`, and Muse Spark gets a prompt that names the source and target
  languages ("from Hindi into English") and answers with the translation only, without table
  mode's target-language first line (D-008). Translations run once per distinct listener
  language. The transcription stream is biased to the speaker's language **plus English**
  (English alone for an English speaker), for code-switching (D-005).
- **Why:** Table mode only asks Muse Spark to work out the language because one phone hears
  both people. In a room each phone hears one person, so guessing would only add a way to
  be wrong (and a few tokens of reasoning before the first word, D-014).
  **Why plus English:** it is D-005's plan for code-switching, and `["Hindi", "English"]` is
  the bias table mode already uses, checked with real Hindi on the phone. A single-language
  bias would be a new, unchecked setting. **Not settled by measurement (30 Oct, Phase 4
  build, synthetic Hinglish fixture, one run each):** `["Hindi"]` and `["Hindi", "English"]`
  both wrote "blue pottery" as "ब्लू पाचरी" (Muse Spark then said "blue pachari"), where
  Phase 0 got "ब्लू पॉटरी" with `["Hindi", "English"]`. That's run-to-run variance, not the
  bias. Product words are Phase 5's job (keywords and the glossary).
- **Trade-off:** A speaker of another language who uses no English gets a two-language bias
  they don't need; Phase 0 found bias order doesn't matter and pure Hindi still came back in
  Devanagari with it.
- **Revisit when:** real voices in a room show the extra English bias turning
  non-English speech into Latin script.

## D-016 — Conversation context: owned by the room, a two-form glossary, memory in the system prompt

- **Decision (Yash, 30 Oct, before the Phase 5 build):**
  1. **The context belongs to the room.** It is a setting ("what's this conversation about")
     and a glossary. Either participant can change it at any time, and the API sends the new
     context to everyone in the room (`conversation_context`), and to a phone when it joins.
     The creator can fill it in on the create form, where a demo preset fills it with one
     tap. Table mode has the same editor behind a "Context" button.
  2. **A glossary entry is `{ term, preferredTranslation }`:** the term, and how it is said in
     the other language ("blue pottery" ↔ "ब्लू पॉटरी"). A blank `preferredTranslation` means
     "keep it as it is", which suits names. This replaces the spec's `preferredTranslations`
     (one form per language), which needs the room's languages before anyone has joined.
  3. **Memory goes in the system prompt**, not as earlier chat turns: the setting, the
     glossary and the last `CONVERSATION_MEMORY_UTTERANCE_COUNT` (8) utterances of the room,
     each with its transcript and, once it exists, its translation into this request's target
     language. The block says it is for reference and not to be translated. The prompt is
     kept under a character budget (oldest utterances dropped first), because Muse Spark's
     tokenizer isn't public; the schema's length limits bound the setting and glossary. An
     empty context gives exactly the Phase 4 prompt, which is also the comparison script's
     "without context" baseline.
  4. **Keywords:** every glossary term, and every non-blank `preferredTranslation`, goes to
     Muse Voice Transcribe as a keyword. Keywords are fixed at the handshake (D-005), so a
     glossary change replaces each open transcription stream once its speaker is between
     utterances (at once if they are, after the current utterance's final transcript if
     not), the same hand-over the 55-minute rotation uses.
  5. **No "I mix in English" switch.** D-015 already biases every room speaker to their
     language plus English, and table mode to its two languages, so the switch would change
     nothing. The language picker says "Mixing in English is fine" instead.
  6. **"End conversation" ends it for both phones.** The API tells everyone
     (`conversation_ended { participantName }`), every phone closes its microphone, and the
     API writes one recap per listener language with Muse Spark and sends each to the
     participants listening in it (`conversation_recap`). A table gets one in each of its two
     languages. A failed or empty recap is an `error` with the new code `RECAP_UNAVAILABLE`.
     The room stays open: the recap screen has Back to the conversation and Leave, and a
     second End recaps the whole conversation again.
- **Why:** Context is what makes this better than a phrase translator (MVP.md, the "Use of
  Meta AI tooling" score). In a real meeting either side may need to add a name. The two-form
  glossary entry is what a person would write on a card, and it doubles as two keywords.
- **Trade-off:** A longer prompt may slow Muse Spark's first word (D-014). The log line
  `translation complete` records the memory size and prompt length per utterance, and the
  comparison script prints first-word times with and without context; tuning stays parked
  with D-011. A glossary change costs one transcription reconnect per open microphone.
  Keyword effect on Meta's transcripts is unmeasured (D-005 saw none in Phase 0).
- **Revisit when:** a measurement shows the context slowing translation, or a phone in a room
  needs a single-language bias (D-015).
- **Checked in the build (30 Oct):** Meta accepts Devanagari keywords at the handshake (one
  `smoke:transcribe` run). The recap prompt says "agreed" means both people accepted it, after a
  Hindi recap called an unanswered offer agreed. One `compare:context` run: context fixed the
  name, product terms, a price said as bare numbers and the speaker's gender, and the median time
  to the first word was 1.29 s with context against 1.88 s without (one run, not a measurement).

## D-017 — Phase 6 hardening: seat keeping, a room time limit, reopening a dropped stream, dark mode

- **Decision (1 Nov, Phase 6.1 and 6.2; Yash asked for the rest of Phase 6 except submission):**
  1. **A dropped socket keeps its seat for `PARTICIPANT_RECONNECT_GRACE_SECONDS` (60).** When a
     room participant's socket closes without `leave_room`, the API closes their transcription
     but keeps them in the room, marked not connected (`room_state` participants gain
     `isConnected`). Nothing is translated for them meanwhile, so no Meta call is spent on a
     phone that can't hear it. `join_room` gains an optional `previousParticipantId`: if that
     participant is in the room, the new socket takes over the seat and keeps the id. That works
     whether the API has noticed the old socket close or not (a phone that changed networks), and
     the old socket is closed. After 60 s unclaimed, the participant leaves as before
     (`participant_left`). The phone keeps its participant id in `sessionStorage` per room, so a
     reload in the same tab gets the seat back too. `leave_room` still leaves at once. Table
     mode is not kept: a reconnect starts a new table session, as before.
  2. **A room closes its microphones after `MAX_ROOM_DURATION_MINUTES` (60).** Counted from the
     room's creation (a table session's from its start). Once it is reached, the next audio
     frame ends every open microphone in the room, everyone gets the new error code
     `ROOM_TIME_LIMIT_REACHED`, and opening a microphone there is refused with it. Context and
     End & recap still work. A forgotten open mic therefore stops within the hour. Checked at
     each audio frame rather than by a timer, so nothing needs cancelling when a room closes.
  3. **A stream that worked and then broke is reopened on its own.** When Meta ends a stream
     after a successful handshake ("Ingress audio slower than real-time", seen in Phase 3) while
     the microphone is still on, the API opens a new stream with the same language bias and
     keywords instead of reporting `UPSTREAM_UNAVAILABLE`. At most
     `MAXIMUM_AUTOMATIC_REOPENS_PER_MINUTE` (3) times a minute; past that, and for a stream
     whose handshake failed, the browser is told as before. The utterance in progress on the
     broken stream is lost.
  4. **A screen wake lock** while a room or a table session is on screen, re-requested when
     the page becomes visible again (D-001). Where the browser has no wake lock API, nothing
     happens.
  5. **Every error code has a plain sentence and a next step in the UI**, enforced by a
     `Record<ErrorCode, string>`, so a new code doesn't compile without one.
  6. **Dark mode follows the phone's setting** (`prefers-color-scheme`). The components use the
     stone scale and white surfaces, so dark mode swaps the stone scale end for end and the
     surface colour in one place, `globals.css`, instead of adding `dark:` to every class. The
     status line says "Listening", "Translating" and "Speaking" so each state is clear.
- **Why:** Mobile data drops sockets, and a dropped phone used to come back as a new participant,
  or find the room full. A forgotten open mic was the one way to drain the credit unattended.
- **Trade-off:** Anyone in the room sees the other participant's id in `room_state`, so they could
  take that seat. In a two-person room that only means kicking the other person out; not worth a
  separate token for the MVP. Translations during a dropped phone's gap are not sent later.
  The palette swap keeps component classes unchanged, but a colour outside the stone scale (rose,
  amber, indigo) is the same in both modes.
- **Revisit when:** rooms need more than two people, or a translation missed during a reconnect
  needs to be resent.

## D-018 — Rooms become a real call: Meta stays the brain, a voice API speaks, WebRTC carries the voice

- **Decision (Yash, 2 Nov):** Phase 7 turns a room into a call
  ([`phases/phase-07-real-call.md`](phases/phase-07-real-call.md)), following
  [`research/real-time-calling.md`](research/real-time-calling.md). Muse Voice Transcribe and Muse Spark
  keep doing the listening, the translating and the recap. A third-party streaming voice speaks the
  translation (D-021). WebRTC carries each person's real voice to the other phone, quietly, under the
  translation (D-023). The UI copies the shape of a phone call (D-022). Phase 7 comes before Phase 6.3
  (submission). In the UI the word is "call"; in the code and docs it stays **room** (vocabulary table).
- **Why:** Yash wants a WhatsApp-call experience, for the hackathon and as the start of a product. A
  single speech-to-speech model (`gpt-realtime-translate`, Gemini Live Translate) would be faster but
  would replace Meta's models, which Stage One requires and "Use of Meta AI tooling" (25%) scores.
- **Trade-off:** Two more vendors in the path (a voice API, a TURN service), each with its own key and
  failure mode, so each has a fallback: the browser voice (D-007), and captions plus the translated voice
  when WebRTC can't connect. `MVP.md` §5's "not in the MVP: phone or video calls (WebRTC media)" no
  longer holds.
- **Revisit when:** after the hackathon (LiveKit and a translation agent per room, native apps, a
  speech-to-speech fast lane: research doc §11).

## D-019 — Keep the transcription stream open while the phone speaks: send silence, don't close

- **Decision:** While the phone speaks a translation, the microphone gate replaces the audio frames
  with silence of the same size and pace, instead of stopping them. `microphone_state { isOpen: false }`
  is only sent when the person turns the mic off. The 300 ms after speaking stays silent too (D-008).
- **Why:** Closing ended Meta's stream every time a translation was spoken, and reopening costs a new
  handshake (about 0.5 s, Phase 3 notes) before the reply is heard. Meta closes a stream that stops
  receiving audio (D-005), and silence keeps it fed. Meta bills by audio time ($0.18 an hour), so
  silence costs almost nothing.
- **Trade-off:** The other phone no longer sees this mic "off" while it speaks (`room_state`); the
  orb shows "speaking" instead. An utterance the person was in the middle of when a translation
  started is still cut short by the silence, as before.
- **Revisit when:** echo is proven cancelled on speaker (research doc §7); then the gate can go.

## D-020 — Race two translation requests and keep the first to answer

- **Decision:** Each translation sends `TRANSLATION_PARALLEL_REQUEST_COUNT` (default **2**) identical
  Muse Spark requests at once. The first to yield text wins; the others are aborted. A request that
  fails before any text is ignored while another is still running; only when all fail is it an error.
  `1` turns the race off.
- **Why:** Muse Spark's time to the first word varies from 1.0 to 2.8 s for the same kind of sentence
  (D-014), because of how long it reasons. The faster of two draws cuts both the median and the long
  tail. A translation is a few hundred tokens, so doubling it costs cents over a whole demo.
- **Trade-off:** About twice the translation tokens and requests (rate limits). The recap isn't raced.
- **Revisit when:** a faster model makes the spread small (7.6), or rate limits bite.

## D-021 — Spoken translation in a natural voice: streaming TTS from the API, browser voice as fallback

- **Decision:** The API synthesises each finished translation with a streaming TTS API and sends the
  audio to the listeners, in utterance order, as binary WebSocket frames (utterance id + 24 kHz mono
  PCM16), followed by `translation_audio_end`. `translation_complete` says whether audio follows
  (`hasTranslationAudio`). The phone plays the audio through one `AudioContext`, unlocked on the first
  tap like `speechSynthesis` (D-007). If synthesis fails, `translation_audio_end { hasFailed: true }`
  makes the phone speak the text with its own voice, as before. Providers: **ElevenLabs** (Flash v2.5)
  and **Cartesia** (Sonic), behind one interface, chosen by `SPEECH_PROVIDER`; the default stays
  `browser`, so nothing needs a new key to run. `SPEECH_VOICE_IDS` gives the room's first participant
  the first voice and the second the second, so the two people sound different. The provider and voices
  are picked by Yash after `scripts/compare-voices.ts` (Phase 7.3).
- **Why:** The browser voice is the weakest part of the demo (D-007). Both providers speak Hindi and
  English, stream their first audio in well under half a second, and have free tiers that cover a demo.
  Synthesising after `translation_complete` rather than mid-stream costs about 100 ms (Muse Spark
  streams a whole sentence that fast once it starts, D-006) and keeps one request per utterance.
  Raw PCM needs no decoder in the browser. The key stays on the API, like Meta's.
- **Trade-off:** Another network hop and vendor. About 48 KB/s down per second of speech (raw 24 kHz
  PCM16), fine on mobile data. Free tiers are non-commercial; the product needs a paid plan. Ordered
  delivery now waits for an utterance's audio before the next utterance's captions go out; synthesis runs
  faster than real time, so the wait is short.
- **Revisit when:** voice cloning is wanted (both providers clone), or an Indian-language voice
  (Sarvam) sounds clearly better for Hindi in the bake-off.
- **Bake-off (2 Nov, `compare:voices` from Yash's laptop, five demo lines per voice):** both keys and
  both request formats work. Time to the first audio byte, after each batch's cold first line:
  **Cartesia `sonic-3` 180 to 330 ms**, ElevenLabs Flash v2.5 560 to 1,000 ms (cold first lines 1.0 s
  and 2.3 to 3.3 s). Cartesia has native Hindi voices. **Set locally, until Yash has listened:**
  `SPEECH_PROVIDER=cartesia`, Dev (Hindi male) for the caller and Meera (Hindi female) for the person
  who answers. **One in-app run** (two headless browsers, the English fixture as the microphone, real
  Meta and Cartesia): final transcript → first translated word 728 ms, translation complete → first
  audio 214 ms, **speech end → playback start 2.07 s** (one sample, not a measurement).

## D-022 — The call UI: start, share, answer, talk, end

- **Decision:** The room screens are redesigned as a phone call (Phase 7.4): home with one **Start a
  call** button; a calling screen with Share, QR and code; an incoming screen ("Ramesh is calling ·
  speaks Hindi") with a big **Answer**; a dark in-call screen with one orb, the newest words large, ✓/✓✓
  receipts, and a bottom bar (Mute, Original voice, Captions, Context, End call); the recap with **Call
  again**. The mic opens on Answer, and for the creator once the other person joins: no mic button to
  find. To show who is calling before joining, the browser sends `preview_room { roomCode }` and the
  API answers `room_preview { roomCode, participants: [{ participantName, languageCode }] }` or
  `ROOM_NOT_FOUND`. For the ✓/✓✓ receipts, the API sends the speaker `utterance_receipt { utteranceId,
  receipt: 'translated' | 'heard' }` when the translation reaches the other phone and when that phone
  reports `playback_started`; each remembered utterance keeps its `speakerParticipantId` for this. The
  orb has six states: idle, you speaking, translating (your colour sweeping to
  theirs), they speaking, their translation playing, reconnecting. Tokens: a dark call screen, a warm
  hue for you and a cool one for them, captions at 28 to 32 px, springs of 200 to 400 ms, and only the
  orb loops. Table mode keeps its current screen.
- **Why:** "Make it like a WhatsApp call, as simple as possible" (Yash). Everyone already knows how a
  call screen works, so nothing needs explaining. The patterns come from Apple's and Google's call
  translation and WhatsApp's call screen; no other site's code or assets are copied (research doc §10).
- **Trade-off:** The orb's "they are speaking" state comes from `room_state` and the receipts until
  WebRTC (D-023) gives the phone their audio level. More motion means more to test on a cheap Android phone.
- **Revisit when:** native apps (ringing, lock screen).

## D-023 — The real voice: WebRTC audio between the two phones, signalled through the API

- **Decision:** In a two-person room, the phones open a WebRTC peer connection for audio only. Offers,
  answers and ICE candidates travel over the conversation socket as `webrtc_signal`, which the API relays
  only between participants of the same room. The API sends `ice_servers` after `room_joined`:
  Cloudflare's free STUN, plus short-lived Cloudflare TURN credentials when `CLOUDFLARE_TURN_KEY_ID`
  and `CLOUDFLARE_TURN_API_TOKEN` are set. The participant who joined second makes the offer. One
  `getUserMedia` stream feeds both the PCM capture (D-009) and the peer connection. The other person's
  voice plays through an `<audio>` element at `ORIGINAL_VOICE_VOLUME` (0.25), under the translated
  voice, with an "Original voice" switch in the call bar. The send track is disabled whenever the mic
  gate isn't sending real audio (muted, or the phone speaking a translation, D-019).
- **Why:** Hearing the real voice is what makes it a call: tone, laughter, "hmm", and knowing they're
  talking before the translation comes (Google Meet does the same). Peer-to-peer costs nothing and is the
  shortest path between two phones in India. Playing the remote track through a media element keeps it
  inside what the browser's echo canceller cancels (research doc §7). Muting the send track while the
  phone speaks stops a speaker hearing their own translation come back.
- **Trade-off:** Mobile carriers' NAT can block peer-to-peer without TURN; then the call works as before,
  captions and translated voice, without the real voice. iOS ignores `<audio>.volume`, so on an iPhone
  the original voice is on (full volume) or off. The original voice can't be heard while your own phone
  speaks a translation.
- **Revisit when:** LiveKit replaces peer-to-peer after the hackathon (research doc §6).
- **Revised by D-024:** the original voice now starts off, and goes quiet while the phone plays a translation.

## D-024 — Fixes from the first live call: pace Meta's audio in the API, the original voice starts off

- **Context:** Yash's first call on the hosted app (2 Nov) had two problems. People heard the other
  person's real voice about as loudly as the translation, and some sentences were never translated.
  The API log showed why the sentences were lost. On one phone, Meta ended the transcription stream with
  "Ingress audio slower than real-time" about 16 s after every reopen (11 times in one call, 1 in all the
  days before). That phone's microphone delivers slightly less than real-time audio. Before Phase 7, a mic
  was only open while someone was talking, so the shortfall rarely added up. Now the mic stays open for the
  whole call (D-019, D-022), so it adds up every 16 s. Whatever was being said at that moment was lost
  (D-017 reopens the stream, but not the utterance).
- **Decision:**
  1. **The API keeps Meta's audio at real-time pace.** When the audio forwarded on a stream falls more than
     `TRANSCRIPTION_MAXIMUM_AUDIO_LAG_MILLISECONDS` (default 400, `0` turns it off) behind the time since
     the stream opened, the API sends Meta 80 ms frames of silence until the gap is back under that.
     The silence counts as audio received, so the speech-end time (D-011) still lines up with Meta's
     positions. Each stream logs how much silence it needed when it closes, so the phone's shortfall shows up.
  2. **The original voice (D-023) starts off.** "Their voice" in the call bar turns it on. When it's on,
     it goes silent while this phone plays a translation, so the translation is always what you hear.
- **Why:** The phone can't be trusted to keep time (a sample-rate mismatch, a throttled audio thread, a
  slow uplink), but the API can. A few 80 ms gaps of silence are inaudible to the transcriber, while a broken
  stream loses a whole sentence. And a translated call should sound translated by default. The real voice
  under it is a choice for people who want it, not something everyone has to tune out.
- **Trade-off:** If a phone's uplink stalls and then sends everything at once, the padded silence plus the
  late audio can put the stream ahead of real time. Meta tolerates a few seconds ahead (the 4 s connect
  queue, D-017). Fewer people will discover the original voice.

