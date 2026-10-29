'use client';

import type { LanguageCode, ServerMessage } from '@samvaad/shared';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { webEnv } from '@/config/env';
import {
  type ConversationSocketClient,
  type ConversationSocketStatus,
  createConversationSocketClient,
} from '@/lib/conversation-socket/conversation-socket-client';
import { useMicrophone } from '../microphone/use-microphone';
import { INITIAL_CONVERSATION_STATE, reduceConversation } from './conversation-reducer';

export type LanguagePair = [LanguageCode, LanguageCode];

const DEFAULT_LANGUAGE_PAIR: LanguagePair = ['hi', 'en'];

/** Table mode: one phone, two languages, live captions (Phase 1, D-008). */
export function useTableConversation() {
  const [conversation, dispatchServerMessage] = useReducer(
    reduceConversation,
    INITIAL_CONVERSATION_STATE,
  );
  const [socketStatus, setSocketStatus] = useState<ConversationSocketStatus>('connecting');
  const [languagePair, setLanguagePair] = useState<LanguagePair>(DEFAULT_LANGUAGE_PAIR);
  const socketClientRef = useRef<ConversationSocketClient | null>(null);
  const languagePairRef = useRef(languagePair);
  languagePairRef.current = languagePair;

  const microphone = useMicrophone({
    onAudioFrame: (frame) => socketClientRef.current?.sendAudioFrame(frame),
  });
  const closeMicrophoneRef = useRef(microphone.close);
  closeMicrophoneRef.current = microphone.close;

  const handleServerMessage = useCallback((message: ServerMessage) => {
    // The API has already closed its transcription stream; stop capturing to match.
    if (message.type === 'error' && message.code === 'UPSTREAM_UNAVAILABLE') {
      closeMicrophoneRef.current();
    }
    dispatchServerMessage(message);
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
    const socketClient = socketClientRef.current;
    if (!socketClient) {
      return;
    }
    if (microphone.status === 'open') {
      // Stop capturing first, so no frame follows the "closed" message.
      microphone.close();
      socketClient.sendClientMessage({ type: 'microphone_state', isOpen: false });
      return;
    }
    // Announce first: the API queues frames until Meta's handshake completes (D-005).
    socketClient.sendClientMessage({ type: 'microphone_state', isOpen: true });
    const isOpen = await microphone.open();
    if (!isOpen) {
      socketClient.sendClientMessage({ type: 'microphone_state', isOpen: false });
    }
  }, [microphone]);

  const retryConnection = useCallback(() => {
    socketClientRef.current?.reconnect();
  }, []);

  return {
    captions: conversation.captions,
    latestError: conversation.latestError,
    socketStatus,
    microphoneStatus: microphone.status,
    languagePair,
    changeLanguagePair,
    toggleMicrophone,
    retryConnection,
  };
}
