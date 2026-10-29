import type { ErrorCode } from '@samvaad/shared';

type EchoErrorReply = { type: 'error'; code: ErrorCode; message: string };

/**
 * Phase 0 only: the conversation socket echoes every JSON message back, which proves the
 * browser → API socket path end to end. Phase 1 replaces this with real message handlers.
 */
export function createEchoReply(messageText: string): string {
  try {
    JSON.parse(messageText);
    return messageText;
  } catch {
    const reply: EchoErrorReply = {
      type: 'error',
      code: 'INVALID_MESSAGE',
      message: 'Messages must be JSON.',
    };
    return JSON.stringify(reply);
  }
}
