'use client';

import { type LanguageCode, MAXIMUM_PARTICIPANT_NAME_LENGTH } from '@samvaad/shared';
import { type FormEvent, useEffect, useState } from 'react';
import { LanguageSelect } from '../conversation/language-select';
import { findRememberedRoomEntry, type RoomEntry, roomEntrySchema } from './remembered-room-entry';

// The demo story: a Hindi speaker opens the room and an English speaker joins it (roadmap).
const DEFAULT_CREATOR_LANGUAGE_CODE: LanguageCode = 'hi';
const DEFAULT_JOINER_LANGUAGE_CODE: LanguageCode = 'en';

type RoomEntryFormProps = {
  /** `null` when creating a room. */
  roomCode: string | null;
  isConnected: boolean;
  onSubmit: (roomEntry: RoomEntry) => void;
};

/** Name and language, before creating or joining a room. */
export function RoomEntryForm({ roomCode, isConnected, onSubmit }: RoomEntryFormProps) {
  const [participantName, setParticipantName] = useState('');
  const [languageCode, setLanguageCode] = useState<LanguageCode>(
    roomCode === null ? DEFAULT_CREATOR_LANGUAGE_CODE : DEFAULT_JOINER_LANGUAGE_CODE,
  );
  const [problemText, setProblemText] = useState<string | null>(null);

  // localStorage only exists in the browser, so read it after the first render.
  useEffect(() => {
    const rememberedRoomEntry = findRememberedRoomEntry();
    if (rememberedRoomEntry) {
      setParticipantName(rememberedRoomEntry.participantName);
      setLanguageCode(rememberedRoomEntry.languageCode);
    }
  }, []);

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const parseResult = roomEntrySchema.safeParse({ participantName, languageCode });
    if (!parseResult.success) {
      setProblemText(parseResult.error.issues[0]?.message ?? 'Check your name.');
      return;
    }
    setProblemText(null);
    onSubmit(parseResult.data);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-wide text-stone-500">
          Your name
        </span>
        <input
          value={participantName}
          onChange={(event) => setParticipantName(event.target.value)}
          maxLength={MAXIMUM_PARTICIPANT_NAME_LENGTH}
          autoComplete="given-name"
          placeholder="Shown to the other person"
          className="rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-base"
        />
      </label>
      <LanguageSelect
        label="The language you speak and want to hear"
        languageCode={languageCode}
        isDisabled={false}
        onChange={setLanguageCode}
      />
      <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
        <strong className="font-medium">Earbuds recommended.</strong> You hear the translation in
        your own ear, and your phone doesn’t hear itself. Without them, take turns: the microphone
        pauses while your phone speaks.
      </p>
      {problemText && (
        <p role="alert" className="text-sm text-rose-600">
          {problemText}
        </p>
      )}
      <button
        type="submit"
        disabled={!isConnected}
        className="rounded-2xl bg-stone-900 px-5 py-3 text-lg font-medium text-white shadow-sm transition hover:bg-stone-700 disabled:opacity-40"
      >
        {roomCode === null ? 'Create the room' : `Join room ${roomCode}`}
      </button>
      {!isConnected && (
        <p className="text-center text-sm text-stone-500">Connecting to the server…</p>
      )}
    </form>
  );
}
