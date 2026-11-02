# Roadmap

Today is Thu 29 Oct 2026. Submissions close **Thu 5 Nov 2026, 07:30 IST** (Wed 4 Nov,
21:00 ET). That is about six and a half working days. Aim to submit on the evening of
**Wed 4 Nov IST**, not at the deadline.

Each phase is **vertical**: it ends with something you can run and show. Each has a
detailed spec in [`phases/`](phases/).

```text
 Phase 0  Foundations and API check ──┐  skeleton + "Meta's APIs do what we think"
 Phase 1  Live captions ──────────────┤
 Phase 2  Translated captions ────────┤
 Phase 3  Spoken translation ─────────┘  ← TABLE MODE DONE: one phone, two languages
 Phase 4  Two-phone rooms ────────────   ← CORE DONE: the pitch works end to end
 Phase 5  Context and recap ──────────   ← the Muse Spark differentiator
 Phase 6  Hosting, hardening ──────────   ← 6.1 and 6.2 done (1 Nov)
 Phase 7  A real call ────────────────   ← natural voice, call UI, the real voice (2 to 4 Nov)
 Phase 6.3 Submission ────────────────   ← hackathon-ready
 ──────────────────────────────────────────────── submission line
```

| Phase | Name | Size | Planned (IST) | Demo at the end |
|-------|------|------|---------------|-----------------|
| 0 | [Foundations and API check](phases/phase-00-foundations.md) | S | Thu 29 Oct | Web page shows "API ok". Two scripts: a WAV file is transcribed by Muse Voice Transcribe and translated by Muse Spark |
| 1 | [Live captions](phases/phase-01-live-captions.md) | M | Fri 30 Oct | Speak into the laptop or phone, see live captions in your language |
| 2 | [Translated captions](phases/phase-02-translated-captions.md) | S | Sat 31 Oct AM | Speak Hindi, read English under it (and the reverse), with a latency number |
| 3 | [Spoken translation](phases/phase-03-spoken-translation.md) | S | Sat 31 Oct PM | One phone on the table: speak Hindi, it says it in English, and the reverse. **Table mode done** |
| 4 | [Two-phone rooms](phases/phase-04-two-phone-rooms.md) | M | Sun 1 Nov | Two phones, two people, each hears the other in their own language. **Core done** |
| 5 | [Context and recap](phases/phase-05-context-and-recap.md) | M | Mon 2 Nov | Names and product terms come out right; the conversation ends with a recap in both languages |
| 6 | [Hosting, hardening and submission](phases/phase-06-hosting-and-submission.md) | M | Tue 3 Nov – Wed 4 Nov | The demo runs on the hosted app; video recorded; submitted |
| 7 | [A real call](phases/phase-07-real-call.md) | L | Mon 2 Nov – Wed 4 Nov AM, before 6.3 | Answer a call from a WhatsApp link; natural voices; the other person's real voice underneath (D-018) |

Sizes: **S** ≈ half a day, **M** ≈ one day of focused work.

**If time runs short:** protect Phases 0 to 4 and the hosting part of Phase 6, in that
order. Then cut Phase 5 down to "conversation memory only" (drop the glossary UI and the
recap). Phase 7 is built in parts (7.1 to 7.7) and cut from the bottom; 6.3 (submission) is never cut.

## How to run a phase

1. Read the phase spec and the docs it links to.
2. If the spec is wrong or missing something, **update the doc first**, then build.
3. Build in the order the spec lists (usually shared → API → web).
4. Check every item in the phase's *Definition of done*, including tests.
5. Run the phase's demo check, on a real phone from Phase 1 onwards.
6. Update the status table in `docs/README.md`.

## Naming

| What | Value |
|------|-------|
| Product name | **Samvaad** (working name, see open questions) |
| npm workspace scope | `@samvaad/*` |

## Open questions (answer before the phase that needs them)

| Question | Needed by | Default if unanswered |
|----------|-----------|-----------------------|
| Product name | Phase 0 (it's the package scope) | Samvaad |
| The demo language pair | Phase 1 | Hindi ↔ English (both validated by Muse Voice Transcribe) |
| Is the MVP's "median under 2.5 s" still the bar, now that Muse Spark needs ~1 s to its first word (D-014)? | Phase 2 | Keep 2.5 s as the goal; decide after Phase 2 measures real conversations |
| The demo story: who is talking to whom | Phase 5 (glossary and recap are shaped by it) | **Answered (Yash, 30 Oct):** the default. Ramesh Kumawat, a Jaipur blue pottery exporter (Hindi), and Siobhan Doyle of Doyle Home, London (English), agree an order (phase 5 spec) |
| Is the Meta API key and $150 credit claimed and working? | Phase 0 | **Answered (29 Oct):** the key works; both smoke scripts ran |
| Where the API runs | Phase 6 | **Answered (Yash, 1 Nov):** the EC2 instance at `samvaad-api.yashmittal.xyz`, the web app on Vercel at `samvaad.yashmittal.xyz` (D-010, [`deployment.md`](deployment.md)) |
| A better voice than the browser's | Phase 7 | **Answered (Yash, 2 Nov):** yes, a streaming voice API if free tiers cover the demo (D-021); provider picked after `compare-voices` |
| Team or solo | — | Solo, Indie Developer track |
| Test devices | Phase 1 | **Answered (Yash, 29 Oct):** one Android phone. The laptop browser is the second participant in Phase 4. iPhone only if one can be borrowed before Phase 6 |
