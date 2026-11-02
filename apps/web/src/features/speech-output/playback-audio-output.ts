/**
 * The one AudioContext that plays spoken translations (D-021), with an analyser so the call
 * screen can show how loud the voice is (D-022). Created inside the first tap: iOS Safari only
 * starts audio after a user gesture (D-007).
 */

const ANALYSER_FFT_SIZE = 256;

export type PlaybackAudioOutput = {
  audioContext: AudioContext;
  /** Connect sources here; it leads to the analyser and the speakers. */
  destinationNode: AudioNode;
  analyserNode: AnalyserNode;
};

let playbackAudioOutput: PlaybackAudioOutput | null = null;
// Every context this page records or plays with, so a tap can resume any the phone paused.
const runningAudioContexts = new Set<AudioContext>();

/**
 * Phones pause audio when the microphone or a call starts, or the app goes to the background
 * (iOS calls that state `interrupted`). Ask it to carry on; if the phone wants a tap first,
 * the next tap's `unlockPlaybackAudioOutput` resumes it.
 */
export function keepAudioContextRunning(audioContext: AudioContext): void {
  runningAudioContexts.add(audioContext);
  audioContext.addEventListener('statechange', () => {
    if (audioContext.state === 'closed') {
      runningAudioContexts.delete(audioContext);
    } else if (audioContext.state !== 'running') {
      audioContext.resume().catch(() => {});
    }
  });
}

/** Creates (once) and resumes the playback context, and any paused microphone. Call it inside a tap. */
export function unlockPlaybackAudioOutput(): void {
  if (typeof AudioContext === 'undefined') {
    return;
  }
  if (playbackAudioOutput === null) {
    const audioContext = new AudioContext();
    const analyserNode = audioContext.createAnalyser();
    analyserNode.fftSize = ANALYSER_FFT_SIZE;
    const gainNode = audioContext.createGain();
    gainNode.connect(analyserNode);
    analyserNode.connect(audioContext.destination);
    playbackAudioOutput = { audioContext, destinationNode: gainNode, analyserNode };
    keepAudioContextRunning(audioContext);
  }
  for (const audioContext of runningAudioContexts) {
    if (audioContext.state !== 'running') {
      audioContext.resume().catch(() => {});
    }
  }
}

/** `null` until the first tap has unlocked it. */
export function findPlaybackAudioOutput(): PlaybackAudioOutput | null {
  return playbackAudioOutput;
}
