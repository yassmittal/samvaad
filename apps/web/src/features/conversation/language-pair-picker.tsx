'use client';

import { LanguageSelect } from './language-select';
import type { LanguagePair } from './use-table-conversation';

type LanguagePairPickerProps = {
  languagePair: LanguagePair;
  isDisabled: boolean;
  onChange: (languagePair: LanguagePair) => void;
};

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
