# Repository Structure

Planned layout. Folders appear in the phase that needs them; this shows where they go.

```text
hackathon-project/
├── about.md                        the hackathon page (read-only)
├── MVP.md                          what we're building
├── CLAUDE.md
├── README.md                       setup, run, "built during the hackathon" (Phase 6)
├── LICENSE                         MIT (Phase 6)
├── package.json                    Bun workspaces + root scripts
├── biome.json
├── tsconfig.base.json
├── docs/
├── scripts/
│   ├── smoke-transcribe.ts         Phase 0: WAV file → Muse Voice Transcribe → print
│   ├── smoke-translate.ts          Phase 0: text → Muse Spark → print
│   └── fixtures/                   short test recordings (our own voices)
├── packages/
│   └── shared/src/
│       ├── protocol/
│       │   ├── client-messages.ts  zod discriminated union, browser → API
│       │   └── server-messages.ts  zod discriminated union, API → browser
│       ├── languages/
│       │   └── supported-languages.ts   code, English name, native name, BCP-47 voice tag
│       ├── audio/
│       │   └── audio-format.ts     SAMPLE_RATE_HERTZ, FRAME_DURATION_MILLISECONDS, …
│       └── domain/
│           ├── error-code.ts       the ErrorCode union
│           └── room-code.ts        room code alphabet, length and schema (Phase 4)
├── apps/
│   ├── api/src/
│   │   ├── index.ts                starts the server
│   │   ├── build-server.ts         assembles plugins and routes (used by tests too)
│   │   ├── plugins/                env (zod), websocket, error-handler
│   │   ├── routes/                 health.ts, conversation-socket.ts (thin)
│   │   ├── handlers/               one per client message type
│   │   ├── services/
│   │   │   ├── meta-transcription-stream.ts   the upstream ASR WebSocket
│   │   │   └── meta-translation-client.ts     Muse Spark streaming calls
│   │   ├── rooms/
│   │   │   ├── room.ts             a room's shape; table rooms (D-008)
│   │   │   └── room-registry.ts    in-memory rooms by code (D-004)
│   │   ├── lib/                    pure functions: prompts, timings, room codes
│   │   └── test-support/           fake Meta ASR server, fake Muse Spark endpoint
│   └── web/
│       ├── public/audio-worklets/
│       │   └── pcm-capture-processor.js   the AudioWorklet (plain JS, loaded by URL)
│       └── src/
│           ├── app/                thin route files
│           │   ├── page.tsx        home: table mode or create/join a room
│           │   ├── table/page.tsx  table mode
│           │   ├── room/new/page.tsx         create a room
│           │   └── room/[roomCode]/page.tsx  join a room
│           ├── features/
│           │   ├── microphone/     capture, resample, PCM16 encode, mute
│           │   ├── conversation/   caption list, latency meter
│           │   ├── speech-output/  speechSynthesis queue, voice picking, iOS unlock
│           │   └── rooms/          create, join, QR code
│           ├── components/ui/
│           └── lib/
│               └── conversation-socket/   the only place that opens the WebSocket
```

## Layer rules

- **API:** routes are thin, `handlers/` do one message each, `lib/` is pure and tested,
  and only `services/` talk to Meta.
- **Web:** `app/` route files are thin and features own their logic. Only
  `lib/conversation-socket/` opens the WebSocket. Every message in or out is parsed with
  the shared zod schema.
