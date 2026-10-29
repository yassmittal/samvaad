'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { type PcmCapture, startPcmCapture } from './start-pcm-capture';

export type MicrophoneStatus = 'closed' | 'opening' | 'open' | 'permission-denied' | 'unavailable';

function findMicrophoneErrorStatus(error: unknown): MicrophoneStatus {
  const isPermissionDenied =
    error instanceof DOMException &&
    (error.name === 'NotAllowedError' || error.name === 'SecurityError');
  return isPermissionDenied ? 'permission-denied' : 'unavailable';
}

/** The microphone as 16 kHz PCM16 frames, with permission and failure states (D-009). */
export function useMicrophone({ onAudioFrame }: { onAudioFrame: (frame: ArrayBuffer) => void }) {
  const [status, setStatus] = useState<MicrophoneStatus>('closed');
  const captureRef = useRef<PcmCapture | null>(null);
  const onAudioFrameRef = useRef(onAudioFrame);
  onAudioFrameRef.current = onAudioFrame;

  /** Resolves `true` once frames are flowing. */
  const open = useCallback(async (): Promise<boolean> => {
    if (captureRef.current) {
      return true;
    }
    // `mediaDevices` only exists in a secure context: HTTPS or localhost (D-010).
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('unavailable');
      return false;
    }
    setStatus('opening');
    try {
      captureRef.current = await startPcmCapture((frame) => onAudioFrameRef.current(frame));
      setStatus('open');
      return true;
    } catch (error) {
      console.warn('microphone failed to open', error);
      setStatus(findMicrophoneErrorStatus(error));
      return false;
    }
  }, []);

  const close = useCallback(() => {
    captureRef.current?.stop();
    captureRef.current = null;
    setStatus((currentStatus) => (currentStatus === 'open' ? 'closed' : currentStatus));
  }, []);

  useEffect(() => close, [close]);

  return { status, open, close };
}
