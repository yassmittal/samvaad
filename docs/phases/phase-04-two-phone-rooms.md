# Phase 4 — Two-phone rooms (core done)

**Planned:** Sun 1 Nov (IST) · **Size:** M

**Goal:** A creates a room in Hindi and shows a QR code. B scans it, joins in English.
Each speaks into their own phone and hears the other through their own earbuds, in their
own language. **This is the pitch working end to end. Core done.**

**Read first:** `architecture/system-overview.md` (the whole thing), `decisions.md` D-004, D-008.

## Deliverables

### `packages/shared`
- Client messages: `create_room { participantName, languageCode }`,
  `join_room { roomCode, participantName, languageCode }`, `leave_room`.
- Server messages: `room_state { roomCode, participants: [{ participantId, participantName,
  languageCode, isMicrophoneOpen }] }`, `participant_left`.
- Error codes: `ROOM_NOT_FOUND`, `ROOM_FULL`.

### `apps/api`
- `rooms/room-registry.ts` (D-004): create, join, leave, find. Rooms close when empty.
  `MAX_PARTICIPANTS_PER_ROOM = 2` for the MVP (the code works for more).
- `lib/generate-room-code.ts` (pure): 6 characters, no look-alikes (`0/O`, `1/I/L`).
- Routing: a final transcript goes to everyone; translations run **once per distinct
  listener language** (two English listeners share one translation), and each listener gets
  only their language. A listener with the speaker's language gets the transcript only.
- Table mode becomes a room with one participant and two languages, so there is one code path.
- Tests: two fake participants, Hindi and English. Each receives exactly the other's
  translation. Joining a full room, a missing room, and leaving mid-translation.

### `apps/web`
- `app/page.tsx` (home): "Table mode" and "Talk on two phones" → create or join.
- `features/rooms/`: create (name, language), join (code or QR), a share sheet with the QR
  code and the link (`/room/ABC123`).
- `app/room/[roomCode]/page.tsx`: who's here and their language, my mic button, the shared
  caption list (my utterances: my transcript; theirs: the translation big, their original small).
- An "earbuds recommended" hint on join. Without earbuds, mic gating from Phase 3 still applies.

## Out of scope
Reconnect after a dropped connection (Phase 6). Context and recap (Phase 5).

## Definition of done
- [ ] Two devices on different networks (the Android phone on mobile data, the laptop on
  Wi-Fi, each with its own earbuds or headphones) hold a 2-minute Hindi ↔ English
  conversation through the tunnel, each hearing only the other in their own language.
  A second phone (a friend's) replaces the laptop for the demo video if possible.
- [ ] Opening the link on a laptop and a phone works (QR and typed code).
- [ ] Median speech end → playback start on the *other* phone is measured and written into D-011.
- [ ] Typecheck, lint and tests pass.

## Demo check
Two people, two phones, two languages, two minutes. Record it on a third phone: this is a
first draft of the demo video.
