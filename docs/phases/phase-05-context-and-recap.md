# Phase 5 — Context-aware translation and recap

**Planned:** Mon 2 Nov (IST) · **Size:** M

**Goal:** make the translation *better than a phrase translator*, which is our answer to
"Use of Meta AI tooling" (25%) and "Impact" (30%). Muse Spark sees the conversation so far,
the setting and a glossary, so names, product terms, numbers and "it/that" come out right.
Muse Voice Transcribe gets the same glossary as keywords, so names are *heard* right. At
the end, each person gets a recap in their own language.

**Needs:** the demo story (open question in `roadmap.md`). **Settled (Yash, 30 Oct):** the
roadmap default. Ramesh Kumawat, a Jaipur blue pottery exporter (Hindi), and Siobhan Doyle of
Doyle Home, a London homeware shop (English), agree an order: large platters, coaster sets,
prices in rupees per piece, a shipping date and payment terms.

**Read first:** `decisions.md` D-005 (keywords), D-006, D-014, D-015, **D-016** (how context
works, settled before the build).

## Deliverables

### `packages/shared`
- Client messages: `update_conversation_context { setting, glossaryTerms: [{ term,
  preferredTranslation }] }` (D-016: the term and its form in the other language, blank to
  keep it as it is), `end_conversation`.
- Server messages: `conversation_context { setting, glossaryTerms, updatedByParticipantName }`
  (to everyone on every change, and to a phone when it joins), `conversation_ended {
  participantName }` (to everyone, at once), `conversation_recap { languageCode, text }` (to
  the participants listening in that language).
- Error code `RECAP_UNAVAILABLE`. Length limits on the setting and the glossary, so the prompt
  stays bounded.
- `domain/demo-conversation-preset.ts`: the demo story's setting and glossary, used by the web
  preset and the comparison script.

### `apps/api`
- The room keeps the conversation so far: utterances with their transcripts and translations.
- `lib/build-translation-prompt.ts` grows: the setting, the glossary, and the last
  `CONVERSATION_MEMORY_UTTERANCE_COUNT` utterances (start with 8), with their translations into
  this target language. Kept under a character budget (D-016). An empty context gives the
  Phase 4 prompt unchanged.
- Glossary terms (and their other-language forms) are sent to the transcription stream as
  keywords. The language bias and keywords are fixed at the handshake (D-005), so a glossary
  change reconnects the stream between utterances, never in the middle of one.
- `lib/build-recap-prompt.ts` + handler: on `end_conversation`, one Muse Spark call per
  listener language: what was agreed, numbers and dates, open questions. Not a transcript.
- An evaluation script, `scripts/compare-translation-context.ts`: runs a fixed 10-utterance
  conversation with and without context and prints both side by side. Its output goes in the
  README and the video. It's the proof that context matters.
- Tests: prompt includes memory and glossary, stays under budget, recap per language.

### `apps/web`
- Room setup: an optional "What's this conversation about?" field and a glossary editor
  (term + how it should be translated). Pre-filled presets for the demo story. The same editor
  in the room (either participant, D-016) and in table mode, behind a "Context" button.
- "End conversation" → a recap screen in your language, with copy and share, on both phones.
- ~~Hinglish: a "I mix in English" switch on the language picker that sets the bias list.~~
  Dropped (D-016): D-015 already biases every speaker to their language plus English. The
  picker says "Mixing in English is fine".

## Out of scope
Saving recaps (no database, D-004).

## Definition of done
- [x] In the scripted demo conversation, product names, a person's name and a price come
  out right with context and visibly wrong (or less right) without. Shown by the comparison script.
  *(30 Oct, one run of `compare:context`: "Shivan ji … blue pachari" → "Siobhan … blue pottery";
  "large thali" → "large platter"; "four twenty-five / three hundred" left in English →
  "चार सौ पच्चीस / तीन सौ"; "Siobhan Doyle … thirty percent" left in Latin script → "शिवॉन डॉयल,
  डॉयल होम, तीस प्रतिशत". Rows in the README.)*
- [x] A pronoun that refers to something said three utterances ago is translated correctly.
  *(Utterance 7, "वो … निकल जाएगी" for the platter order: "It'll be packed and dispatched by the
  fifteenth of December" with context. Honest note: without context it also said "It", so this
  line doesn't show a difference. Context did fix the speaker's gender: Siobhan's "I'll pay"
  became "दूँगी" with context, "करूंगा" without.)*
- [x] The recap is correct in both languages for the demo conversation.
  *(30 Oct: Yash ran the two-phone conversation and the recap on the phone and the laptop;
  both worked. On the scripted conversation (`--recap`) both recaps had the
  quantities, prices, date and payment terms right and listed the food-safe glaze question as
  open; the English one was sparser (the agreed list left out the 300 and the coaster sets,
  which were only under numbers). In the headless room check the Hindi recap first called an
  offer nobody accepted "agreed"; the prompt now says agreed means both people accepted it,
  and the rerun agreed in both languages.)*
- [ ] Translation latency with context is still within D-011 (measured).
  *(Parked with D-011/D-014, Yash's call. Not a measurement: in the one comparison run the
  median time to the first word was 1.29 s with context and 1.88 s without, so the context did
  not visibly slow it; the largest prompt was 2,276 characters. The API's `translation complete`
  log line now has `memoryUtteranceCount` and `systemPromptCharacterCount` next to the delay.)*
- [x] Typecheck, lint and tests pass. *(30 Oct: 7 script, 24 shared, 123 API, 37 web tests.)*

## Demo check
Run the exporter–buyer conversation on two phones, end it, and read the recap on each phone.

## Build notes (30 Oct)

- **Settled before the build (D-016):** context belongs to the room, either phone edits it any
  time; a glossary entry is a term and its form in the other language; no Hinglish switch;
  End ends it for both phones. Protocol beyond the spec: `conversation_context` carries
  `updatedByParticipantName`, `conversation_ended { participantName }` goes to everyone at
  once, and the error code `RECAP_UNAVAILABLE`.
- **Shared:** `domain/conversation-context.ts` (schema and length limits: setting 400
  characters, 20 terms of up to 60) and `domain/demo-conversation-preset.ts` (the preset the
  web offers and the comparison script uses).
- **Memory:** the room keeps every utterance with its finished translations
  (`lib/conversation-memory.ts`). A translation sees the last 8 utterances before it, each with
  its translation into this request's target language, in the system prompt after the rules and
  before the "answer immediately" line (`lib/build-translation-prompt.ts`), plus "The user
  message is spoken by Ramesh" in a room. Over 6,000 characters the oldest utterances are
  dropped first. An empty context gives the Phase 4 prompt byte for byte (tested), which is the
  comparison script's baseline.
- **Keywords:** every term and non-blank other-language form goes to Meta's handshake
  (`lib/find-transcription-keywords.ts`). **Meta accepts Devanagari keywords** (one
  `smoke:transcribe` run on the Hinglish fixture with "ब्लू पॉटरी" and "शिवॉन": handshake fine,
  transcript "ब्लू पॉटरी"; Phase 0 got the same spelling without keywords, so the run doesn't show
  an effect). A glossary change replaces each open stream with the 55-minute rotation's
  hand-over: at once if the speaker is between utterances, after the current utterance's
  `speechComplete` if not (`utteranceTracker.hasUtteranceInProgress`). A mutation check (the
  tracker always answering "not in progress") makes the mid-utterance test fail. In practice the
  mic gate also recycles the stream each time the phone speaks a translation.
- **Recap:** `handlers/handle-end-conversation.ts` writes one recap per language anyone in the
  room listens in (both of a table's), with `reasoning_effort: "low"` and a 45 s timeout
  (`writeRecap` on the Muse Spark client), from the newest 30,000 characters of transcript.
  Nothing said yet answers `RECAP_UNAVAILABLE` to the asker only; a second End while recaps are
  being written is ignored. The room and its memory stay, so a later End recaps it all again.
- **Comparison script:** `bun run compare:context` (20 Muse Spark calls; 22 with `--recap`;
  `--markdown` for the README table). The conversation is in `scripts/lib/demo-conversation.ts`;
  the Hindi lines are written the way the transcriber writes Hinglish, including the real
  mishearing "ब्लू पाचरी" from Phase 4. The English "four twenty-five" is a plausible transcript,
  not one Meta has produced. Run once so far, with `--recap` (22 calls).
- **Web:** `features/conversation-context/` (the draft logic, the editor, the panel and the
  header chip) and `features/recap/` (the two-tap "End & recap" button and the recap screen with
  Copy, Share, Back to the conversation and Leave; headings bold, "- " lines as items). The
  create form has the editor folded under "Context for the translation (optional)" with the
  demo preset button, and sends `update_conversation_context` right after `create_room`; a
  reconnecting creator rejoins without resending it. Table mode resends its context after a
  reconnect, because that starts a new table session. Every phone closes its mic on
  `conversation_ended`. "End & recap" is disabled until something has been said.
- **Checked headless (30 Oct, twice, through real Meta, ~4 calls each):** the phone created a
  room with the demo preset, the laptop joined and saw "Context · 6 terms" and the editor
  filled in, the phone spoke the Hinglish fixture, the laptop got "Our blue pottery price is
  four hundred rupees per piece…", the laptop ended it, and both screens switched to the recap
  in their own language. Two layout bugs found and fixed: glossary rows overflowed a 390 px
  screen (a `<fieldset>` is as wide as its content unless given `min-w-0`), and the summary of
  the folded editor repeated the field's label.
- **Not built:** the recap isn't cancelled if everyone leaves while it's being written (it
  finishes and goes to nobody: one wasted call). A context change made on the other phone while
  your panel is open shows the next time you open it.
