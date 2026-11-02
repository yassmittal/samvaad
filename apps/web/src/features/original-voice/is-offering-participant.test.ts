import { describe, expect, test } from 'bun:test';
import { isOfferingParticipant } from './is-offering-participant';

const participants = [{ participantId: 'first' }, { participantId: 'second' }];

describe('isOfferingParticipant', () => {
  test('the second to join offers, the first answers', () => {
    expect(isOfferingParticipant(participants, 'second')).toBe(true);
    expect(isOfferingParticipant(participants, 'first')).toBe(false);
  });

  test('nobody offers while alone, or before knowing who this phone is', () => {
    expect(isOfferingParticipant([{ participantId: 'first' }], 'first')).toBe(false);
    expect(isOfferingParticipant(participants, null)).toBe(false);
  });
});
