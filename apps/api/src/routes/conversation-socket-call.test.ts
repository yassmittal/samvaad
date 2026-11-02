import { afterEach, describe, expect, test } from 'bun:test';
import type { ScriptedTranslation } from '../test-support/fake-muse-spark-server';
import {
  type ConversationTestServers,
  sendFinishedUtterance,
  startConversationTestServers,
} from '../test-support/start-conversation-test-servers';
import { findSystemPrompt, startHindiEnglishRoom } from '../test-support/start-hindi-english-room';

let servers: ConversationTestServers;

afterEach(() => servers.stop());

function translateByPrompt(requestBody: Record<string, unknown>): ScriptedTranslation {
  return findSystemPrompt(requestBody).includes('into English')
    ? { chunks: ['Hello.'] }
    : { chunks: ['नमस्ते।'] };
}

describe('the incoming-call screen (D-022)', () => {
  test('preview_room says who is in the room, without joining it', async () => {
    servers = await startConversationTestServers();
    servers.browser.sendJson({
      type: 'create_room',
      participantName: 'Ramesh',
      languageCode: 'hi',
    });
    const { roomCode } = await servers.browser.waitForMessage('room_joined');
    await servers.browser.waitForMessage('room_state');
    const answeringBrowser = await servers.connectAnotherBrowser();

    answeringBrowser.sendJson({ type: 'preview_room', roomCode });
    const roomPreview = await answeringBrowser.waitForMessage('room_preview');

    expect(roomPreview).toEqual({
      type: 'room_preview',
      roomCode,
      participants: [{ participantName: 'Ramesh', languageCode: 'hi' }],
    });
    // Previewing is not joining: the caller is still alone.
    await Bun.sleep(20);
    expect(servers.browser.receivedMessages.some((message) => message.type === 'room_state')).toBe(
      false,
    );
  });

  test('preview_room for a room that has closed answers ROOM_NOT_FOUND', async () => {
    servers = await startConversationTestServers();

    servers.browser.sendJson({ type: 'preview_room', roomCode: 'ABCDEF' });
    const error = await servers.browser.waitForMessage('error');

    expect(error.code).toBe('ROOM_NOT_FOUND');
  });
});

describe('receipts for the speaker (D-022)', () => {
  test('the speaker gets ✓ when the translation reaches the other phone, ✓✓ when it is heard', async () => {
    const room = await startHindiEnglishRoom({ createScriptedTranslation: translateByPrompt });
    servers = room.servers;
    const metaConnection = await servers.openMicrophone(room.hindiBrowser);

    sendFinishedUtterance(metaConnection, { turnId: 0, transcript: 'नमस्ते' });
    const translationComplete = await room.englishBrowser.waitForMessage('translation_complete');
    const translatedReceipt = await room.hindiBrowser.waitForMessage('utterance_receipt');
    room.englishBrowser.sendJson({
      type: 'playback_started',
      utteranceId: translationComplete.utteranceId,
      startedAtEpochMilliseconds: Date.now(),
    });
    const heardReceipt = await room.hindiBrowser.waitForMessage('utterance_receipt');

    expect(translatedReceipt).toEqual({
      type: 'utterance_receipt',
      utteranceId: translationComplete.utteranceId,
      receipt: 'translated',
    });
    expect(heardReceipt.receipt).toBe('heard');
    // Receipts are the speaker's alone.
    expect(
      room.englishBrowser.receivedMessages.some((message) => message.type === 'utterance_receipt'),
    ).toBe(false);
  });

  test('a table gets no receipts: the speaker is the listener', async () => {
    servers = await startConversationTestServers();
    const metaConnection = await servers.startTableSessionWithMicrophoneOpen();

    sendFinishedUtterance(metaConnection, { turnId: 0, transcript: 'नमस्ते' });
    const translationComplete = await servers.browser.waitForMessage('translation_complete');
    servers.browser.sendJson({
      type: 'playback_started',
      utteranceId: translationComplete.utteranceId,
      startedAtEpochMilliseconds: Date.now(),
    });
    await Bun.sleep(30);

    expect(
      servers.browser.receivedMessages.some((message) => message.type === 'utterance_receipt'),
    ).toBe(false);
  });
});
