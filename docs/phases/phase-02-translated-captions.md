# Phase 2 — Translated captions

**Planned:** Sat 31 Oct, morning (IST) · **Size:** S

**Goal:** every finished utterance is translated into the *other* language of the table
session, and the translation streams in under the original. Each bubble shows how long the
translation took. This is where the latency budget (D-011) is first measured.

**Read first:** `decisions.md` D-006, D-008 (which language was spoken), D-011.

## Deliverables

### `packages/shared`
- `protocol/server-messages.ts`: `translation_delta`, `translation_complete` with
  `timings { speechEndedAtEpochMilliseconds, transcriptFinalAtEpochMilliseconds,
  firstTranslationDeltaAtEpochMilliseconds, translationCompleteAtEpochMilliseconds }`.
- `protocol/client-messages.ts`: `playback_started { utteranceId, startedAtEpochMilliseconds }`
  (used from Phase 3; added now so the timings type is complete).

### `apps/api`
- `services/meta-translation-client.ts`: Muse Spark Chat Completions with `stream: true`.
  Yields text deltas. Handles a `null` delta content. Times out after
  `TRANSLATION_TIMEOUT_MILLISECONDS`.
- `lib/build-translation-prompt.ts` (pure): a system prompt that says *translate, don't
  answer*. Output only the translation. Keep names, numbers and units. Keep the register
  (formal stays formal). In table mode: "translate into whichever of A and B the text is not
  in" when the transcriber doesn't report the language (D-008).
- `handlers/`: on each `transcript_final`, start the translation and stream deltas to the
  socket. Utterances are translated in order: a later one never overtakes an earlier one.
- `test-support/fake-muse-spark-server.ts`: a local HTTP endpoint that streams scripted
  deltas with controllable delays.
- Tests: prompt shape, in-order delivery when the second translation finishes first,
  timeout → `error { code: 'UPSTREAM_UNAVAILABLE' }` for that utterance only.

### `apps/web`
- Caption bubbles show the original small and the translation large, filling in as deltas arrive.
- A small latency label per bubble: "translated in 0.9 s".
- `features/conversation/latency-meter.tsx`: the running median of
  speech end → translation complete, for the session.

### Settled before building (29 Oct)
- **Which way to translate (table mode):** the transcriber doesn't say (D-008), so the prompt
  asks Muse Spark to write the target `languageCode` on its first line, then the
  translation. The API strips that line and uses it as `targetLanguageCode`. If the line is
  missing or wrong, the API falls back to the session's second language and logs it.
  Mixed speech goes by its grammar: Hinglish counts as Hindi, so it goes to English.
- **Ordered delivery:** every translation starts as soon as its transcript is final (no
  waiting in line), but its messages are held until the previous utterance's translation
  has finished. A later one never overtakes an earlier one.
- **`error` gets an optional `utteranceId`**, so a failed translation marks that bubble
  only. Failure is a timeout (`TRANSLATION_TIMEOUT_MILLISECONDS`, 10 s) or an HTTP error.
- **Latency (D-014):** terse prompt, `reasoning_effort: "minimal"`, and a warm-up request
  when a session starts, so the first utterance doesn't pay for the TLS handshake.
- **New env, for the fake server in tests:** `META_CHAT_COMPLETIONS_URL` (default
  `https://api.meta.ai/v1/chat/completions`) and `META_TRANSLATION_MODEL_ID` (default
  `muse-spark-1.3`).
- `playback_started` is parsed and logged; Phase 3 uses it.

## Out of scope
Speaking (Phase 3). Conversation memory (Phase 5).

## Definition of done
- [x] Hindi in → English caption; English in → Hindi caption; Hinglish → the right side.
- [x] Translations never answer the speaker ("How are you?" is translated, not answered). Test it.
  *("How are you? What is your name?" and "आप कैसे हैं? आपका नाम क्या है?" both came back
  translated, through real Meta.)*
- [x] Ten utterances in a row arrive in order. *(A unit test runs ten translations at
  random speeds; a socket test makes the second finish first. Five in a row through real
  Meta also arrived in order.)*
- [x] The median speech end → translation complete is written into D-011 as measured.
  If it's over 2 s, note which step is slow and the fix to try. *(See D-014: about 2.7 s;
  Muse Spark's time to first word is the slow step.)*
- [x] Typecheck, lint and tests pass.

## Demo check
Speak a Hindi sentence and read its English translation appear under it, with the time it took.

## Build notes (29 Oct)

- **Checked end to end in headless Chromium** with the fixtures as a fake microphone,
  through the real API, Muse Voice Transcribe and Muse Spark. Not yet checked by a person on
  the phone (the phone path is the same code as Phase 1 plus new messages).
- **Measured, 11 utterances over four runs** (synthetic voices, API behind the tunnel; the
  per-step split comes from the 6 utterances logged with timings):

  | Step | Measured | Budget (D-014) |
  |------|----------|----------------|
  | Speech end → final transcript | 0.82 to 0.92 s | ≤ 1.0 s |
  | Final transcript → first translated word | 1.0 to 2.8 s, median ≈ 1.4 s | ≤ 1.2 s |
  | First word → whole translation | 0.02 to 0.14 s | — |
  | **Speech end → translation complete** | **1.6 to 3.8 s, median ≈ 2.5 s** | |

- The slow step is Muse Spark's reasoning before its first word. Fixes to try, in order, in
  D-014.
- Translation failures show on their own bubble ("This sentence couldn't be translated");
  the status line is for connection and microphone problems only.
- The smoke script's SSE parser moved to `apps/api/src/lib/parse-server-sent-events.ts`, and
  `scripts/smoke-translate.ts` imports it from there.
