import type { LanguageCode } from '../../packages/shared/src';

export type ScriptedUtterance = {
  speakerName: string;
  languageCode: LanguageCode;
  /** As Muse Voice Transcribe writes it: Hinglish in Devanagari, English in Latin (D-005). */
  transcript: string;
  /** What a reader should check in the two translations. */
  whatToLookFor: string;
};

/**
 * The demo story (phase 5 spec, `DEMO_CONVERSATION_PRESET`) as ten transcripts. Each line
 * tests something only context can fix: a mis-transcribed product name, an unusual name
 * spelled from Devanagari, a price said as bare numbers, and a pronoun three utterances away.
 */
export const DEMO_CONVERSATION: readonly ScriptedUtterance[] = [
  {
    speakerName: 'Ramesh',
    languageCode: 'hi',
    // "ब्लू पाचरी" is how the transcriber actually wrote "blue pottery" once (D-015).
    transcript: 'नमस्ते शिवॉन जी, मैं जयपुर से रमेश कुमावत बोल रहा हूँ। हमारी ब्लू पाचरी की नई रेंज तैयार है।',
    whatToLookFor: '"Siobhan" (not "Shivon") and "blue pottery" (the transcriber wrote "ब्लू पाचरी")',
  },
  {
    speakerName: 'Siobhan',
    languageCode: 'en',
    transcript:
      "Lovely to meet you, Ramesh. I'm most interested in the large serving platter from your catalogue.",
    whatToLookFor: '"large platter" as "बड़ी थाली"',
  },
  {
    speakerName: 'Ramesh',
    languageCode: 'hi',
    transcript: 'जी, बड़ी थाली हमारा सबसे ज़्यादा बिकने वाला पीस है, साढ़े चार सौ रुपये पर पीस।',
    whatToLookFor: '₹450 per piece',
  },
  {
    speakerName: 'Siobhan',
    languageCode: 'en',
    // A price said as bare numbers; how Meta writes it is unverified, so this is a plausible form.
    transcript: 'Could you do four twenty-five if I take three hundred?',
    whatToLookFor: '₹425 a piece for 300 platters, not a time of day',
  },
  {
    speakerName: 'Ramesh',
    languageCode: 'hi',
    transcript: 'तीन सौ पर चार सौ चालीस कर दूँगा, इससे कम नहीं हो पाएगा।',
    whatToLookFor: '₹440 a piece for 300',
  },
  {
    speakerName: 'Siobhan',
    languageCode: 'en',
    transcript: "Fine, four forty it is. I'd also like fifty coaster sets.",
    whatToLookFor: '₹440, and "coaster set" as "कोस्टर सेट"',
  },
  {
    speakerName: 'Ramesh',
    languageCode: 'hi',
    transcript: 'ठीक है। वो पंद्रह दिसंबर तक पैक होकर निकल जाएगी।',
    whatToLookFor:
      '"वो … जाएगी" is the platter order from three utterances back: "it/the order will ship", not "she"',
  },
  {
    speakerName: 'Siobhan',
    languageCode: 'en',
    transcript:
      "Perfect. Please send the invoice to Siobhan Doyle at Doyle Home, and I'll pay thirty percent upfront.",
    whatToLookFor: '"शिवॉन", "डॉयल होम", 30% upfront',
  },
  {
    speakerName: 'Ramesh',
    languageCode: 'hi',
    transcript: 'ज़रूर शिवॉन जी, बाकी सत्तर प्रतिशत डिलीवरी पर दे दीजिएगा।',
    whatToLookFor: '"Siobhan", the remaining 70% on delivery',
  },
  {
    speakerName: 'Siobhan',
    languageCode: 'en',
    transcript: 'Agreed. One last thing: is the blue pottery glaze food safe?',
    whatToLookFor: '"ब्लू पॉटरी" (not "नीले मिट्टी के बर्तन"); an open question for the recap',
  },
];
