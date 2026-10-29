const DATA_FIELD_PREFIX = 'data:';

export type ServerSentEventsParseResult = {
  /** The payload of every complete `data:` line, in order. */
  dataPayloads: string[];
  /** A trailing partial line, to prepend to the next network chunk. */
  remainingText: string;
};

/** Splits streamed text into `data:` payloads. Network chunks can end mid-line. */
export function parseServerSentEvents(bufferedText: string): ServerSentEventsParseResult {
  const lines = bufferedText.split(/\r?\n/);
  const remainingText = lines.pop() ?? '';
  const dataPayloads = lines
    .filter((line) => line.startsWith(DATA_FIELD_PREFIX))
    .map((line) => line.slice(DATA_FIELD_PREFIX.length).trimStart());

  return { dataPayloads, remainingText };
}
