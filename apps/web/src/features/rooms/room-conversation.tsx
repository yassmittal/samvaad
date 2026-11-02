'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { CallScreenFrame } from '../call-screen/call-screen-frame';
import { CallSheet } from '../call-screen/call-sheet';
import { CallUnavailableScreen } from '../call-screen/call-unavailable-screen';
import { CallingScreen } from '../call-screen/calling-screen';
import { InCallScreen } from '../call-screen/in-call-screen';
import { IncomingCallScreen } from '../call-screen/incoming-call-screen';
import { playCallCue } from '../call-screen/play-call-cue';
import { StartCallScreen } from '../call-screen/start-call-screen';
import { useCallMicrophone } from '../call-screen/use-call-microphone';
import { CaptionList } from '../conversation/caption-list';
import { findConversationProblemText } from '../conversation/conversation-status';
import { useScreenWakeLock } from '../conversation/use-screen-wake-lock';
import { ConversationContextPanel } from '../conversation-context/conversation-context-panel';
import { isOfferingParticipant } from '../original-voice/is-offering-participant';
import { useOriginalVoice } from '../original-voice/use-original-voice';
import { RecapView } from '../recap/recap-view';
import { type RoomJoinFailureCode, useRoomConversation } from './use-room-conversation';

const JOIN_FAILURE_TEXT = {
  ROOM_NOT_FOUND: 'This call has ended, or the link is wrong. Calls close when everyone leaves.',
  ROOM_FULL: 'This call already has two people in it.',
} as const satisfies Record<RoomJoinFailureCode, string>;

type RoomConversation = ReturnType<typeof useRoomConversation>;
type OpenSheet = 'transcript' | 'context' | null;

/**
 * `/room/new` (start a call) and `/room/ABC123` (answer one): a room shown as a phone call
 * (D-018, D-022). Start or Answer, then the calling screen until both are in, then the call.
 */
export function RoomConversation({ requestedRoomCode }: { requestedRoomCode: string | null }) {
  const roomConversation = useRoomConversation({ requestedRoomCode });
  const { stage, socketStatus } = roomConversation;
  const isConnected = socketStatus === 'open';

  if (stage === 'in_room') {
    return <RoomCall roomConversation={roomConversation} />;
  }
  if (stage === 'unavailable' && roomConversation.joinFailureCode !== null) {
    return <CallUnavailableScreen text={JOIN_FAILURE_TEXT[roomConversation.joinFailureCode]} />;
  }
  if (stage === 'joining') {
    return (
      <CallScreenFrame>
        <p className="m-auto animate-pulse text-call-muted">
          {requestedRoomCode === null ? 'Starting the call…' : 'Connecting…'}
        </p>
      </CallScreenFrame>
    );
  }
  if (requestedRoomCode === null) {
    return <StartCallScreen isConnected={isConnected} onStart={roomConversation.enterRoom} />;
  }
  return (
    <IncomingCallScreen
      roomPreview={roomConversation.roomPreview}
      isConnected={isConnected}
      onAnswer={(roomEntry) => roomConversation.enterRoom(roomEntry, null)}
    />
  );
}

/** When the other person first connected, for the call timer, with a cue each time they do. */
function useCallStart(isInCall: boolean): number | null {
  const [callStartedAtEpochMilliseconds, setCallStartedAtEpochMilliseconds] = useState<
    number | null
  >(null);
  const wasInCallRef = useRef(false);

  useEffect(() => {
    if (isInCall === wasInCallRef.current) {
      return;
    }
    wasInCallRef.current = isInCall;
    playCallCue(isInCall ? 'connected' : 'ended');
    if (isInCall) {
      setCallStartedAtEpochMilliseconds((startedAt) => startedAt ?? Date.now());
    }
  }, [isInCall]);

  return callStartedAtEpochMilliseconds;
}

function RoomCall({ roomConversation }: { roomConversation: RoomConversation }) {
  const router = useRouter();
  const {
    room,
    participantId,
    participantName,
    languageCode,
    departedParticipantName,
    captions,
    latestError,
    conversationContext,
    contextUpdatedByParticipantName,
    recap,
    socketStatus,
    microphoneStatus,
    isSpeaking,
    hasVoiceForLanguage,
    repeatTranslation,
    updateConversationContext,
    endConversation,
    dismissRecap,
    leaveRoom,
    openMicrophoneCapture,
    setMicrophoneOn,
    findMicrophoneAnalyserNode,
    findMicrophoneStream,
    isSendingRealAudio,
    iceServers,
    sendClientMessage,
    subscribeToWebrtcSignals,
  } = roomConversation;
  const [openSheet, setOpenSheet] = useState<OpenSheet>(null);
  useScreenWakeLock();

  const otherParticipant =
    room?.participants.find((participant) => participant.participantId !== participantId) ?? null;
  const isInCall = otherParticipant?.isConnected === true;
  const callStartedAtEpochMilliseconds = useCallStart(isInCall);
  const originalVoice = useOriginalVoice({
    otherParticipantId:
      isInCall && socketStatus === 'open' && recap === null
        ? (otherParticipant?.participantId ?? null)
        : null,
    isOfferer: isOfferingParticipant(room?.participants ?? [], participantId),
    iceServers,
    microphoneStatus,
    findMicrophoneStream,
    isSendingRealAudio,
    isSpeakingTranslation: isSpeaking,
    sendSignal: sendClientMessage,
    subscribeToSignals: subscribeToWebrtcSignals,
  });
  const { isMuted, toggleMute } = useCallMicrophone({
    isInCall,
    isRecapOpen: recap !== null,
    socketStatus,
    microphoneStatus,
    openMicrophoneCapture,
    setMicrophoneOn,
  });

  if (room === null || languageCode === null || participantName === null) {
    return null;
  }
  const isConnected = socketStatus === 'open';
  const problemText = findConversationProblemText({ socketStatus, microphoneStatus, latestError });

  function leaveCall(): void {
    leaveRoom();
    router.push('/');
  }

  // Ending with something said takes both phones to the recap (D-016); with nothing said, just hang up.
  function endCall(): void {
    if (captions.some((caption) => caption.isFinal)) {
      endConversation();
      return;
    }
    leaveCall();
  }

  return (
    <>
      {otherParticipant === null ? (
        <CallingScreen
          roomCode={room.roomCode}
          participantName={participantName}
          languageCode={languageCode}
          departedParticipantName={departedParticipantName}
          problemText={problemText}
          onEnd={leaveCall}
        />
      ) : (
        <InCallScreen
          otherParticipantName={otherParticipant.participantName}
          otherLanguageCode={otherParticipant.languageCode}
          languageCode={languageCode}
          callStartedAtEpochMilliseconds={callStartedAtEpochMilliseconds ?? Date.now()}
          captions={captions}
          isSpeaking={isSpeaking}
          isReconnecting={!isConnected || !otherParticipant.isConnected}
          originalVoice={
            originalVoice.isConnected
              ? {
                  isOn: originalVoice.isOriginalVoiceOn,
                  isOtherPersonSpeaking: originalVoice.isOtherPersonSpeaking,
                  findAnalyserNode: originalVoice.findRemoteAnalyserNode,
                  onToggle: originalVoice.toggleOriginalVoice,
                }
              : null
          }
          isMuted={isMuted}
          hasVoice={hasVoiceForLanguage(languageCode)}
          problemText={
            problemText ??
            (otherParticipant.isConnected
              ? null
              : `${otherParticipant.participantName} lost the connection. Waiting for them…`)
          }
          findMicrophoneAnalyserNode={findMicrophoneAnalyserNode}
          onToggleMute={toggleMute}
          onOpenTranscript={() => setOpenSheet('transcript')}
          onOpenContext={() => setOpenSheet('context')}
          onEnd={endCall}
        />
      )}

      {recap !== null && (
        <CallSheet title="Call ended" onClose={dismissRecap}>
          <RecapView
            recap={recap}
            languageCodes={[languageCode]}
            isConnected={isConnected}
            onRetry={endConversation}
            onBack={() => {
              dismissRecap();
              // Inside the tap, so iOS lets the microphone start again (D-007).
              void openMicrophoneCapture();
            }}
            onExit={leaveRoom}
          />
        </CallSheet>
      )}
      {recap === null && openSheet === 'transcript' && (
        <CallSheet title="Transcript" onClose={() => setOpenSheet(null)}>
          <CaptionList
            captions={captions}
            listenerLanguageCode={languageCode}
            emptyStateText="Nothing said yet. Everything you both say appears here, in both languages."
            hasVoiceForLanguage={hasVoiceForLanguage}
            onRepeat={repeatTranslation}
          />
        </CallSheet>
      )}
      {recap === null && openSheet === 'context' && (
        <CallSheet title="Context" onClose={() => setOpenSheet(null)}>
          <ConversationContextPanel
            conversationContext={conversationContext}
            contextUpdatedByParticipantName={contextUpdatedByParticipantName}
            isSharedWithOthers
            isDisabled={!isConnected}
            onSave={updateConversationContext}
            onClose={() => setOpenSheet(null)}
          />
        </CallSheet>
      )}
    </>
  );
}
