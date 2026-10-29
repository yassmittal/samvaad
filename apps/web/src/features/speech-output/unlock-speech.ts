let isSpeechUnlocked = false;

/**
 * iOS Safari only speaks after a user gesture (D-007). Speaking a silent, empty utterance
 * inside the first tap unlocks `speechSynthesis` for the rest of the page's life.
 */
export function unlockSpeech(): void {
  if (isSpeechUnlocked || typeof speechSynthesis === 'undefined') {
    return;
  }
  isSpeechUnlocked = true;
  const silentUtterance = new SpeechSynthesisUtterance('');
  silentUtterance.volume = 0;
  speechSynthesis.speak(silentUtterance);
}
