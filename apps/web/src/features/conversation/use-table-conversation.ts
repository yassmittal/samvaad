'use client';

import type { LanguageCode } from '@samvaad/shared';
import { useCallback, useRef, useState } from 'react';
import { useConversation } from './use-conversation';

export type LanguagePair = [LanguageCode, LanguageCode];

const DEFAULT_LANGUAGE_PAIR: LanguagePair = ['hi', 'en'];

/** Table mode: one phone, two languages, captions and spoken translations (D-008). */
export function useTableConversation() {
  const [languagePair, setLanguagePair] = useState<LanguagePair>(DEFAULT_LANGUAGE_PAIR);
  const languagePairRef = useRef(languagePair);
  languagePairRef.current = languagePair;

  const { conversation, sendClientMessage, ...conversationControls } = useConversation({
    onSocketOpen(socketClient) {
      socketClient.sendClientMessage({
        type: 'start_table_session',
        languageCodes: languagePairRef.current,
      });
    },
  });

  const changeLanguagePair = useCallback(
    (nextLanguagePair: LanguagePair) => {
      setLanguagePair(nextLanguagePair);
      sendClientMessage({ type: 'start_table_session', languageCodes: nextLanguagePair });
    },
    [sendClientMessage],
  );

  return {
    ...conversationControls,
    captions: conversation.captions,
    latestError: conversation.latestError,
    languagePair,
    changeLanguagePair,
  };
}
