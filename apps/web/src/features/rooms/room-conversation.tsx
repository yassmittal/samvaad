'use client';

import { SUPPORTED_LANGUAGE_BY_CODE } from '@samvaad/shared';
import Link from 'next/link';
import { useState } from 'react';
import { CaptionList } from '../conversation/caption-list';
import { isWaitingForTranslation } from '../conversation/conversation-reducer';
import { ConversationStatus } from '../conversation/conversation-status';
import { LatencyMeter } from '../conversation/latency-meter';
import { MicrophoneButton } from '../conversation/microphone-button';
import { useScreenWakeLock } from '../conversation/use-screen-wake-lock';
import {
  ConversationContextChip,
  ConversationContextPanel,
} from '../conversation-context/conversation-context-panel';
import { EndConversationButton } from '../recap/end-conversation-button';
import { RecapView } from '../recap/recap-view';
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
        className="rounded-2xl bg-stone-900 px-5 py-3 text-center text-lg font-medium text-stone-50"
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
    conversationContext,
    contextUpdatedByParticipantName,
    recap,
    languageCode,
    socketStatus,
    microphoneStatus,
    isSpeaking,
    hasVoiceForLanguage,
    toggleMicrophone,
    repeatTranslation,
    updateConversationContext,
    endConversation,
    dismissRecap,
    retryConnection,
    leaveRoom,
  } = roomConversation;
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [isContextOpen, setIsContextOpen] = useState(false);
  useScreenWakeLock();
  if (room === null || languageCode === null) {
    return null;
  }
  const isAlone = room.participants.length < 2;
  // The room keeps a dropped phone's seat for a minute (D-017).
  const disconnectedParticipant = room.participants.find(
    (participant) => participant.participantId !== participantId && !participant.isConnected,
  );
  const language = SUPPORTED_LANGUAGE_BY_CODE[languageCode];
  const isConnected = socketStatus === 'open';
  const hasFinishedUtterance = captions.some((caption) => caption.isFinal);

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
            <ConversationContextChip
              conversationContext={conversationContext}
              isOpen={isContextOpen}
              onToggle={() => setIsContextOpen((isOpen) => !isOpen)}
            />
          </div>
          <LatencyMeter captions={captions} />
        </div>
        <ParticipantList participants={room.participants} participantId={participantId} />
        {disconnectedParticipant && (
          <p className="text-sm text-amber-700 dark:text-amber-400">
            {disconnectedParticipant.participantName} lost the connection. Waiting for them to come
            back…
          </p>
        )}
        {isAlone && (
          <p className="text-sm text-stone-500">
            {departedParticipantName
              ? `${departedParticipantName} left. They can come back with the same code.`
              : 'Waiting for the other person to join.'}
          </p>
        )}
        {!hasVoiceForLanguage(languageCode) && (
          <p className="text-sm text-amber-700 dark:text-amber-400">
            Captions only: this phone has no {language.englishName} voice.
          </p>
        )}
      </header>

      <section className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
        {recap !== null ? (
          <RecapView
            recap={recap}
            languageCodes={[languageCode]}
            isConnected={isConnected}
            onRetry={endConversation}
            onBack={dismissRecap}
            onExit={leaveRoom}
          />
        ) : (
          <>
            {isContextOpen && (
              <ConversationContextPanel
                conversationContext={conversationContext}
                contextUpdatedByParticipantName={contextUpdatedByParticipantName}
                isSharedWithOthers
                isDisabled={!isConnected}
                onSave={updateConversationContext}
                onClose={() => setIsContextOpen(false)}
              />
            )}
            {(isAlone || isShareOpen) && <ShareRoomPanel roomCode={room.roomCode} />}
            <CaptionList
              captions={captions}
              listenerLanguageCode={languageCode}
              emptyStateText={`Tap the microphone and speak ${language.englishName}. The other phone hears it in their language, and you hear their replies in yours.`}
              hasVoiceForLanguage={hasVoiceForLanguage}
              onRepeat={repeatTranslation}
            />
          </>
        )}
      </section>

      {recap === null && (
        <footer className="flex flex-col items-center gap-3 border-t border-stone-200 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4">
          <ConversationStatus
            socketStatus={socketStatus}
            microphoneStatus={microphoneStatus}
            isSpeaking={isSpeaking}
            isTranslating={isWaitingForTranslation(captions, languageCode)}
            latestError={latestError}
          />
          {(socketStatus === 'closed' || socketStatus === 'replaced') && (
            <button
              type="button"
              onClick={retryConnection}
              className="rounded-full bg-stone-200 px-4 py-1.5 text-sm font-medium hover:bg-stone-300"
            >
              Try again
            </button>
          )}
          <div className="grid w-full grid-cols-[1fr_auto_1fr] items-center">
            <div className="justify-self-start">
              <EndConversationButton
                isDisabled={!isConnected || !hasFinishedUtterance}
                isSharedWithOthers={!isAlone}
                onEnd={endConversation}
              />
            </div>
            <MicrophoneButton
              microphoneStatus={microphoneStatus}
              isSpeaking={isSpeaking}
              isDisabled={!isConnected}
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
      )}
    </main>
  );
}
