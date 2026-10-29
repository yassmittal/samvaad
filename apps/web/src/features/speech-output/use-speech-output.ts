'use client';

import { type LanguageCode, SUPPORTED_LANGUAGE_BY_CODE } from '@samvaad/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { pickVoice } from './pick-voice';
import { speakWithSpeechSynthesis } from './speak-with-speech-synthesis';
import { createSpeechQueue, type SpeechQueue, type SpeechRequest } from './speech-queue';

type SpeechOutputOptions = {
  onSpeakingChange: (isSpeaking: boolean) => void;
  onPlaybackStarted: (request: SpeechRequest) => void;
};

/** Speaks translations aloud with the browser's voices, one at a time (D-007). */
export function useSpeechOutput({ onSpeakingChange, onPlaybackStarted }: SpeechOutputOptions) {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isSpeechSupported, setIsSpeechSupported] = useState(true);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const voicesRef = useRef(voices);
  voicesRef.current = voices;
  const callbacksRef = useRef({ onSpeakingChange, onPlaybackStarted });
  callbacksRef.current = { onSpeakingChange, onPlaybackStarted };
  const queueRef = useRef<SpeechQueue | null>(null);

  useEffect(() => {
    if (typeof speechSynthesis === 'undefined') {
      setIsSpeechSupported(false);
      return;
    }
    // The voice list often fills in after the page loads, announced by `voiceschanged`.
    const updateVoices = () => setVoices(speechSynthesis.getVoices());
    updateVoices();
    speechSynthesis.addEventListener('voiceschanged', updateVoices);

    const queue = createSpeechQueue({
      speak(request, { onStarted, onFinished }) {
        const { speechSynthesisLanguageTag } = SUPPORTED_LANGUAGE_BY_CODE[request.languageCode];
        speakWithSpeechSynthesis({
          text: request.text,
          voice: pickVoice(voicesRef.current, speechSynthesisLanguageTag),
          speechSynthesisLanguageTag,
          onStarted,
          onFinished,
        });
      },
      onSpeakingChange(nextIsSpeaking) {
        setIsSpeaking(nextIsSpeaking);
        callbacksRef.current.onSpeakingChange(nextIsSpeaking);
      },
      onPlaybackStarted: (request) => callbacksRef.current.onPlaybackStarted(request),
    });
    queueRef.current = queue;

    return () => {
      speechSynthesis.removeEventListener('voiceschanged', updateVoices);
      queue.clearWaitingRequests();
      speechSynthesis.cancel();
      queueRef.current = null;
    };
  }, []);

  /** `false` only when this device is known to have no voice for the language. */
  const hasVoiceForLanguage = useCallback(
    (languageCode: LanguageCode): boolean => {
      if (!isSpeechSupported) {
        return false;
      }
      // An empty list means the voices haven't loaded, or the browser won't list them.
      // Speaking with only the language tag usually still works, so don't give up yet.
      if (voices.length === 0) {
        return true;
      }
      const { speechSynthesisLanguageTag } = SUPPORTED_LANGUAGE_BY_CODE[languageCode];
      return pickVoice(voices, speechSynthesisLanguageTag) !== null;
    },
    [isSpeechSupported, voices],
  );
  const hasVoiceForLanguageRef = useRef(hasVoiceForLanguage);
  hasVoiceForLanguageRef.current = hasVoiceForLanguage;

  /** Queues a translation to be spoken; `false` when its language stays captions only. */
  const speak = useCallback((request: SpeechRequest): boolean => {
    const queue = queueRef.current;
    if (!queue || !hasVoiceForLanguageRef.current(request.languageCode)) {
      return false;
    }
    queue.enqueue(request);
    return true;
  }, []);

  return { isSpeaking, speak, hasVoiceForLanguage };
}
