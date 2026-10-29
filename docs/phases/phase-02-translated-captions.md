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

## Out of scope
Speaking (Phase 3). Conversation memory (Phase 5).

## Definition of done
- [ ] Hindi in → English caption; English in → Hindi caption; Hinglish → the right side.
- [ ] Translations never answer the speaker ("How are you?" is translated, not answered). Test it.
- [ ] Ten utterances in a row arrive in order.
- [ ] The median speech end → translation complete is written into D-011 as measured.
  If it's over 2 s, note which step is slow and the fix to try.
- [ ] Typecheck, lint and tests pass.

## Demo check
Speak a Hindi sentence and read its English translation appear under it, with the time it took.
