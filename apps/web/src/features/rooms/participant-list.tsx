'use client';

import { type RoomParticipant, SUPPORTED_LANGUAGE_BY_CODE } from '@samvaad/shared';

type ParticipantListProps = {
  participants: RoomParticipant[];
  /** This phone's participant, labelled "you". */
  participantId: string | null;
};

/** Who's here, their language, and whether their microphone is on. */
export function ParticipantList({ participants, participantId }: ParticipantListProps) {
  return (
    <ul className="flex flex-wrap gap-2">
      {participants.map((participant) => {
        const language = SUPPORTED_LANGUAGE_BY_CODE[participant.languageCode];
        const isThisPhone = participant.participantId === participantId;
        return (
          <li
            key={participant.participantId}
            className="flex items-center gap-2 rounded-full border border-stone-200 bg-white px-3 py-1 text-sm"
          >
            <span
              aria-hidden
              className={`size-2 rounded-full ${participant.isMicrophoneOpen ? 'bg-rose-500' : 'bg-stone-300'}`}
            />
            <span className="font-medium">
              {participant.participantName}
              {isThisPhone && <span className="font-normal text-stone-400"> (you)</span>}
            </span>
            <span className="text-stone-500">{language.nativeName}</span>
            <span className="sr-only">
              {participant.isMicrophoneOpen ? 'microphone on' : 'microphone off'}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
