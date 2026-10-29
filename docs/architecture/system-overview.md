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
│  room registry: room code → participants (id, name, languageCode)        │
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

Table mode (Phases 1 to 3) is the same picture with one phone and one participant who
has two languages.

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
7. When the translation is complete, B's browser speaks it and reports
   `playbackStartedAt`. The latency meter shows `playbackStartedAt − speechEndedAt`.

## Who owns what

| Concern | Owner | Why |
|---------|-------|-----|
| Microphone capture, resampling | **Browser** (`apps/web`) | Only the browser has the mic. |
| Speaking the translation aloud | **Listener's browser** | Meta has no TTS (D-007). Speaking on the listener's own device means it comes out of their earbuds. |
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
| binary frame | 1 | 80 ms of 16 kHz mono PCM16 from this participant's mic |
| `start_table_session { languageCodes: [a, b] }` | 1 | Table mode: one phone, two languages |
| `microphone_state { isOpen }` | 1 | Mic opened or closed (also sent when muted during playback) |
| `create_room { participantName, languageCode }` | 4 | Two-phone mode |
| `join_room { roomCode, participantName, languageCode }` | 4 | Two-phone mode |
| `playback_started { utteranceId }` | 2 | For the latency meter |
| `update_conversation_context { setting, glossaryTerms }` | 5 | Context for translation |
| `end_conversation` | 5 | Ask for the recap |

**API → browser**

| Message | Phase | Meaning |
|---------|-------|---------|
| `session_ready { participantId, languageCodes }` | 1 | Table session started |
| `transcript_partial { utteranceId, text }` | 1 | Live caption, speaker only |
| `transcript_final { utteranceId, speakerParticipantId, languageCode, text, speechEndedAtEpochMilliseconds }` | 1 | Finished sentence, everyone. `languageCode` is `null` in table mode (D-008) |
| `translation_delta { utteranceId, targetLanguageCode, textDelta }` | 2 | Translation arriving |
| `translation_complete { utteranceId, targetLanguageCode, text, timings }` | 2 | Speak this now |
| `room_state { roomCode, participants }` | 4 | Who is here |
| `conversation_recap { languageCode, text }` | 5 | End-of-conversation recap |
| `error { code, message, utteranceId? }` | 1 | Something went wrong, with a code the UI can explain. `utteranceId` when it concerns one utterance (Phase 2) |

## Known risks

| Risk | Mitigation |
|------|------------|
| Meta's native ASR protocol differs from the third-party docs | Phase 0 checks it with a script before anything is built on it |
| Endpointing cuts sentences too early or waits too long | Measure in Phase 2. Endpointing settings, or our own "commit after N ms of silence" |
| Browser voice missing for a language on a phone | Captions always show; the UI says when no voice is available |
| iOS Safari blocks speech until a tap | The "Start" button unlocks speech with an empty utterance |
| Echo in table mode | The mic is muted while the phone is speaking (D-008) |
| Mobile networks drop the WebSocket | Reconnect with the same participant id; the room keeps the seat for 60 s (Phase 6) |
| Meta API rate limits or credit running out | Spend limit alert on the Billing page; only final transcripts are translated |
