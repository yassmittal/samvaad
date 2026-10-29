# Fixtures

Short 16 kHz mono 16-bit PCM WAV files for `bun run smoke:transcribe`.

| File           | Says                                                                                 |
| -------------- | ------------------------------------------------------------------------------------ |
| `hindi.wav`    | नमस्ते, मैं जयपुर से बोल रहा हूँ। हमारे पास हाथ से बने नीले मिट्टी के बर्तन हैं।                      |
| `english.wav`  | Hello, I would like to order two hundred blue pottery vases for my shop in London.   |
| `hinglish.wav` | हमारी blue pottery की price per piece चार सौ रुपये है, और delivery दो weeks में हो जाएगी। |

**These are placeholders** made with macOS voices (`say -v Lekha` and `say -v "Aman (English (India))"`),
so the API check can run before anyone records anything. Phase 0 asks for recordings in our own
voices: replace each file with a real recording of the same sentence, keeping the file name.

```sh
# From any recording (phone voice memo, QuickTime, ...):
ffmpeg -i recording.m4a -ac 1 -ar 16000 -sample_fmt s16 scripts/fixtures/hindi.wav
```
