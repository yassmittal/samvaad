import { z } from 'zod';

/**
 * Muse Voice Transcribe's realtime events, as verified in Phase 0 (D-005). Field names are
 * Meta's (`audioProcessedMs`); the stream service converts them to ours at the boundary.
 */

export const metaHandshakeResponseSchema = z.object({ sessionId: z.string() });

export const metaTranscriptionEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('speechStart'), turnId: z.number(), audioProcessedMs: z.number() }),
  z.object({
    type: z.literal('transcript'),
    transcript: z.string(),
    final: z.boolean(),
    audioProcessedMs: z.number(),
  }),
  z.object({ type: z.literal('speechEnd'), turnId: z.number(), audioProcessedMs: z.number() }),
  z.object({
    type: z.literal('speechComplete'),
    turnId: z.number(),
    transcript: z.string(),
    audioProcessedMs: z.number(),
  }),
  z.object({ type: z.literal('error'), message: z.string(), errorCode: z.string().optional() }),
]);

export type MetaTranscriptionEvent = z.infer<typeof metaTranscriptionEventSchema>;

/**
 * Returns `null` for event types we don't use (`audioProgress`, `speaker`, anything new):
 * Meta says to ignore unknown types. Throws for text that isn't JSON or a known event that
 * doesn't match its schema, because that means the protocol changed under us.
 */
export function parseMetaTranscriptionEvent(eventText: string): MetaTranscriptionEvent | null {
  const event: unknown = JSON.parse(eventText);
  const knownTypes = metaTranscriptionEventSchema.options.map((option) => option.shape.type.value);
  const isKnownType =
    typeof event === 'object' &&
    event !== null &&
    'type' in event &&
    knownTypes.some((knownType) => knownType === event.type);

  return isKnownType ? metaTranscriptionEventSchema.parse(event) : null;
}
