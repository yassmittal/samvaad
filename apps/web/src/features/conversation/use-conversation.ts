'use client';

import {
  type ConversationContext,
  isQuietAudioFrame,
  type LanguageCode,
  type ServerMessage,
  type TranslationCompleteMessage,
} from '@samvaad/shared';
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
import { toPcm16Samples } from '../speech-output/to-pcm16-samples';
import {
  createTranslationAudioStore,
  type TranslationAudioStore,
} from '../speech-output/translation-audio-store';
import { unlockSpeech } from '../speech-output/unlock-speech';
import { useSpeechOutput } from '../speech-output/use-speech-output';
import { INITIAL_CONVERSATION_STATE, reduceConversation } from './conversation-reducer';
import { HEALTHY_UPLINK, shouldSkipQuietFrame, updateUplinkHealth } from './track-uplink-backlog';

const UPLINK_CHECK_MILLISECONDS = 500;

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
 * speaking each translation that arrives for this phone. The mic sends silence while the phone
 * speaks, so it never translates itself (D-008, D-019); in a room that matters without earbuds.
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

  const [isSendingRealAudio, setIsSendingRealAudio] = useState(false);
  const microphoneGateRef = useRef<MicrophoneGate | null>(null);
  microphoneGateRef.current ??= createMicrophoneGate({
    onMicrophoneStateChange(isOpen) {
      // Opening first: the API queues frames until Meta's handshake completes (D-005).
      socketClientRef.current?.sendClientMessage({ type: 'microphone_state', isOpen });
    },
    onSendingRealAudioChange: setIsSendingRealAudio,
  });
  const microphoneGate = microphoneGateRef.current;

  const microphone = useMicrophone({
    onAudioFrame(frame) {
      const outgoingFrame = microphoneGate.toOutgoingFrame(frame);
      const socketClient = socketClientRef.current;
      if (outgoingFrame === null || socketClient === null) {
        return;
      }
      // A slow uplink gets speech only; the API pads the silence back in (D-024).
      if (
        shouldSkipQuietFrame({
          bufferedByteCount: socketClient.findBufferedByteCount(),
          isQuiet: isQuietAudioFrame(new Uint8Array(outgoingFrame)),
        })
      ) {
        return;
      }
      socketClient.sendAudioFrame(outgoingFrame);
    },
  });

  // Whether this phone's audio is reaching the API late, to say so on screen (D-024).
  const [isConnectionWeak, setIsConnectionWeak] = useState(false);
  useEffect(() => {
    let uplinkHealth = HEALTHY_UPLINK;
    const interval = setInterval(() => {
      uplinkHealth = updateUplinkHealth(uplinkHealth, {
        bufferedByteCount: socketClientRef.current?.findBufferedByteCount() ?? 0,
        nowEpochMilliseconds: Date.now(),
      });
      setIsConnectionWeak(uplinkHealth.isWeak);
    }, UPLINK_CHECK_MILLISECONDS);
    return () => clearInterval(interval);
  }, []);

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

  const translationAudioStoreRef = useRef<TranslationAudioStore | null>(null);
  translationAudioStoreRef.current ??= createTranslationAudioStore();
  const translationAudioStore = translationAudioStoreRef.current;

  const speechOutput = useSpeechOutput({
    translationAudioStore,
    onSpeakingChange: (isSpeaking) => microphoneGate.setSpeaking(isSpeaking),
    onPlaybackStarted: handlePlaybackStarted,
  });
  const speakRef = useRef(speechOutput.speak);
  speakRef.current = speechOutput.speak;

  useEffect(() => () => microphoneGate.cancelPendingReopen(), [microphoneGate]);

  const handleServerMessage = useCallback((message: ServerMessage) => {
    // The API has already closed its transcription stream; stop capturing to match. A failed
    // translation (it has an `utteranceId`) leaves the microphone alone.
    if (
      message.type === 'error' &&
      message.utteranceId === undefined &&
      (message.code === 'UPSTREAM_UNAVAILABLE' || message.code === 'ROOM_TIME_LIMIT_REACHED')
    ) {
      closeMicrophoneRef.current();
    }
    // Someone ended the conversation, here or on the other phone: stop listening (D-016).
    if (message.type === 'conversation_ended') {
      closeMicrophoneRef.current();
    }
    // Only translations meant for this phone arrive, in this phone's language(s).
    if (message.type === 'translation_complete') {
      const wasQueued = speakRef.current({
        utteranceId: message.utteranceId,
        text: message.text,
        languageCode: message.targetLanguageCode,
        isRepeat: false,
        hasTranslationAudio: message.hasTranslationAudio,
      });
      if (wasQueued) {
        translationArrivalsRef.current.set(message.utteranceId, createTranslationArrival(message));
      }
    }
    if (message.type === 'translation_audio_end') {
      translationAudioStoreRef.current?.end(message.utteranceId, message.hasFailed);
    }
    dispatchConversationEvent(message);
    callbacksRef.current.onServerMessage?.(message);
  }, []);

  useEffect(() => {
    const socketClient = createConversationSocketClient({
      apiBaseUrl: webEnv.NEXT_PUBLIC_API_BASE_URL,
      onServerMessage: handleServerMessage,
      onTranslationAudioFrame({ utteranceId, audio }) {
        translationAudioStoreRef.current?.appendChunk(utteranceId, toPcm16Samples(audio));
      },
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

  /**
   * A call (D-022): opens the microphone inside the Start or Answer tap, without sending
   * anything yet. `setMicrophoneOn` then follows who is in the call and the Mute button.
   */
  const openMicrophoneCapture = useCallback(async (): Promise<boolean> => {
    // The tap may be the first, and iOS only plays audio after one (D-007).
    unlockSpeech();
    return microphone.open();
  }, [microphone.open]);

  const setMicrophoneOn = useCallback(
    (isOn: boolean) => microphoneGate.setMicrophoneOn(isOn),
    [microphoneGate],
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
      const translationAudio = translationAudioStore.find(utteranceId);
      speechOutput.speak({
        utteranceId,
        text: translation.text,
        languageCode: translation.targetLanguageCode,
        isRepeat: true,
        // Replays the API's speech while this phone still keeps all of it (D-021).
        hasTranslationAudio:
          translationAudio?.isEnded === true &&
          !translationAudio.hasFailed &&
          translationAudio.chunks.length > 0,
      });
    },
    [conversation.captions, speechOutput.speak, translationAudioStore],
  );

  /** The API's voice needs nothing from this phone (D-021); the browser's needs a voice installed. */
  const hasVoiceForLanguage = useCallback(
    (languageCode: LanguageCode) =>
      conversation.isTranslationAudioEnabled || speechOutput.hasVoiceForLanguage(languageCode),
    [conversation.isTranslationAudioEnabled, speechOutput.hasVoiceForLanguage],
  );

  /** Applies to the whole room, from the next utterance translated (D-016). */
  const updateConversationContext = useCallback((context: ConversationContext) => {
    socketClientRef.current?.sendClientMessage({ type: 'update_conversation_context', ...context });
  }, []);

  /** Ends it for everyone in the room; the recaps follow (D-016). */
  const endConversation = useCallback(() => {
    socketClientRef.current?.sendClientMessage({ type: 'end_conversation' });
  }, []);

  const dismissRecap = useCallback(() => {
    dispatchConversationEvent({ type: 'recap_dismissed' });
  }, []);

  const retryConnection = useCallback(() => {
    socketClientRef.current?.reconnect();
  }, []);

  return {
    conversation,
    socketStatus,
    microphoneStatus: microphone.status,
    isSpeaking: speechOutput.isSpeaking,
    hasVoiceForLanguage,
    sendClientMessage,
    closeMicrophone,
    toggleMicrophone,
    openMicrophoneCapture,
    setMicrophoneOn,
    findMicrophoneAnalyserNode: microphone.findAnalyserNode,
    findMicrophoneStream: microphone.findMediaStream,
    isSendingRealAudio,
    isConnectionWeak,
    repeatTranslation,
    updateConversationContext,
    endConversation,
    dismissRecap,
    retryConnection,
  };
}
