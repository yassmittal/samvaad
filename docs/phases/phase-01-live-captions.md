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

### Settled before building (29 Oct, from Phase 0's findings)
- `session_ready { participantId, languageCodes }` answers `start_table_session`. Sending
  `start_table_session` again (new languages) replaces the session and its stream.
- `transcript_final.languageCode` is `null` in table mode: the transcriber doesn't say which
  language was spoken (D-008). Phase 2's translation works it out.
- The handshake sets `mode: ENDPOINTING`, `audioEncoding: PCM_16KHZ`,
  `emitAudioProgress: false` and `languageBias` from the two languages' `englishName`s.
- Frames that arrive before Meta answers the handshake are queued, then sent in order.
- **Mic off sends `endStream`**, which completes the open utterance at once (D-005), then the
  stream closes. A 1006 close after `endStream` is normal.
- `speechEndedAtEpochMilliseconds` maps Meta's `speechEnd.audioProcessedMs` back to when that
  audio reached the API, so the Phase 2 latency meter includes endpointing.
- `apps/api` gets `META_TRANSCRIPTION_URL` (default `wss://api.meta.ai/v1/asr/realtime`) so
  tests can point it at the fake server.
- Phase 0's echo goes away. The home page keeps the API health check and links to table mode.
- `next.config.ts` allows `*.trycloudflare.com` as a dev origin, so the tunnel works.

## Out of scope
Translation (Phase 2), speech output (Phase 3), rooms (Phase 4).

## Definition of done
- [x] Captions appear while you speak, on an Android phone in Chrome, through the tunnel.
  (iPhone: only if one can be borrowed; see the open questions in `roadmap.md`.)
  *(Yash, 29 Oct: real Hindi speech transcribed correctly on the Android phone.)*
- [x] A pause ends the utterance and starts a new bubble.
- [x] Hindi, English and Hinglish fixtures all transcribe sensibly when played to the mic.
  *(Checked in headless Chromium with the fixtures as a fake microphone, through the real
  AudioWorklet, API and Meta. Not yet with real voices.)*
- [x] Turning the mic off stops audio frames and closes the upstream socket (check the logs).
- [x] Typecheck, lint and tests pass.

## Demo check
Hold the phone, speak Hindi for 20 seconds with two pauses, and watch three caption bubbles fill in.

## Build notes (29 Oct)

- **Checked end to end without a phone:** headless Chromium with
  `--use-file-for-fake-audio-capture` plays a WAV as the microphone. The worklet sent exactly
  one frame per 80 ms, three utterances separated by 2 s pauses became three bubbles, and
  partials streamed live. Captured in a throwaway script, not in the repo (it needs a local
  Playwright Chromium).
- **Phone test (Yash, 29 Oct):** real Hindi transcribes correctly; a pause starts a new
  bubble; stop mid-sentence finalises it; it still works from across the room. The
  synthetic Hindi fixture's endpointing problem (below) doesn't happen with a real voice.
- **Hindi endpointing, again:** the Hindi fixture's turn didn't end on its own, even after
  3.5 s of silence. It only completed when the mic closed (`endStream`). English and
  Hinglish ended within about 1 s. Try a real Hindi voice on the phone before treating this
  as a bug. If it holds, add our own "silence for N ms → `endStream` and reopen" in Phase 2
  (D-005's mitigation).
- **Mute moved to Phase 3**, where speaking the translation needs it. `useMicrophone()` has
  open and close only.
- **`bun run dev:phone`** (`scripts/dev-phone.ts`) starts both Cloudflare quick tunnels,
  passes their URLs to the API (`ALLOWED_WEB_ORIGINS`) and the web app
  (`NEXT_PUBLIC_API_BASE_URL`), and prints the URL to open on the phone.
- **Reconnects, changed from "once":** the first phone test hit Cloudflare quick tunnels
  dropping and re-registering 10 times in their first few minutes (Cloudflare error 1033
  meanwhile), and a WebSocket handshake that hung forever ("Connecting…"). The socket client
  now gives up on a handshake after 10 s and retries up to 5 times (1, 2, 4, 8, 16 s apart),
  then shows **Try again**. Rejoining a room after a drop is still Phase 6.
- **`dev:phone` and the tunnels:** it keeps reading cloudflared's log (if it stops, cloudflared
  dies on its next log line), writes each tunnel's log to `$TMPDIR/samvaad-dev-phone/`, and
  prints a line when a tunnel drops and when it's back.
- **Tunnels use HTTP/2, not QUIC.** cloudflared's default QUIC (UDP) kept timing out on our
  network ("failed to dial to edge with quic: timeout: no recent network activity"), dropping
  both tunnels every 20 to 40 s. Page JavaScript failed to download mid-drop, so the page
  never hydrated and sat on its server-rendered "Connecting…". An HTTP/2 (TCP) tunnel
  carried the conversation socket for 90 s with no errors. `dev:phone` passes
  `--protocol http2`.
