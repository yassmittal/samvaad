import { clientMessageSchema } from '@samvaad/shared';
import { findErrorCodeForInvalidMessage } from '../lib/find-error-code-for-invalid-message';
import type { ConversationConnection } from './conversation-connection';
import { handleMicrophoneState } from './handle-microphone-state';
import { handlePlaybackStarted } from './handle-playback-started';
import { handleStartTableSession } from './handle-start-table-session';

/** Parses one JSON text frame with the shared schema and hands it to its handler. */
export function handleClientMessage(connection: ConversationConnection, messageText: string): void {
  let unparsedMessage: unknown;
  try {
    unparsedMessage = JSON.parse(messageText);
  } catch {
    connection.sendServerMessage({
      type: 'error',
      code: 'INVALID_MESSAGE',
      message: 'Messages must be JSON.',
    });
    return;
  }

  const parseResult = clientMessageSchema.safeParse(unparsedMessage);
  if (!parseResult.success) {
    connection.logger.warn({ issues: parseResult.error.issues }, 'invalid client message');
    connection.sendServerMessage({
      type: 'error',
      code: findErrorCodeForInvalidMessage(parseResult.error),
      message: parseResult.error.issues.map((issue) => issue.message).join(' '),
    });
    return;
  }

  const message = parseResult.data;
  switch (message.type) {
    case 'start_table_session':
      handleStartTableSession(connection, message);
      return;
    case 'microphone_state':
      handleMicrophoneState(connection, message);
      return;
    case 'playback_started':
      handlePlaybackStarted(connection, message);
      return;
  }
}
