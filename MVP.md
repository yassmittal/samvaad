# Samvaad — MVP

> **Samvaad** (Hindi: *conversation*) is a working name. See the open questions in
> `docs/roadmap.md`.

## 1. The idea

Two people who don't share a language talk to each other normally. Each of them
speaks their own language and hears the other person in their own language, a
sentence or two behind.

> **You speak Hindi. They hear English. They answer in English. You hear Hindi.**

It is built for the **Meta Global AI Developer Hackathon** (`about.md`), theme
**Build for Your World**, Indie Developer track. Submissions close
**Wed 4 Nov 2026, 21:00 ET = Thu 5 Nov 2026, 07:30 IST**.

## 2. Why this is worth building

- India alone has 22 scheduled languages, and most people switch between two of them
  in the same sentence (Hinglish). Existing live translators handle that badly.
- A lot of everyday business happens across a language gap: an exporter and a foreign
  buyer, a shopkeeper and a tourist, a migrant worker and a landlord.
- The phrase-by-phrase translators that exist (Google Translate conversation mode,
  AirPods Live Translation) translate each sentence on its own. They forget names,
  product terms and what was said a minute ago. An LLM translator can keep all of that.

## 3. End-to-end user journey

```text
Person A (Hindi)                                  Person B (English)
 │                                                 │
 ├── Opens the web app on their phone              │
 ├── Picks "Hindi", creates a room ──── code/QR ──→├── Opens the link, picks "English", joins
 │                                                 │
 ├── Speaks Hindi (mixed with English is fine)     │
 │     → live Hindi captions on A's screen         │
 │     → finished sentence is translated ─────────→├── Reads English captions
 │                                                 ├── Hears the English sentence in earbuds
 │                                                 │
 │                                                 ├── Answers in English
 ├── Reads Hindi captions  ←───────────────────────│
 ├── Hears the Hindi sentence in earbuds           │
 │                                                 │
 └── Ends the conversation → recap in both languages (Phase 5)
```

There is also a **table mode**: one phone lies on the table between two people, works
out which of the two languages was just spoken, and says it out loud in the other one.
It's built first (Phases 1 to 3), because it needs no rooms.

## 4. What it uses from Meta

| Step | Model | Why this model |
|------|-------|----------------|
| Speech → text | **Muse Voice Transcribe** (`muse-voice-transcribe-1.0`, realtime WebSocket) | Streaming partials, server endpointing (it knows when a sentence ended), 25 validated languages including Hindi, Tamil, Telugu, Kannada, Marathi and Bengali, code-switching through a language bias list, and keyword biasing for names. |
| Translate | **Muse Spark** (Chat Completions, streaming) | Translates a sentence *with* the conversation so far, a glossary and the setting, so names, terms and tone stay right. Also writes the end-of-conversation recap. |
| Text → speech | **Not Meta.** The browser's `speechSynthesis` first (D-007) | Meta's API has no speech output model. |
| Optional | **Muse Spark Open** through Baseten (Phase 7) | The "Best Build on Meta Open Weight Models" bonus. |

## 5. Scope

### In the MVP (Phases 0 to 6)
- Table mode on one phone, for one language pair.
- Two-phone rooms: each person speaks and hears their own language.
- Live captions (original and translated), with spoken translation.
- Context-aware translation: conversation memory, a glossary of names and terms, and the setting.
- A recap at the end of the conversation, in each person's language.
- An on-screen latency meter: time from the end of your sentence to the other side hearing it.
- Hosted, so judges can open it on their own phones.

### Not in the MVP
- Accounts, sign-in, saved history (no database, D-004).
- Simultaneous interpretation that speaks *while* you are still talking.
- Group calls with more than two people (the protocol allows it, the UI doesn't).
- Native mobile apps.
- Phone or video calls (WebRTC media). Both people are in the same place, or on a voice call of their own.
- Anything medical or legal (hackathon anti-project list).

## 6. Judging, and how the plan answers it

| Criterion (weight) | How Samvaad scores |
|--------------------|--------------------|
| Impact (30%) | A real problem from Yash's world (Indian languages, Hinglish, exporters and buyers). Anyone with a phone can use it, no install. |
| Use of Meta AI tooling (25%) | Two Meta models in one live pipeline. Uses the less obvious parts of Muse Voice Transcribe (endpointing, code-switching bias, keyword bias) and uses Muse Spark for *context* rather than plain translation. |
| Technical depth (20%) | Real-time audio capture, a streaming proxy over two WebSockets, a measured latency budget, tests against a fake Meta server. |
| Demo (25%) | Two phones, two people, two languages, live in the video, with the latency meter on screen. |

## 7. What "done" means

The MVP is done when two people on two phones, in two different supported languages,
hold a 2-minute conversation on the **hosted** app, and each hears the other in their own
language with a median delay under **2.5 seconds** from the end of a sentence (D-011).
