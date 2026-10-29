import { afterEach, describe, expect, test } from 'bun:test';
import type { ServerMessage } from '@samvaad/shared';
import type { ScriptedTranslation } from '../test-support/fake-muse-spark-server';
import {
  type ConversationTestServers,
  sendFinishedUtterance,
  startConversationTestServers,
} from '../test-support/start-conversation-test-servers';
import type { TestBrowserClient } from '../test-support/test-browser-client';
import { waitForCondition } from '../test-support/wait-for-condition';

const SLOW_TRANSLATION_DELAY_MILLISECONDS = 300;

let servers: ConversationTestServers;

afterEach(() => servers.stop());

type ChatCompletionsRequestBody = { messages: { role: string; content: string }[] };

function findSystemPrompt(requestBody: Record<string, unknown>): string {
  return (requestBody as ChatCompletionsRequestBody).messages[0]?.content ?? '';
}

/** Answers like Muse Spark would for a room prompt: the translation alone, no code line. */
function translateByPrompt(requestBody: Record<string, unknown>): ScriptedTranslation {
  return findSystemPrompt(requestBody).includes('into English')
    ? { chunks: ['Hello, ', 'friend.'] }
    : { chunks: ['नमस्ते, ', 'दोस्त।'] };
}

function findTranslationMessages(messages: ServerMessage[]) {
  return messages.flatMap((message) =>
    message.type === 'translation_delta' || message.type === 'translation_complete'
      ? [message]
      : [],
  );
}

type HindiEnglishRoom = {
  roomCode: string;
  hindiBrowser: TestBrowserClient;
  hindiParticipantId: string;
  englishBrowser: TestBrowserClient;
  englishParticipantId: string;
};

/** Asha creates a room in Hindi, Ben joins it in English. Their join messages are consumed. */
async function startHindiEnglishRoom(
  options: Parameters<typeof startConversationTestServers>[0] = {},
): Promise<HindiEnglishRoom> {
  servers = await startConversationTestServers({
    createScriptedTranslation: translateByPrompt,
    ...options,
  });
  const hindiBrowser = servers.browser;
  hindiBrowser.sendJson({ type: 'create_room', participantName: 'Asha', languageCode: 'hi' });
  const { roomCode, participantId: hindiParticipantId } =
    await hindiBrowser.waitForMessage('room_joined');
  await hindiBrowser.waitForMessage('room_state');

  const englishBrowser = await servers.connectAnotherBrowser();
  englishBrowser.sendJson({
    type: 'join_room',
    roomCode,
    participantName: 'Ben',
    languageCode: 'en',
  });
  const { participantId: englishParticipantId } =
    await englishBrowser.waitForMessage('room_joined');
  await englishBrowser.waitForMessage('room_state');
  await hindiBrowser.waitForMessage('room_state');

  return { roomCode, hindiBrowser, hindiParticipantId, englishBrowser, englishParticipantId };
}

describe('rooms: creating and joining', () => {
  test('create_room answers room_joined, then a room_state with the creator alone', async () => {
    servers = await startConversationTestServers();
    servers.browser.sendJson({ type: 'create_room', participantName: 'Asha', languageCode: 'hi' });

    const roomJoined = await servers.browser.waitForMessage('room_joined');
    const roomState = await servers.browser.waitForMessage('room_state');

    expect(roomJoined.roomCode).toMatch(/^[A-Z2-9]{6}$/);
    expect(roomState).toEqual({
      type: 'room_state',
      roomCode: roomJoined.roomCode,
      participants: [
        {
          participantId: roomJoined.participantId,
          participantName: 'Asha',
          languageCode: 'hi',
          isMicrophoneOpen: false,
        },
      ],
    });
  });

  test('after a join, both phones see both participants and their languages', async () => {
    servers = await startConversationTestServers();
    servers.browser.sendJson({ type: 'create_room', participantName: 'Asha', languageCode: 'hi' });
    const { roomCode } = await servers.browser.waitForMessage('room_joined');
    await servers.browser.waitForMessage('room_state');
    const englishBrowser = await servers.connectAnotherBrowser();

    // A typed code in lower case is fine; the shared schema normalises it.
    englishBrowser.sendJson({
      type: 'join_room',
      roomCode: roomCode.toLowerCase(),
      participantName: 'Ben',
      languageCode: 'en',
    });

    expect((await englishBrowser.waitForMessage('room_joined')).roomCode).toBe(roomCode);
    for (const browser of [servers.browser, englishBrowser]) {
      const roomState = await browser.waitForMessage('room_state');
      expect(
        roomState.participants.map(({ participantName, languageCode }) => ({
          participantName,
          languageCode,
        })),
      ).toEqual([
        { participantName: 'Asha', languageCode: 'hi' },
        { participantName: 'Ben', languageCode: 'en' },
      ]);
    }
  });

  test('a code nobody created is ROOM_NOT_FOUND', async () => {
    servers = await startConversationTestServers();
    servers.browser.sendJson({
      type: 'join_room',
      roomCode: 'ZZZZZZ',
      participantName: 'Ben',
      languageCode: 'en',
    });

    expect((await servers.browser.waitForMessage('error')).code).toBe('ROOM_NOT_FOUND');
  });

  test('a third phone is ROOM_FULL, and the two inside hear nothing of it', async () => {
    const { roomCode, hindiBrowser, englishBrowser } = await startHindiEnglishRoom();
    const thirdBrowser = await servers.connectAnotherBrowser();

    thirdBrowser.sendJson({
      type: 'join_room',
      roomCode,
      participantName: 'Chandra',
      languageCode: 'ta',
    });

    expect((await thirdBrowser.waitForMessage('error')).code).toBe('ROOM_FULL');
    await Bun.sleep(50);
    expect(hindiBrowser.receivedMessages).toEqual([]);
    expect(englishBrowser.receivedMessages).toEqual([]);
  });

  test('a malformed code is INVALID_MESSAGE', async () => {
    servers = await startConversationTestServers();
    servers.browser.sendJson({
      type: 'join_room',
      roomCode: 'ABC',
      participantName: 'Ben',
      languageCode: 'en',
    });

    expect((await servers.browser.waitForMessage('error')).code).toBe('INVALID_MESSAGE');
  });

  test('a room closes when everyone has left', async () => {
    servers = await startConversationTestServers();
    servers.browser.sendJson({ type: 'create_room', participantName: 'Asha', languageCode: 'hi' });
    const { roomCode } = await servers.browser.waitForMessage('room_joined');
    servers.browser.sendJson({ type: 'leave_room' });
    const lateBrowser = await servers.connectAnotherBrowser();

    lateBrowser.sendJson({
      type: 'join_room',
      roomCode,
      participantName: 'Ben',
      languageCode: 'en',
    });

    expect((await lateBrowser.waitForMessage('error')).code).toBe('ROOM_NOT_FOUND');
  });
});

describe('rooms: speaking and translating', () => {
  test('each participant receives exactly the other’s translation, in their language', async () => {
    const room = await startHindiEnglishRoom();
    const hindiMetaConnection = await servers.openMicrophone(room.hindiBrowser);
    const englishMetaConnection = await servers.openMicrophone(room.englishBrowser);

    sendFinishedUtterance(hindiMetaConnection, { turnId: 0, transcript: 'नमस्ते, दोस्त।' });
    const hindiUtterance = await room.englishBrowser.waitForMessage('transcript_final');
    expect(await room.hindiBrowser.waitForMessage('transcript_final')).toEqual(hindiUtterance);
    expect(hindiUtterance).toMatchObject({
      speakerParticipantId: room.hindiParticipantId,
      languageCode: 'hi',
    });
    expect((await room.englishBrowser.waitForMessage('translation_complete')).text).toBe(
      'Hello, friend.',
    );

    sendFinishedUtterance(englishMetaConnection, { turnId: 0, transcript: 'Hello, friend.' });
    const englishUtterance = await room.hindiBrowser.waitForMessage('transcript_final');
    expect(englishUtterance).toMatchObject({
      speakerParticipantId: room.englishParticipantId,
      languageCode: 'en',
    });
    expect((await room.hindiBrowser.waitForMessage('translation_complete')).text).toBe(
      'नमस्ते, दोस्त।',
    );
    await Bun.sleep(50);

    // Whatever is left over: Asha got only Ben's utterance in Hindi, and Ben only Asha's in English.
    const hindiTranslations = findTranslationMessages(room.hindiBrowser.receivedMessages);
    const englishTranslations = findTranslationMessages(room.englishBrowser.receivedMessages);
    expect(hindiTranslations.length).toBeGreaterThan(0);
    expect(englishTranslations.length).toBeGreaterThan(0);
    for (const message of hindiTranslations) {
      expect(message).toMatchObject({
        utteranceId: englishUtterance.utteranceId,
        targetLanguageCode: 'hi',
      });
    }
    for (const message of englishTranslations) {
      expect(message).toMatchObject({
        utteranceId: hindiUtterance.utteranceId,
        targetLanguageCode: 'en',
      });
    }
    expect(servers.fakeMuseSparkServer.receivedRequestBodies.map(findSystemPrompt)).toEqual([
      expect.stringContaining('from Hindi into English'),
      expect.stringContaining('from English into Hindi'),
    ]);
  });

  test('each transcription stream is biased to its speaker’s language, plus English (D-015)', async () => {
    const room = await startHindiEnglishRoom();

    const hindiMetaConnection = await servers.openMicrophone(room.hindiBrowser);
    const englishMetaConnection = await servers.openMicrophone(room.englishBrowser);

    expect(hindiMetaConnection.handshake?.languageBias).toEqual(['Hindi', 'English']);
    expect(englishMetaConnection.handshake?.languageBias).toEqual(['English']);
  });

  test('partial transcripts go to the speaker only', async () => {
    const room = await startHindiEnglishRoom();
    const hindiMetaConnection = await servers.openMicrophone(room.hindiBrowser);

    hindiMetaConnection.sendEvent({ type: 'speechStart', turnId: 0, audioProcessedMs: 0 });
    hindiMetaConnection.sendEvent({
      type: 'transcript',
      transcript: 'नमस्ते',
      final: false,
      audioProcessedMs: 40,
    });

    await room.hindiBrowser.waitForMessage('transcript_partial');
    await Bun.sleep(50);
    expect(
      room.englishBrowser.receivedMessages.some((message) => message.type === 'transcript_partial'),
    ).toBe(false);
  });

  test('turning a microphone on and off shows on both phones', async () => {
    const room = await startHindiEnglishRoom();
    // Room states from the mic opening and closing; only the latest of each matters here.
    const findHindiMicrophoneState = (browser: TestBrowserClient) =>
      browser
        .waitForMessage('room_state')
        .then(
          (roomState) =>
            roomState.participants.find(
              (participant) => participant.participantId === room.hindiParticipantId,
            )?.isMicrophoneOpen,
        );

    await servers.openMicrophone(room.hindiBrowser);
    expect(await findHindiMicrophoneState(room.englishBrowser)).toBe(true);
    expect(await findHindiMicrophoneState(room.hindiBrowser)).toBe(true);

    room.hindiBrowser.sendJson({ type: 'microphone_state', isOpen: false });
    expect(await findHindiMicrophoneState(room.englishBrowser)).toBe(false);
  });
});

describe('rooms: leaving mid-translation', () => {
  const slowTranslation = (requestBody: Record<string, unknown>): ScriptedTranslation => ({
    ...translateByPrompt(requestBody),
    delayBeforeFirstChunkMilliseconds: SLOW_TRANSLATION_DELAY_MILLISECONDS,
  });

  test('the listener leaving cancels the translation, and the speaker is told', async () => {
    const room = await startHindiEnglishRoom({ createScriptedTranslation: slowTranslation });
    const hindiMetaConnection = await servers.openMicrophone(room.hindiBrowser);
    await room.hindiBrowser.waitForMessage('room_state');
    sendFinishedUtterance(hindiMetaConnection, { turnId: 0, transcript: 'नमस्ते।' });
    await room.englishBrowser.waitForMessage('transcript_final');
    await waitForCondition(
      () => servers.fakeMuseSparkServer.receivedRequestBodies.length === 1,
      'the translation request',
    );

    room.englishBrowser.sendJson({ type: 'leave_room' });

    expect(await room.hindiBrowser.waitForMessage('participant_left')).toEqual({
      type: 'participant_left',
      participantId: room.englishParticipantId,
      participantName: 'Ben',
    });
    expect((await room.hindiBrowser.waitForMessage('room_state')).participants).toHaveLength(1);
    await waitForCondition(
      () => servers.fakeMuseSparkServer.abortedRequestIndexes.includes(0),
      'the translation request to be cancelled',
    );
    await Bun.sleep(SLOW_TRANSLATION_DELAY_MILLISECONDS);
    expect(findTranslationMessages(room.englishBrowser.receivedMessages)).toEqual([]);
    expect(room.hindiBrowser.receivedMessages.some((message) => message.type === 'error')).toBe(
      false,
    );
  });

  test('the speaker leaving still delivers their last translation to the listener', async () => {
    const room = await startHindiEnglishRoom({ createScriptedTranslation: slowTranslation });
    const hindiMetaConnection = await servers.openMicrophone(room.hindiBrowser);
    sendFinishedUtterance(hindiMetaConnection, { turnId: 0, transcript: 'नमस्ते, दोस्त।' });
    await room.englishBrowser.waitForMessage('transcript_final');

    room.hindiBrowser.socket.close();

    expect((await room.englishBrowser.waitForMessage('participant_left')).participantName).toBe(
      'Asha',
    );
    expect((await room.englishBrowser.waitForMessage('translation_complete')).text).toBe(
      'Hello, friend.',
    );
    await waitForCondition(() => hindiMetaConnection.isClosed, 'the speaker’s upstream to close');
  });
});
