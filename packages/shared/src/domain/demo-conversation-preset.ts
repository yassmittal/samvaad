import type { ConversationContext } from './conversation-context';

/**
 * The demo story (roadmap, settled 30 Oct): a Jaipur exporter speaking Hindi and a London
 * buyer speaking English agree an order. The web offers it as a preset and
 * `scripts/compare-translation-context.ts` translates its scripted conversation with it.
 */
export const DEMO_CONVERSATION_PRESET = {
  presetName: 'Blue pottery order',
  context: {
    setting:
      'Ramesh Kumawat, a blue pottery exporter in Jaipur, is agreeing an order with Siobhan ' +
      'Doyle of Doyle Home, a homeware shop in London. Prices are in Indian rupees, per piece ' +
      'unless they say per set.',
    glossaryTerms: [
      { term: 'blue pottery', preferredTranslation: 'ब्लू पॉटरी' },
      { term: 'Siobhan', preferredTranslation: 'शिवॉन' },
      { term: 'Kumawat', preferredTranslation: 'कुमावत' },
      { term: 'Doyle Home', preferredTranslation: 'डॉयल होम' },
      { term: 'large platter', preferredTranslation: 'बड़ी थाली' },
      { term: 'coaster set', preferredTranslation: 'कोस्टर सेट' },
    ],
  } satisfies ConversationContext,
};
