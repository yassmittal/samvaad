# Phase 6 — Hosting, hardening and submission

**Planned:** Tue 3 Nov – Wed 4 Nov (IST) · **Size:** M

**Goal:** the demo runs on the **hosted** app without surprises, the video is recorded,
and the project is submitted **on the evening of Wed 4 Nov IST**, well before the
Thu 5 Nov 07:30 IST deadline.

Built in three parts, in this order. Hosting first, so every later check runs on the real thing.

> **1 Nov (Yash):** not submitting yet. Build 6.1 and 6.2; leave 6.3 (README for judges, video,
> X post, submitting) until he says. The choices for 6.1's room cap and 6.2 are in D-017.

**Read first:** `decisions.md` D-010, `about.md` → Rules, Submission Process, Judging.

## 6.1 Hosting (Tue morning)
- **Ask Yash before deploying anything** (D-010). Yash runs the steps in
  [`../deployment.md`](../deployment.md).
- `apps/api` on the EC2 instance under PM2 (`apps/api/ecosystem.config.cjs`), behind nginx and
  TLS at `https://samvaad-api.yashmittal.xyz` (`wss://` for rooms). nginx passes the WebSocket
  upgrade and keeps quiet sockets open for an hour. `ALLOWED_WEB_ORIGINS` set to the web app's URL.
- `apps/web` on Vercel at `https://samvaad.yashmittal.xyz`, with `NEXT_PUBLIC_API_BASE_URL` set.
- A spend limit alert on the Meta Billing page. A per-room cap on minutes
  (`MAX_ROOM_DURATION_MINUTES`, default 60) so a forgotten open mic can't drain the credit:
  once reached, the room's mics close and can't reopen (D-017).

## 6.2 Hardening (Tue afternoon)
- Reconnect: a dropped socket reconnects with the same `participantId`; the room keeps the
  seat for `PARTICIPANT_RECONNECT_GRACE_SECONDS = 60`. A reload in the same tab gets it back
  too (D-017).
- A screen wake lock while a room is open (D-001).
- When Meta ends a stream with "Ingress audio slower than real-time" (seen once in Phase 3's
  phone test, D-005: pacing) while the mic is still on, open a new stream on its own
  instead of closing the mic and waiting for a tap.
- Every error code has a plain sentence in the UI and a next step.
- Design pass: big readable captions, clear "listening / translating / speaking" states,
  works one-handed on a phone. Light and dark.
- The full Phase 4 + Phase 5 demo on the hosted app, on Android, on mobile data. If an iPhone
  can be borrowed for an hour, run it there too: judges may open the link on one.

## 6.3 Submission (Wed)
- `README.md`: what it is, the demo video, "Try it" link, how it uses each Meta model,
  the architecture picture, the measured latency, how to run it locally, and a
  **"Built during the hackathon"** section (everything; the repo starts on 29 Oct). The
  rules disqualify a demo whose original work isn't clear.
- `LICENSE` (MIT).
- `docs/demo-video-script.md`: a ≤ 3-minute script. Hook in the first 10 seconds (two
  people who can't talk, then can). Then the two-phone conversation with the latency meter on
  screen, the context comparison, the recap, and a short architecture shot.
- Record and edit the video. Upload so the link works logged out.
- An X post with the video, for the Most Viral bonus (engagement counts until 8 Nov). Draft
  it; Yash posts it.
- **Yash's checklist** (he does these: no git from Claude):
  - [ ] The repo is pushed and **public**.
  - [ ] The video link opens in a private window.
  - [ ] Submitted on the Cerebral Valley platform, Indie Developer track, with the X post link.
  - [ ] The Meta API credit was claimed (deadline Wed 4 Nov 21:00 ET).

## Definition of done
- [ ] The hosted app runs the full demo on two phones on mobile data.
- [ ] The video is ≤ 3 minutes and shows only work built during the hackathon.
- [ ] Submitted before the deadline.

## Demo check
A friend opens the link with no help and has a conversation with you in another language.

## Build notes (1 Nov)

**6.1 Hosting** is live: the API at `https://samvaad-api.yashmittal.xyz`, the web app at
`https://samvaad.yashmittal.xyz` (every step in [`../deployment.md`](../deployment.md); steps 1–7
checked from the laptop, no Meta calls). Yash ran a basic phone test on it. The room minute cap
(`MAX_ROOM_DURATION_MINUTES`, default 60) is built with 6.2 below; it needs no change to the
server's `.env`.

**6.2 Hardening**, all in D-017:

- **Seat keeping.** A dropped socket stays in the room for 60 s, shown to the other phone as
  "lost the connection… reconnecting". The phone rejoins with `previousParticipantId` (kept per
  room in `sessionStorage`) and gets the same id back, so a reload in the same tab works too.
  Nothing is translated for an empty seat; a translation missed in the gap shows "couldn't be
  translated. Say it again." A second tab with the same seat takes it, and the first stops with
  "This room is open in another tab or on another phone. Tap Try again" instead of fighting back
  (close code `SEAT_TAKEN_OVER_CLOSE_CODE`, 4001).
- **Room time limit.** Past `MAX_ROOM_DURATION_MINUTES`, the next audio frame ends every mic in the
  room (Meta finishes the utterance in progress) and the mics can't reopen
  (`ROOM_TIME_LIMIT_REACHED`). Context and End & recap still work.
- **Reopening a broken stream.** A stream that broke after its handshake is replaced with the same
  handshake, at most 3 times a minute; the phone isn't told. A handshake that fails is reported as
  before.
- **Wake lock** while a room or table is on screen, re-requested when the page comes back.
- **Errors.** `ConversationStatus` has a sentence and a next step for every `ErrorCode`, as a
  `Record` the compiler checks. Found and fixed on the way: a failed translation used to turn the
  *listener's* microphone off (it shares `UPSTREAM_UNAVAILABLE` with a failed transcription); only an
  error without an `utteranceId` closes the mic now.
- **Design pass.** Dark mode follows the phone (the stone scale swapped in `globals.css`, a
  `surface` colour for cards; the QR code stays on white). The status line has a coloured dot and
  says Listening (red), Translating (amber) or Speaking (indigo), matching the mic button.
  Translations are a size larger (`text-xl`).
- **Checked:** typecheck, lint and tests (7 script, 24 shared, 135 API, 39 web). The API tests
  cover seat keeping (6), the time limit (2) and reopening (2); breaking each of the three made
  its tests fail. In headless Chromium against local servers, no microphone, no Meta calls: light
  and dark screens, a reload taking back the same seat while the other phone showed "lost the
  connection", and a duplicated tab taking the seat with no reconnect loop.
- **Not checked yet:** seat keeping on a real phone switching networks, the reopen against Meta's
  real "Ingress" error (it can't be caused on purpose), and the wake lock on the Android phone.
- **6.3 Submission** is left for later (Yash, 1 Nov).
