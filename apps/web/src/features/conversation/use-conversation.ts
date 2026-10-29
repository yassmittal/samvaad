'use client';

import type { ServerMessage, TranslationCompleteMessage } from '@samvaad/shared';
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

type ConversationOptions = {
  /**
   * Called each time the socket opens, the first time and after a reconnect. The API forgets
   * a connection when it closes, so this (re)starts the table session or rejoins the room.
   */
  onSocketOpen: (socketClient: ConversationSocketClient) => void;
  /** Called after the conversation state has taken the message in. */
  onServerMessage?: (message: ServerMessage) => void;
};

/**
 * What table mode and a room have in common: the socket, the captions, the microphone and
 * speaking each translation that arrives for this phone. The mic pauses while the phone
 * speaks, so it never translates itself (D-008); in a room that matters without earbuds.
 */
export function useConversation({ onSocketOpen, onServerMessage }: ConversationOptions) {
  const [conversation, dispatchConversationEvent] = useReducer(
    reduceConversation,
    INITIAL_CONVERSATION_STATE,
  );
  const [socketStatus, setSocketStatus] = useState<ConversationSocketStatus>('connecting');
  const socketClientRef = useRef<ConversationSocketClient | null>(null);
  const callbacksRef = useRef({ onSocketOpen, onServerMessage });
  callbacksRef.current = { onSocketOpen, onServerMessage };
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
    // Only translations meant for this phone arrive, in this phone's language(s).
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
    callbacksRef.current.onServerMessage?.(message);
  }, []);

  useEffect(() => {
    const socketClient = createConversationSocketClient({
      apiBaseUrl: webEnv.NEXT_PUBLIC_API_BASE_URL,
      onServerMessage: handleServerMessage,
      onStatusChange(status) {
        setSocketStatus(status);
        if (status === 'open') {
          callbacksRef.current.onSocketOpen(socketClient);
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

  const sendClientMessage = useCallback<ConversationSocketClient['sendClientMessage']>(
    (message) => socketClientRef.current?.sendClientMessage(message),
    [],
  );

  const toggleMicrophone = useCallback(async () => {
    // The mic button may be the first tap, and iOS only lets a page speak after one (D-007).
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
    conversation,
    socketStatus,
    microphoneStatus: microphone.status,
    isSpeaking: speechOutput.isSpeaking,
    hasVoiceForLanguage: speechOutput.hasVoiceForLanguage,
    sendClientMessage,
    closeMicrophone,
    toggleMicrophone,
    repeatTranslation,
    retryConnection,
  };
}
