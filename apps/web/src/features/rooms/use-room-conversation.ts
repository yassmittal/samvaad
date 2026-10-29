'use client';

import type { ClientMessage, ErrorCode } from '@samvaad/shared';
import { useCallback, useRef, useState } from 'react';
import { useConversation } from '../conversation/use-conversation';
import { unlockSpeech } from '../speech-output/unlock-speech';
import { type RoomEntry, rememberRoomEntry } from './remembered-room-entry';

export type RoomJoinFailureCode = Extract<ErrorCode, 'ROOM_NOT_FOUND' | 'ROOM_FULL'>;

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
  // Set once the API answers, so a creator who reconnects rejoins their room, not a new one.
  const joinedRoomCodeRef = useRef<string | null>(null);

  const sendEntryMessage = useCallback(
    (sendClientMessage: (message: ClientMessage) => void, entry: RoomEntry) => {
      const roomCode = joinedRoomCodeRef.current ?? requestedRoomCode;
      sendClientMessage(
        roomCode === null
          ? { type: 'create_room', ...entry }
          : { type: 'join_room', roomCode, ...entry },
      );
    },
    [requestedRoomCode],
  );

  const { conversation, sendClientMessage, ...conversationControls } = useConversation({
    onSocketOpen(socketClient) {
      // After a dropped socket the API has forgotten us: rejoin, as a new participant, if
      // the room is still open. Keeping the seat is Phase 6.
      const entry = roomEntryRef.current;
      if (entry) {
        sendEntryMessage(socketClient.sendClientMessage, entry);
      }
    },
    onServerMessage(message) {
      if (message.type === 'room_joined') {
        joinedRoomCodeRef.current = message.roomCode;
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

  const enterRoom = useCallback(
    (entry: RoomEntry) => {
      // Joining is the first tap, and iOS only lets a page speak after one (D-007).
      unlockSpeech();
      rememberRoomEntry(entry);
      roomEntryRef.current = entry;
      setRoomEntry(entry);
      // Dropped if the socket isn't open yet; `onSocketOpen` sends it then.
      sendEntryMessage(sendClientMessage, entry);
    },
    [sendClientMessage, sendEntryMessage],
  );

  const leaveRoom = useCallback(() => {
    roomEntryRef.current = null;
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
    languageCode: roomEntry?.languageCode ?? null,
    enterRoom,
    leaveRoom,
  };
}
