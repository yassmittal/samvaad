'use client';

import {
  type ConversationContext,
  EMPTY_CONVERSATION_CONTEXT,
  isConversationContextEmpty,
  type LanguageCode,
} from '@samvaad/shared';
import { useCallback, useRef, useState } from 'react';
import { useConversation } from './use-conversation';

export type LanguagePair = [LanguageCode, LanguageCode];

const DEFAULT_LANGUAGE_PAIR: LanguagePair = ['hi', 'en'];

/** Table mode: one phone, two languages, captions and spoken translations (D-008). */
export function useTableConversation() {
  const [languagePair, setLanguagePair] = useState<LanguagePair>(DEFAULT_LANGUAGE_PAIR);
  const languagePairRef = useRef(languagePair);
  languagePairRef.current = languagePair;
  const conversationContextRef = useRef<ConversationContext>(EMPTY_CONVERSATION_CONTEXT);

  const { conversation, sendClientMessage, ...conversationControls } = useConversation({
    onSocketOpen(socketClient) {
      socketClient.sendClientMessage({
        type: 'start_table_session',
        languageCodes: languagePairRef.current,
      });
      // A reconnect starts a new table session, which has no context yet (D-016).
      const conversationContext = conversationContextRef.current;
      if (!isConversationContextEmpty(conversationContext)) {
        socketClient.sendClientMessage({
          type: 'update_conversation_context',
          ...conversationContext,
        });
      }
    },
  });
  conversationContextRef.current = conversation.conversationContext;

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
    conversationContext: conversation.conversationContext,
    recap: conversation.recap,
    languagePair,
    changeLanguagePair,
  };
}
