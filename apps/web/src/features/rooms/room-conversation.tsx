'use client';

import { SUPPORTED_LANGUAGE_BY_CODE } from '@samvaad/shared';
import Link from 'next/link';
import { useState } from 'react';
import { CaptionList } from '../conversation/caption-list';
import { ConversationStatus } from '../conversation/conversation-status';
import { LatencyMeter } from '../conversation/latency-meter';
import { MicrophoneButton } from '../conversation/microphone-button';
import { ParticipantList } from './participant-list';
import { RoomEntryForm } from './room-entry-form';
import { ShareRoomPanel } from './share-room-panel';
import { type RoomJoinFailureCode, useRoomConversation } from './use-room-conversation';

const JOIN_FAILURE_TEXT = {
  ROOM_NOT_FOUND: 'This room has closed, or the code is wrong. Rooms close when everyone leaves.',
  ROOM_FULL: 'This room already has two people in it.',
} as const satisfies Record<RoomJoinFailureCode, string>;

function RoomUnavailable({ joinFailureCode }: { joinFailureCode: RoomJoinFailureCode }) {
  return (
    <div className="flex flex-col gap-4">
      <p role="alert" className="text-lg text-stone-700">
        {JOIN_FAILURE_TEXT[joinFailureCode]}
      </p>
      {/* A full page load, so the new room starts with a fresh socket and state. */}
      <a
        href="/room/new"
        className="rounded-2xl bg-stone-900 px-5 py-3 text-center text-lg font-medium text-white"
      >
        Start a new room
      </a>
      <Link href="/" className="text-center text-stone-500 underline">
        Home
      </Link>
    </div>
  );
}

function RoomScreenHeading({ roomCode }: { roomCode: string | null }) {
  return (
    <header className="space-y-1">
      <Link href="/" className="text-xl font-semibold tracking-tight">
        Samvaad
      </Link>
      <h1 className="text-3xl font-semibold tracking-tight">
        {roomCode === null ? 'Start a room' : `Join room ${roomCode}`}
      </h1>
      <p className="text-stone-600">
        {roomCode === null
          ? 'Each of you talks into your own phone and hears the other in your own language.'
          : 'Talk into this phone; hear the other person in your own language.'}
      </p>
    </header>
  );
}

/** `/room/new` (create) and `/room/ABC123` (join): the entry form, then the conversation. */
export function RoomConversation({ requestedRoomCode }: { requestedRoomCode: string | null }) {
  const roomConversation = useRoomConversation({ requestedRoomCode });
  const { stage, socketStatus } = roomConversation;

  if (stage === 'in_room') {
    return <RoomConversationInRoom roomConversation={roomConversation} />;
  }
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-8 px-4 py-12">
      <RoomScreenHeading roomCode={requestedRoomCode} />
      {stage === 'unavailable' && roomConversation.joinFailureCode !== null && (
        <RoomUnavailable joinFailureCode={roomConversation.joinFailureCode} />
      )}
      {stage === 'entering' && (
        <RoomEntryForm
          roomCode={requestedRoomCode}
          isConnected={socketStatus === 'open'}
          onSubmit={roomConversation.enterRoom}
        />
      )}
      {stage === 'joining' && (
        <p className="animate-pulse text-center text-stone-500">
          {requestedRoomCode === null ? 'Creating the room…' : 'Joining…'}
        </p>
      )}
    </main>
  );
}

function RoomConversationInRoom({
  roomConversation,
}: {
  roomConversation: ReturnType<typeof useRoomConversation>;
}) {
  const {
    room,
    participantId,
    departedParticipantName,
    captions,
    latestError,
    languageCode,
    socketStatus,
    microphoneStatus,
    isSpeaking,
    hasVoiceForLanguage,
    toggleMicrophone,
    repeatTranslation,
    retryConnection,
    leaveRoom,
  } = roomConversation;
  const [isShareOpen, setIsShareOpen] = useState(false);
  if (room === null || languageCode === null) {
    return null;
  }
  const isAlone = room.participants.length < 2;
  const language = SUPPORTED_LANGUAGE_BY_CODE[languageCode];

  return (
    <main className="mx-auto flex h-dvh w-full max-w-xl flex-col">
      <header className="flex flex-col gap-3 border-b border-stone-200 px-4 pb-4 pt-5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-semibold tracking-tight">Samvaad</span>
            <button
              type="button"
              onClick={() => setIsShareOpen((isOpen) => !isOpen)}
              aria-expanded={isShareOpen || isAlone}
              className="rounded-full bg-stone-100 px-2.5 py-0.5 font-mono text-sm tracking-widest text-stone-700 hover:bg-stone-200"
            >
              {room.roomCode}
            </button>
          </div>
          <LatencyMeter captions={captions} />
        </div>
        <ParticipantList participants={room.participants} participantId={participantId} />
        {isAlone && (
          <p className="text-sm text-stone-500">
            {departedParticipantName
              ? `${departedParticipantName} left. They can come back with the same code.`
              : 'Waiting for the other person to join.'}
          </p>
        )}
        {!hasVoiceForLanguage(languageCode) && (
          <p className="text-sm text-amber-700">
            Captions only: this phone has no {language.englishName} voice.
          </p>
        )}
      </header>

      <section className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
        {(isAlone || isShareOpen) && <ShareRoomPanel roomCode={room.roomCode} />}
        <CaptionList
          captions={captions}
          listenerLanguageCode={languageCode}
          emptyStateText={`Tap the microphone and speak ${language.englishName}. The other phone hears it in their language, and you hear their replies in yours.`}
          hasVoiceForLanguage={hasVoiceForLanguage}
          onRepeat={repeatTranslation}
        />
      </section>

      <footer className="flex flex-col items-center gap-3 border-t border-stone-200 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4">
        <ConversationStatus
          socketStatus={socketStatus}
          microphoneStatus={microphoneStatus}
          isSpeaking={isSpeaking}
          latestError={latestError}
        />
        {socketStatus === 'closed' && (
          <button
            type="button"
            onClick={retryConnection}
            className="rounded-full bg-stone-200 px-4 py-1.5 text-sm font-medium hover:bg-stone-300"
          >
            Try again
          </button>
        )}
        <div className="grid w-full grid-cols-[1fr_auto_1fr] items-center">
          <span />
          <MicrophoneButton
            microphoneStatus={microphoneStatus}
            isSpeaking={isSpeaking}
            isDisabled={socketStatus !== 'open'}
            onToggle={() => void toggleMicrophone()}
          />
          <Link
            href="/"
            onClick={leaveRoom}
            className="justify-self-end rounded-full px-3 py-1.5 text-sm font-medium text-stone-500 hover:bg-stone-100"
          >
            Leave
          </Link>
        </div>
      </footer>
    </main>
  );
}
