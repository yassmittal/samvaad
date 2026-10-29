// Chrome sometimes never fires `end` for an utterance. Without a cap the microphone would
// stay muted for good, so give up after a generous time for the length of the text.
const MINIMUM_SPEECH_WAIT_MILLISECONDS = 5000;
const SPEECH_WAIT_MILLISECONDS_PER_CHARACTER = 200;

// Chrome drops an utterance's events if nothing references it while it plays.
let utteranceBeingSpoken: SpeechSynthesisUtterance | null = null;

type SpeakWithSpeechSynthesisOptions = {
  text: string;
  /** `null` when the device's voice list is unknown: the browser picks one from the tag. */
  voice: SpeechSynthesisVoice | null;
  speechSynthesisLanguageTag: string;
  onStarted: () => void;
  onFinished: () => void;
};

/** Speaks one text with the browser's voice and calls `onFinished` exactly once (D-007). */
export function speakWithSpeechSynthesis({
  text,
  voice,
  speechSynthesisLanguageTag,
  onStarted,
  onFinished,
}: SpeakWithSpeechSynthesisOptions): void {
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = voice?.lang ?? speechSynthesisLanguageTag;
  if (voice) {
    utterance.voice = voice;
  }

  let isFinished = false;
  const finish = () => {
    if (isFinished) {
      return;
    }
    isFinished = true;
    clearTimeout(stuckSpeechTimeout);
    if (utteranceBeingSpoken === utterance) {
      utteranceBeingSpoken = null;
    }
    onFinished();
  };
  const stuckSpeechTimeout = setTimeout(
    () => {
      console.warn('speech never finished; moving on', text);
      speechSynthesis.cancel();
      finish();
    },
    Math.max(
      MINIMUM_SPEECH_WAIT_MILLISECONDS,
      text.length * SPEECH_WAIT_MILLISECONDS_PER_CHARACTER,
    ),
  );

  utterance.onstart = onStarted;
  utterance.onend = finish;
  utterance.onerror = (event) => {
    console.warn('speech failed', event.error);
    finish();
  };
  utteranceBeingSpoken = utterance;
  speechSynthesis.speak(utterance);
}
