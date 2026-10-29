import { describe, expect, test } from 'bun:test';
import { clientMessageSchema } from './client-messages';

describe('clientMessageSchema', () => {
  test('accepts a table session with two different supported languages', () => {
    const result = clientMessageSchema.safeParse({
      type: 'start_table_session',
      languageCodes: ['hi', 'en'],
    });

    expect(result.success).toBe(true);
  });

  test('rejects a table session with the same language twice', () => {
    const result = clientMessageSchema.safeParse({
      type: 'start_table_session',
      languageCodes: ['hi', 'hi'],
    });

    expect(result.success).toBe(false);
  });

  test('rejects an unsupported language', () => {
    const result = clientMessageSchema.safeParse({
      type: 'start_table_session',
      languageCodes: ['hi', 'xx'],
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['languageCodes', 1]);
  });

  test('accepts a microphone state', () => {
    expect(clientMessageSchema.safeParse({ type: 'microphone_state', isOpen: true }).success).toBe(
      true,
    );
  });

  test('rejects an unknown message type', () => {
    expect(clientMessageSchema.safeParse({ type: 'dance' }).success).toBe(false);
  });
});
