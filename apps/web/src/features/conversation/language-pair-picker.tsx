'use client';

import { type LanguageCode, SUPPORTED_LANGUAGES } from '@samvaad/shared';
import type { LanguagePair } from './use-table-conversation';

type LanguagePairPickerProps = {
  languagePair: LanguagePair;
  isDisabled: boolean;
  onChange: (languagePair: LanguagePair) => void;
};

function LanguageSelect({
  label,
  languageCode,
  excludedLanguageCode,
  isDisabled,
  onChange,
}: {
  label: string;
  languageCode: LanguageCode;
  excludedLanguageCode: LanguageCode;
  isDisabled: boolean;
  onChange: (languageCode: LanguageCode) => void;
}) {
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-1">
      <span className="text-xs font-medium uppercase tracking-wide text-stone-500">{label}</span>
      <select
        value={languageCode}
        disabled={isDisabled}
        onChange={(event) => onChange(event.target.value as LanguageCode)}
        className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-base disabled:opacity-50"
      >
        {SUPPORTED_LANGUAGES.filter(
          (language) => language.languageCode !== excludedLanguageCode,
        ).map((language) => (
          <option key={language.languageCode} value={language.languageCode}>
            {language.nativeName === language.englishName
              ? language.englishName
              : `${language.nativeName} · ${language.englishName}`}
          </option>
        ))}
      </select>
    </label>
  );
}

export function LanguagePairPicker({
  languagePair,
  isDisabled,
  onChange,
}: LanguagePairPickerProps) {
  const [firstLanguageCode, secondLanguageCode] = languagePair;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-end gap-2">
        <LanguageSelect
          label="First language"
          languageCode={firstLanguageCode}
          excludedLanguageCode={secondLanguageCode}
          isDisabled={isDisabled}
          onChange={(languageCode) => onChange([languageCode, secondLanguageCode])}
        />
        <button
          type="button"
          aria-label="Swap languages"
          disabled={isDisabled}
          onClick={() => onChange([secondLanguageCode, firstLanguageCode])}
          className="mb-1 rounded-full p-2 text-stone-500 hover:bg-stone-200 disabled:opacity-40"
        >
          ⇄
        </button>
        <LanguageSelect
          label="Second language"
          languageCode={secondLanguageCode}
          excludedLanguageCode={firstLanguageCode}
          isDisabled={isDisabled}
          onChange={(languageCode) => onChange([firstLanguageCode, languageCode])}
        />
      </div>
      <p className="text-xs text-stone-500">
        The two languages spoken at this table, in any order. Mixing them in one sentence, like
        Hinglish, works too. Speech in any other language is written as one of these two.
      </p>
    </div>
  );
}
