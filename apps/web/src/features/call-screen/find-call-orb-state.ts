import type { LanguageCode } from '@samvaad/shared';
import { type Caption, isWaitingForTranslation } from '../conversation/conversation-reducer';

/** What the orb shows (D-022); also its `data-state`, styled in globals.css. */
export type CallOrbState =
  | 'idle'
  | 'you_speaking'
  | 'translating_to_them'
  | 'translating_to_you'
  | 'they_speaking'
  | 'their_translation_playing'
  | 'reconnecting';

type CallOrbStateInput = {
  captions: readonly Caption[];
  listenerLanguageCode: LanguageCode;
  /** This phone is speaking a translation. */
  isSpeaking: boolean;
  /** Their real voice is coming through right now (D-023). */
  isOtherPersonSpeaking: boolean;
  /** This phone's socket, or the other phone, is reconnecting. */
  isReconnecting: boolean;
};

/** Your newest utterance is finished but hasn't reached the other phone yet. */
function isTranslatingForThem(captions: readonly Caption[]): boolean {
  const newestCaption = captions.at(-1);
  return (
    newestCaption?.isOwnUtterance === true &&
    newestCaption.isFinal &&
    newestCaption.receipt === null &&
    !newestCaption.hasTranslationFailed
  );
}

/** The one state the orb shows, most important first (D-022). */
export function findCallOrbState({
  captions,
  listenerLanguageCode,
  isSpeaking,
  isOtherPersonSpeaking,
  isReconnecting,
}: CallOrbStateInput): CallOrbState {
  if (isReconnecting) {
    return 'reconnecting';
  }
  if (isSpeaking) {
    return 'their_translation_playing';
  }
  const newestCaption = captions.at(-1);
  if (newestCaption?.isOwnUtterance && !newestCaption.isFinal) {
    return 'you_speaking';
  }
  if (isOtherPersonSpeaking) {
    return 'they_speaking';
  }
  if (isWaitingForTranslation([...captions], listenerLanguageCode)) {
    return 'translating_to_you';
  }
  if (isTranslatingForThem(captions)) {
    return 'translating_to_them';
  }
  return 'idle';
}
