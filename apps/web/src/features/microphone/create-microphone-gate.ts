// Table mode: wait a moment after the phone stops speaking, so its last word's echo isn't
// heard as the next utterance (D-008).
export const MICROPHONE_REOPEN_DELAY_MILLISECONDS = 300;

type MicrophoneGateOptions = {
  /** Sends `microphone_state`. Called only when the state actually changes. */
  onMicrophoneStateChange: (isOpen: boolean) => void;
  reopenDelayMilliseconds?: number;
};

/**
 * Decides whether audio goes to the API. It does while the person has the microphone on
 * and the phone isn't speaking a translation, so table mode never translates itself.
 *
 * Muting keeps the capture running and only stops sending frames. The API's transcription
 * stream is still ended with `microphone_state { isOpen: false }`, because Meta closes a
 * stream that stops receiving audio (D-005: pacing). Reopening starts a fresh one.
 */
export function createMicrophoneGate({
  onMicrophoneStateChange,
  reopenDelayMilliseconds = MICROPHONE_REOPEN_DELAY_MILLISECONDS,
}: MicrophoneGateOptions) {
  let isMicrophoneOn = false;
  let isMutedForSpeech = false;
  let isSendingAudio = false;
  let reopenTimeout: ReturnType<typeof setTimeout> | null = null;

  function cancelReopen(): void {
    if (reopenTimeout !== null) {
      clearTimeout(reopenTimeout);
      reopenTimeout = null;
    }
  }

  function updateSendingAudio(): void {
    const nextIsSendingAudio = isMicrophoneOn && !isMutedForSpeech;
    if (nextIsSendingAudio === isSendingAudio) {
      return;
    }
    // Flip first, so no frame slips through after the "closed" message.
    isSendingAudio = nextIsSendingAudio;
    onMicrophoneStateChange(nextIsSendingAudio);
  }

  return {
    setMicrophoneOn(isOn: boolean): void {
      isMicrophoneOn = isOn;
      updateSendingAudio();
    },

    setSpeaking(isSpeaking: boolean): void {
      cancelReopen();
      if (isSpeaking) {
        isMutedForSpeech = true;
        updateSendingAudio();
        return;
      }
      reopenTimeout = setTimeout(() => {
        reopenTimeout = null;
        isMutedForSpeech = false;
        updateSendingAudio();
      }, reopenDelayMilliseconds);
    },

    isSendingAudio: (): boolean => isSendingAudio,

    /** For unmounting: the microphone stays muted rather than reopening later. */
    cancelPendingReopen: cancelReopen,
  };
}

export type MicrophoneGate = ReturnType<typeof createMicrophoneGate>;
