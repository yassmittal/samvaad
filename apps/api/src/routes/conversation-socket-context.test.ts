import { afterEach, describe, expect, test } from 'bun:test';
import { DEMO_CONVERSATION_PRESET, type ServerMessage } from '@samvaad/shared';
import type { FakeMetaConnection } from '../test-support/fake-meta-transcription-server';
import type { ScriptedTranslation } from '../test-support/fake-muse-spark-server';
import {
  type ConversationTestServers,
  sendFinishedUtterance,
  startConversationTestServers,
} from '../test-support/start-conversation-test-servers';
import {
  findSystemPrompt,
  findUserText,
  startHindiEnglishRoom,
} from '../test-support/start-hindi-english-room';
import { waitForCondition } from '../test-support/wait-for-condition';

let servers: ConversationTestServers;

afterEach(() => servers.stop());

const RECAP_LANGUAGE_PATTERN = /Write the recap in (\w+) only/;

/** Translations as a room prompt gets them, and a recap that names its language. */
function answerByPrompt(requestBody: Record<string, unknown>): ScriptedTranslation {
  const systemPrompt = findSystemPrompt(requestBody);
  const recapLanguageName = RECAP_LANGUAGE_PATTERN.exec(systemPrompt)?.[1];
  if (recapLanguageName !== undefined) {
    return { chunks: ['Recap in ', recapLanguageName] };
  }
  if (systemPrompt.includes('"hi" or "en"')) {
    return { chunks: ['en\n', 'Translated.'] };
  }
  return systemPrompt.includes('into English')
    ? { chunks: ['Hello, ', 'friend.'] }
    : { chunks: ['नमस्ते, ', 'दोस्त।'] };
}

const UPDATE_TO_DEMO_CONTEXT = {
  type: 'update_conversation_context',
  ...DEMO_CONVERSATION_PRESET.context,
} as const;

async function startRoom() {
  const room = await startHindiEnglishRoom({ createScriptedTranslation: answerByPrompt });
  servers = room.servers;
  return room;
}

function countMessages(messages: ServerMessage[], type: ServerMessage['type']): number {
  return messages.filter((message) => message.type === type).length;
}

describe('conversation context (D-016)', () => {
  test('either phone can set it, and both phones are told who did', async () => {
    const { hindiBrowser, englishBrowser } = await startRoom();

    englishBrowser.sendJson(UPDATE_TO_DEMO_CONTEXT);

    for (const browser of [hindiBrowser, englishBrowser]) {
      const contextMessage = await browser.waitForMessage('conversation_context');
      expect(contextMessage.glossaryTerms).toEqual(DEMO_CONVERSATION_PRESET.context.glossaryTerms);
      expect(contextMessage.updatedByParticipantName).toBe('Ben');
    }
  });

  test('a phone joining later is told the context already set', async () => {
    servers = await startConversationTestServers({ createScriptedTranslation: answerByPrompt });
    servers.browser.sendJson({ type: 'create_room', participantName: 'Asha', languageCode: 'hi' });
    const { roomCode } = await servers.browser.waitForMessage('room_joined');
    servers.browser.sendJson(UPDATE_TO_DEMO_CONTEXT);
    await servers.browser.waitForMessage('conversation_context');

    const joiningBrowser = await servers.connectAnotherBrowser();
    joiningBrowser.sendJson({
      type: 'join_room',
      roomCode,
      participantName: 'Ben',
      languageCode: 'en',
    });

    const contextMessage = await joiningBrowser.waitForMessage('conversation_context');
    expect(contextMessage.setting).toBe(DEMO_CONVERSATION_PRESET.context.setting);
    expect(contextMessage.updatedByParticipantName).toBeNull();
  });

  test('the next translation sees the setting, the glossary and the conversation so far', async () => {
    const { hindiBrowser, englishBrowser } = await startRoom();
    hindiBrowser.sendJson(UPDATE_TO_DEMO_CONTEXT);
    await hindiBrowser.waitForMessage('conversation_context');
    const metaConnection = await servers.openMicrophone(hindiBrowser);

    sendFinishedUtterance(metaConnection, { turnId: 0, transcript: 'नमस्ते शिवॉन जी।' });
    await englishBrowser.waitForMessage('translation_complete');
    sendFinishedUtterance(metaConnection, { turnId: 1, transcript: 'वो तैयार है।' });
    await englishBrowser.waitForMessage('translation_complete');

    const [firstRequestBody, secondRequestBody] = servers.fakeMuseSparkServer.receivedRequestBodies;
    const firstSystemPrompt = findSystemPrompt(firstRequestBody ?? {});
    const secondSystemPrompt = findSystemPrompt(secondRequestBody ?? {});
    expect(firstSystemPrompt).toContain('- blue pottery = ब्लू पॉटरी');
    expect(firstSystemPrompt).not.toContain('The conversation so far');
    expect(secondSystemPrompt).toContain('About this conversation: Ramesh Kumawat');
    expect(secondSystemPrompt).toContain('Asha (Hindi): नमस्ते शिवॉन जी।');
    expect(secondSystemPrompt).toContain('  → Hello, friend.');
    expect(secondSystemPrompt).toContain('The user message is spoken by Asha.');
    expect(findUserText(secondRequestBody ?? {})).toBe('वो तैयार है।');
  });

  test('glossary terms reach the transcriber as keywords, replacing an idle stream at once', async () => {
    const { hindiBrowser } = await startRoom();
    const firstMetaConnection = await servers.openMicrophone(hindiBrowser);
    expect(firstMetaConnection.handshake?.keywords).toBeUndefined();

    hindiBrowser.sendJson(UPDATE_TO_DEMO_CONTEXT);

    await waitForCondition(
      () => servers.fakeMetaServer.connections[1]?.handshake != null,
      'a second transcription stream',
    );
    expect(servers.fakeMetaServer.connections[1]?.handshake?.keywords).toEqual(
      expect.arrayContaining(['blue pottery', 'ब्लू पॉटरी', 'Siobhan', 'Kumawat']),
    );
    expect(firstMetaConnection.receivedTextMessages).toContainEqual({ type: 'endStream' });
  });

  test('a glossary change mid-utterance waits for that utterance to finish', async () => {
    const { hindiBrowser, englishBrowser } = await startRoom();
    const firstMetaConnection = await servers.openMicrophone(hindiBrowser);
    firstMetaConnection.sendEvent({ type: 'speechStart', turnId: 0, audioProcessedMs: 0 });
    firstMetaConnection.sendEvent({
      type: 'transcript',
      transcript: 'हमारी',
      final: false,
      audioProcessedMs: 0,
    });
    await hindiBrowser.waitForMessage('transcript_partial');

    hindiBrowser.sendJson(UPDATE_TO_DEMO_CONTEXT);
    await hindiBrowser.waitForMessage('conversation_context');
    await Bun.sleep(50);
    expect(servers.fakeMetaServer.connections).toHaveLength(1);
    expect(firstMetaConnection.receivedTextMessages).toEqual([]);

    firstMetaConnection.sendEvent({ type: 'speechEnd', turnId: 0, audioProcessedMs: 0 });
    firstMetaConnection.sendEvent({
      type: 'speechComplete',
      turnId: 0,
      transcript: 'हमारी ब्लू पॉटरी।',
      audioProcessedMs: 0,
    });

    await waitForCondition(
      () => servers.fakeMetaServer.connections[1]?.handshake != null,
      'a second transcription stream',
    );
    expect(firstMetaConnection.receivedTextMessages).toContainEqual({ type: 'endStream' });
    expect((await englishBrowser.waitForMessage('translation_complete')).text).toBe(
      'Hello, friend.',
    );
  });
});

describe('ending the conversation (D-016)', () => {
  test('both phones are told, then each gets the recap in its own language', async () => {
    const { hindiBrowser, englishBrowser } = await startRoom();
    const metaConnection = await servers.openMicrophone(hindiBrowser);
    sendFinishedUtterance(metaConnection, { turnId: 0, transcript: 'तीन सौ थाली।' });
    await englishBrowser.waitForMessage('translation_complete');

    englishBrowser.sendJson({ type: 'end_conversation' });

    for (const browser of [hindiBrowser, englishBrowser]) {
      expect((await browser.waitForMessage('conversation_ended')).participantName).toBe('Ben');
    }
    const hindiRecap = await hindiBrowser.waitForMessage('conversation_recap');
    const englishRecap = await englishBrowser.waitForMessage('conversation_recap');
    expect(hindiRecap).toMatchObject({ languageCode: 'hi', text: 'Recap in Hindi' });
    expect(englishRecap).toMatchObject({ languageCode: 'en', text: 'Recap in English' });

    await Bun.sleep(50);
    expect(countMessages(hindiBrowser.receivedMessages, 'conversation_recap')).toBe(0);
    expect(countMessages(englishBrowser.receivedMessages, 'conversation_recap')).toBe(0);
    const recapRequestBody = servers.fakeMuseSparkServer.receivedRequestBodies.find((requestBody) =>
      RECAP_LANGUAGE_PATTERN.test(findSystemPrompt(requestBody)),
    );
    expect(findUserText(recapRequestBody ?? {})).toBe('Asha (Hindi): तीन सौ थाली।');
  });

  test('with nothing said yet, only the phone that asked hears RECAP_UNAVAILABLE', async () => {
    const { hindiBrowser, englishBrowser } = await startRoom();

    hindiBrowser.sendJson({ type: 'end_conversation' });

    expect((await hindiBrowser.waitForMessage('error')).code).toBe('RECAP_UNAVAILABLE');
    await Bun.sleep(50);
    expect(englishBrowser.receivedMessages).toEqual([]);
    expect(servers.fakeMuseSparkServer.receivedRequestBodies).toEqual([]);
  });

  test('a failed recap is RECAP_UNAVAILABLE for the listeners in its language', async () => {
    const { hindiBrowser, englishBrowser } = await startHindiEnglishRoom({
      createScriptedTranslation: (requestBody) =>
        RECAP_LANGUAGE_PATTERN.test(findSystemPrompt(requestBody))
          ? { chunks: [], failureStatus: 500 }
          : answerByPrompt(requestBody),
    }).then((room) => {
      servers = room.servers;
      return room;
    });
    const metaConnection = await servers.openMicrophone(hindiBrowser);
    sendFinishedUtterance(metaConnection, { turnId: 0, transcript: 'तीन सौ थाली।' });
    await englishBrowser.waitForMessage('translation_complete');

    hindiBrowser.sendJson({ type: 'end_conversation' });

    expect((await hindiBrowser.waitForMessage('error')).code).toBe('RECAP_UNAVAILABLE');
    expect((await englishBrowser.waitForMessage('error')).code).toBe('RECAP_UNAVAILABLE');
  });

  test('a table gets its context back and a recap in each of its two languages', async () => {
    servers = await startConversationTestServers({ createScriptedTranslation: answerByPrompt });
    await servers.startTableSessionWithMicrophoneOpen();
    servers.browser.sendJson(UPDATE_TO_DEMO_CONTEXT);
    expect(
      (await servers.browser.waitForMessage('conversation_context')).updatedByParticipantName,
    ).toBeNull();
    // The new glossary replaced the idle stream (D-016); speech goes to the new one.
    await waitForCondition(
      () => servers.fakeMetaServer.connections[1]?.handshake != null,
      'the stream with the new keywords',
    );
    const metaConnection = servers.fakeMetaServer.connections[1] as FakeMetaConnection;
    sendFinishedUtterance(metaConnection, { turnId: 0, transcript: 'तीन सौ थाली।' });
    await servers.browser.waitForMessage('translation_complete');

    servers.browser.sendJson({ type: 'end_conversation' });

    expect((await servers.browser.waitForMessage('conversation_ended')).participantName).toBeNull();
    const recaps = [
      await servers.browser.waitForMessage('conversation_recap'),
      await servers.browser.waitForMessage('conversation_recap'),
    ];
    expect(recaps.map((recap) => recap.languageCode).sort()).toEqual(['en', 'hi']);
  });
});
