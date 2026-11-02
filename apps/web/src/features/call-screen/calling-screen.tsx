'use client';

import { type LanguageCode, SUPPORTED_LANGUAGE_BY_CODE } from '@samvaad/shared';
import { CallAvatar } from './call-avatar';
import { CallControlButton } from './call-control-button';
import { PhoneDownIcon } from './call-icons';
import { CallScreenFrame } from './call-screen-frame';
import { ShareCallInvite } from './share-call-invite';

type CallingScreenProps = {
  roomCode: string;
  participantName: string;
  languageCode: LanguageCode;
  /** Who was here and left, so the screen says they can come back. */
  departedParticipantName: string | null;
  problemText: string | null;
  onEnd: () => void;
};

/** Waiting for the other person to answer, with the ways to send them the call (D-022). */
export function CallingScreen({
  roomCode,
  participantName,
  languageCode,
  departedParticipantName,
  problemText,
  onEnd,
}: CallingScreenProps) {
  const language = SUPPORTED_LANGUAGE_BY_CODE[languageCode];
  return (
    <CallScreenFrame>
      <div className="call-screen-enter flex flex-1 flex-col items-center">
        <div className="flex flex-col items-center gap-6 pt-8 text-center">
          <CallAvatar name={participantName} side="you" isRinging />
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight">
              {departedParticipantName ? `${departedParticipantName} left` : 'Calling…'}
            </h1>
            <p className="mx-auto max-w-xs text-call-muted">
              {departedParticipantName
                ? 'They can come back with the same link.'
                : `Send the link. When they answer, you’ll speak and hear ${language.englishName}.`}
            </p>
          </div>
        </div>
        <div className="mt-10 w-full">
          <ShareCallInvite roomCode={roomCode} callerName={participantName} />
        </div>
        <div className="mt-auto flex flex-col items-center gap-4 pt-8">
          {problemText && (
            <p role="alert" className="text-center text-sm text-call-end">
              {problemText}
            </p>
          )}
          <CallControlButton
            label="End"
            tone="end"
            isLarge
            icon={<PhoneDownIcon className="size-7" />}
            onClick={onEnd}
          />
        </div>
      </div>
    </CallScreenFrame>
  );
}
