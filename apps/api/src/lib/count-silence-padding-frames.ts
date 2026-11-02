type SilencePaddingInput = {
  /** Time since the stream opened at Meta. */
  elapsedMilliseconds: number;
  /** Audio forwarded to Meta on this stream so far, silence included. */
  audioSentMilliseconds: number;
  maximumAudioLagMilliseconds: number;
  frameDurationMilliseconds: number;
};

/**
 * How many frames of silence bring a stream back within `maximumAudioLagMilliseconds` of real
 * time, so Meta doesn't end it as "Ingress audio slower than real-time" (D-024). Zero while the
 * audio is on time, or ahead.
 */
export function countSilencePaddingFrames({
  elapsedMilliseconds,
  audioSentMilliseconds,
  maximumAudioLagMilliseconds,
  frameDurationMilliseconds,
}: SilencePaddingInput): number {
  const audioLagMilliseconds = elapsedMilliseconds - audioSentMilliseconds;
  if (audioLagMilliseconds <= maximumAudioLagMilliseconds) {
    return 0;
  }
  return Math.ceil(
    (audioLagMilliseconds - maximumAudioLagMilliseconds) / frameDurationMilliseconds,
  );
}
