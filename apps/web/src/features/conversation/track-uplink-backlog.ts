import { BYTES_PER_SAMPLE, SAMPLE_RATE_HERTZ } from '@samvaad/shared';

const AUDIO_BYTES_PER_SECOND = SAMPLE_RATE_HERTZ * BYTES_PER_SAMPLE;
// Half a second of audio waiting to upload: the network is behind, so quiet frames are left
// out (the API pads silence back in, D-024) and only speech competes for the uplink.
export const SKIP_QUIET_FRAMES_BACKLOG_BYTES = AUDIO_BYTES_PER_SECOND / 2;
// A second of audio waiting: tell the person, so a slow call isn't a mystery.
export const WEAK_CONNECTION_BACKLOG_BYTES = AUDIO_BYTES_PER_SECOND;
const RECOVERED_BACKLOG_BYTES = AUDIO_BYTES_PER_SECOND / 4;
// Clear the warning only after the uplink has kept up for a while, so it doesn't flicker.
export const RECOVERY_MILLISECONDS = 3000;

export type UplinkHealth = {
  isWeak: boolean;
  /** Since when the backlog has been small, while weak. */
  recoveringSinceEpochMilliseconds: number | null;
};

export const HEALTHY_UPLINK: UplinkHealth = {
  isWeak: false,
  recoveringSinceEpochMilliseconds: null,
};

/** Whether to leave a frame out because the uplink is behind (D-024). Speech is always sent. */
export function shouldSkipQuietFrame({
  bufferedByteCount,
  isQuiet,
}: {
  bufferedByteCount: number;
  isQuiet: boolean;
}): boolean {
  return isQuiet && bufferedByteCount > SKIP_QUIET_FRAMES_BACKLOG_BYTES;
}

/** Weak as soon as a second of audio is stuck; healthy again after it keeps up for a while. */
export function updateUplinkHealth(
  uplinkHealth: UplinkHealth,
  {
    bufferedByteCount,
    nowEpochMilliseconds,
  }: { bufferedByteCount: number; nowEpochMilliseconds: number },
): UplinkHealth {
  if (bufferedByteCount > WEAK_CONNECTION_BACKLOG_BYTES) {
    return { isWeak: true, recoveringSinceEpochMilliseconds: null };
  }
  if (!uplinkHealth.isWeak) {
    return uplinkHealth;
  }
  if (bufferedByteCount > RECOVERED_BACKLOG_BYTES) {
    return { isWeak: true, recoveringSinceEpochMilliseconds: null };
  }
  const recoveringSinceEpochMilliseconds =
    uplinkHealth.recoveringSinceEpochMilliseconds ?? nowEpochMilliseconds;
  return nowEpochMilliseconds - recoveringSinceEpochMilliseconds >= RECOVERY_MILLISECONDS
    ? HEALTHY_UPLINK
    : { isWeak: true, recoveringSinceEpochMilliseconds };
}
