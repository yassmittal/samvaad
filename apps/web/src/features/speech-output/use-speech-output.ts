'use client';

import { type LanguageCode, SUPPORTED_LANGUAGE_BY_CODE } from '@samvaad/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { pickVoice } from './pick-voice';
import { playTranslationAudio } from './play-translation-audio';
import { findPlaybackAudioOutput } from './playback-audio-output';
import { speakWithSpeechSynthesis } from './speak-with-speech-synthesis';
import { createSpeechQueue, type SpeechQueue, type SpeechRequest } from './speech-queue';
import type { TranslationAudioStore } from './translation-audio-store';

type SpeechOutputOptions = {
  /** Where the API's spoken translations collect as their frames arrive (D-021). */
  translationAudioStore: TranslationAudioStore;
  onSpeakingChange: (isSpeaking: boolean) => void;
  onPlaybackStarted: (request: SpeechRequest) => void;
};

/**
 * Speaks translations aloud, one at a time: the API's own speech when it sends some (D-021),
 * otherwise, or when that fails, the browser's voice (D-007).
 */
export function useSpeechOutput({
  translationAudioStore,
  onSpeakingChange,
  onPlaybackStarted,
}: SpeechOutputOptions) {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isSpeechSupported, setIsSpeechSupported] = useState(true);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const voicesRef = useRef(voices);
  voicesRef.current = voices;
  const callbacksRef = useRef({ onSpeakingChange, onPlaybackStarted });
  callbacksRef.current = { onSpeakingChange, onPlaybackStarted };
  const queueRef = useRef<SpeechQueue | null>(null);

  useEffect(() => {
    // Some browsers have no voice of their own (Android in-app browsers, such as a link opened
    // inside an app). The API's speech still plays there, so the queue is made regardless.
    const hasSpeechSynthesis = typeof speechSynthesis !== 'undefined';
    setIsSpeechSupported(hasSpeechSynthesis);
    // The voice list often fills in after the page loads, announced by `voiceschanged`.
    const updateVoices = () => setVoices(speechSynthesis.getVoices());
    if (hasSpeechSynthesis) {
      updateVoices();
      speechSynthesis.addEventListener('voiceschanged', updateVoices);
    }

    let activePlayback: { stop: () => void } | null = null;
    const queue = createSpeechQueue({
      speak(request, { onStarted, onFinished }) {
        const { speechSynthesisLanguageTag } = SUPPORTED_LANGUAGE_BY_CODE[request.languageCode];
        const speakText = () => {
          if (!hasSpeechSynthesis) {
            // Captions only for this one: nothing to speak it with.
            onFinished();
            return;
          }
          speakWithSpeechSynthesis({
            text: request.text,
            voice: pickVoice(voicesRef.current, speechSynthesisLanguageTag),
            speechSynthesisLanguageTag,
            onStarted,
            onFinished,
          });
        };
        const playbackAudioOutput = findPlaybackAudioOutput();
        if (!request.hasTranslationAudio || playbackAudioOutput === null) {
          speakText();
          return;
        }
        activePlayback = playTranslationAudio({
          playbackAudioOutput,
          translationAudioStore,
          utteranceId: request.utteranceId,
          onStarted,
          onFinished() {
            activePlayback = null;
            onFinished();
          },
          onFailedBeforeAudio() {
            activePlayback = null;
            speakText();
          },
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
      queue.clearWaitingRequests();
      if (hasSpeechSynthesis) {
        speechSynthesis.removeEventListener('voiceschanged', updateVoices);
        speechSynthesis.cancel();
      }
      activePlayback?.stop();
      queueRef.current = null;
    };
  }, [translationAudioStore]);

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
    // The API's speech needs no voice on this phone (D-021).
    if (
      !queue ||
      (!request.hasTranslationAudio && !hasVoiceForLanguageRef.current(request.languageCode))
    ) {
      return false;
    }
    queue.enqueue(request);
    return true;
  }, []);

  return { isSpeaking, speak, hasVoiceForLanguage };
}
