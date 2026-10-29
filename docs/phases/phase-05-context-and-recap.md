# Phase 5 — Context-aware translation and recap

**Planned:** Mon 2 Nov (IST) · **Size:** M

**Goal:** make the translation *better than a phrase translator*, which is our answer to
"Use of Meta AI tooling" (25%) and "Impact" (30%). Muse Spark sees the conversation so far,
the setting and a glossary, so names, product terms, numbers and "it/that" come out right.
Muse Voice Transcribe gets the same glossary as keywords, so names are *heard* right. At
the end, each person gets a recap in their own language.

**Needs:** the demo story (open question in `roadmap.md`). The default is an exporter and a
buyer agreeing an order.

**Read first:** `decisions.md` D-005 (keywords), D-006.

## Deliverables

### `packages/shared`
- Client messages: `update_conversation_context { setting, glossaryTerms: [{ term,
  preferredTranslations }] }`, `end_conversation`.
- Server messages: `conversation_context`, `conversation_recap { languageCode, text }`.

### `apps/api`
- The room keeps the conversation so far: utterances with their transcripts and translations.
- `lib/build-translation-prompt.ts` grows: the setting, the glossary, and the last
  `CONVERSATION_MEMORY_UTTERANCE_COUNT` utterances (start with 8). Kept under a token budget.
- Glossary terms are sent to the transcription stream as keywords. The language bias and
  keywords are fixed at the handshake (D-005), so a glossary change reconnects the stream
  between utterances, never in the middle of one.
- `lib/build-recap-prompt.ts` + handler: on `end_conversation`, one Muse Spark call per
  participant language: what was agreed, numbers and dates, open questions. Not a
  transcript.
- An evaluation script, `scripts/compare-translation-context.ts`: runs a fixed 10-utterance
  conversation with and without context and prints both side by side. Its output goes in the
  README and the video. It's the proof that context matters.
- Tests: prompt includes memory and glossary, stays under budget, recap per language.

### `apps/web`
- Room setup: an optional "What's this conversation about?" field and a glossary editor
  (term + how it should be translated). Pre-filled presets for the demo story.
- "End conversation" → a recap screen in your language, with copy and share.
- Hinglish: a "I mix in English" switch on the language picker that sets the bias list.

## Out of scope
Saving recaps (no database, D-004).

## Definition of done
- [ ] In the scripted demo conversation, product names, a person's name and a price come
  out right with context and visibly wrong (or less right) without. Shown by the comparison script.
- [ ] A pronoun that refers to something said three utterances ago is translated correctly.
- [ ] The recap is correct in both languages for the demo conversation.
- [ ] Translation latency with context is still within D-011 (measured).
- [ ] Typecheck, lint and tests pass.

## Demo check
Run the exporter–buyer conversation on two phones, end it, and read the recap on each phone.
