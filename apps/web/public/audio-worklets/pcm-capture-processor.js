/**
 * Runs on the audio thread. Turns the microphone's float samples (usually 48 kHz) into
 * 16 kHz mono signed 16-bit PCM and posts one 80 ms frame at a time (D-009).
 *
 * Plain JavaScript loaded by URL: AudioWorklet modules aren't bundled by Next.js.
 * The target rate and frame size come from `@samvaad/shared` through `processorOptions`.
 */

const INT16_NEGATIVE_LIMIT = 0x8000;
const INT16_POSITIVE_LIMIT = 0x7fff;

class PcmCaptureProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const { targetSampleRateHertz, samplesPerFrame } = options.processorOptions;
    // `sampleRate` is the AudioContext's rate, a global inside AudioWorkletGlobalScope.
    this.inputSamplesPerOutputSample = sampleRate / targetSampleRateHertz;
    this.samplesPerFrame = samplesPerFrame;
    this.frame = new Int16Array(samplesPerFrame);
    this.frameSampleCount = 0;
    this.inputSampleSum = 0;
    this.inputSampleCount = 0;
    this.inputSamplesSinceOutput = 0;
  }

  process(inputs) {
    const channelSamples = inputs[0]?.[0];
    if (!channelSamples) {
      return true;
    }

    // Downsample by averaging each group of input samples: a box filter, which also keeps
    // most of the aliasing above 8 kHz out of the 16 kHz output.
    for (const inputSample of channelSamples) {
      this.inputSampleSum += inputSample;
      this.inputSampleCount += 1;
      this.inputSamplesSinceOutput += 1;
      if (this.inputSamplesSinceOutput >= this.inputSamplesPerOutputSample) {
        this.inputSamplesSinceOutput -= this.inputSamplesPerOutputSample;
        this.appendOutputSample(this.inputSampleSum / this.inputSampleCount);
        this.inputSampleSum = 0;
        this.inputSampleCount = 0;
      }
    }
    return true;
  }

  appendOutputSample(floatSample) {
    const clampedSample = Math.max(-1, Math.min(1, floatSample));
    // Int16Array is little-endian on every platform browsers run on, as Meta expects.
    this.frame[this.frameSampleCount] =
      clampedSample < 0
        ? clampedSample * INT16_NEGATIVE_LIMIT
        : clampedSample * INT16_POSITIVE_LIMIT;
    this.frameSampleCount += 1;

    if (this.frameSampleCount === this.samplesPerFrame) {
      this.port.postMessage(this.frame.buffer, [this.frame.buffer]);
      this.frame = new Int16Array(this.samplesPerFrame);
      this.frameSampleCount = 0;
    }
  }
}

registerProcessor('pcm-capture-processor', PcmCaptureProcessor);
