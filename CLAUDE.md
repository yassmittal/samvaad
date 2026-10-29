# CLAUDE.md

Working guide for **Samvaad** (working name), a real-time two-way speech translator built for
the Meta Global AI Developer Hackathon (`about.md`). Each person speaks their own language and
hears the other in theirs.

- `MVP.md` is the product brief (**what**).
- `docs/` is the architecture, conventions and phased build plan (**how**). Start at `docs/README.md`.
- `about.md` is the hackathon page as pasted: rules, judging rubric and deadline. Read-only.

## Stack (planned, D-001 to D-003)

Bun workspaces monorepo:

```
apps/web         Next.js 16 + React 19 + Tailwind v4 (mic capture, captions, speech output)
apps/api         Fastify 5 + TypeScript on Bun (WebSocket rooms, proxies Meta's ASR and Muse Spark)
packages/shared  zod schemas for the WebSocket protocol, supported languages, shared types
```

## Non-negotiables

- **Never run git commands** (see the workspace `CLAUDE.md`). Leave changes in the working tree.
  The repo must be public for the submission. Yash does that himself.
- **Build phase by phase** from `docs/phases/`. Only write what the current phase needs.
- **If the code needs to differ from the docs, update the doc first** (and add a decision to
  `docs/decisions.md` when it changes a choice).
- **The Meta API key never reaches the browser.** The browser only talks to `apps/api`.
- **Follow `docs/conventions/coding-standards.md`**: full-word names with units
  (`sampleRateHertz`, `delayMilliseconds`), verb-first functions, no `any`, and the vocabulary
  table (room, participant, utterance, caption, translation).
- **Search `packages/shared` before writing a type or schema.** The WebSocket protocol is defined
  once, there.
- **Meta API facts are only facts once Phase 0 has checked them.** Until then, treat model ids,
  audio formats and event names in these docs as "from third-party docs".
- A change is done when typecheck, lint and tests pass.
- **Deadline:** submissions close Thu 5 Nov 2026, 07:30 IST. Keep `docs/roadmap.md`'s dates honest.
