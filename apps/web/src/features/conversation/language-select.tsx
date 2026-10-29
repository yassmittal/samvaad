'use client';

import { type LanguageCode, SUPPORTED_LANGUAGES } from '@samvaad/shared';

type LanguageSelectProps = {
  label: string;
  languageCode: LanguageCode;
  /** Left out of the list, such as the other language of a table's pair. */
  excludedLanguageCode?: LanguageCode;
  isDisabled: boolean;
  onChange: (languageCode: LanguageCode) => void;
};

export function LanguageSelect({
  label,
  languageCode,
  excludedLanguageCode,
  isDisabled,
  onChange,
}: LanguageSelectProps) {
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
