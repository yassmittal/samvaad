import { afterEach, describe, expect, test } from 'bun:test';
import { MAXIMUM_AUTOMATIC_REOPENS_PER_MINUTE } from '../handlers/transcription-lifecycle';
import {
  type ConversationTestServers,
  startConversationTestServers,
} from '../test-support/start-conversation-test-servers';
import { waitForCondition } from '../test-support/wait-for-condition';

const AUDIO_FRAME = new Uint8Array(2560);
// 0.003 minutes is 180 ms: long enough to open a mic, short enough to outwait.
const SHORT_ROOM_DURATION_MINUTES = '0.003';
const ROOM_DURATION_WAIT_MILLISECONDS = 250;
const INGRESS_ERROR_EVENT = { type: 'error', message: 'Ingress audio slower than real-time' };

let servers: ConversationTestServers;

afterEach(() => servers.stop());

describe('a room past MAX_ROOM_DURATION_MINUTES (D-017)', () => {
  test('the next audio frame closes the mic, and it cannot be opened again', async () => {
    servers = await startConversationTestServers({
      env: { MAX_ROOM_DURATION_MINUTES: SHORT_ROOM_DURATION_MINUTES },
    });
    const metaConnection = await servers.startTableSessionWithMicrophoneOpen();
    servers.browser.sendAudioFrame(AUDIO_FRAME);
    await waitForCondition(() => metaConnection.receivedAudioByteCount > 0, 'the first frame');

    await Bun.sleep(ROOM_DURATION_WAIT_MILLISECONDS);
    servers.browser.sendAudioFrame(AUDIO_FRAME);

    expect((await servers.browser.waitForMessage('error')).code).toBe('ROOM_TIME_LIMIT_REACHED');
    await waitForCondition(
      () => metaConnection.receivedTextMessages.length > 0,
      'endStream to Meta',
    );
    expect(metaConnection.receivedTextMessages).toEqual([{ type: 'endStream' }]);
    expect(metaConnection.receivedAudioByteCount).toBe(AUDIO_FRAME.byteLength);

    const connectionCountBefore = servers.fakeMetaServer.connections.length;
    servers.browser.sendJson({ type: 'microphone_state', isOpen: true });
    expect((await servers.browser.waitForMessage('error')).code).toBe('ROOM_TIME_LIMIT_REACHED');
    expect(servers.fakeMetaServer.connections).toHaveLength(connectionCountBefore);
  });

  test('a room within its limit is untouched', async () => {
    servers = await startConversationTestServers();
    const metaConnection = await servers.startTableSessionWithMicrophoneOpen();

    servers.browser.sendAudioFrame(AUDIO_FRAME);

    await waitForCondition(() => metaConnection.receivedAudioByteCount > 0, 'the frame');
    expect(servers.browser.receivedMessages.some((message) => message.type === 'error')).toBe(
      false,
    );
  });
});

describe('Meta ending a stream that worked, while the mic is on (D-017)', () => {
  test('a new stream opens on its own, with the same handshake, and the phone hears nothing', async () => {
    servers = await startConversationTestServers();
    const firstConnection = await servers.startTableSessionWithMicrophoneOpen();

    firstConnection.sendEvent(INGRESS_ERROR_EVENT);

    await waitForCondition(
      () => servers.fakeMetaServer.connections[1]?.handshake != null,
      'a second stream',
    );
    const secondConnection = servers.fakeMetaServer.connections[1];
    expect(secondConnection?.handshake).toEqual(firstConnection.handshake);
    servers.browser.sendAudioFrame(AUDIO_FRAME);
    await waitForCondition(
      () => (secondConnection?.receivedAudioByteCount ?? 0) > 0,
      'audio on the new stream',
    );
    expect(servers.browser.receivedMessages.some((message) => message.type === 'error')).toBe(
      false,
    );
  });

  test(`after ${MAXIMUM_AUTOMATIC_REOPENS_PER_MINUTE} reopens in a minute, the phone is told`, async () => {
    servers = await startConversationTestServers();
    await servers.startTableSessionWithMicrophoneOpen();

    for (let reopenIndex = 0; reopenIndex <= MAXIMUM_AUTOMATIC_REOPENS_PER_MINUTE; reopenIndex++) {
      await waitForCondition(
        () => servers.fakeMetaServer.connections[reopenIndex]?.handshake != null,
        `stream ${reopenIndex}`,
      );
      servers.fakeMetaServer.connections[reopenIndex]?.sendEvent(INGRESS_ERROR_EVENT);
    }

    expect((await servers.browser.waitForMessage('error')).code).toBe('UPSTREAM_UNAVAILABLE');
    expect(servers.fakeMetaServer.connections).toHaveLength(
      MAXIMUM_AUTOMATIC_REOPENS_PER_MINUTE + 1,
    );
  });
});
