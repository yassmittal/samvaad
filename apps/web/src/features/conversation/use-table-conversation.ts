'use client';

import type { LanguageCode, ServerMessage, TranslationCompleteMessage } from '@samvaad/shared';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { webEnv } from '@/config/env';
import {
  type ConversationSocketClient,
  type ConversationSocketStatus,
  createConversationSocketClient,
} from '@/lib/conversation-socket/conversation-socket-client';
import { createMicrophoneGate, type MicrophoneGate } from '../microphone/create-microphone-gate';
import { useMicrophone } from '../microphone/use-microphone';
import type { SpeechRequest } from '../speech-output/speech-queue';
import { unlockSpeech } from '../speech-output/unlock-speech';
import { useSpeechOutput } from '../speech-output/use-speech-output';
import { INITIAL_CONVERSATION_STATE, reduceConversation } from './conversation-reducer';

export type LanguagePair = [LanguageCode, LanguageCode];

const DEFAULT_LANGUAGE_PAIR: LanguagePair = ['hi', 'en'];

type TranslationArrival = {
  speechEndToTranslationCompleteMilliseconds: number;
  receivedAtEpochMilliseconds: number;
};

function createTranslationArrival(message: TranslationCompleteMessage): TranslationArrival {
  const { timings } = message;
  return {
    speechEndToTranslationCompleteMilliseconds:
      timings.translationCompleteAtEpochMilliseconds - timings.speechEndedAtEpochMilliseconds,
    receivedAtEpochMilliseconds: Date.now(),
  };
}

// The API's clock times the steps up to the translation and this phone's clock times the
// rest, so a difference between the two clocks never enters the number (D-011).
function calculateSpeechEndToPlaybackStartMilliseconds(arrival: TranslationArrival): number {
  return (
    arrival.speechEndToTranslationCompleteMilliseconds +
    (Date.now() - arrival.receivedAtEpochMilliseconds)
  );
}

/** Table mode: one phone, two languages, captions and spoken translations (D-008). */
export function useTableConversation() {
  const [conversation, dispatchConversationEvent] = useReducer(
    reduceConversation,
    INITIAL_CONVERSATION_STATE,
  );
  const [socketStatus, setSocketStatus] = useState<ConversationSocketStatus>('connecting');
  const [languagePair, setLanguagePair] = useState<LanguagePair>(DEFAULT_LANGUAGE_PAIR);
  const socketClientRef = useRef<ConversationSocketClient | null>(null);
  const languagePairRef = useRef(languagePair);
  languagePairRef.current = languagePair;
  const translationArrivalsRef = useRef(new Map<string, TranslationArrival>());

  const microphoneGateRef = useRef<MicrophoneGate | null>(null);
  microphoneGateRef.current ??= createMicrophoneGate({
    onMicrophoneStateChange(isOpen) {
      // Opening first: the API queues frames until Meta's handshake completes (D-005).
      socketClientRef.current?.sendClientMessage({ type: 'microphone_state', isOpen });
    },
  });
  const microphoneGate = microphoneGateRef.current;

  const microphone = useMicrophone({
    onAudioFrame(frame) {
      if (microphoneGate.isSendingAudio()) {
        socketClientRef.current?.sendAudioFrame(frame);
      }
    },
  });

  const closeMicrophone = useCallback(() => {
    // Stop capturing first, so no frame follows the "closed" message.
    microphone.close();
    microphoneGate.setMicrophoneOn(false);
  }, [microphone.close, microphoneGate]);
  const closeMicrophoneRef = useRef(closeMicrophone);
  closeMicrophoneRef.current = closeMicrophone;

  const handlePlaybackStarted = useCallback((request: SpeechRequest) => {
    const arrival = translationArrivalsRef.current.get(request.utteranceId);
    if (request.isRepeat || !arrival) {
      return;
    }
    translationArrivalsRef.current.delete(request.utteranceId);
    dispatchConversationEvent({
      type: 'playback_started',
      utteranceId: request.utteranceId,
      speechEndToPlaybackStartMilliseconds: calculateSpeechEndToPlaybackStartMilliseconds(arrival),
    });
    socketClientRef.current?.sendClientMessage({
      type: 'playback_started',
      utteranceId: request.utteranceId,
      startedAtEpochMilliseconds: Date.now(),
    });
  }, []);

  const speechOutput = useSpeechOutput({
    // Table mode: the phone must not hear itself and translate its own voice (D-008).
    onSpeakingChange: (isSpeaking) => microphoneGate.setSpeaking(isSpeaking),
    onPlaybackStarted: handlePlaybackStarted,
  });
  const speakRef = useRef(speechOutput.speak);
  speakRef.current = speechOutput.speak;

  useEffect(() => () => microphoneGate.cancelPendingReopen(), [microphoneGate]);

  const handleServerMessage = useCallback((message: ServerMessage) => {
    // The API has already closed its transcription stream; stop capturing to match.
    if (message.type === 'error' && message.code === 'UPSTREAM_UNAVAILABLE') {
      closeMicrophoneRef.current();
    }
    if (message.type === 'translation_complete') {
      const wasQueued = speakRef.current({
        utteranceId: message.utteranceId,
        text: message.text,
        languageCode: message.targetLanguageCode,
        isRepeat: false,
      });
      if (wasQueued) {
        translationArrivalsRef.current.set(message.utteranceId, createTranslationArrival(message));
      }
    }
    dispatchConversationEvent(message);
  }, []);

  useEffect(() => {
    const socketClient = createConversationSocketClient({
      apiBaseUrl: webEnv.NEXT_PUBLIC_API_BASE_URL,
      onServerMessage: handleServerMessage,
      onStatusChange(status) {
        setSocketStatus(status);
        if (status === 'open') {
          socketClient.sendClientMessage({
            type: 'start_table_session',
            languageCodes: languagePairRef.current,
          });
        } else {
          closeMicrophoneRef.current();
        }
      },
    });
    socketClientRef.current = socketClient;
    return () => {
      socketClient.close();
      socketClientRef.current = null;
    };
  }, [handleServerMessage]);

  const changeLanguagePair = useCallback((nextLanguagePair: LanguagePair) => {
    setLanguagePair(nextLanguagePair);
    socketClientRef.current?.sendClientMessage({
      type: 'start_table_session',
      languageCodes: nextLanguagePair,
    });
  }, []);

  const toggleMicrophone = useCallback(async () => {
    // The mic button is the first tap, and iOS only lets a page speak after one (D-007).
    unlockSpeech();
    if (!socketClientRef.current) {
      return;
    }
    if (microphone.status === 'open') {
      closeMicrophone();
      return;
    }
    microphoneGate.setMicrophoneOn(true);
    const isOpen = await microphone.open();
    if (!isOpen) {
      microphoneGate.setMicrophoneOn(false);
    }
  }, [microphone, microphoneGate, closeMicrophone]);

  const repeatTranslation = useCallback(
    (utteranceId: string) => {
      const translation = conversation.captions.find(
        (caption) => caption.utteranceId === utteranceId,
      )?.translation;
      if (!translation?.isComplete) {
        return;
      }
      unlockSpeech();
      speechOutput.speak({
        utteranceId,
        text: translation.text,
        languageCode: translation.targetLanguageCode,
        isRepeat: true,
      });
    },
    [conversation.captions, speechOutput.speak],
  );

  const retryConnection = useCallback(() => {
    socketClientRef.current?.reconnect();
  }, []);

  return {
    captions: conversation.captions,
    latestError: conversation.latestError,
    socketStatus,
    microphoneStatus: microphone.status,
    isSpeaking: speechOutput.isSpeaking,
    hasVoiceForLanguage: speechOutput.hasVoiceForLanguage,
    languagePair,
    changeLanguagePair,
    toggleMicrophone,
    repeatTranslation,
    retryConnection,
  };
}
