import { describe, expect, test } from 'bun:test';
import { createMicrophoneGate } from './create-microphone-gate';

const TEST_REOPEN_DELAY_MILLISECONDS = 20;
const TEST_FRAME_BYTE_LENGTH = 8;

function createTestGate() {
  const sentStates: boolean[] = [];
  const gate = createMicrophoneGate({
    onMicrophoneStateChange: (isOpen) => sentStates.push(isOpen),
    reopenDelayMilliseconds: TEST_REOPEN_DELAY_MILLISECONDS,
  });
  return { gate, sentStates };
}

/** A frame of non-zero samples, so silence is told apart from it. */
function createVoiceFrame(): ArrayBuffer {
  return new Uint8Array(TEST_FRAME_BYTE_LENGTH).fill(7).buffer;
}

type OutgoingFrameKind = 'voice' | 'silence' | 'nothing';

function findOutgoingFrameKind(outgoingFrame: ArrayBuffer | null): OutgoingFrameKind {
  if (outgoingFrame === null) {
    return 'nothing';
  }
  expect(outgoingFrame.byteLength).toBe(TEST_FRAME_BYTE_LENGTH);
  return new Uint8Array(outgoingFrame).every((byte) => byte === 0) ? 'silence' : 'voice';
}

function waitMilliseconds(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

describe('createMicrophoneGate', () => {
  test('sends the voice while the microphone is on, and nothing while it is off', () => {
    const { gate, sentStates } = createTestGate();

    expect(findOutgoingFrameKind(gate.toOutgoingFrame(createVoiceFrame()))).toBe('nothing');
    gate.setMicrophoneOn(true);
    expect(findOutgoingFrameKind(gate.toOutgoingFrame(createVoiceFrame()))).toBe('voice');
    gate.setMicrophoneOn(false);

    expect(findOutgoingFrameKind(gate.toOutgoingFrame(createVoiceFrame()))).toBe('nothing');
    expect(sentStates).toEqual([true, false]);
  });

  test('sends silence while the phone speaks, and the voice again only after the delay', async () => {
    const { gate } = createTestGate();
    gate.setMicrophoneOn(true);

    gate.setSpeaking(true);
    expect(findOutgoingFrameKind(gate.toOutgoingFrame(createVoiceFrame()))).toBe('silence');
    expect(gate.isSendingRealAudio()).toBe(false);
    gate.setSpeaking(false);
    expect(findOutgoingFrameKind(gate.toOutgoingFrame(createVoiceFrame()))).toBe('silence');

    await waitMilliseconds(TEST_REOPEN_DELAY_MILLISECONDS * 2);
    expect(findOutgoingFrameKind(gate.toOutgoingFrame(createVoiceFrame()))).toBe('voice');
    expect(gate.isSendingRealAudio()).toBe(true);
  });

  test('speaking never closes the stream: microphone_state only follows the mic button (D-019)', async () => {
    const { gate, sentStates } = createTestGate();
    gate.setMicrophoneOn(true);

    gate.setSpeaking(true);
    gate.setSpeaking(false);
    await waitMilliseconds(TEST_REOPEN_DELAY_MILLISECONDS * 2);

    expect(sentStates).toEqual([true]);
  });

  test('speaking again within the delay keeps sending silence', async () => {
    const { gate } = createTestGate();
    gate.setMicrophoneOn(true);

    gate.setSpeaking(true);
    gate.setSpeaking(false);
    gate.setSpeaking(true);
    await waitMilliseconds(TEST_REOPEN_DELAY_MILLISECONDS * 2);

    expect(findOutgoingFrameKind(gate.toOutgoingFrame(createVoiceFrame()))).toBe('silence');
  });

  test('turning the microphone off while the phone speaks sends nothing more', async () => {
    const { gate, sentStates } = createTestGate();
    gate.setMicrophoneOn(true);
    gate.setSpeaking(true);

    gate.setMicrophoneOn(false);
    gate.setSpeaking(false);
    await waitMilliseconds(TEST_REOPEN_DELAY_MILLISECONDS * 2);

    expect(findOutgoingFrameKind(gate.toOutgoingFrame(createVoiceFrame()))).toBe('nothing');
    expect(sentStates).toEqual([true, false]);
  });

  test('turning the microphone on while the phone speaks opens the stream at once, with silence', () => {
    const { gate, sentStates } = createTestGate();
    gate.setSpeaking(true);

    gate.setMicrophoneOn(true);

    expect(sentStates).toEqual([true]);
    expect(findOutgoingFrameKind(gate.toOutgoingFrame(createVoiceFrame()))).toBe('silence');
  });

  test('a cancelled reopen keeps sending silence', async () => {
    const { gate } = createTestGate();
    gate.setMicrophoneOn(true);
    gate.setSpeaking(true);
    gate.setSpeaking(false);

    gate.cancelPendingReopen();
    await waitMilliseconds(TEST_REOPEN_DELAY_MILLISECONDS * 2);

    expect(findOutgoingFrameKind(gate.toOutgoingFrame(createVoiceFrame()))).toBe('silence');
  });

  test('reports each change in whether the real voice is sent, for the peer connection (D-023)', async () => {
    const realAudioChanges: boolean[] = [];
    const gate = createMicrophoneGate({
      onMicrophoneStateChange: () => {},
      onSendingRealAudioChange: (isSendingRealAudio) => realAudioChanges.push(isSendingRealAudio),
      reopenDelayMilliseconds: TEST_REOPEN_DELAY_MILLISECONDS,
    });

    gate.setMicrophoneOn(true);
    gate.setSpeaking(true);
    gate.setSpeaking(false);
    await waitMilliseconds(TEST_REOPEN_DELAY_MILLISECONDS * 2);
    gate.setMicrophoneOn(false);

    expect(realAudioChanges).toEqual([true, false, true, false]);
  });
});
