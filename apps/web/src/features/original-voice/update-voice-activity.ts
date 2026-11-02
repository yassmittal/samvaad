// Loudness levels (0 to 1, see calculateLoudnessLevel) with a gap between them, so breathing
// and room noise don't flicker the orb between "speaking" and not (D-023).
export const VOICE_START_LEVEL = 0.32;
export const VOICE_STOP_LEVEL = 0.18;
// Brief pauses between words don't count as stopping.
export const VOICE_STOP_HOLD_MILLISECONDS = 450;

export type VoiceActivity = {
  isActive: boolean;
  /** When the level last fell below the stop level while active; `null` otherwise. */
  quietSinceEpochMilliseconds: number | null;
};

export const SILENT_VOICE_ACTIVITY: VoiceActivity = {
  isActive: false,
  quietSinceEpochMilliseconds: null,
};

/** One step of telling whether the other person is talking, from their voice's loudness. */
export function updateVoiceActivity(
  previous: VoiceActivity,
  { level, nowEpochMilliseconds }: { level: number; nowEpochMilliseconds: number },
): VoiceActivity {
  if (!previous.isActive) {
    return level >= VOICE_START_LEVEL
      ? { isActive: true, quietSinceEpochMilliseconds: null }
      : SILENT_VOICE_ACTIVITY;
  }
  if (level >= VOICE_STOP_LEVEL) {
    return { isActive: true, quietSinceEpochMilliseconds: null };
  }
  const quietSinceEpochMilliseconds = previous.quietSinceEpochMilliseconds ?? nowEpochMilliseconds;
  if (nowEpochMilliseconds - quietSinceEpochMilliseconds >= VOICE_STOP_HOLD_MILLISECONDS) {
    return SILENT_VOICE_ACTIVITY;
  }
  return { isActive: true, quietSinceEpochMilliseconds };
}
