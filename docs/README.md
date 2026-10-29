# Samvaad — Documentation

This folder is the source of truth for **how** we build the product described in
[`../MVP.md`](../MVP.md). `MVP.md` says *what* it is; these docs say how the system is
shaped, how the code is written, and in which order it is built.

When a decision changes, the doc changes first.

## Reading order

| # | Document | Read it when |
|---|----------|--------------|
| 1 | [`architecture/system-overview.md`](architecture/system-overview.md) | First. The pieces, the audio path, the protocol and the latency budget on one page. |
| 2 | [`decisions.md`](decisions.md) | You want to know *why* something was chosen. |
| 3 | [`roadmap.md`](roadmap.md) | You want the phases, the dates, what to cut if time runs short, and the open questions. |
| 4 | [`conventions/coding-standards.md`](conventions/coding-standards.md) | Before writing any code. Naming, vocabulary, tests. **Not optional.** |
| 5 | [`architecture/repository-structure.md`](architecture/repository-structure.md) | Deciding where a file goes. |
| — | [`phases/`](phases/) | One spec per phase. Build from these. |

## Three rules that override everything else

1. **Every phase ends with something you can run and show.** No half-built layers.
2. **Readable over clever.** Every name says what it is, in full words, with units.
3. **Write only what the current phase needs.** No "we might need this later" code.

## Status

| Phase | Planned (IST) | State |
|-------|---------------|-------|
| 0 — Foundations and API check | Thu 29 Oct | Done (fixtures still synthetic) |
| 1 — Live captions (table mode) | Fri 30 Oct | Done (checked on the Android phone) |
| 2 — Translated captions | Sat 31 Oct, morning | Done (checked in desktop Chromium through real Meta; quick phone check recommended) |
| 3 — Spoken translation (**table mode done**) | Sat 31 Oct, afternoon | Done (checked on the Android phone; latency not yet recorded in D-011) |
| 4 — Two-phone rooms (**core done**) | Sun 1 Nov | Done (30 Oct; checked on the Android phone and the laptop, QR included; latency not yet recorded in D-011) |
| 5 — Context-aware translation and recap | Mon 2 Nov | Not started |
| 6 — Hosting, hardening and submission | Tue 3 Nov to Wed 4 Nov | Not started |
| 7 — Stretch (open weights, better voice) | Only if ahead | Not started |

Update this table as phases finish.
