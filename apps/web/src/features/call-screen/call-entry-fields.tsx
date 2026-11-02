'use client';

import {
  type LanguageCode,
  MAXIMUM_PARTICIPANT_NAME_LENGTH,
  SUPPORTED_LANGUAGES,
} from '@samvaad/shared';

type CallEntryFieldsProps = {
  participantName: string;
  languageCode: LanguageCode;
  onParticipantNameChange: (participantName: string) => void;
  onLanguageCodeChange: (languageCode: LanguageCode) => void;
};

/** Your name and your language, on the dark start and answer screens (D-022). */
export function CallEntryFields({
  participantName,
  languageCode,
  onParticipantNameChange,
  onLanguageCodeChange,
}: CallEntryFieldsProps) {
  return (
    <div className="flex w-full max-w-sm flex-col gap-3">
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium uppercase tracking-wider text-call-muted">
          Your name
        </span>
        <input
          value={participantName}
          onChange={(event) => onParticipantNameChange(event.target.value)}
          maxLength={MAXIMUM_PARTICIPANT_NAME_LENGTH}
          autoComplete="given-name"
          placeholder="So they know who it is"
          className="rounded-2xl border border-white/10 bg-call-surface px-4 py-3 text-base text-call-text placeholder:text-call-muted/70 focus:border-white/30 focus:outline-none"
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium uppercase tracking-wider text-call-muted">
          You speak and hear
        </span>
        <select
          value={languageCode}
          onChange={(event) => onLanguageCodeChange(event.target.value as LanguageCode)}
          className="rounded-2xl border border-white/10 bg-call-surface px-4 py-3 text-base text-call-text focus:border-white/30 focus:outline-none"
        >
          {SUPPORTED_LANGUAGES.map((language) => (
            <option key={language.languageCode} value={language.languageCode}>
              {language.nativeName === language.englishName
                ? language.englishName
                : `${language.nativeName} · ${language.englishName}`}
            </option>
          ))}
        </select>
        {/* The transcriber already listens for English mixed in (D-015, D-016). */}
        <span className="text-xs text-call-muted">Mixing in English is fine.</span>
      </label>
    </div>
  );
}
