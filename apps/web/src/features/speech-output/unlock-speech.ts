import { unlockPlaybackAudioOutput } from './playback-audio-output';

let isSpeechUnlocked = false;

/**
 * iOS Safari only speaks after a user gesture (D-007). Speaking a silent, empty utterance
 * inside the first tap unlocks `speechSynthesis` for the rest of the page's life. The
 * AudioContext for spoken translations (D-021) is created, or resumed after an interruption,
 * in every tap that calls this.
 */
export function unlockSpeech(): void {
  unlockPlaybackAudioOutput();
  if (isSpeechUnlocked || typeof speechSynthesis === 'undefined') {
    return;
  }
  isSpeechUnlocked = true;
  const silentUtterance = new SpeechSynthesisUtterance('');
  silentUtterance.volume = 0;
  speechSynthesis.speak(silentUtterance);
}
