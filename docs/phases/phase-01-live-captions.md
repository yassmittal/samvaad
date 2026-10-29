# Phase 1 — Live captions (table mode)

**Planned:** Fri 30 Oct (IST) · **Size:** M

**Goal:** open the app on a phone, pick two languages, press the mic, speak, and see live
captions of what you said, in the language you spoke, word by word. Each finished utterance
becomes its own caption bubble. Nothing is translated yet.

This is the hardest plumbing in the project: browser audio capture, resampling, a binary
WebSocket and an upstream WebSocket to Meta. Everything after this reuses it.

**Read first:** `architecture/system-overview.md` → One utterance, step by step, and the
protocol table; `decisions.md` D-005, D-008, D-009 (as updated in Phase 0).

## Deliverables

### `packages/shared`
- `protocol/client-messages.ts`: `start_table_session { languageCodes: [a, b] }`,
  `microphone_state { isOpen }`. Binary frames carry audio and need no schema.
- `protocol/server-messages.ts`: `session_ready`, `transcript_partial`,
  `transcript_final`, `error`.
- `domain/error-code.ts`: add `UNSUPPORTED_LANGUAGE`, `MICROPHONE_NOT_OPEN`.

### `apps/api`
- `services/meta-transcription-stream.ts`: opens the upstream socket with the language bias,
  forwards PCM frames, parses Meta's events into `partial` / `final` callbacks, closes
  cleanly, and reconnects before the 60-minute cap (D-005).
- `routes/conversation-socket.ts` + `handlers/`: on `start_table_session`, remember the
  languages; on `microphone_state { isOpen: true }`, open the transcription stream; forward
  binary frames; on close, close it. Each final transcript gets an `utteranceId` and
  `speechEndedAtEpochMilliseconds`.
- `test-support/fake-meta-transcription-server.ts`: a local WebSocket server that speaks
  Meta's protocol as recorded in Phase 0, and replays scripted events.
- Tests: frames reach the fake server; partial and final events reach the browser socket;
  closing the browser socket closes the upstream one; an invalid message gets `INVALID_MESSAGE`.

### `apps/web`
- `public/audio-worklets/pcm-capture-processor.js`: the AudioWorklet. Downsamples the
  device rate (usually 48 kHz) to 16 kHz mono, converts to Int16 and posts 80 ms frames.
- `features/microphone/`: `useMicrophone()` (permission, start, stop, mute), with the
  `getUserMedia` constraints `echoCancellation`, `noiseSuppression`, `autoGainControl` on.
- `lib/conversation-socket/`: open, send JSON, send binary, parse every incoming message
  with the shared schema, reconnect once on drop.
- `features/conversation/`: a caption list. The current partial is shown greyed and
  replaced as it grows; a final becomes a solid bubble.
- `app/table/page.tsx`: pick two languages, a big mic button, the caption list.
- Clear states: mic permission denied, API unreachable, Meta unavailable.

### Dev setup
- A Cloudflare quick tunnel for the web app and the API, so a phone gets HTTPS (the mic
  needs it). Write the commands into `README.md`.

## Out of scope
Translation (Phase 2), speech output (Phase 3), rooms (Phase 4).

## Definition of done
- [ ] Captions appear while you speak, on an Android phone in Chrome, through the tunnel.
  (iPhone: only if one can be borrowed; see the open questions in `roadmap.md`.)
- [ ] A pause ends the utterance and starts a new bubble.
- [ ] Hindi, English and Hinglish fixtures all transcribe sensibly when played to the mic.
- [ ] Turning the mic off stops audio frames and closes the upstream socket (check the logs).
- [ ] Typecheck, lint and tests pass.

## Demo check
Hold the phone, speak Hindi for 20 seconds with two pauses, and watch three caption bubbles fill in.
