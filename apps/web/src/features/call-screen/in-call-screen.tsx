'use client';

import { type LanguageCode, SUPPORTED_LANGUAGE_BY_CODE } from '@samvaad/shared';
import type { Caption } from '../conversation/conversation-reducer';
import { findPlaybackAudioOutput } from '../speech-output/playback-audio-output';
import { CallControlButton } from './call-control-button';
import {
  ContextIcon,
  MicrophoneIcon,
  MicrophoneOffIcon,
  PhoneDownIcon,
  SpeakerIcon,
  TranscriptIcon,
} from './call-icons';
import { CallLatencyChip } from './call-latency-chip';
import { CallOrb } from './call-orb';
import { CallScreenFrame } from './call-screen-frame';
import { CallTimer } from './call-timer';
import { type CallOrbState, findCallOrbState } from './find-call-orb-state';
import { LatestExchange } from './latest-exchange';

type InCallScreenProps = {
  otherParticipantName: string;
  otherLanguageCode: LanguageCode;
  languageCode: LanguageCode;
  callStartedAtEpochMilliseconds: number;
  captions: readonly Caption[];
  isSpeaking: boolean;
  isReconnecting: boolean;
  /** This phone's audio is reaching the API late (D-024). */
  isConnectionWeak: boolean;
  /** The real voice between the phones (D-023); `null` until it connects. */
  originalVoice: {
    isOn: boolean;
    isOtherPersonSpeaking: boolean;
    findAnalyserNode: () => AnalyserNode | null;
    onToggle: () => void;
  } | null;
  isMuted: boolean;
  hasVoice: boolean;
  problemText: string | null;
  findMicrophoneAnalyserNode: () => AnalyserNode | null;
  onToggleMute: () => void;
  onOpenTranscript: () => void;
  onOpenContext: () => void;
  onEnd: () => void;
};

function createStatusText(
  orbState: CallOrbState,
  otherParticipantName: string,
  isMuted: boolean,
): string {
  if (isMuted && orbState !== 'reconnecting') {
    return 'You’re muted';
  }
  switch (orbState) {
    case 'idle':
      return 'Speak now';
    case 'you_speaking':
      // Meta translates at the pause (D-005), so say when that is.
      return 'Listening… pause when you’re done';
    case 'translating_to_them':
      return `Translating for ${otherParticipantName}…`;
    case 'translating_to_you':
      return `Translating ${otherParticipantName}…`;
    case 'they_speaking':
      return `${otherParticipantName} is speaking…`;
    case 'their_translation_playing':
      // The mic is paused so the phone doesn't translate itself (D-019): say so, or a reply
      // started now seems to vanish.
      return `${otherParticipantName}, in your language · your mic is paused`;
    case 'reconnecting':
      return 'Reconnecting…';
  }
}

/** The call itself (D-022): who, how long, the orb, the newest words, and the call buttons. */
export function InCallScreen({
  otherParticipantName,
  otherLanguageCode,
  languageCode,
  callStartedAtEpochMilliseconds,
  captions,
  isSpeaking,
  isReconnecting,
  isConnectionWeak,
  originalVoice,
  isMuted,
  hasVoice,
  problemText,
  findMicrophoneAnalyserNode,
  onToggleMute,
  onOpenTranscript,
  onOpenContext,
  onEnd,
}: InCallScreenProps) {
  const orbState = findCallOrbState({
    captions,
    listenerLanguageCode: languageCode,
    isSpeaking,
    isOtherPersonSpeaking: originalVoice?.isOtherPersonSpeaking ?? false,
    isReconnecting,
  });
  // The orb follows whichever voice is being heard: yours while you speak, theirs as it plays.
  const findOrbAnalyserNode = () => {
    if (orbState === 'their_translation_playing') {
      return findPlaybackAudioOutput()?.analyserNode ?? null;
    }
    if (orbState === 'they_speaking') {
      return originalVoice?.findAnalyserNode() ?? null;
    }
    return orbState === 'you_speaking' && !isMuted ? findMicrophoneAnalyserNode() : null;
  };

  return (
    <CallScreenFrame>
      <div className="call-screen-enter flex flex-1 flex-col">
        <header className="relative flex flex-col items-center gap-1 text-center">
          <div className="absolute right-0 top-0">
            <CallLatencyChip captions={captions} />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{otherParticipantName}</h1>
          <p className="text-sm text-call-muted">
            <CallTimer startedAtEpochMilliseconds={callStartedAtEpochMilliseconds} /> ·{' '}
            {SUPPORTED_LANGUAGE_BY_CODE[otherLanguageCode].englishName} ⇄{' '}
            {SUPPORTED_LANGUAGE_BY_CODE[languageCode].englishName}
          </p>
        </header>

        <div className="flex flex-col items-center gap-3 pt-6">
          <CallOrb state={orbState} findAnalyserNode={findOrbAnalyserNode} className="w-40" />
          <p role="status" className="min-h-5 text-sm text-call-muted">
            {createStatusText(orbState, otherParticipantName, isMuted)}
          </p>
          {isConnectionWeak && !isReconnecting && (
            <p className="text-xs text-amber-300">
              Weak connection: {otherParticipantName} hears you late
            </p>
          )}
        </div>

        <div className="flex flex-1 flex-col py-6">
          <LatestExchange
            captions={captions}
            listenerLanguageCode={languageCode}
            otherParticipantName={otherParticipantName}
          />
        </div>

        {(problemText !== null || !hasVoice) && (
          <p role="alert" className="pb-4 text-center text-sm text-call-end">
            {problemText ?? 'This phone has no voice for your language: captions only.'}
          </p>
        )}

        <footer className="flex items-start justify-between">
          <CallControlButton
            label={isMuted ? 'Unmute' : 'Mute'}
            tone={isMuted ? 'active' : 'plain'}
            isPressed={isMuted}
            icon={isMuted ? <MicrophoneOffIcon /> : <MicrophoneIcon />}
            onClick={onToggleMute}
          />
          {originalVoice !== null && (
            <CallControlButton
              label="Their voice"
              tone={originalVoice.isOn ? 'active' : 'plain'}
              isPressed={originalVoice.isOn}
              icon={<SpeakerIcon />}
              onClick={originalVoice.onToggle}
            />
          )}
          <CallControlButton
            label="Transcript"
            icon={<TranscriptIcon />}
            onClick={onOpenTranscript}
          />
          <CallControlButton label="Context" icon={<ContextIcon />} onClick={onOpenContext} />
          <CallControlButton label="End" tone="end" icon={<PhoneDownIcon />} onClick={onEnd} />
        </footer>
      </div>
    </CallScreenFrame>
  );
}
