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

/** Creates (once) and resumes the playback context. Call it inside a tap. */
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
  }
  void playbackAudioOutput.audioContext.resume();
}

/** `null` until the first tap has unlocked it. */
export function findPlaybackAudioOutput(): PlaybackAudioOutput | null {
  return playbackAudioOutput;
}
