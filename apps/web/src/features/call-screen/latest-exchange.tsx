'use client';

import { type LanguageCode, SUPPORTED_LANGUAGE_BY_CODE } from '@samvaad/shared';
import type { Caption } from '../conversation/conversation-reducer';
import { AnimatedWords } from './animated-words';
import { ReceiptTicks } from './receipt-ticks';

type LatestExchangeProps = {
  captions: readonly Caption[];
  listenerLanguageCode: LanguageCode;
  otherParticipantName: string;
};

/** The newest caption that matches (ES2022 has no `findLast`). */
function findLastCaption(
  captions: readonly Caption[],
  isMatch: (caption: Caption) => boolean,
): Caption | undefined {
  for (let captionIndex = captions.length - 1; captionIndex >= 0; captionIndex -= 1) {
    const caption = captions[captionIndex];
    if (caption !== undefined && isMatch(caption)) {
      return caption;
    }
  }
  return undefined;
}

/** The other person's newest words, large, in your language, with what they actually said. */
function TheirLatestWords({
  caption,
  listenerLanguageCode,
  otherParticipantName,
}: {
  caption: Caption;
  listenerLanguageCode: LanguageCode;
  otherParticipantName: string;
}) {
  if (caption.hasTranslationFailed) {
    return (
      <p className="max-w-xs text-center text-xl text-call-muted">
        That couldn’t be translated. Ask {otherParticipantName} to say it again.
      </p>
    );
  }
  // Same language: there is nothing to translate, the transcript is what they said (D-015).
  const isSameLanguage = caption.languageCode === listenerLanguageCode;
  const shownText = isSameLanguage ? caption.text : (caption.translation?.text ?? '');
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <p
        lang={listenerLanguageCode}
        className="min-h-[2lh] text-balance text-[1.75rem] font-medium leading-tight sm:text-3xl"
      >
        {shownText.length > 0 ? (
          <AnimatedWords text={shownText} />
        ) : (
          <span className="animate-pulse text-call-muted">…</span>
        )}
      </p>
      {!isSameLanguage && (
        <p
          lang={caption.languageCode ?? undefined}
          className="max-w-prose text-[0.95rem] leading-snug text-call-muted"
        >
          {caption.text}
        </p>
      )}
    </div>
  );
}

/**
 * The middle of the call screen (D-022): what the other person just said, translated, and
 * your own last sentence with its receipt, so you know it got through.
 */
export function LatestExchange({
  captions,
  listenerLanguageCode,
  otherParticipantName,
}: LatestExchangeProps) {
  const theirLatestCaption = findLastCaption(
    captions,
    (caption) => !caption.isOwnUtterance && caption.isFinal,
  );
  const yourLatestCaption = findLastCaption(captions, (caption) => caption.isOwnUtterance);
  const listenerLanguage = SUPPORTED_LANGUAGE_BY_CODE[listenerLanguageCode];

  return (
    <div className="flex w-full flex-1 flex-col justify-between gap-6">
      <div className="flex flex-1 items-center justify-center">
        {theirLatestCaption ? (
          <TheirLatestWords
            key={theirLatestCaption.utteranceId}
            caption={theirLatestCaption}
            listenerLanguageCode={listenerLanguageCode}
            otherParticipantName={otherParticipantName}
          />
        ) : (
          <p className="max-w-xs text-center text-lg text-call-muted">
            Say hello in {listenerLanguage.englishName}. {otherParticipantName} hears you in their
            language.
          </p>
        )}
      </div>
      {yourLatestCaption && (
        <div
          key={yourLatestCaption.utteranceId}
          className="call-screen-enter flex flex-col items-center gap-1 text-center"
        >
          <p
            lang={listenerLanguageCode}
            className={`max-w-prose text-base leading-snug ${yourLatestCaption.isFinal ? 'text-call-text/80' : 'text-call-you'}`}
          >
            {yourLatestCaption.text}
          </p>
          {yourLatestCaption.hasTranslationFailed ? (
            <span className="text-xs text-call-end">Not translated. Say it again.</span>
          ) : (
            <ReceiptTicks receipt={yourLatestCaption.receipt} />
          )}
        </div>
      )}
    </div>
  );
}
