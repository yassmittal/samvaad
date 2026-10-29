type SpeechEndedAtInput = {
  /** Meta's `speechEnd.audioProcessedMs`: where in the audio stream the speech ended. */
  speechEndAudioMilliseconds: number;
  /** How much audio the API has received from the browser for this stream so far. */
  audioReceivedMilliseconds: number;
  lastAudioFrameReceivedAtEpochMilliseconds: number;
};

/**
 * Turns a position in the audio stream into the wall-clock time that audio reached the API.
 * The browser sends audio in real time, so audio received `n` ms before the latest frame
 * arrived about `n` ms before it did. This puts endpointing inside the latency meter (D-011).
 */
export function calculateSpeechEndedAtEpochMilliseconds({
  speechEndAudioMilliseconds,
  audioReceivedMilliseconds,
  lastAudioFrameReceivedAtEpochMilliseconds,
}: SpeechEndedAtInput): number {
  const audioAfterSpeechEndMilliseconds = Math.max(
    0,
    audioReceivedMilliseconds - speechEndAudioMilliseconds,
  );
  return lastAudioFrameReceivedAtEpochMilliseconds - audioAfterSpeechEndMilliseconds;
}
