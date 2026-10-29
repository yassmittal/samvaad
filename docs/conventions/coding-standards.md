# Coding Standards

Same rules as StrideMon (`monad/docs/conventions/coding-standards.md`), cut down to what
this project needs. Judges read the code: it should read top to bottom without questions.

## 1. Naming

- **Full words.** `participant`, not `p`. `utterance`, not `utt`. `error` in a catch, not `e`.
  Accepted abbreviations: `id`, `url`, `api`, `asr`, `tts`, `pcm`, `ws` (only in URLs).
- **Units in names.** Audio and latency bugs are unit bugs.

  | ❌ | ✅ |
  |----|----|
  | `rate` | `sampleRateHertz` |
  | `frameSize` | `frameDurationMilliseconds`, `samplesPerFrame` |
  | `latency`, `delay` | `endToEndLatencyMilliseconds` |
  | `endedAt` (number) | `speechEndedAtEpochMilliseconds` |
  | `timeout` | `reconnectTimeoutMilliseconds` |

- **Booleans read as questions:** `isMicrophoneOpen`, `isSpeaking`, `hasVoiceForLanguage`.
- **Functions start with a verb:** `calculate…`, `fetch…`, `find…` (may return `null`),
  `create…`, `send…`, `is…`/`has…`, `assert…`, `to…`, `format…`. React handlers are
  `handle…`, props `on…`, hooks `use…` + noun.
- **Types and components:** PascalCase, no `I` prefix, no `Type` suffix. zod schemas are
  camelCase + `Schema`; the inferred type drops the suffix.
- **Constants:** `SCREAMING_SNAKE_CASE` with units: `SAMPLE_RATE_HERTZ`, `FRAME_DURATION_MILLISECONDS`.
- **String unions, not `enum`s.**

### Vocabulary: one word per concept

| Concept | Term | Not |
|---------|------|-----|
| A conversation space two phones share | **room** (`roomCode`) | call, channel, session |
| Someone in a room | **participant** (`participantId`) | user, member, client |
| One finished stretch of speech, from start to pause | **utterance** (`utteranceId`) | sentence, segment, turn, message |
| The text of what was said, in the speaker's language | **transcript** (partial or final) | caption, text |
| The text in the listener's language | **translation** | output, result |
| What the screen shows | **caption** (UI only) | subtitle |
| A language | **`languageCode`** (ISO 639-1, `hi`, `en`) | lang, locale |
| The upstream Meta ASR connection | **transcription stream** | asr socket, stt |
| One phone, two languages | **table mode** | single mode, solo mode |

## 2. Functions and files

- One job per function. Return early. An object parameter once there are more than two
  arguments.
- No magic numbers: every meaningful number is a named constant or comes from config.
- Files around 200 lines are a signal to split. Named exports only (default exports only
  where Next.js requires them).

## 3. TypeScript

- `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`. No `any`; use
  `unknown` and parse with zod.
- Every message crossing the WebSocket is parsed with its shared schema, on both sides.
  A message that fails to parse is logged and answered with `error { code: 'INVALID_MESSAGE' }`.
- Env is parsed with zod at boot. A missing variable stops the process with a clear message.

## 4. Testing

- `bun test`. Pure `lib/` functions get unit tests. Socket handlers get tests against the
  fake Meta servers in `apps/api/src/test-support/` (D-012).
- No test calls the real Meta API. The smoke scripts in `scripts/` do that, by hand.
- A change is done when `bun run typecheck`, `bun run lint` and `bun run test` pass.

## 5. Comments

Comment *why*, not *what*. Every place that depends on a browser or Meta quirk gets a
one-line comment with the decision id: `// iOS Safari only speaks after a gesture (D-007)`.
