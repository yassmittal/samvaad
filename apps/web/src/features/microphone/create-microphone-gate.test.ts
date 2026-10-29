import { describe, expect, test } from 'bun:test';
import { createMicrophoneGate } from './create-microphone-gate';

const TEST_REOPEN_DELAY_MILLISECONDS = 20;

function createTestGate() {
  const sentStates: boolean[] = [];
  const gate = createMicrophoneGate({
    onMicrophoneStateChange: (isOpen) => sentStates.push(isOpen),
    reopenDelayMilliseconds: TEST_REOPEN_DELAY_MILLISECONDS,
  });
  return { gate, sentStates };
}

function waitMilliseconds(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

describe('createMicrophoneGate', () => {
  test('sends audio while the microphone is on and the phone is quiet', () => {
    const { gate, sentStates } = createTestGate();

    gate.setMicrophoneOn(true);
    expect(gate.isSendingAudio()).toBe(true);
    gate.setMicrophoneOn(false);

    expect(gate.isSendingAudio()).toBe(false);
    expect(sentStates).toEqual([true, false]);
  });

  test('mutes at once when speaking starts, and reopens only after the delay', async () => {
    const { gate, sentStates } = createTestGate();
    gate.setMicrophoneOn(true);

    gate.setSpeaking(true);
    expect(gate.isSendingAudio()).toBe(false);
    gate.setSpeaking(false);
    expect(gate.isSendingAudio()).toBe(false);

    await waitMilliseconds(TEST_REOPEN_DELAY_MILLISECONDS * 2);
    expect(gate.isSendingAudio()).toBe(true);
    expect(sentStates).toEqual([true, false, true]);
  });

  test('speaking again within the delay keeps the microphone muted', async () => {
    const { gate, sentStates } = createTestGate();
    gate.setMicrophoneOn(true);

    gate.setSpeaking(true);
    gate.setSpeaking(false);
    gate.setSpeaking(true);
    await waitMilliseconds(TEST_REOPEN_DELAY_MILLISECONDS * 2);

    expect(gate.isSendingAudio()).toBe(false);
    expect(sentStates).toEqual([true, false]);
  });

  test('turning the microphone off while muted sends nothing more, and it stays off', async () => {
    const { gate, sentStates } = createTestGate();
    gate.setMicrophoneOn(true);
    gate.setSpeaking(true);

    gate.setMicrophoneOn(false);
    gate.setSpeaking(false);
    await waitMilliseconds(TEST_REOPEN_DELAY_MILLISECONDS * 2);

    expect(gate.isSendingAudio()).toBe(false);
    expect(sentStates).toEqual([true, false]);
  });

  test('turning the microphone on while the phone speaks waits until it is quiet', async () => {
    const { gate, sentStates } = createTestGate();
    gate.setSpeaking(true);

    gate.setMicrophoneOn(true);
    expect(sentStates).toEqual([]);
    gate.setSpeaking(false);
    await waitMilliseconds(TEST_REOPEN_DELAY_MILLISECONDS * 2);

    expect(sentStates).toEqual([true]);
  });

  test('a cancelled reopen leaves the microphone muted', async () => {
    const { gate, sentStates } = createTestGate();
    gate.setMicrophoneOn(true);
    gate.setSpeaking(true);
    gate.setSpeaking(false);

    gate.cancelPendingReopen();
    await waitMilliseconds(TEST_REOPEN_DELAY_MILLISECONDS * 2);

    expect(sentStates).toEqual([true, false]);
  });
});
