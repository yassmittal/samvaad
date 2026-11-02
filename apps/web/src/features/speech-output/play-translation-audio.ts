import { TRANSLATION_AUDIO_SAMPLE_RATE_HERTZ } from '@samvaad/shared';
import { planChunkStartTimeSeconds } from './plan-chunk-start-time';
import type { PlaybackAudioOutput } from './playback-audio-output';
import type { TranslationAudioStore } from './translation-audio-store';

const INT16_FULL_SCALE = 0x8000;
const MILLISECONDS_PER_SECOND = 1000;
// If the API goes quiet before `translation_audio_end`, don't keep the mic muted for good.
const STALLED_AUDIO_TIMEOUT_MILLISECONDS = 15_000;

type PlayTranslationAudioOptions = {
  playbackAudioOutput: PlaybackAudioOutput;
  translationAudioStore: TranslationAudioStore;
  utteranceId: string;
  onStarted: () => void;
  onFinished: () => void;
  /** No audio came, and the API said it failed: speak the text another way. */
  onFailedBeforeAudio: () => void;
};

function toAudioBuffer(audioContext: AudioContext, samples: Int16Array): AudioBuffer {
  const audioBuffer = audioContext.createBuffer(
    1,
    samples.length,
    TRANSLATION_AUDIO_SAMPLE_RATE_HERTZ,
  );
  const channelSamples = audioBuffer.getChannelData(0);
  for (const [sampleIndex, sample] of samples.entries()) {
    channelSamples[sampleIndex] = sample / INT16_FULL_SCALE;
  }
  return audioBuffer;
}

/**
 * Plays one spoken translation while its chunks are still arriving (D-021): each chunk is
 * scheduled to start where the previous one ends, so they sound as one. Calls exactly one of
 * `onFinished` or `onFailedBeforeAudio`. Returns `stop`, for leaving the page.
 */
export function playTranslationAudio({
  playbackAudioOutput,
  translationAudioStore,
  utteranceId,
  onStarted,
  onFinished,
  onFailedBeforeAudio,
}: PlayTranslationAudioOptions): { stop: () => void } {
  const { audioContext, destinationNode } = playbackAudioOutput;
  const scheduledSources: AudioBufferSourceNode[] = [];
  let previousChunkEndTimeSeconds: number | null = null;
  let finishTimeout: ReturnType<typeof setTimeout> | null = null;
  let stalledTimeout: ReturnType<typeof setTimeout> | null = null;
  let isDone = false;

  function finishWith(callback: () => void): void {
    if (isDone) {
      return;
    }
    isDone = true;
    unsubscribe();
    if (finishTimeout !== null) {
      clearTimeout(finishTimeout);
    }
    if (stalledTimeout !== null) {
      clearTimeout(stalledTimeout);
    }
    callback();
  }

  function restartStalledTimeout(): void {
    if (stalledTimeout !== null) {
      clearTimeout(stalledTimeout);
    }
    stalledTimeout = setTimeout(() => {
      console.warn('spoken translation stalled; moving on', utteranceId);
      finishWith(scheduledSources.length === 0 ? onFailedBeforeAudio : onFinished);
    }, STALLED_AUDIO_TIMEOUT_MILLISECONDS);
  }

  function scheduleArrivedChunks(): void {
    const translationAudio = translationAudioStore.find(utteranceId);
    if (isDone || translationAudio === null) {
      return;
    }
    for (const samples of translationAudio.chunks.slice(scheduledSources.length)) {
      const source = audioContext.createBufferSource();
      source.buffer = toAudioBuffer(audioContext, samples);
      source.connect(destinationNode);
      const startTimeSeconds = planChunkStartTimeSeconds({
        currentTimeSeconds: audioContext.currentTime,
        previousChunkEndTimeSeconds,
      });
      source.start(startTimeSeconds);
      previousChunkEndTimeSeconds = startTimeSeconds + source.buffer.duration;
      scheduledSources.push(source);
      if (scheduledSources.length === 1) {
        onStarted();
      }
    }
    restartStalledTimeout();
    if (!translationAudio.isEnded) {
      return;
    }
    if (scheduledSources.length === 0) {
      finishWith(translationAudio.hasFailed ? onFailedBeforeAudio : onFinished);
      return;
    }
    // Every chunk is scheduled: finish when the last one has played.
    const remainingMilliseconds =
      ((previousChunkEndTimeSeconds ?? 0) - audioContext.currentTime) * MILLISECONDS_PER_SECOND;
    if (finishTimeout === null) {
      finishTimeout = setTimeout(() => finishWith(onFinished), Math.max(0, remainingMilliseconds));
    }
  }

  const unsubscribe = translationAudioStore.subscribe(utteranceId, scheduleArrivedChunks);
  scheduleArrivedChunks();

  return {
    stop() {
      for (const source of scheduledSources) {
        source.stop();
      }
      finishWith(() => {});
    },
  };
}
