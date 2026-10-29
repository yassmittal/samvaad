import { SAMPLE_RATE_HERTZ, SAMPLES_PER_FRAME } from '@samvaad/shared';

const PCM_CAPTURE_PROCESSOR_URL = '/audio-worklets/pcm-capture-processor.js';
const PCM_CAPTURE_PROCESSOR_NAME = 'pcm-capture-processor';

export type PcmCapture = {
  stop: () => void;
};

/**
 * Opens the microphone and calls `onAudioFrame` with 80 ms of 16 kHz mono PCM16 at a time.
 * Must be called from a tap: iOS Safari only starts an AudioContext after a user gesture.
 */
export async function startPcmCapture(
  onAudioFrame: (frame: ArrayBuffer) => void,
): Promise<PcmCapture> {
  const mediaStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });

  const audioContext = new AudioContext();
  try {
    await audioContext.audioWorklet.addModule(PCM_CAPTURE_PROCESSOR_URL);
    const sourceNode = audioContext.createMediaStreamSource(mediaStream);
    // No outputs: a sink node is processed without being connected to the speakers.
    const workletNode = new AudioWorkletNode(audioContext, PCM_CAPTURE_PROCESSOR_NAME, {
      numberOfInputs: 1,
      numberOfOutputs: 0,
      channelCount: 1,
      processorOptions: {
        targetSampleRateHertz: SAMPLE_RATE_HERTZ,
        samplesPerFrame: SAMPLES_PER_FRAME,
      },
    });

    let isStopped = false;
    workletNode.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
      if (!isStopped) {
        onAudioFrame(event.data);
      }
    };
    sourceNode.connect(workletNode);

    return {
      stop() {
        isStopped = true;
        workletNode.port.onmessage = null;
        sourceNode.disconnect();
        for (const track of mediaStream.getTracks()) {
          track.stop();
        }
        void audioContext.close();
      },
    };
  } catch (error) {
    for (const track of mediaStream.getTracks()) {
      track.stop();
    }
    void audioContext.close();
    throw error;
  }
}
