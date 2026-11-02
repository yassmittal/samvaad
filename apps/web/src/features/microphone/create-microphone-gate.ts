// Wait a moment after the phone stops speaking, so its last word's echo isn't heard as the
// next utterance (D-008).
export const MICROPHONE_REOPEN_DELAY_MILLISECONDS = 300;

type MicrophoneGateOptions = {
  /** Sends `microphone_state`. Called only when the person turns the mic on or off. */
  onMicrophoneStateChange: (isOpen: boolean) => void;
  /** The real voice is only sent to the other phone while this is `true` (D-023). */
  onSendingRealAudioChange?: (isSendingRealAudio: boolean) => void;
  reopenDelayMilliseconds?: number;
};

/**
 * Decides what audio goes to the API. While the person has the microphone on, every captured
 * frame is sent; while the phone speaks a translation (and for a moment after), the frame is
 * replaced with silence of the same length, so the phone never translates itself (D-008).
 *
 * Silence rather than nothing: Meta closes a stream that stops receiving audio (D-005: pacing),
 * and reopening costs a handshake before the next utterance is heard. So the stream stays open
 * and `microphone_state` only follows the person's own mic button (D-019).
 */
export function createMicrophoneGate({
  onMicrophoneStateChange,
  onSendingRealAudioChange,
  reopenDelayMilliseconds = MICROPHONE_REOPEN_DELAY_MILLISECONDS,
}: MicrophoneGateOptions) {
  let isMicrophoneOn = false;
  let isMutedForSpeech = false;
  let wasSendingRealAudio = false;
  let reopenTimeout: ReturnType<typeof setTimeout> | null = null;

  function reportSendingRealAudio(): void {
    const isSendingRealAudio = isMicrophoneOn && !isMutedForSpeech;
    if (isSendingRealAudio !== wasSendingRealAudio) {
      wasSendingRealAudio = isSendingRealAudio;
      onSendingRealAudioChange?.(isSendingRealAudio);
    }
  }

  function cancelReopen(): void {
    if (reopenTimeout !== null) {
      clearTimeout(reopenTimeout);
      reopenTimeout = null;
    }
  }

  return {
    setMicrophoneOn(isOn: boolean): void {
      if (isOn === isMicrophoneOn) {
        return;
      }
      isMicrophoneOn = isOn;
      onMicrophoneStateChange(isOn);
      reportSendingRealAudio();
    },

    setSpeaking(isSpeaking: boolean): void {
      cancelReopen();
      if (isSpeaking) {
        isMutedForSpeech = true;
        reportSendingRealAudio();
        return;
      }
      reopenTimeout = setTimeout(() => {
        reopenTimeout = null;
        isMutedForSpeech = false;
        reportSendingRealAudio();
      }, reopenDelayMilliseconds);
    },

    /**
     * What to send for one captured frame: the frame itself, silence of the same length while
     * the phone speaks, or `null` while the microphone is off.
     */
    toOutgoingFrame(frame: ArrayBuffer): ArrayBuffer | null {
      if (!isMicrophoneOn) {
        return null;
      }
      // A new ArrayBuffer is zero-filled: PCM16 silence.
      return isMutedForSpeech ? new ArrayBuffer(frame.byteLength) : frame;
    },

    /** `true` while what is sent is the person's real voice, not silence. */
    isSendingRealAudio: (): boolean => isMicrophoneOn && !isMutedForSpeech,

    /** For unmounting: the microphone stays muted rather than reopening later. */
    cancelPendingReopen: cancelReopen,
  };
}

export type MicrophoneGate = ReturnType<typeof createMicrophoneGate>;
