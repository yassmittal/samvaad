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

### Where Phase 2 left things (29 Oct)
- `playback_started { utteranceId, startedAtEpochMilliseconds }` is already in
  `packages/shared` and parsed by the API (`handlers/handle-playback-started.ts`, which only
  logs it). Phase 3 stores it and computes speech end → playback start.
- `translation_complete` carries `targetLanguageCode` and `timings`, and arrives in
  utterance order (the API's `translationDelivery`), so the speech queue can speak them as
  they come.
- **Mute was moved here from Phase 1.** `useMicrophone()` has only `open` and `close`. Mic
  gating while speaking can close and reopen it (each reopen is a new Meta stream, about
  0.5 s to connect, with frames queued meanwhile), or add a mute that stops sending frames
  but keeps the capture. Mind that Meta closes a stream that gets no audio (D-005: pacing),
  so a muted-but-open stream must still be ended with `microphone_state { isOpen: false }`.
- The latency meter (`features/conversation/latency-meter.tsx`) currently measures speech
  end → translation complete. Switch it to speech end → playback start.
- Test with `bun run dev:phone` (HTTP/2 tunnels, see Phase 1 build notes).

## Out of scope
Rooms (Phase 4). A better voice than the browser's (Phase 7).

## Definition of done
- [x] A 2-minute, turn-taking Hindi ↔ English conversation on one Android phone works with
  no self-translation. *(Yash, 30 Oct: English → Hindi and Hindi → English, end to end.)*
- [ ] *(Only if an iPhone can be borrowed, by Phase 6 at the latest)* The same on an iPhone,
  including the first-tap unlock. The unlock code is written either way.
- [ ] Median speech end → playback start is measured and written into D-011. *(Skipped for
  now, Yash's call: the app shows and logs the number, but it isn't recorded yet.)*
- [x] Typecheck, lint and tests pass.

## Demo check
Put the phone on the table, talk with someone across a language gap for two minutes.

## Build notes (29 Oct)

- **Muting keeps the capture running.** `features/microphone/create-microphone-gate.ts`
  decides whether frames go to the API: only while the mic is on *and* the phone is quiet.
  It mutes the moment a translation is queued (before any sound), sends
  `microphone_state { isOpen: false }` so Meta's stream ends cleanly (D-005: pacing), and
  reopens 300 ms after the queue goes quiet with a fresh stream. The AudioWorklet and
  `getUserMedia` stay open throughout, so reopening costs no permission prompt or
  AudioContext start. Turning the mic on while the phone speaks waits until it's quiet.
- **Everything that arrives is spoken, in arrival order** (which is utterance order). In
  table mode both people share the phone, so both directions are spoken.
- **Voices:** `pick-voice.ts` takes the exact tag, then the same language, preferring
  on-device voices, and reads `hi_IN`-style tags. An empty voice list counts as "not loaded
  yet", so the app still tries with just the language tag; only a known-missing voice makes
  a language captions only (the amber notice under the picker, and no repeat button).
- **Chrome quirks handled in `speak-with-speech-synthesis.ts`:** the utterance is kept
  referenced while it plays (Chrome drops events otherwise), and a cap of
  max(5 s, 200 ms per character) ends a speech whose `end` never fires, so the mic can't
  stay muted for good.
- **The latency meter and each bubble now show speech end → playback start.** It adds the
  API's speech end → translation complete (server clock) to this phone's translation
  received → playback start (phone clock), so the two clocks never mix; one network hop is
  left out. The API logs its own figure on `playback_started`, measured on its clock.
- **Checked in headless Chromium** through real Meta, with a WAV as the microphone: the
  mic closed as the translation was queued, no audio frames were sent while it spoke, it
  reopened after, `playback_started` followed every translation, and the repeat button
  appeared. Speech that overlaps the phone talking is dropped, as designed: take turns.
- **Phone test (Yash, 30 Oct):** works end to end on the Android phone, English → Hindi
  and Hindi → English, spoken aloud. No iPhone yet. If the phone ever hears its own voice
  after reopening, raise `MICROPHONE_REOPEN_DELAY_MILLISECONDS` (300 ms).
- **Seen once in that test:** Meta closed a stream mid-conversation with
  "Ingress audio slower than real-time" (D-005: pacing). The Cloudflare tunnel stayed up at
  that moment, and muting always ends the stream before audio stops, so the likeliest cause
  is the phone's upload stalling briefly or the screen locking. The app showed the error and
  closed the mic; the next tap opened a new stream. Handling it without a tap is in
  Phase 6's hardening list.
