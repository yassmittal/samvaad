import { describe, expect, test } from 'bun:test';
import {
  SILENT_VOICE_ACTIVITY,
  updateVoiceActivity,
  VOICE_STOP_HOLD_MILLISECONDS,
} from './update-voice-activity';

describe('updateVoiceActivity', () => {
  test('starts only on a clearly spoken level', () => {
    expect(
      updateVoiceActivity(SILENT_VOICE_ACTIVITY, { level: 0.2, nowEpochMilliseconds: 0 }).isActive,
    ).toBe(false);
    expect(
      updateVoiceActivity(SILENT_VOICE_ACTIVITY, { level: 0.5, nowEpochMilliseconds: 0 }).isActive,
    ).toBe(true);
  });

  test('a short pause between words keeps it active; a longer one stops it', () => {
    const speaking = updateVoiceActivity(SILENT_VOICE_ACTIVITY, {
      level: 0.5,
      nowEpochMilliseconds: 0,
    });
    const pausing = updateVoiceActivity(speaking, { level: 0, nowEpochMilliseconds: 100 });
    const stillPausing = updateVoiceActivity(pausing, {
      level: 0,
      nowEpochMilliseconds: 100 + VOICE_STOP_HOLD_MILLISECONDS - 1,
    });
    const stopped = updateVoiceActivity(stillPausing, {
      level: 0,
      nowEpochMilliseconds: 100 + VOICE_STOP_HOLD_MILLISECONDS,
    });

    expect(pausing.isActive).toBe(true);
    expect(stillPausing.isActive).toBe(true);
    expect(stopped.isActive).toBe(false);
  });

  test('speaking again during the pause starts the hold over', () => {
    const speaking = updateVoiceActivity(SILENT_VOICE_ACTIVITY, {
      level: 0.5,
      nowEpochMilliseconds: 0,
    });
    const pausing = updateVoiceActivity(speaking, { level: 0, nowEpochMilliseconds: 100 });
    const speakingAgain = updateVoiceActivity(pausing, { level: 0.25, nowEpochMilliseconds: 200 });

    expect(speakingAgain).toEqual({ isActive: true, quietSinceEpochMilliseconds: null });
  });
});
