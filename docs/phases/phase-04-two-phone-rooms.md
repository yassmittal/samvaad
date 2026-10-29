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
- Server messages: `room_joined { roomCode, participantId }` (to the phone that created or
  joined, so it knows which utterances are its own), `room_state { roomCode, participants:
  [{ participantId, participantName, languageCode, isMicrophoneOpen }] }` (to everyone, on
  every change), `participant_left { participantId, participantName }`.
- `domain/room-code.ts`: the room code alphabet, length and schema, shared so the join form
  can check a typed code before sending it.
- Error codes: `ROOM_NOT_FOUND`, `ROOM_FULL`.

### `apps/api`
- `rooms/room-registry.ts` (D-004): create, join, leave, find. Rooms close when empty.
  `MAX_PARTICIPANTS_PER_ROOM = 2` for the MVP (the code works for more).
- `lib/generate-room-code.ts` (pure): 6 characters, no look-alikes (`0/O`, `1/I/L`).
- Routing: a final transcript goes to everyone; translations run **once per distinct
  listener language** (two English listeners share one translation), and each listener gets
  only their language. A listener with the speaker's language gets the transcript only.
- Table mode becomes a room with one participant and two languages, so there is one code path.
  A table room has no room code and isn't in the registry, so nobody can join it.
- In a room the speaker's language is known, so the prompt names the target language and
  the answer has no code line; the transcriber is biased to the speaker's language plus
  English, for code-switching (D-015).
- Translations belong to the room. A speaker leaving doesn't cancel their last translation
  (the listener still gets it); a translation nobody in the room can receive any more is
  cancelled.
- Tests: two fake participants, Hindi and English. Each receives exactly the other's
  translation. Joining a full room, a missing room, and leaving mid-translation.

### `apps/web`
- `app/page.tsx` (home): "Table mode" and "Talk on two phones" → create or join.
- `features/rooms/`: create (name, language), join (code or QR), a share sheet with the QR
  code and the link (`/room/ABC123`). The QR code is drawn with `uqr` (zero dependencies,
  approved by Yash 30 Oct) as an inline SVG.
- `app/room/new/page.tsx` creates a room; once the API answers, the address becomes
  `/room/ABC123` (`history.replaceState`, no reload), so it can be shared or reloaded.
- `app/room/[roomCode]/page.tsx`: who's here and their language, my mic button, the shared
  caption list (my utterances: my transcript; theirs: the translation big, their original small).
- An "earbuds recommended" hint on join. Without earbuds, mic gating from Phase 3 still applies.

## Out of scope
Reconnect after a dropped connection (Phase 6). Context and recap (Phase 5). Like table mode,
a socket that reconnects on its own sends `join_room` again, as a new participant, if the
room is still open; keeping the seat and the participant id is Phase 6.

## Definition of done
- [x] Two devices on different networks (the Android phone on mobile data, the laptop on
  Wi-Fi, each with its own earbuds or headphones) hold a 2-minute Hindi ↔ English
  conversation through the tunnel, each hearing only the other in their own language.
  A second phone (a friend's) replaces the laptop for the demo video if possible.
  *(Yash, 30 Oct: works end to end on the Android phone and the laptop. The friend's phone
  for the video is still to do.)*
- [x] Opening the link on a laptop and a phone works (QR and typed code). *(Typed code, the
  link and a lower-case code checked in headless Chromium, 30 Oct; Yash checked the rest on
  the devices, QR scan included, 30 Oct.)*
- [ ] Median speech end → playback start on the *other* phone is measured and written into D-011.
  *(Parked, Yash's call: D-011/D-014. The meter and the API log show the number.)*
- [x] Typecheck, lint and tests pass. *(30 Oct: 18 shared, 96 API, 30 web tests.)*

## Demo check
Two people, two phones, two languages, two minutes. Record it on a third phone: this is a
first draft of the demo video.

## Build notes (30 Oct)

- **Device check (Yash, 30 Oct):** everything in the "what to try" list worked end to end on
  the Android phone and the laptop: create, typed code, QR scan, the conversation both ways,
  leave and rejoin.

- **Protocol:** one message beyond the spec, `room_joined { roomCode, participantId }`, so a
  phone knows which utterances are its own. `participant_left` carries the name for the
  "Ben left" line. `room_state` goes to everyone on join, leave and every mic change (the
  mic gate flips it on each spoken translation, so expect a few per utterance; they're tiny).
  Room codes (`domain/room-code.ts`) are normalised by the shared schema, so a typed
  `k7mq2x` joins `K7MQ2X`.
- **One code path:** a connection is a participant with a `membership { room,
  participantName, languageCodes }`. `start_table_session` makes a table room (one
  participant, two languages, no code, not in the registry); changing the table's languages
  keeps the same room, so a translation in flight still arrives, as before. The routing rule
  is "a translation into X goes to everyone who listens in X", which covers both modes.
  `lib/plan-utterance-translations.ts` decides the translations (once per distinct listener
  language other than the speaker's); `rooms/room.ts` holds the room shape and
  `rooms/room-registry.ts` the codes.
- **Ordering and leaving:** translations belong to the room, with one ordered delivery per
  speaker and target language. The speaker leaving (or their socket closing) closes their
  transcription streams at once but lets their last translation reach the listener; a
  translation nobody left in the room can receive is cancelled (the fake Muse Spark server
  now records aborted requests, and a mutation check confirmed the test catches a missing
  abort).
- **Prompt and bias (D-015):** a room prompt names the direction ("from Hindi into English")
  and asks for the translation only, so the code-line parser isn't used. The transcriber is
  biased to the speaker's language plus English, like table mode. A one-run-each comparison
  on the synthetic Hinglish fixture didn't separate the two biases ("ब्लू पाचरी" both times).
- **Web:** `features/conversation/use-conversation.ts` now holds what table mode and rooms
  share (socket, captions, mic gate, speech queue, playback timings); `useTableConversation`
  and `useRoomConversation` are thin wrappers. The caption list takes the listener's
  language: `null` keeps the table layout; in a room, my utterances are dark bubbles on the
  right with the transcript only, theirs show the translation big and their original small
  (or just the transcript when they spoke my language).
- **Creating a room:** `/room/new` sends `create_room`; `room_joined` swaps the address to
  `/room/ABC123` with `history.replaceState`. Checked in Chromium: the page does not remount,
  the socket stays open. The share panel (QR code, the code in large type, the link, Copy and
  the native Share sheet) shows while you're alone and from the room-code chip after.
- **Small conveniences:** the name and language are remembered in `localStorage` on each
  device. With nothing remembered, the creator defaults to Hindi and the joiner to English
  (the demo story). Joining is the first tap, so it unlocks iOS speech (D-007).
- **Reconnects:** like table mode, a socket that comes back sends `join_room` again, as a new
  participant, if the room is still open. If a phone drops while alone, its room closes and
  the rejoin answers "This room has closed". If the API hasn't yet noticed the old socket
  closing, a rejoin into a two-person room could answer "full". Seat keeping is Phase 6.
- **Checked headless (30 Oct):** two Chromium contexts walked create → QR shown → join by
  typed lower-case code → third phone gets "full" → leave → "Ben left" → missing code →
  malformed code 404. Then two browsers, each with a fixture WAV as its microphone, held one
  exchange each way through real Meta (Hinglish → English, English → Hindi): each side got
  only the other's translation, and both reported `playback_started`. The harness lives in
  the session scratchpad, not in the repo.
- **Seen while testing:** headless Chromium has no voices, so its speech runs to the 5 s cap,
  and the mic gate (rightly) drops speech during it. On a phone, speech ends normally, but the
  rule is the same as table mode: speech that starts while your phone is still speaking is
  dropped, so wait for it to finish.
- **Testing through `dev:phone`:** the QR code and link use the address the creating browser
  is on. Create the room on the phone (tunnel URL), or open the web tunnel URL on the laptop
  too; a room created on `localhost:3400` shows a link the phone can't open.
