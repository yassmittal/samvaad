# Phase 6 — Hosting, hardening and submission

**Planned:** Tue 3 Nov – Wed 4 Nov (IST) · **Size:** M

**Goal:** the demo runs on the **hosted** app without surprises, the video is recorded,
and the project is submitted **on the evening of Wed 4 Nov IST**, well before the
Thu 5 Nov 07:30 IST deadline.

Built in three parts, in this order. Hosting first, so every later check runs on the real thing.

**Read first:** `decisions.md` D-010, `about.md` → Rules, Submission Process, Judging.

## 6.1 Hosting (Tue morning)
- **Ask Yash before deploying anything** (D-010).
- `apps/api` on the EC2 instance under PM2, behind TLS on a subdomain (`wss://…`).
  `ALLOWED_WEB_ORIGINS` set to the web app's URL.
- `apps/web` on Vercel with `NEXT_PUBLIC_API_BASE_URL` set.
- A spend limit alert on the Meta Billing page. A per-room cap on minutes
  (`MAX_ROOM_DURATION_MINUTES`) so a forgotten open mic can't drain the credit.

## 6.2 Hardening (Tue afternoon)
- Reconnect: a dropped socket reconnects with the same `participantId`; the room keeps the
  seat for `PARTICIPANT_RECONNECT_GRACE_SECONDS = 60`.
- A screen wake lock while a room is open (D-001).
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
