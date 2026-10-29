import type { LanguageCode } from '@samvaad/shared';

export type SpeechRequest = {
  utteranceId: string;
  text: string;
  languageCode: LanguageCode;
  /** Spoken again from the bubble's repeat button, so it has no latency to report. */
  isRepeat: boolean;
};

type SpeakEvents = {
  onStarted: () => void;
  /** Called once, when speech ends or fails. */
  onFinished: () => void;
};

type SpeechQueueOptions = {
  speak: (request: SpeechRequest, events: SpeakEvents) => void;
  /** `true` as soon as something is queued, before any sound, so the mic can mute first. */
  onSpeakingChange: (isSpeaking: boolean) => void;
  onPlaybackStarted: (request: SpeechRequest) => void;
};

/**
 * Speaks requests one at a time, in the order they were queued. Translations already arrive
 * in utterance order (the API's ordered delivery), so first in, first out is utterance order.
 */
export function createSpeechQueue({
  speak,
  onSpeakingChange,
  onPlaybackStarted,
}: SpeechQueueOptions) {
  const waitingRequests: SpeechRequest[] = [];
  let isSpeaking = false;

  function speakNextRequest(): void {
    const nextRequest = waitingRequests.shift();
    if (!nextRequest) {
      isSpeaking = false;
      onSpeakingChange(false);
      return;
    }
    let hasFinished = false;
    speak(nextRequest, {
      onStarted() {
        if (!hasFinished) {
          onPlaybackStarted(nextRequest);
        }
      },
      onFinished() {
        if (hasFinished) {
          return;
        }
        hasFinished = true;
        speakNextRequest();
      },
    });
  }

  return {
    enqueue(request: SpeechRequest): void {
      waitingRequests.push(request);
      if (isSpeaking) {
        return;
      }
      isSpeaking = true;
      onSpeakingChange(true);
      speakNextRequest();
    },

    /** Drops everything still waiting. The request being spoken finishes on its own. */
    clearWaitingRequests(): void {
      waitingRequests.length = 0;
    },
  };
}

export type SpeechQueue = ReturnType<typeof createSpeechQueue>;
