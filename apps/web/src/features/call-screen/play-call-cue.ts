import { findPlaybackAudioOutput } from '../speech-output/playback-audio-output';

/** A short sound and buzz for moments the person shouldn't have to look for (D-022). */
export type CallCue = 'connected' | 'ended';

const CALL_CUE_NOTES_HERTZ = {
  connected: [523.25, 783.99],
  ended: [659.25, 440],
} as const satisfies Record<CallCue, readonly number[]>;
const CALL_CUE_VIBRATION_MILLISECONDS = {
  connected: [18],
  ended: [30, 60, 30],
} as const satisfies Record<CallCue, readonly number[]>;

const NOTE_SPACING_SECONDS = 0.12;
const NOTE_DURATION_SECONDS = 0.28;
const NOTE_PEAK_GAIN = 0.12;
const NOTE_ATTACK_SECONDS = 0.015;
const SILENT_GAIN = 0.0001;

/** Two soft sine notes, rising to connect and falling to end, and a buzz where phones allow it. */
export function playCallCue(callCue: CallCue): void {
  // Android only: iOS Safari has no vibration API.
  navigator.vibrate?.([...CALL_CUE_VIBRATION_MILLISECONDS[callCue]]);
  const playbackAudioOutput = findPlaybackAudioOutput();
  if (playbackAudioOutput === null) {
    return;
  }
  const { audioContext } = playbackAudioOutput;
  for (const [noteIndex, frequencyHertz] of CALL_CUE_NOTES_HERTZ[callCue].entries()) {
    const startTimeSeconds = audioContext.currentTime + noteIndex * NOTE_SPACING_SECONDS;
    const oscillatorNode = audioContext.createOscillator();
    oscillatorNode.type = 'sine';
    oscillatorNode.frequency.value = frequencyHertz;
    const gainNode = audioContext.createGain();
    gainNode.gain.setValueAtTime(SILENT_GAIN, startTimeSeconds);
    gainNode.gain.linearRampToValueAtTime(NOTE_PEAK_GAIN, startTimeSeconds + NOTE_ATTACK_SECONDS);
    gainNode.gain.exponentialRampToValueAtTime(
      SILENT_GAIN,
      startTimeSeconds + NOTE_DURATION_SECONDS,
    );
    // Straight to the speakers, not through the analyser: the orb follows voices, not cues.
    oscillatorNode.connect(gainNode).connect(audioContext.destination);
    oscillatorNode.start(startTimeSeconds);
    oscillatorNode.stop(startTimeSeconds + NOTE_DURATION_SECONDS);
  }
}
