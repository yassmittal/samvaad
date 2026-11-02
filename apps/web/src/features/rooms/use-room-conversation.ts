'use client';

import {
  type ClientMessage,
  type ConversationContext,
  type ErrorCode,
  isConversationContextEmpty,
  type WebrtcSignalServerMessage,
} from '@samvaad/shared';
import { useCallback, useRef, useState } from 'react';
import { useConversation } from '../conversation/use-conversation';
import { unlockSpeech } from '../speech-output/unlock-speech';
import { type RoomEntry, rememberRoomEntry } from './remembered-room-entry';
import {
  findRememberedParticipantId,
  forgetParticipantId,
  rememberParticipantId,
} from './remembered-room-seat';

export type RoomJoinFailureCode = Extract<ErrorCode, 'ROOM_NOT_FOUND' | 'ROOM_FULL'>;

// An offer and a few dozen ICE candidates; older ones are useless anyway.
const MAXIMUM_WAITING_WEBRTC_SIGNAL_COUNT = 40;

export type RoomStage =
  /** Asking for a name and language. */
  | 'entering'
  /** Sent `create_room` or `join_room`, waiting for the answer. */
  | 'joining'
  | 'in_room'
  | 'unavailable';

function isRoomJoinFailureCode(code: ErrorCode): code is RoomJoinFailureCode {
  return code === 'ROOM_NOT_FOUND' || code === 'ROOM_FULL';
}

/**
 * Two-phone mode (D-008): create or join a room, then the same conversation as table mode,
 * with this phone hearing only translations into its own language.
 */
export function useRoomConversation({ requestedRoomCode }: { requestedRoomCode: string | null }) {
  const [roomEntry, setRoomEntry] = useState<RoomEntry | null>(null);
  const [joinFailureCode, setJoinFailureCode] = useState<RoomJoinFailureCode | null>(null);
  const roomEntryRef = useRef<RoomEntry | null>(null);
  // What the creator filled in on the form; the room gets it once it exists (D-016).
  const initialContextRef = useRef<ConversationContext | null>(null);
  // Set once the API answers, so a creator who reconnects rejoins their room, not a new one.
  const joinedRoomCodeRef = useRef<string | null>(null);

  // A signal can arrive before the real voice is ready for it (the other phone answered first,
  // or the microphone is still opening), so signals wait here for a listener (D-023).
  const webrtcSignalListenerRef = useRef<((signal: WebrtcSignalServerMessage) => void) | null>(
    null,
  );
  const waitingWebrtcSignalsRef = useRef<WebrtcSignalServerMessage[]>([]);
  const deliverWebrtcSignal = useCallback((signal: WebrtcSignalServerMessage) => {
    const listener = webrtcSignalListenerRef.current;
    if (listener) {
      listener(signal);
      return;
    }
    waitingWebrtcSignalsRef.current = [
      ...waitingWebrtcSignalsRef.current.slice(-(MAXIMUM_WAITING_WEBRTC_SIGNAL_COUNT - 1)),
      signal,
    ];
  }, []);
  const subscribeToWebrtcSignals = useCallback(
    (listener: (signal: WebrtcSignalServerMessage) => void) => {
      webrtcSignalListenerRef.current = listener;
      for (const signal of waitingWebrtcSignalsRef.current.splice(0)) {
        listener(signal);
      }
      return () => {
        if (webrtcSignalListenerRef.current === listener) {
          webrtcSignalListenerRef.current = null;
        }
      };
    },
    [],
  );

  const sendEntryMessage = useCallback(
    (sendClientMessage: (message: ClientMessage) => void, entry: RoomEntry) => {
      const roomCode = joinedRoomCodeRef.current ?? requestedRoomCode;
      if (roomCode !== null) {
        // After a dropped socket or a reload, ask for this tab's old seat back (D-017).
        const previousParticipantId = findRememberedParticipantId(roomCode);
        // A room someone is still in keeps its context; rejoining doesn't resend ours.
        sendClientMessage({
          type: 'join_room',
          roomCode,
          ...entry,
          ...(previousParticipantId === null ? {} : { previousParticipantId }),
        });
        return;
      }
      sendClientMessage({ type: 'create_room', ...entry });
      const initialContext = initialContextRef.current;
      // Messages on one socket arrive in order, so the room exists by the time this does.
      if (initialContext !== null && !isConversationContextEmpty(initialContext)) {
        sendClientMessage({ type: 'update_conversation_context', ...initialContext });
      }
    },
    [requestedRoomCode],
  );

  const { conversation, sendClientMessage, ...conversationControls } = useConversation({
    onSocketOpen(socketClient) {
      // After a dropped socket, rejoin: the room keeps this phone's seat for a minute (D-017).
      const entry = roomEntryRef.current;
      if (entry) {
        sendEntryMessage(socketClient.sendClientMessage, entry);
        return;
      }
      // Not answered yet: ask who is calling, for the incoming-call screen (D-022).
      if (requestedRoomCode !== null) {
        socketClient.sendClientMessage({ type: 'preview_room', roomCode: requestedRoomCode });
      }
    },
    onServerMessage(message) {
      if (message.type === 'webrtc_signal') {
        deliverWebrtcSignal(message);
        return;
      }
      if (message.type === 'room_joined') {
        joinedRoomCodeRef.current = message.roomCode;
        rememberParticipantId(message.roomCode, message.participantId);
        // A created room gets its shareable address; no reload, so the socket stays open.
        const roomPath = `/room/${message.roomCode}`;
        if (window.location.pathname !== roomPath) {
          window.history.replaceState(null, '', roomPath);
        }
      }
      if (message.type === 'error' && isRoomJoinFailureCode(message.code)) {
        roomEntryRef.current = null;
        setRoomEntry(null);
        setJoinFailureCode(message.code);
      }
    },
  });

  const { openMicrophoneCapture } = conversationControls;
  const enterRoom = useCallback(
    (entry: RoomEntry, initialContext: ConversationContext | null) => {
      // Joining is the first tap, and iOS only lets a page speak after one (D-007). The
      // microphone opens in the same tap; it sends nothing until both people are in (D-022).
      unlockSpeech();
      void openMicrophoneCapture();
      rememberRoomEntry(entry);
      roomEntryRef.current = entry;
      initialContextRef.current = initialContext;
      setRoomEntry(entry);
      // Dropped if the socket isn't open yet; `onSocketOpen` sends it then.
      sendEntryMessage(sendClientMessage, entry);
    },
    [sendClientMessage, sendEntryMessage, openMicrophoneCapture],
  );

  const leaveRoom = useCallback(() => {
    roomEntryRef.current = null;
    if (joinedRoomCodeRef.current !== null) {
      forgetParticipantId(joinedRoomCodeRef.current);
    }
    sendClientMessage({ type: 'leave_room' });
  }, [sendClientMessage]);

  const stage: RoomStage =
    joinFailureCode !== null
      ? 'unavailable'
      : roomEntry === null
        ? 'entering'
        : conversation.room === null
          ? 'joining'
          : 'in_room';

  return {
    ...conversationControls,
    stage,
    joinFailureCode,
    room: conversation.room,
    participantId: conversation.participantId,
    departedParticipantName: conversation.departedParticipantName,
    captions: conversation.captions,
    latestError: conversation.latestError,
    conversationContext: conversation.conversationContext,
    contextUpdatedByParticipantName: conversation.contextUpdatedByParticipantName,
    recap: conversation.recap,
    roomPreview: conversation.roomPreview,
    iceServers: conversation.iceServers,
    sendClientMessage,
    subscribeToWebrtcSignals,
    participantName: roomEntry?.participantName ?? null,
    languageCode: roomEntry?.languageCode ?? null,
    enterRoom,
    leaveRoom,
  };
}
