# Phase 7 — A real call

**Planned:** Mon 2 Nov – Wed 4 Nov morning (IST), before Phase 6.3 · **Size:** L, in parts

**Goal:** a room stops feeling like a translator app and starts feeling like a WhatsApp call. You
answer, you talk, you hear the other person's real voice faintly and their words in your language in
a natural voice about a second and a half after they pause.

> **2 Nov (Yash):** go with the recommendation in
> [`../research/real-time-calling.md`](../research/real-time-calling.md): Meta stays the brain
> (transcription, translation, recap), a voice API speaks, WebRTC carries the real voice. For the
> hackathon and as the start of a product. Small spend is fine if free tiers cover the demo.

**Read first:** the research doc above, `decisions.md` D-018 onwards, D-005, D-007, D-008, D-014.

Built in parts, in this order. Each part ends runnable, with typecheck, lint and tests passing.
If time runs short, cut from the bottom.

| Part | What | Decision | Needs from Yash |
|------|------|----------|-----------------|
| 7.1 | Keep the transcription stream open while the phone speaks | D-019 | — |
| 7.2 | Race two translation requests, keep the first to answer | D-020 | — |
| 7.3 | A natural voice: streaming TTS from the API, browser voice as fallback | D-021 | ElevenLabs and Cartesia API keys |
| 7.4 | The call UI: start, share, answer, in call, end | D-022 | — |
| 7.5 | The real voice: WebRTC audio between the two phones | D-023 | Optional: a Cloudflare TURN key |
| 7.6 | Translation on Muse Spark Open (Baseten), switchable by env | later | Baseten credits or a paid account |
| 7.7 | Speculative translation of a stable partial transcript | later | — |

## 7.1 Keep the transcription stream open while the phone speaks (D-019)

- `apps/web`: the microphone gate sends **silence frames** (zeros, same size and pace) instead of
  stopping, while the phone speaks a translation. `microphone_state { isOpen: false }` is only sent
  when the person turns the mic off. The 300 ms reopen delay stays, now as "silence for 300 ms more".
- Nothing changes in `apps/api` or the protocol.
- Tests: the gate's unit tests (silence while speaking, real frames again after the delay, one
  `microphone_state` per real change).

## 7.2 Race two translation requests (D-020)

- `apps/api`: `TRANSLATION_PARALLEL_REQUEST_COUNT` (default 2, 1 turns it off). Each translation
  sends that many identical Muse Spark requests; the first to yield text wins, the others are
  aborted. If one fails before any text, the others carry on; only when all fail is it an error.
- `lib/race-text-streams.ts` (pure, tested with fake generators). The log line `translation complete`
  gains `parallelRequestCount`.
- Tests: the faster stream wins and the slower is aborted; a failing stream loses to a working one;
  all failing throws; a count of 1 behaves as before.

## 7.3 A natural voice (D-021)

- `scripts/compare-voices.ts`: the demo lines through each configured provider, time to the first
  audio byte, and a WAV per line in the scratch folder for Yash to listen to. Lists each provider's
  voices so the defaults can be picked.
- `apps/api/src/services/speech-synthesis-client.ts`: one interface, `streamSpeech({ text,
  languageCode, voiceId, signal })` yielding PCM16 24 kHz mono chunks, with an ElevenLabs and a
  Cartesia implementation over streaming HTTP. Env: `SPEECH_PROVIDER` (`browser` | `elevenlabs` |
  `cartesia`, default `browser`), the provider's key, and `SPEECH_VOICE_IDS` (comma-separated:
  the room's first participant gets the first voice, the second the second).
- After `translation_complete` the API synthesises the translation and sends it to the same listeners
  as **binary frames**, through the same ordered delivery, then `translation_audio_end`.
  `translation_complete` gains `hasTranslationAudio`. A failed synthesis sends
  `translation_audio_end { hasFailed: true }` and the phone speaks the text with its own voice.
- `packages/shared/src/audio/translation-audio-frame.ts`: encode and decode the binary frame
  (utterance id + PCM16), and the output sample rate.
- `apps/web/src/features/speech-output/`: the speech queue plays streamed audio through one
  `AudioContext` (unlocked on the first tap, like `speechSynthesis`, D-007), scheduling chunks back to
  back; `playback_started` is sent when the first chunk starts. The browser voice stays for
  repeats when no audio is kept, fallbacks and `SPEECH_PROVIDER=browser`.
- Tests: a fake TTS server; the API sends audio frames to the right listener after
  `translation_complete`, in utterance order, and `hasFailed` on a TTS failure; frame encoding round-trips.

## 7.4 The call UI (D-022)

- **Home:** one big **Start a call** button and your language as a chip (remembered). Table mode as a
  quiet link. "Join with a code" stays, smaller.
- **Calling** (`/room/new` after creating): your name, "Waiting for them to join", **Share** (Web
  Share API, falls back to copy), QR code, the code.
- **Incoming** (`/room/ABC123` opened from the link): "**Ramesh is calling** · speaks Hindi", your
  name and language (pre-filled from last time, or from the browser's language), a big green
  **Answer**. The Answer tap joins, opens the mic and unlocks audio (D-007). The API tells a joiner
  who created the room before they join (`room_preview`, see D-022).
- **In call:** dark screen, their name and a call timer, the **orb** (states in D-022), their newest
  words large in your language with the original small beneath, your own last sentence small with ✓
  (translated) and ✓✓ (they heard it), a quiet latency chip, and a bottom bar: **Mute**, **Original
  voice** (from 7.5, labelled "Their voice"), **Transcript** (the full list), **Context**, red **End**. Open mic: the mic opens on
  Answer and on room creation once the other person joins.
- **Ended:** the recap (exists) with **Call again**.
- `prefers-reduced-motion`: the orb only changes colour.

## 7.5 The real voice (D-023)

- `packages/shared`: `webrtc_signal { toParticipantId, description?, candidate? }` from the browser,
  relayed by the API as `webrtc_signal { fromParticipantId, description?, candidate? }`, and
  `ice_servers { iceServers }` sent on `room_joined`.
- `apps/api`: relays signals only between participants of the same room. ICE servers: Cloudflare's
  free STUN, plus Cloudflare TURN credentials minted per join when `CLOUDFLARE_TURN_KEY_ID` and
  `CLOUDFLARE_TURN_API_TOKEN` are set.
- `apps/web`: one `getUserMedia` stream feeds both the PCM capture and the peer connection. The
  participant who joined second makes the offer. The remote track plays through an `<audio>` element
  (so the browser's echo canceller sees it) at `ORIGINAL_VOICE_VOLUME` (0.25), switchable in the
  call bar. The send track is disabled whenever the mic gate isn't sending real audio (muted, or the
  phone speaking a translation), so a speaker never hears their own translation back.
- Tests: the API relays a signal to the other participant only, refuses one to a stranger, sends ICE
  servers on join.

## 7.6 and 7.7

Specified when started, with their decisions.

## Out of scope (after the hackathon)

Voice cloning (decide Wed), LiveKit and a translation agent per room, native apps with ringing,
three or more people in a call, the camera (point it at a menu or price tag).

## Definition of done

- [ ] Two phones on different networks hold a 2-minute Hindi ↔ English call on the hosted app:
  answer from a link, natural voices, the other person's real voice faint underneath.
- [ ] Median speech end → playback start measured over the call and written into D-011.
- [ ] Typecheck, lint and tests pass.

## Demo check

A friend opens the link you sent on WhatsApp, taps Answer, and talks to you, each in your own
language, without being told how.

## Build notes (2 Nov)

**Built:** 7.1 to 7.5. Typecheck, lint and tests pass (8 script, 28 shared, 68 web, 163 API).

- **7.1** The gate sends silence while the phone speaks; `microphone_state` follows only the mic
  button (D-019). It also reports when the real voice may be sent, for 7.5.
- **7.2** `lib/race-text-streams.ts`; `TRANSLATION_PARALLEL_REQUEST_COUNT` (default 2; the test
  servers use 1). The warm-up opens one connection per raced request, so the second request doesn't
  start with a TLS handshake.
- **7.3** `services/speech-synthesis-client.ts` (ElevenLabs and Cartesia), `handlers/produce-translation-audio.ts`,
  binary frames from `translation-audio-frame.ts`, the browser's `translation-audio-store.ts` and
  `play-translation-audio.ts` (chunks scheduled back to back, the browser voice when synthesis fails).
  `session_ready` / `room_joined` gained `isTranslationAudioEnabled`, so "captions only" isn't shown
  when the API speaks. **`compare:voices` ran on 2 Nov with Yash's keys:** both providers work;
  Cartesia is about three times faster to the first audio, so it's set locally (D-021, bake-off).
  Streamed speech then played in the app in a headless browser, with ✓✓ back to the speaker.
- **7.4** `features/call-screen/`: start, incoming (`preview_room` → `room_preview`), calling (WhatsApp
  link, share sheet, copy, QR), in call (orb, newest words, ✓/✓✓ from `utterance_receipt`, timer,
  latency chip, Mute / Their voice / Transcript / Context / End), the recap in a sheet. Home redesigned
  dark with the orb cycling through a call's states. The mic opens inside Start or Answer and sends
  only while both are in, connected and unmuted (`use-call-microphone.ts`). Anek Devanagari for both
  scripts. The old `room-entry-form`, `share-room-panel` and `participant-list` were removed; table mode
  is unchanged.
- **7.5** `features/original-voice/use-original-voice.ts`: the second to join offers; every offer starts
  a fresh peer connection, so a reconnect on either side sets it up again. Signals that arrive before the
  hook is ready wait in `use-room-conversation.ts`. The API relays `webrtc_signal` within a room only and
  sends `ice_servers` after `room_joined` (`services/ice-servers-client.ts`). The orb gained `they_speaking`
  from the remote voice's loudness.
- **Checked in two headless Chromium windows against local servers:** start → share → incoming ("Ramesh
  is calling", English pre-selected) → answer → in call. With the English fixture fed in as the
  microphone, real Muse Voice Transcribe and Muse Spark ran (one utterance): the caller saw the Hindi
  translation large with the English beneath, the speaker got ✓✓ Heard. Speech end → final transcript
  ≈ 1.0 s, final → first word 2.2 s (one sample, with the race; not a measurement). With a tone as each
  microphone, the peer connection came up, the other window's orb went to "Ramesh is speaking…", and
  Mute stopped it.
- **Not checked:** any real phone (echo on speaker, iOS volume, Android autoplay), mobile data without
  TURN, and how the voices sound (Yash to listen).

## First live call (2 Nov, hosted app)

Yash called on the hosted app, with Cartesia speaking. Two problems:

- **Some sentences were never translated.** The API log showed Meta ending one phone's transcription
  stream with "Ingress audio slower than real-time" about 16 s after every reopen, 11 times in one call.
  That phone's mic sends slightly less than real-time audio, and now that the mic stays open for the whole
  call, the shortfall adds up. The sentence in progress at each break was lost. **Fix (D-024):** the API pads
  Meta's audio with 80 ms of silence whenever a stream falls more than 400 ms behind real time
  (`TRANSCRIPTION_MAXIMUM_AUDIO_LAG_MILLISECONDS`). It logs `silencePaddingMilliseconds` when each stream
  closes or fails, so the next live log shows how far behind each phone runs.
- **The real voice was as loud as the translation.** **Fix (D-024):** "Their voice" now starts off, and
  goes quiet while this phone plays a translation.

Timings from the same log: speech end → playback start 2.3 to 2.6 s on clean utterances, Cartesia's first
audio 150 to 640 ms after the translation was complete. One Muse Spark request timed out.

### Second live call (2 Nov, after the D-024 deploy)

- No stream broke. The padding worked: the phone that answered needed 5.4 s of silence in its first 7 s, and
  26 s over the next 42 s, then none. So that phone's audio starts badly and then recovers. The laptop needed
  80 ms in two minutes.
- **The phone never played a translation** (no `playback_started` from it at all), while the laptop played
  every one. One cause found and fixed: `useSpeechOutput` built its queue only when the browser had
  `speechSynthesis`. Android in-app browsers (a link opened inside an app) have none, so even the API's
  Cartesia audio was dropped without a sound. The queue is now made regardless, and a translation without
  API audio stays captions only on such a browser. Checked in Chromium with `speechSynthesis` removed: the
  Cartesia audio played and the speaker got ✓✓.
- **Audio that a phone pauses now resumes.** The microphone's and the speaker's `AudioContext` ask to resume
  whenever the phone suspends or interrupts them (the mic starting, a notification, iOS's `interrupted`), and
  any tap on the call screen resumes both. A paused capture context sends no audio, which matches the silent
  start.
- The answer screen no longer wipes a typed name when the caller's details (`room_preview`) arrive.

### Third live call (2 Nov evening)

Delays, lost sentences and dropped sockets, all from a network losing 57% of packets past the router
(measured from the laptop on the same connection; the router itself answered every ping). The EC2 server
answered its own health check in 1 ms. One stream ran 34 s ahead and Meta ended it ("Audio processing
backlog too large"), Cartesia answered 429 once, and two Muse Spark requests timed out. Fixes 3 to 6 in
D-024: the 1.5 s lead cap, speech-only upload when the socket is backed up, a "Weak connection" line,
the 429 retry, and status text that says when to speak and when the mic is paused.
