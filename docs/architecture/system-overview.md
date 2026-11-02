# System Overview

## The system in one picture

```text
┌──────────────────────────────┐            ┌──────────────────────────────┐
│  Phone A (Hindi)             │            │  Phone B (English)           │
│  apps/web in the browser     │            │  apps/web in the browser     │
│                              │            │                              │
│  mic → AudioWorklet          │            │  mic → AudioWorklet          │
│      → 16 kHz PCM16 frames   │            │      → 16 kHz PCM16 frames   │
│  captions (original + trans.)│            │  captions (original + trans.)│
│  speechSynthesis (hi-IN)     │            │  speechSynthesis (en-*)      │
└──────────────┬───────────────┘            └───────────────┬──────────────┘
               │  WebSocket (binary audio up, JSON events down)│
               └──────────────────┬───────────────────────────┘
                                  ↓
┌──────────────────────────────────────────────────────────────────────────┐
│  apps/api  (Fastify 5 on Bun, one process, state in memory)              │
│                                                                          │
│  room registry: room code → participants, context, conversation so far   │
│                                                                          │
│  per speaking participant:                                               │
│    TranscriptionStream ── WebSocket ──→ Muse Voice Transcribe            │
│      partial transcript  → speaker's captions                            │
│      final transcript    → TranslationJob                                │
│                                                                          │
│  TranslationJob ── HTTPS stream ──→ Muse Spark (Chat Completions)        │
│      one per listener language, with the conversation so far (Phase 5)  │
│      deltas → listener's captions; complete → listener speaks it        │
└──────────────────────────────────────────────────────────────────────────┘
```

**From Phase 7 (D-018), a room is a call:** the two phones also hold a WebRTC peer connection for
audio only, signalled through the API, so each hears the other's real voice quietly under the
translated one (D-023); and the translation is spoken by a voice API through the API (D-021).

Table mode (Phases 1 to 3) is the same picture with one phone and one participant who
has two languages. From Phase 4 it runs through the same room code: a table room has one
participant, no room code, and isn't in the registry.

**Routing rule (Phase 4):** a translation into language X goes to every participant who
listens in X. A room participant listens in their one language; the table participant in
both of theirs. Translations run once per distinct listener language other than the
speaker's, and each speaker's translations into one language arrive in utterance order.

## One utterance, step by step

1. A presses the mic button. The browser starts sending 80 ms PCM16 frames.
2. The API opens (or reuses) A's transcription stream to Meta, biased to Hindi.
3. Meta sends partial transcripts. The API forwards them to **A** only, as live captions,
   so A can see they're being heard.
4. A pauses. Meta's endpointing marks the utterance final. The API stamps
   `speechEndedAt` and broadcasts the final transcript to **everyone** in the room.
5. The API starts one translation per listener language (here: English) on Muse Spark,
   streaming.
6. Translation deltas go to **B**, whose captions fill in word by word.
7. When the translation is complete, the API asks the voice API to speak it and streams the
   audio to B (Phase 7.3, D-021); without a voice API, B's browser speaks the text. B reports
   `playbackStartedAt`. The latency meter shows `playbackStartedAt − speechEndedAt`.

Muse Spark is asked twice at once for each translation and the faster answer wins (D-020).

## Who owns what

| Concern | Owner | Why |
|---------|-------|-----|
| Microphone capture, resampling | **Browser** (`apps/web`) | Only the browser has the mic. |
| Speaking the translation aloud | **API → a voice API**, played by the listener's browser; the browser's own voice as fallback | Meta has no TTS (D-007). From Phase 7.3 the API streams a natural voice (D-021); it still plays on the listener's own device, so it comes out of their earbuds. |
| The Meta API key | **API**, from env | It must never reach a browser. |
| Transcription and translation calls | **API** | Same reason, and it can fan one utterance out to several listeners. |
| Rooms, participants, conversation so far | **API memory** | No database (D-004). |
| The protocol's shape | **`packages/shared`** | One zod definition, imported by both sides (D-003). |

## The WebSocket protocol (summary)

The full zod definitions live in `packages/shared/src/protocol/`. Phases add messages as
they need them.

**Browser → API**

| Message | Phase | Meaning |
|---------|-------|---------|
| binary frame | 1 | 80 ms of 16 kHz mono PCM16 from this participant's mic; silence while the phone speaks a translation (D-019) |
| `start_table_session { languageCodes: [a, b] }` | 1 | Table mode: one phone, two languages |
| `microphone_state { isOpen }` | 1 | Mic opened or closed (also sent when muted during playback) |
| `create_room { participantName, languageCode }` | 4 | Two-phone mode |
| `join_room { roomCode, participantName, languageCode, previousParticipantId? }` | 4 | Two-phone mode. `previousParticipantId` takes back a seat kept after a dropped socket (Phase 6, D-017) |
| `preview_room { roomCode }` | 7.4 | Who is calling, before answering (D-022) |
| `webrtc_signal { toParticipantId, description? \| candidate? }` | 7.5 | Setting up the peer-to-peer real voice; the API passes it to the other participant (D-023) |
| `leave_room` | 4 | Leave the room; the socket stays open |
| `playback_started { utteranceId }` | 2 | For the latency meter |
| `update_conversation_context { setting, glossaryTerms: [{ term, preferredTranslation }] }` | 5 | The room's context for translation; either participant, any time (D-016) |
| `end_conversation` | 5 | End the conversation for everyone and ask for the recap |

**API → browser**

| Message | Phase | Meaning |
|---------|-------|---------|
| `session_ready { participantId, languageCodes, isTranslationAudioEnabled }` | 1 | Table session started. `isTranslationAudioEnabled`: the API speaks translations itself (Phase 7.3) |
| `transcript_partial { utteranceId, text }` | 1 | Live caption, speaker only |
| `transcript_final { utteranceId, speakerParticipantId, languageCode, text, speechEndedAtEpochMilliseconds }` | 1 | Finished sentence, everyone. `languageCode` is `null` in table mode (D-008), the speaker's language in a room |
| `translation_delta { utteranceId, targetLanguageCode, textDelta }` | 2 | Translation arriving |
| `translation_complete { utteranceId, targetLanguageCode, text, timings, hasTranslationAudio }` | 2 | Speak this now; with `hasTranslationAudio`, its speech follows as binary frames (Phase 7.3, D-021) |
| binary frame | 7.3 | A piece of a spoken translation: utterance id + 24 kHz mono PCM16 (`translation-audio-frame.ts`, D-021) |
| `translation_audio_end { utteranceId, hasFailed }` | 7.3 | The spoken translation's last frame has been sent; `hasFailed`: speak the text with the phone's own voice |
| `room_joined { roomCode, participantId, isTranslationAudioEnabled }` | 4 | You created or joined this room, as this participant |
| `room_state { roomCode, participants }` | 4 | Who is here, their language, whether their mic is on and whether they are connected (Phase 6). Sent to everyone on every change |
| `room_preview { roomCode, participants: [{ participantName, languageCode }] }` | 7.4 | The answer to `preview_room`: "Ramesh is calling" (D-022) |
| `ice_servers { iceServers }` | 7.5 | After `room_joined`: free STUN, plus Cloudflare TURN when a key is set (D-023) |
| `webrtc_signal { fromParticipantId, description? \| candidate? }` | 7.5 | The other phone's part of setting up the real voice (D-023) |
| `utterance_receipt { utteranceId, receipt }` | 7.4 | To the speaker: `translated` (✓) once the other phone has the translation, `heard` (✓✓) once it starts speaking it (D-022) |
| `participant_left { participantId, participantName }` | 4 | Someone left, or their socket closed and they didn't come back within 60 s (D-017) |
| `conversation_context { setting, glossaryTerms, updatedByParticipantName }` | 5 | The room's context, to everyone on every change and to a phone when it joins |
| `conversation_ended { participantName }` | 5 | Someone ended the conversation; recaps follow. Mics close |
| `conversation_recap { languageCode, text }` | 5 | End-of-conversation recap, to the participants listening in that language |
| `error { code, message, utteranceId? }` | 1 | Something went wrong, with a code the UI can explain. `utteranceId` when it concerns one utterance (Phase 2) |

## Known risks

| Risk | Mitigation |
|------|------------|
| Meta's native ASR protocol differs from the third-party docs | Phase 0 checks it with a script before anything is built on it |
| Endpointing cuts sentences too early or waits too long | Measure in Phase 2. Endpointing settings, or our own "commit after N ms of silence" |
| Browser voice missing for a language on a phone | Captions always show; the UI says when no voice is available |
| iOS Safari blocks speech until a tap | The "Start" button unlocks speech with an empty utterance |
| Echo in table mode | The mic is muted while the phone is speaking (D-008) |
| Mobile networks drop the WebSocket | Reconnect with the same participant id; the room keeps the seat for 60 s (D-017) |
| Meta API rate limits or credit running out | Spend limit alert on the Billing page; only final transcripts are translated |
