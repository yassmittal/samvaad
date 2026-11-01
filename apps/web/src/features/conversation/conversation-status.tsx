'use client';

import type { ErrorCode } from '@samvaad/shared';
import type { ConversationSocketStatus } from '@/lib/conversation-socket/conversation-socket-client';
import type { MicrophoneStatus } from '../microphone/use-microphone';

type ConversationStatusProps = {
  socketStatus: ConversationSocketStatus;
  microphoneStatus: MicrophoneStatus;
  isSpeaking: boolean;
  /** A translation this phone will hear hasn't arrived yet. */
  isTranslating: boolean;
  latestError: { code: ErrorCode; message: string } | null;
};

/**
 * What went wrong and what to do next, for every code (D-017): a new code doesn't compile
 * without its sentence.
 */
const ERROR_EXPLANATION: Record<ErrorCode, string> = {
  INVALID_MESSAGE: 'Something went wrong between this phone and the server. Reload the page.',
  UNSUPPORTED_LANGUAGE: 'That language isn’t supported yet. Pick another one.',
  MICROPHONE_NOT_OPEN: 'The microphone was off, so that audio was ignored. Tap it to talk.',
  UPSTREAM_UNAVAILABLE:
    'Meta’s speech recognition is unavailable right now. Tap the microphone to try again.',
  ROOM_NOT_FOUND: 'This room has closed. Start a new one from the home page.',
  ROOM_FULL: 'This room already has two people in it.',
  RECAP_UNAVAILABLE: 'The recap couldn’t be written. Try End & recap again.',
  ROOM_TIME_LIMIT_REACHED:
    'This conversation reached its time limit, so the microphones are off. End & recap, or start a new one.',
  INTERNAL_ERROR: 'Something went wrong on the server. Try again, or reload the page.',
};

type StatusTone = 'problem' | 'quiet' | 'listening' | 'translating' | 'speaking';

const TONE_CLASS_NAME: Record<StatusTone, string> = {
  problem: 'text-rose-600 dark:text-rose-400',
  quiet: 'text-stone-500',
  listening: 'text-stone-700',
  translating: 'text-stone-700',
  speaking: 'text-stone-700',
};

// The same colours as the microphone button: red while listening, indigo while speaking.
const TONE_DOT_CLASS_NAME: Partial<Record<StatusTone, string>> = {
  listening: 'bg-rose-500 animate-pulse',
  translating: 'bg-amber-500 animate-pulse',
  speaking: 'bg-indigo-500 animate-pulse',
};

function findStatus({
  socketStatus,
  microphoneStatus,
  isSpeaking,
  isTranslating,
  latestError,
}: ConversationStatusProps): { text: string; tone: StatusTone } | null {
  if (socketStatus === 'connecting') {
    return { text: 'Connecting…', tone: 'quiet' };
  }
  if (socketStatus === 'reconnecting') {
    return { text: 'Connection lost. Reconnecting…', tone: 'problem' };
  }
  if (socketStatus === 'closed') {
    return {
      text: 'Can’t reach the server. Check your connection, then tap Try again.',
      tone: 'problem',
    };
  }
  if (socketStatus === 'replaced') {
    return {
      text: 'This room is open in another tab or on another phone. Tap Try again to use it here.',
      tone: 'problem',
    };
  }
  if (microphoneStatus === 'permission-denied') {
    return {
      text: 'Microphone access is blocked. Allow it in the browser’s site settings, then try again.',
      tone: 'problem',
    };
  }
  if (microphoneStatus === 'unavailable') {
    return {
      text: 'No microphone available. On a phone, open the app over https.',
      tone: 'problem',
    };
  }
  if (latestError) {
    return { text: ERROR_EXPLANATION[latestError.code], tone: 'problem' };
  }
  if (isSpeaking) {
    return {
      text: microphoneStatus === 'open' ? 'Speaking… (microphone paused)' : 'Speaking…',
      tone: 'speaking',
    };
  }
  if (isTranslating) {
    return { text: 'Translating…', tone: 'translating' };
  }
  if (microphoneStatus === 'open') {
    return { text: 'Listening…', tone: 'listening' };
  }
  return null;
}

export function ConversationStatus(props: ConversationStatusProps) {
  const status = findStatus(props);
  if (!status) {
    return <p className="min-h-6" />;
  }
  const dotClassName = TONE_DOT_CLASS_NAME[status.tone];
  return (
    <p
      role={status.tone === 'problem' ? 'alert' : 'status'}
      className={`flex min-h-6 items-center justify-center gap-2 text-center text-base ${TONE_CLASS_NAME[status.tone]}`}
    >
      {dotClassName && (
        <span aria-hidden className={`size-2.5 shrink-0 rounded-full ${dotClassName}`} />
      )}
      {status.text}
    </p>
  );
}
