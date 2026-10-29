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

  test('accepts create_room and trims the name', () => {
    const result = clientMessageSchema.safeParse({
      type: 'create_room',
      participantName: '  Yash ',
      languageCode: 'hi',
    });

    expect(result.data).toEqual({
      type: 'create_room',
      participantName: 'Yash',
      languageCode: 'hi',
    });
  });

  test('rejects create_room with an empty name', () => {
    expect(
      clientMessageSchema.safeParse({
        type: 'create_room',
        participantName: '  ',
        languageCode: 'hi',
      }).success,
    ).toBe(false);
  });

  test('accepts join_room with a typed lower-case code, normalised', () => {
    const result = clientMessageSchema.safeParse({
      type: 'join_room',
      roomCode: 'abc234',
      participantName: 'Sam',
      languageCode: 'en',
    });

    expect(result.data).toMatchObject({ roomCode: 'ABC234' });
  });

  test('rejects join_room with a malformed code', () => {
    expect(
      clientMessageSchema.safeParse({
        type: 'join_room',
        roomCode: 'ABC',
        participantName: 'Sam',
        languageCode: 'en',
      }).success,
    ).toBe(false);
  });

  test('accepts leave_room', () => {
    expect(clientMessageSchema.safeParse({ type: 'leave_room' }).success).toBe(true);
  });
});
