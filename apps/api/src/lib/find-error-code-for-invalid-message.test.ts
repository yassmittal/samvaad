import { describe, expect, test } from 'bun:test';
import { clientMessageSchema } from '@samvaad/shared';
import { findErrorCodeForInvalidMessage } from './find-error-code-for-invalid-message';

function findErrorCodeFor(message: unknown) {
  const parseResult = clientMessageSchema.safeParse(message);
  if (parseResult.success) {
    throw new Error('Expected the message to be invalid.');
  }
  return findErrorCodeForInvalidMessage(parseResult.error);
}

describe('findErrorCodeForInvalidMessage', () => {
  test('an unsupported language is UNSUPPORTED_LANGUAGE', () => {
    expect(findErrorCodeFor({ type: 'start_table_session', languageCodes: ['hi', 'xx'] })).toBe(
      'UNSUPPORTED_LANGUAGE',
    );
  });

  test('an unsupported room language is UNSUPPORTED_LANGUAGE too', () => {
    expect(
      findErrorCodeFor({ type: 'create_room', participantName: 'Yash', languageCode: 'xx' }),
    ).toBe('UNSUPPORTED_LANGUAGE');
  });

  test('the same language twice is INVALID_MESSAGE', () => {
    expect(findErrorCodeFor({ type: 'start_table_session', languageCodes: ['hi', 'hi'] })).toBe(
      'INVALID_MESSAGE',
    );
  });

  test('anything else is INVALID_MESSAGE', () => {
    expect(findErrorCodeFor({ type: 'microphone_state' })).toBe('INVALID_MESSAGE');
  });
});
