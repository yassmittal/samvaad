'use client';

import type { ErrorCode } from '@samvaad/shared';
import type { ConversationSocketStatus } from '@/lib/conversation-socket/conversation-socket-client';
import type { MicrophoneStatus } from '../microphone/use-microphone';

type ConversationStatusProps = {
  socketStatus: ConversationSocketStatus;
  microphoneStatus: MicrophoneStatus;
  latestError: { code: ErrorCode; message: string } | null;
};

const ERROR_EXPLANATION: Partial<Record<ErrorCode, string>> = {
  UPSTREAM_UNAVAILABLE: "Meta's speech recognition is unavailable. Try the microphone again.",
  UNSUPPORTED_LANGUAGE: 'That language is not supported yet.',
};

function findStatusText({
  socketStatus,
  microphoneStatus,
  latestError,
}: ConversationStatusProps): { text: string; isProblem: boolean } | null {
  if (socketStatus === 'connecting') {
    return { text: 'Connecting…', isProblem: false };
  }
  if (socketStatus === 'reconnecting') {
    return { text: 'Connection lost. Reconnecting…', isProblem: true };
  }
  if (socketStatus === 'closed') {
    return { text: "Can't reach the server. Check your connection.", isProblem: true };
  }
  if (microphoneStatus === 'permission-denied') {
    return {
      text: 'Microphone access is blocked. Allow it in the browser’s site settings, then try again.',
      isProblem: true,
    };
  }
  if (microphoneStatus === 'unavailable') {
    return {
      text: 'No microphone available. On a phone, open the app over https.',
      isProblem: true,
    };
  }
  if (latestError) {
    return { text: ERROR_EXPLANATION[latestError.code] ?? latestError.message, isProblem: true };
  }
  if (microphoneStatus === 'open') {
    return { text: 'Listening…', isProblem: false };
  }
  return null;
}

export function ConversationStatus(props: ConversationStatusProps) {
  const status = findStatusText(props);
  if (!status) {
    return <p className="h-5" />;
  }
  return (
    <p
      role={status.isProblem ? 'alert' : 'status'}
      className={`min-h-5 text-center text-sm ${status.isProblem ? 'text-rose-600' : 'text-stone-500'}`}
    >
      {status.text}
    </p>
  );
}
