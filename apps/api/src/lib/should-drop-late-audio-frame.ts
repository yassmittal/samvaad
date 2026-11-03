// Ahead of real time by more than this, quiet frames are dropped to win the time back (D-024).
export const MAXIMUM_AUDIO_LEAD_MILLISECONDS = 1500;
// Meta ends a stream that is too far ahead ("Audio processing backlog too large"); past this,
// every frame is dropped. The audio is many seconds late by then and no use to a conversation.
export const HARD_MAXIMUM_AUDIO_LEAD_MILLISECONDS = 8000;

/**
 * A phone on a bad network sends its audio late and then all at once, after the API has
 * already padded the gap with silence (D-024). That puts the stream ahead of real time, so
 * quiet frames are skipped until it catches up.
 */
export function shouldDropLateAudioFrame({
  audioLeadMilliseconds,
  isQuiet,
}: {
  /** Audio forwarded to Meta minus the time since the stream opened. */
  audioLeadMilliseconds: number;
  isQuiet: boolean;
}): boolean {
  if (audioLeadMilliseconds > HARD_MAXIMUM_AUDIO_LEAD_MILLISECONDS) {
    return true;
  }
  return isQuiet && audioLeadMilliseconds > MAXIMUM_AUDIO_LEAD_MILLISECONDS;
}
