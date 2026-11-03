import { describe, expect, test } from 'bun:test';
import {
  HARD_MAXIMUM_AUDIO_LEAD_MILLISECONDS,
  MAXIMUM_AUDIO_LEAD_MILLISECONDS,
  shouldDropLateAudioFrame,
} from './should-drop-late-audio-frame';

describe('shouldDropLateAudioFrame (D-024)', () => {
  test('audio on time is always forwarded', () => {
    expect(shouldDropLateAudioFrame({ audioLeadMilliseconds: 0, isQuiet: true })).toBe(false);
    expect(shouldDropLateAudioFrame({ audioLeadMilliseconds: -500, isQuiet: true })).toBe(false);
  });

  test('ahead of real time, quiet frames are dropped and speech is kept', () => {
    const audioLeadMilliseconds = MAXIMUM_AUDIO_LEAD_MILLISECONDS + 100;
    expect(shouldDropLateAudioFrame({ audioLeadMilliseconds, isQuiet: true })).toBe(true);
    expect(shouldDropLateAudioFrame({ audioLeadMilliseconds, isQuiet: false })).toBe(false);
  });

  test('far ahead, even speech is dropped', () => {
    const audioLeadMilliseconds = HARD_MAXIMUM_AUDIO_LEAD_MILLISECONDS + 100;
    expect(shouldDropLateAudioFrame({ audioLeadMilliseconds, isQuiet: false })).toBe(true);
  });
});
