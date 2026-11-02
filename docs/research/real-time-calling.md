# Research: making Samvaad a real call

**Status: adopted by Yash on 2 Nov 2026 (D-018); built as [Phase 7](../phases/phase-07-real-call.md).** Each item becomes a decision
in [`../decisions.md`](../decisions.md) and a doc change before it is built (`CLAUDE.md`).

The ask: two people talk like on a normal WhatsApp call, each in their own language, as fast and
as natural as possible, very simple to use, with subtle animation. Anything in the world is allowed.

---

## 1. TL;DR

- **Today** Samvaad is a sentence-by-sentence interpreter: you finish a sentence, about 3 s later the
  other phone speaks it in a browser voice. You never hear the other person's real voice.
- **The world's fastest option** is a single speech-to-speech model that translates *while you are
  still talking*: OpenAI `gpt-realtime-translate` (May 2026) or Google `gemini-3.5-live-translate-preview`.
  Swapping Meta out for one of them would put Samvaad's hackathon score at risk: Stage One is
  pass/fail on using Meta's models, and "Use of Meta AI tooling" is 25%.
- **Recommendation: keep Meta as the brain, buy the voice and the pipe.** Muse Voice Transcribe and Muse
  Spark stay (context, glossary and recap are the point of the product). Add a natural streaming voice,
  a call-shaped UI, and the latency tricks below. Then, if it fits, add the other person's real voice
  under the translation, the way Google Meet and Apple's Phone app do.
- **Realistic target by Wed 4 Nov:** about 1.5 to 2 s from the end of a sentence to the first
  translated word heard (an estimate, today ≈ 3 s), in a voice that sounds human, in a UI that looks
  and behaves like a phone call.
- **After the hackathon:** WebRTC all the way (LiveKit), a translation agent per room that publishes a
  translated audio track in the speaker's own (cloned, consented) voice, and a native shell for ringing
  and lock-screen calls.

---

## 2. Where Samvaad is today (measured)

| Step | Measured | Source |
|------|----------|--------|
| Speech ends → final transcript (Muse Voice Transcribe endpointing) | 0.76 to 0.96 s | D-005, D-014 |
| Final transcript → first translated word (Muse Spark, `minimal`) | median ≈ 1.4 s, range 1.0 to 2.8 s | D-014, Phase 2 |
| Speech ends → translation complete | median ≈ 2.5 s, range 1.6 to 3.8 s | D-014, Phase 2 |
| Translation → speech starts | browser `speechSynthesis`, only after the whole translation arrives | D-007 |
| Phone ↔ API | the API runs in **AWS us-east-1** (N. Virginia). TCP connect from Yash's laptop: 0.28 to 0.32 s, i.e. one round trip India ↔ Virginia | measured 1 Nov, 3 samples |

Three more things matter for a "call":

1. **There is no call audio.** Each phone hears only the synthetic translation. Tone, laughter, "haan",
   "mm-hmm" are lost, and silence feels like a dead line.
2. **The mic is gated while the phone speaks** (`create-microphone-gate.ts`), in rooms too, and
   gating *ends* the Meta transcription stream; reopening starts a new one. So after every spoken
   translation there is a 300 ms reopen delay plus a fresh Meta handshake, and the first words
   said in that window are at risk.
3. **Browser voices are robotic** and differ per phone (D-007 already calls this the weakest part of the demo).

The only Meta models on the key (`GET /v1/models`, 1 Nov): `muse-spark-1.1/1.2/1.3` (+ `-contributor`),
`muse-voice-transcribe-1.0`, `muse-wonder-1.0`, `muse-image-1.0`, `sam-3.1`. **Meta still has no
speech output model**, and every Muse Spark always reasons before answering.

---

## 3. What "real time" can mean: five levels

The hard floor is language, not computers. Hindi puts the verb at the end (SOV) and English puts
it second (SVO), so any translator, human or machine, has to hear most of a Hindi clause before it can
say the English. Professional simultaneous interpreters run about 2 to 3 s behind the speaker.

| Level | What the listener experiences | Lag (estimate) | Examples |
|-------|-------------------------------|----------------|----------|
| 0. Turn-based (**today**) | Silence while you talk; a robotic voice after you finish the sentence | ≈ 3 s after the sentence | Samvaad now, Google Translate conversation mode |
| 1. Call + sentence interpreter | You hear their real voice faintly; a natural voice speaks the translation after each sentence | ≈ 1.5 to 2.5 s after the sentence | Apple Phone app Live Translation (their volume drops, an AI voice speaks the translation) |
| 2. Clause interpreter | Same, but long sentences are cut at clause boundaries and pauses, so a monologue no longer goes silent | ≈ 1 to 1.5 s after each clause | What a fast human consecutive interpreter does |
| 3. Simultaneous speech-to-speech | The translation speaks *while* they talk, a second or two behind, optionally in their own voice | ≈ 1 to 2 s behind the speaker (no vendor publishes figures) | Google Meet (Gemini 3.5 Live Translate), `gpt-realtime-translate` |
| 4. Full duplex, on device | Both talk over each other naturally, under a second, offline | research | Not shippable this year |

**With Meta in the loop, Level 2 is the ceiling**, and it's close to a human interpreter. Level 3 needs an
end-to-end speech model, which Meta doesn't offer through its API.

---

## 4. What exists in the world (Nov 2026)

### End-to-end speech-to-speech translators

| | What it is | Notes |
|---|---|---|
| **OpenAI `gpt-realtime-translate`** (7 May 2026) | One streaming model, speech in → translated speech out, translates while the speaker talks | 70+ input languages, 13 output languages; reported $0.034/min; WebRTC (browser) or WebSocket (server); also on Azure incl. India South |
| **Google `gemini-3.5-live-translate-preview`** | Live API speech-to-speech, the model behind Meet's translation | 70+ languages incl. Hindi; PCM16 16 kHz in, 24 kHz out; WebSocket; audio-only input; preview; Google itself says "voice replication can be inconsistent" and rapid language switching is hard (Hinglish) |
| **Palabra.ai** | ASR + MT + TTS pipeline as one API, with voice cloning | WebRTC/WebSocket; latency figures are self-reported |
| **Soniox** | Streaming speech → translated *text*, 60+ languages | Text only; would still need TTS |

### How the big products do it

- **Google Meet:** your voice, translated, a few seconds behind; "you will still faintly hear their
  original voice, with the translated speech overlaid on top"; a glow around the speaker's tile shows
  translation is on.
- **Apple Phone app (iOS 26):** on phone calls each speaker's volume drops and an AI voice speaks the
  translation on both ends. **FaceTime** does captions only and keeps the original voice.
- Both tell *both* sides that translation is on.

### Meta's pieces

| Model | Fit |
|-------|-----|
| **Muse Voice Transcribe** | Keep. Streaming partials, endpointing, diarization, code-switching bias, keywords. Third-party launch coverage quotes ~0.16 s to a final transcript; we measure 0.76 to 0.96 s in `ENDPOINTING` mode, so check the docs for an end-of-turn setting (§8, spike 4). |
| **Muse Spark 1.3** | Keep for context-aware translation and the recap. Its ~1.4 s of mandatory reasoning is the single biggest delay. |
| **Muse Spark Open / Muse Glimmer** (open weights) | The main way to cut that delay, if either can answer with less or no reasoning on Baseten/Fireworks/Modal. Aggregators quote ~0.5 s to first token for Spark Open (unverified for our prompt). Glimmer is 30B, Apache 2.0, ~233 tok/s on one RTX 5090 with speculative decoding (Meta's figure). Both qualify for the $10K "Best Build on Meta Open Weight Models" bonus. |
| **Muse Wonder** | Takes audio as *input* (text output), 1M context, $4/$20 per M tokens. Too slow for the hot path; interesting for a recap that hears tone, or for checking a translation after the fact. |

### Voices (text → speech, streaming)

| | Strength | Latency to first audio | Cloning |
|---|---|---|---|
| **ElevenLabs Flash v2.5** | Most natural, multilingual incl. Hindi | ~75 ms vendor-style; 185 ms median in an independent Sept 2026 test | Yes, the reference for cloning |
| **Cartesia Sonic 3.x** | Very fast, improved Hindi in 3.5 | 40 to 90 ms vendor-style; 440 ms in the same independent test | Yes |
| **Sarvam Bulbul v4 Flash** | Best Indian-language pronunciation | "sub-250 ms" (vendor) | No per-request cloning, curated voices |

The figures conflict. **Measure on our own path with the demo sentences** (§8, spike 1) before choosing.

### The pipe (call transport)

| | What it gives | Cost |
|---|---|---|
| **WebRTC peer-to-peer** + our existing WebSocket for signalling | Opus audio between the two phones, echo cancellation, jitter buffer; ~30 to 60 ms inside India | Free, but needs TURN behind mobile carrier NAT |
| **Cloudflare Realtime** (SFU + TURN) | Global anycast TURN/SFU | $0.05/GB egress after 1,000 GB/month free; STUN free |
| **LiveKit** (Cloud or self-hosted) + **LiveKit Agents** | SFU + a framework for a server-side bot that hears each track and publishes new ones: the standard shape for voice AI | Free tier, then usage. The Node agent SDK uses native bindings, so run it on Node rather than Bun |
| **Pipecat** (Daily) | Same idea as LiveKit Agents, Python | Pairs with Daily or any transport |

---

## 5. The hackathon constraint, said plainly

`about.md`: Stage One is pass/fail on "reasonably used Meta Model API and/or Meta's open-weight
models"; then **Use of Meta AI tooling is 25%** and **Demo is 25%**. A Samvaad that runs on
`gpt-realtime-translate` would be faster and smoother, and it would score worse on the 25% and risk Stage One.

So, **until 5 Nov:** Meta does the listening and the thinking (transcription, context-aware translation,
recap, and maybe Muse Spark Open). A third-party model only does the *voice* (D-007 already allows a paid
voice API), and WebRTC only carries audio. **After 5 Nov:** a speech-to-speech "fast lane" is fair game
if Samvaad becomes a product (§9).

---

## 6. Target architecture

### Hackathon version (builds on what exists)

```text
Phone A (Hindi)                                                   Phone B (English)
 mic ─┬─ WebRTC P2P, Opus, echo-cancelled ─────────────────────────→ A's real voice at ~20% volume   (optional, day 3)
      │
      └─ PCM16 over the existing WebSocket ─→ apps/api
                                               ├─ Muse Voice Transcribe   partials + endpointing
                                               ├─ Muse Spark 1.3          speculative + hedged (or Muse Spark Open)
                                               └─ streaming TTS           ElevenLabs / Cartesia / Sarvam
                                                    └─ audio frames over the WebSocket ─→ B hears A in English,
                                                                                          full volume, A's ducked
```

- The TTS key, like the Meta key, never leaves `apps/api`.
- The browser voice stays as the fallback when the TTS call fails.
- The mic gate stays (half duplex) until echo is proven safe (§7).

### Production version (after the hackathon)

```text
Phone A ⇄ LiveKit SFU (Mumbai) ⇄ Phone B         original voices: Opus, echo cancellation, TURN, jitter buffer
                 ⇅
     translation agent, one per room
       A's track → Muse Voice Transcribe → Muse Spark (or a distilled open model) → TTS in A's cloned voice
                 → publishes "A in English" as a WebRTC track
       B's track → … → publishes "B in Hindi"
     Each phone subscribes to the other's original track (low) and the other's translated track (full)
```

Because the translated voice arrives as a WebRTC track, the browser's echo canceller removes it from
the mic. That's what makes speakerphone and talking over each other safe. Native apps
(Expo + LiveKit's React Native SDK + CallKit / ConnectionService) add ringing on the lock screen,
background audio and earpiece/Bluetooth routing. A web page can't do any of those properly.

---

## 7. The hard part of calls: echo, barge-in, audio routing

- **Echo loop risk.** On speaker, the listener's mic hears the translated voice. If that reaches Meta,
  Samvaad translates its own output back. Today's mic gate prevents it.
- **What browsers cancel.** Chrome's echo canceller is documented to cancel audio from WebRTC remote
  tracks. Audio played through Web Audio has a long history of *not* being cancelled in Chromium
  (bugs 933677, 954937). Firefox and Safari cancel all page audio. Phones often add their own echo
  cancellation. **Test on the Android phone, on speaker, before removing the gate** (§8, spike 3).
  Workarounds: play the TTS through an `<audio>` element fed by a `MediaStream`, or loop it through a
  local `RTCPeerConnection` (what Mozilla Hubs did). The real fix is the production version above.
- **Keep the Meta stream alive while gated.** Send silence frames instead of closing the stream
  during playback. Then there's no handshake after each translation and no clipped first word. Pacing
  stays real-time, and Meta bills $0.18 per audio hour, so silence costs almost nothing.
- **Barge-in.** With the gate on, a listener can't interrupt a translation. Show "Speaking… tap to
  interrupt": the tap stops playback and opens the mic. Real barge-in comes with echo-cancelled tracks.
- **Earpiece vs speaker.** Web pages can't reliably switch the output on phones. Default to "earbuds
  recommended", and say so on the answer screen.

---

## 8. Latency plan

| Step | Today | Target by Wed | How |
|------|-------|---------------|-----|
| Speech end → translation request starts | 0.76 to 0.96 s (wait for endpointing) | 0.4 to 0.7 s when the guess is right | **Speculative translation**: once the partial transcript has been stable ~300 ms *and* the browser's own voice detector hears silence, start Muse Spark on the partial; keep the result if `speechComplete` matches (D-014's plan). Partials trail audio by 300 to 400 ms, so the saving is limited |
| Request → first translated word | median 1.4 s, tail 2.8 s | ≈ 1.0 s median, tail ≈ 1.5 s | **Hedged requests**: if no first token after ~1.0 s, fire a second identical request and use whichever answers first (cuts the tail; translations are tiny, so cheap). **Muse Spark Open** if spike 2 shows a lower first-token time at acceptable quality |
| First word → first audio | browser voice, after the *whole* translation | 0.1 to 0.45 s after the first sentence of text | **Streaming TTS** from the API, started on the first complete sentence of the translation |
| Network | ~0.28 s round trip India ↔ us-east-1 | measure | If Meta's endpoints answer fast from Mumbai, move the API to `ap-south-1`; if they're US-only, Virginia may be the better place. Spike 5 decides |
| **Sentence end → first translated word heard** | **≈ 3 s (estimate)** | **≈ 1.5 to 2 s (estimate)** | |

### Spikes to run first (Mon morning, about 3 hours, before building anything)

1. **Voice bake-off.** Five demo lines (pure Hindi, Hinglish in Devanagari, English with a number, a name,
   a price) through ElevenLabs Flash v2.5, Cartesia Sonic and Sarvam Bulbul. Time to first audio from
   the laptop and listen for pronunciation. Pick one.
2. **Muse Spark Open.** On Baseten or Fireworks (hackathon credits): the lowest reasoning setting it
   accepts, first-token time and `compare:context` quality against `muse-spark-1.3`.
3. **Echo.** Android phone on speaker, mic open, TTS played through Web Audio vs an `<audio>` element.
   Does the transcript pick it up?
4. **Endpointing.** Read Muse Voice Transcribe's docs for any end-of-turn / silence setting that
   explains Meta's ~0.16 s against our 0.8 to 0.96 s.
5. **Where Meta lives.** Time `api.meta.ai` TCP connect and a transcription handshake from the EC2
   instance (us-east-1) and from a Mumbai box, to decide on the region.

---

## 9. UX: a call, not an app

Principle: **one decision per screen, then get out of the way.** Nobody should have to read anything to
make a call.

### The flow

| Screen | What's on it | Notes |
|--------|--------------|-------|
| **Home** | Your language as one chip (guessed from `navigator.language`, remembered) and one big **Start a call** button. "Same table? Use one phone" as a quiet link | Name asked once and remembered |
| **Calling** | Your avatar pulsing softly, "Waiting for them to join", **Share** (Web Share API → WhatsApp), QR and copy link | A soft ringback tone |
| **Incoming** (the link's first screen) | "**Yash is calling** · speaks Hindi · you'll hear English", their language chip pre-filled from the browser, a big green **Answer** and a quiet Decline | The Answer tap grants the mic and unlocks audio on iOS (D-007) in one go |
| **In call** | Their name and a call timer at the top. One living **orb** in the middle. Their words *in your language*, large, filling in word by word, with the original small and faint beneath. Your own last sentence at the bottom with WhatsApp-style ticks: ✓ translated, ✓✓ they heard it (`playback_started` already exists). A small latency chip. Bottom bar: **Mute**, **Original voice** (volume of their real voice), **Captions**, red **End** | Open mic, no push-to-talk |
| **Reconnecting** | The orb dims, "Reconnecting…" as WhatsApp says it | D-017's seat keeping already does the work |
| **Ended** | The recap card in your language (exists), **Call again** | |

### What the orb shows (the only animation that carries meaning)

| State | Look |
|-------|------|
| Idle | Slow breathing, neutral |
| You're speaking | Your colour, size follows your mic level (smoothed: ~30 ms attack, ~200 ms release) |
| Translating | The colour **sweeps from your hue to theirs**: your words travelling to them |
| They're speaking | Their colour, gentle ripples (we only have their state, not their audio, until WebRTC) |
| Their translation is playing | Their colour, size follows the playback level |
| Reconnecting | Desaturated, slow |

Everything else is quiet: captions fade and unblur in word by word as deltas arrive (~40 ms stagger),
state changes cross-fade in ~300 ms on springs, a short haptic on connect and end (Android only; iOS
Safari has no vibration API), soft earcons for connect, ended and muted. `prefers-reduced-motion`
gets a static orb that only changes colour.

---

## 10. Design research and direction

Mobbin's screen search needs a paid plan, so these came from Awwwards, product write-ups and open-source kits.

| Reference | What to take |
|-----------|--------------|
| **Apple Phone / FaceTime Live Translation** (iOS 26) | The interaction model: their voice drops, the translation speaks over it, captions in the Live Captions style, both sides told translation is on |
| **Google Meet speech translation** | Original voice faint under the translation; the glow on the speaker's tile as the "translation is on" signal |
| **Elva** ([elva-labs.com](https://elva-labs.com/), Awwwards Site of the Day, 15 Jun 2026, by Lazarev) | A voice-first mobile app with a two-colour palette (#FFFFFF / #151515) and a glass-blob persona with 30+ behavioural states (GSAP, Three.js). The closest award-winning example of "one blob that carries the state" |
| **Cerebrium** (Awwwards SOTD, 10 Sep 2026) | Real-time AI infra site; tone reference for a dark, technical landing page |
| **ElevenLabs UI Orb** (MIT, installs through the shadcn registry, Three.js, agent states) | Code we may actually copy: the orb, waveform and agent components |
| **Pipecat Voice UI Kit** (plasma visualiser), **LiveKit Agents UI** (audio visualiser) | Alternative orb/visualiser implementations |
| **WhatsApp call screen** | Layout everyone already knows: name, timer, avatar, bottom controls, red end button |

**On "copy it end to end":** copy the *patterns* (Apple, Meet, WhatsApp) and the MIT-licensed code
(ElevenLabs UI). Don't lift another site's own code, brand or assets. The repo has to be public, and the
rules disqualify a demo whose original work isn't clear (`about.md`).

### Proposed tokens

- **Call screen is dark**, like every phone's call screen: background `#111111`, text `#F4F1EC`.
  Light mode keeps the current stone palette for home and recap.
- **Two people, two hues:** you warm (marigold, ≈ `oklch(80% 0.15 75)`), them cool (azure/indigo,
  ≈ `oklch(70% 0.14 260)`). Translating is the gradient between them. Red stays for End and errors only.
- **Type:** a family that's equally good in Devanagari and Latin, e.g. **Anek Devanagari + Anek Latin**
  (Google Fonts, variable) or Noto Sans + Noto Sans Devanagari. Captions 28 to 32 px, line height 1.25;
  the original line 15 px at 50% opacity.
- **Motion:** springs (the `motion` library), 200 to 400 ms, nothing that loops except the breathing orb.

---

## 11. Plan

### Until submission (aim: submit Wed 4 Nov evening IST, deadline Thu 5 Nov 07:30 IST)

| When | Work | Go / no-go |
|------|------|------------|
| Mon AM | The five spikes in §8 | Pick the voice; decide on Muse Spark Open |
| Mon PM | Streaming neural TTS through `apps/api` (binary audio frames to the listener, played through an AudioWorklet), browser voice as fallback; keep the Meta stream alive with silence while gated | The demo pair sounds human on the Android phone |
| Tue AM | The call UI: home → calling → incoming/Answer → in call (orb, captions, ticks) → ended | A friend can make a call with no help |
| Tue PM | Speculative + hedged translation; Muse Spark Open switch if spike 2 won | Median sentence-end → first word heard measured and on screen |
| Wed AM | **Optional:** WebRTC P2P real voice, ducked, with Cloudflare TURN. Only if Mon and Tue landed | Decide at noon; otherwise polish |
| Wed PM | Phase 6.3: README, video, X post, submit | |

Each item first gets its decision (D-018 onwards) and doc change, as `CLAUDE.md` asks.

### After the hackathon

1. LiveKit (SFU in Mumbai) + a translation agent per room (§6, production version).
2. "Hear them in their own voice": consented, instant voice cloning (ElevenLabs or Cartesia), with
   both sides told.
3. Native shell: Expo + LiveKit React Native + CallKit / ConnectionService for real ringing, lock screen,
   background audio, earpiece and Bluetooth.
4. A speech-to-speech fast lane (`gpt-realtime-translate` or Gemini Live Translate) per language pair,
   with Muse Spark kept for the glossary, corrections and the recap.
5. Distil translation into a small open model (Muse Glimmer) with no reasoning step, served near the
   users, for a first token well under 0.5 s.

---

## 12. Questions for Yash

1. **Hackathon-first or product-first until 5 Nov?** This doc assumes hackathon-first (Meta stays the brain).
2. **Which voice vendor, and is spending allowed?** ElevenLabs, Cartesia and Sarvam all need an account
   and an API key; their free tiers may be enough for the demo.
3. **Real voice under the translation (WebRTC) before submission, or after?**
4. **Voice cloning:** in scope at all, and only with explicit consent from both people?
5. **Baseten / Fireworks / Modal credits:** claimed? Spike 2 needs one.

---

## Sources

- Gemini Live API, live translation: https://ai.google.dev/gemini-api/docs/live-api/live-translate
- Gemini 3.5 Live Translate and Meet: https://slator.com/google-ai-live-speech-translation-gemini-3-5-live-translate/ ,
  https://www.implicator.ai/google-expands-meet-speech-translation-from-5-languages-to-70-with-gemini-3-5/ ,
  https://www.channelnews.com.au/google-meet-adds-real-time-voice-translation-with-your-own-voice/
- OpenAI `gpt-realtime-translate`: https://openai.com/am-ET/index/advancing-voice-intelligence-with-new-models-in-the-api/ ,
  https://www.llmreference.com/model/gpt-realtime-translate/openai-api , https://ai.azure.com/catalog/models/gpt-realtime-translate
- Apple Live Translation in calls: https://www.tomsguide.com/phones/iphones/how-to-use-live-translations-in-the-ios-26-phone-app ,
  https://appleinsider.com/inside/facetime/tips/inside-live-translation-on-facetime-on-ios-26
- Cascaded vs end-to-end architecture: https://www.forasoft.com/learn/real-time-speech-translation-live-video
- Palabra: https://www.palabra.ai/ · Soniox: https://soniox.com/speech-translation
- Muse Voice Transcribe: https://datanorth.ai/news/meta-launches-muse-voice-transcribe ,
  https://www.gradually.ai/en/ai-models/muse-voice-transcribe/ , https://runtimewire.com/article/meta-muse-voice-transcribe-real-time-diarization-price
- Muse Glimmer: https://campustechnology.com/articles/2026/08/26/meta-releases-muse-glimmer-an-open-weight-ai-model-designed-to-run-on-consumer-hardware.aspx ,
  https://codersera.com/blog/muse-glimmer-complete-guide-2026/amp/
- Muse Spark Open speeds: https://pricepertoken.com/pricing-page/model/meta-llama-muse-spark-open , https://computeprices.com/models/muse-spark-open
- Muse Wonder: https://www.eesel.ai/blog/meta-muse-wonder , https://www.deeplearning.ai/the-batch/meta-releases-wonder-opens-spark/
- TTS latency: https://futureagi.com/blog/elevenlabs-vs-cartesia-tts-2026/ , https://gradium.ai/content/best-low-latency-tts-apis-2026 ,
  https://www.coval.ai/blog/best-text-to-speech-providers-in-2026-how-to-choose-(and-why-vendor-benchmarks-lie)/ ,
  https://www.sarvam.ai/text-to-speech/voice-agents
- Echo cancellation in browsers: https://lists.w3.org/Archives/Public/public-webrtc-logs/2019Apr/0334.html ,
  https://docs.atmoky.com/known-issues , https://forum.babylonjs.com/t/browser-audio-cancellation-doesnt-work-using-babylons-sound-component/16759
- Cloudflare Realtime pricing: https://developers.cloudflare.com/realtime/sfu/platform/pricing/
- LiveKit / Pipecat: https://modal.com/blog/livekit-vs-daily , https://www.f22labs.com/blogs/difference-between-livekit-vs-pipecat-voice-ai-platforms/
- Design: https://www.awwwards.com/sites/elva , https://www.awwwards.com/sites/cerebrium ,
  https://elevenlabs.io/hi/blog/elevenlabs-ui , https://voiceuikit.pipecat.ai/visualizers/plasma-visualizer ,
  https://docs.livekit.io/frontends/agents-ui/audio-visualizer/custom/
