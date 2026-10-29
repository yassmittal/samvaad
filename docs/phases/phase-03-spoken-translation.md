# Phase 3 — Spoken translation (table mode done)

**Planned:** Sat 31 Oct, afternoon (IST) · **Size:** S

**Goal:** one phone lies on the table between two people. One speaks Hindi; the phone says
it in English. The other answers in English; the phone says it in Hindi. The mic is muted
while the phone speaks, so it never translates itself. **Table mode is done.**

**Read first:** `decisions.md` D-007, D-008, D-011.

## Deliverables

### `apps/web`
- `features/speech-output/`:
  - `speech-queue.ts`: speaks `translation_complete` texts one at a time, in utterance order.
  - `pick-voice.ts`: picks the best `speechSynthesis` voice for a `speechSynthesisLanguageTag`
    (exact tag, then same language, then none). Handles voices loading late
    (`voiceschanged`).
  - `unlock-speech.ts`: speaks an empty utterance inside the first tap, for iOS Safari (D-007).
  - `useSpeechOutput()`: `isSpeaking`, the queue, and a per-language "no voice on this
    device" flag.
- Mic gating: while `isSpeaking`, send `microphone_state { isOpen: false }` and stop
  sending frames; reopen 300 ms after speech ends (`MICROPHONE_REOPEN_DELAY_MILLISECONDS`).
- Send `playback_started` when speech begins. The latency meter now measures
  **speech end → playback start**, the number that matters (D-011).
- UI: a clear "speaking…" state on the mic button, a "repeat" button on each bubble, and a
  notice when a language has no voice ("Captions only for Tamil on this phone").

### `apps/api`
- Store `playback_started` timings with the utterance and log the end-to-end latency.

## Out of scope
Rooms (Phase 4). A better voice than the browser's (Phase 7).

## Definition of done
- [ ] A 2-minute, turn-taking Hindi ↔ English conversation on one Android phone works with
  no self-translation.
- [ ] *(Only if an iPhone can be borrowed, by Phase 6 at the latest)* The same on an iPhone,
  including the first-tap unlock. The unlock code is written either way.
- [ ] Median speech end → playback start is measured and written into D-011.
- [ ] Typecheck, lint and tests pass.

## Demo check
Put the phone on the table, talk with someone across a language gap for two minutes.
