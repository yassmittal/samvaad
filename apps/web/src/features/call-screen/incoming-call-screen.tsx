'use client';

import {
  type LanguageCode,
  type RoomPreviewMessage,
  SUPPORTED_LANGUAGE_BY_CODE,
} from '@samvaad/shared';
import { useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useState } from 'react';
import {
  findRememberedRoomEntry,
  type RoomEntry,
  roomEntrySchema,
} from '../rooms/remembered-room-entry';
import { CallAvatar } from './call-avatar';
import { CallControlButton } from './call-control-button';
import { CallEntryFields } from './call-entry-fields';
import { PhoneDownIcon, PhoneIcon } from './call-icons';
import { CallScreenFrame } from './call-screen-frame';
import { pickDefaultLanguageCode } from './pick-default-language-code';

type IncomingCallScreenProps = {
  /** `null` until the API says who is in the room. */
  roomPreview: Pick<RoomPreviewMessage, 'participants'> | null;
  isConnected: boolean;
  /** Called inside the Answer tap, which also opens the microphone (D-022). */
  onAnswer: (roomEntry: RoomEntry) => void;
};

/** The link's first screen: who is calling, in what language, and a big Answer (D-022). */
export function IncomingCallScreen({
  roomPreview,
  isConnected,
  onAnswer,
}: IncomingCallScreenProps) {
  const router = useRouter();
  const caller = roomPreview?.participants[0] ?? null;
  const [participantName, setParticipantName] = useState('');
  const [languageCode, setLanguageCode] = useState<LanguageCode>('en');
  const [problemText, setProblemText] = useState<string | null>(null);
  const callerLanguageCode = caller?.languageCode ?? null;

  // localStorage and navigator only exist in the browser; the caller's language comes later.
  useEffect(() => {
    const rememberedRoomEntry = findRememberedRoomEntry();
    setParticipantName(rememberedRoomEntry?.participantName ?? '');
    setLanguageCode(
      pickDefaultLanguageCode({
        rememberedLanguageCode: rememberedRoomEntry?.languageCode ?? null,
        browserLanguageTags: navigator.languages,
        callerLanguageCode: callerLanguageCode ?? 'hi',
      }),
    );
  }, [callerLanguageCode]);

  function handleAnswer(event?: FormEvent<HTMLFormElement>): void {
    event?.preventDefault();
    const parseResult = roomEntrySchema.safeParse({ participantName, languageCode });
    if (!parseResult.success) {
      setProblemText(parseResult.error.issues[0]?.message ?? 'Check your name.');
      return;
    }
    setProblemText(null);
    onAnswer(parseResult.data);
  }

  return (
    <CallScreenFrame>
      <form onSubmit={handleAnswer} className="call-screen-enter flex flex-1 flex-col items-center">
        <div className="flex flex-col items-center gap-6 pt-10 text-center">
          <CallAvatar name={caller?.participantName ?? '?'} side="them" isRinging />
          <div className="space-y-1">
            <h1 className="text-3xl font-semibold tracking-tight">
              {caller ? `${caller.participantName} is calling` : 'Incoming call'}
            </h1>
            <p className="text-call-muted">
              {caller
                ? `Speaks ${SUPPORTED_LANGUAGE_BY_CODE[caller.languageCode].englishName} · you’ll hear it in yours`
                : 'Samvaad · live translated call'}
            </p>
          </div>
        </div>
        <div className="mt-10 w-full">
          <CallEntryFields
            participantName={participantName}
            languageCode={languageCode}
            onParticipantNameChange={setParticipantName}
            onLanguageCodeChange={setLanguageCode}
          />
        </div>
        <div className="mt-auto flex w-full flex-col items-center gap-4 pt-8">
          {problemText && (
            <p role="alert" className="text-sm text-call-end">
              {problemText}
            </p>
          )}
          {!isConnected && <p className="text-sm text-call-muted">Connecting…</p>}
          <div className="flex w-full max-w-xs justify-between">
            <CallControlButton
              label="Decline"
              tone="end"
              isLarge
              icon={<PhoneDownIcon className="size-7" />}
              onClick={() => router.push('/')}
            />
            <CallControlButton
              label="Answer"
              tone="answer"
              isLarge
              isDisabled={!isConnected}
              icon={<PhoneIcon className="size-7" />}
              onClick={() => handleAnswer()}
            />
          </div>
        </div>
      </form>
    </CallScreenFrame>
  );
}
