import { afterEach, describe, expect, test } from 'bun:test';
import type { ScriptedTranslation } from '../test-support/fake-muse-spark-server';
import type { ScriptedSpeech } from '../test-support/fake-speech-server';
import {
  type ConversationTestServers,
  sendFinishedUtterance,
} from '../test-support/start-conversation-test-servers';
import { findSystemPrompt, startHindiEnglishRoom } from '../test-support/start-hindi-english-room';
import { waitForCondition } from '../test-support/wait-for-condition';

let servers: ConversationTestServers;

afterEach(() => servers.stop());

function translateByPrompt(requestBody: Record<string, unknown>): ScriptedTranslation {
  return findSystemPrompt(requestBody).includes('into English')
    ? { chunks: ['Hello, ', 'friend.'] }
    : { chunks: ['नमस्ते, ', 'दोस्त।'] };
}

const ELEVENLABS_ENV = {
  SPEECH_PROVIDER: 'elevenlabs',
  ELEVENLABS_API_KEY: 'test-elevenlabs-key',
  SPEECH_VOICE_IDS: 'voice-for-first, voice-for-second',
};

/** Asha (Hindi) created the room first, Ben (English) joined second. */
async function startRoomWithSpeech(
  env: Record<string, string>,
  createScriptedSpeech?: () => ScriptedSpeech,
) {
  const room = await startHindiEnglishRoom({
    createScriptedTranslation: translateByPrompt,
    env,
    ...(createScriptedSpeech ? { createScriptedSpeech } : {}),
  });
  servers = room.servers;
  return room;
}

describe('spoken translation from a voice API (D-021)', () => {
  test('the listener gets the translation, then its audio frames, then the end', async () => {
    const { hindiBrowser, englishBrowser } = await startRoomWithSpeech(ELEVENLABS_ENV, () => ({
      // An odd split: the API must only send whole samples.
      chunks: [
        [1, 0, 2],
        [0, 3, 0],
      ],
    }));
    const metaConnection = await servers.openMicrophone(hindiBrowser);

    sendFinishedUtterance(metaConnection, { turnId: 0, transcript: 'नमस्ते दोस्त' });
    const translationComplete = await englishBrowser.waitForMessage('translation_complete');
    const audioEnd = await englishBrowser.waitForMessage('translation_audio_end');

    expect(translationComplete.hasTranslationAudio).toBe(true);
    expect(audioEnd).toEqual({
      type: 'translation_audio_end',
      utteranceId: translationComplete.utteranceId,
      hasFailed: false,
    });
    const audioBytes = englishBrowser.receivedAudioFrames.flatMap((frame) => [...frame.audio]);
    expect(audioBytes).toEqual([1, 0, 2, 0, 3, 0]);
    for (const frame of englishBrowser.receivedAudioFrames) {
      expect(frame.utteranceId).toBe(translationComplete.utteranceId);
      expect(frame.audio.length % 2).toBe(0);
    }
    expect(englishBrowser.timeline.at(-1)).toBe(
      `message:translation_audio_end:${translationComplete.utteranceId}`,
    );
    // The speaker hears nothing of their own translation.
    expect(hindiBrowser.receivedAudioFrames).toEqual([]);
  });

  test('asks ElevenLabs for 24 kHz PCM in the listener language, in the speaker voice', async () => {
    const { hindiBrowser, englishBrowser } = await startRoomWithSpeech(ELEVENLABS_ENV);
    const metaConnection = await servers.openMicrophone(hindiBrowser);

    sendFinishedUtterance(metaConnection, { turnId: 0, transcript: 'नमस्ते दोस्त' });
    await englishBrowser.waitForMessage('translation_audio_end');

    const [speechRequest] = servers.fakeSpeechServer.receivedRequests;
    // Asha joined first, so her translations use the first voice.
    expect(speechRequest?.path).toBe('/v1/text-to-speech/voice-for-first/stream');
    expect(speechRequest?.searchParams.get('output_format')).toBe('pcm_24000');
    expect(speechRequest?.headers.get('xi-api-key')).toBe('test-elevenlabs-key');
    expect(speechRequest?.body).toMatchObject({
      text: 'Hello, friend.',
      model_id: 'eleven_flash_v2_5',
      language_code: 'en',
    });
  });

  test('the second participant speaks in the second voice', async () => {
    const { englishBrowser, hindiBrowser } = await startRoomWithSpeech(ELEVENLABS_ENV);
    const metaConnection = await servers.openMicrophone(englishBrowser);

    sendFinishedUtterance(metaConnection, { turnId: 0, transcript: 'Hello friend' });
    await hindiBrowser.waitForMessage('translation_audio_end');

    expect(servers.fakeSpeechServer.receivedRequests[0]?.path).toBe(
      '/v1/text-to-speech/voice-for-second/stream',
    );
  });

  test('asks Cartesia for raw PCM16 at 24 kHz with the voice and language', async () => {
    const { hindiBrowser, englishBrowser } = await startRoomWithSpeech({
      SPEECH_PROVIDER: 'cartesia',
      CARTESIA_API_KEY: 'test-cartesia-key',
      SPEECH_VOICE_IDS: 'cartesia-voice',
    });
    const metaConnection = await servers.openMicrophone(hindiBrowser);

    sendFinishedUtterance(metaConnection, { turnId: 0, transcript: 'नमस्ते दोस्त' });
    await englishBrowser.waitForMessage('translation_audio_end');

    const [speechRequest] = servers.fakeSpeechServer.receivedRequests;
    expect(speechRequest?.path).toBe('/tts/bytes');
    expect(speechRequest?.headers.get('x-api-key')).toBe('test-cartesia-key');
    expect(speechRequest?.body).toMatchObject({
      transcript: 'Hello, friend.',
      voice: { mode: 'id', id: 'cartesia-voice' },
      language: 'en',
      output_format: { container: 'raw', encoding: 'pcm_s16le', sample_rate: 24_000 },
    });
  });

  test('a failed synthesis still delivers the text, and says the audio failed', async () => {
    const { hindiBrowser, englishBrowser } = await startRoomWithSpeech(ELEVENLABS_ENV, () => ({
      chunks: [],
      failureStatus: 500,
    }));
    const metaConnection = await servers.openMicrophone(hindiBrowser);

    sendFinishedUtterance(metaConnection, { turnId: 0, transcript: 'नमस्ते दोस्त' });
    const translationComplete = await englishBrowser.waitForMessage('translation_complete');
    const audioEnd = await englishBrowser.waitForMessage('translation_audio_end');

    expect(translationComplete.text).toBe('Hello, friend.');
    expect(audioEnd.hasFailed).toBe(true);
    expect(englishBrowser.receivedAudioFrames).toEqual([]);
  });

  test('a busy voice API (429) is tried again, and its audio still arrives (D-024)', async () => {
    let speechRequestCount = 0;
    const { hindiBrowser, englishBrowser } = await startRoomWithSpeech(ELEVENLABS_ENV, () => {
      speechRequestCount += 1;
      return speechRequestCount === 1
        ? { chunks: [], failureStatus: 429 }
        : { chunks: [[1, 0, 2, 0]] };
    });
    const metaConnection = await servers.openMicrophone(hindiBrowser);

    sendFinishedUtterance(metaConnection, { turnId: 0, transcript: 'नमस्ते दोस्त' });
    const audioEnd = await englishBrowser.waitForMessage('translation_audio_end');

    expect(audioEnd.hasFailed).toBe(false);
    expect(servers.fakeSpeechServer.receivedRequests).toHaveLength(2);
    expect(englishBrowser.receivedAudioFrames).toHaveLength(1);
  });

  test('a voice API that stays busy falls back to the phone, after two retries', async () => {
    const { hindiBrowser, englishBrowser } = await startRoomWithSpeech(ELEVENLABS_ENV, () => ({
      chunks: [],
      failureStatus: 429,
    }));
    const metaConnection = await servers.openMicrophone(hindiBrowser);

    sendFinishedUtterance(metaConnection, { turnId: 0, transcript: 'नमस्ते दोस्त' });
    const audioEnd = await englishBrowser.waitForMessage('translation_audio_end');

    expect(audioEnd.hasFailed).toBe(true);
    expect(servers.fakeSpeechServer.receivedRequests).toHaveLength(3);
  });

  test('an utterance after a slow one waits until the first one has been spoken', async () => {
    let speechRequestCount = 0;
    const { hindiBrowser, englishBrowser } = await startRoomWithSpeech(ELEVENLABS_ENV, () => {
      speechRequestCount += 1;
      return speechRequestCount === 1
        ? { chunks: [[1, 0]], delayBeforeFirstChunkMilliseconds: 150 }
        : { chunks: [[2, 0]] };
    });
    const metaConnection = await servers.openMicrophone(hindiBrowser);

    sendFinishedUtterance(metaConnection, { turnId: 0, transcript: 'पहला' });
    sendFinishedUtterance(metaConnection, { turnId: 1, transcript: 'दूसरा' });
    await waitForCondition(
      () =>
        englishBrowser.timeline.filter((entry) => entry.startsWith('message:translation_audio_end'))
          .length === 2,
      'both spoken translations',
    );

    const [firstUtteranceId, secondUtteranceId] = englishBrowser.receivedMessages.flatMap(
      (message) => (message.type === 'translation_complete' ? [message.utteranceId] : []),
    );
    const timeline = englishBrowser.timeline;
    expect(timeline.indexOf(`message:translation_audio_end:${firstUtteranceId}`)).toBeLessThan(
      timeline.indexOf(`message:translation_delta:${secondUtteranceId}`),
    );
  });

  test('without a voice API, phones are told to speak for themselves', async () => {
    const { hindiBrowser, englishBrowser } = await startRoomWithSpeech({});
    const metaConnection = await servers.openMicrophone(hindiBrowser);

    sendFinishedUtterance(metaConnection, { turnId: 0, transcript: 'नमस्ते दोस्त' });
    const translationComplete = await englishBrowser.waitForMessage('translation_complete');
    await Bun.sleep(30);

    expect(translationComplete.hasTranslationAudio).toBe(false);
    expect(englishBrowser.receivedAudioFrames).toEqual([]);
    expect(
      englishBrowser.receivedMessages.some((message) => message.type === 'translation_audio_end'),
    ).toBe(false);
    expect(servers.fakeSpeechServer.receivedRequests).toEqual([]);
  });
});
