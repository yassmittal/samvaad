import { afterEach, describe, expect, test } from 'bun:test';
import { SEAT_TAKEN_OVER_CLOSE_CODE } from '@samvaad/shared';
import type { ScriptedTranslation } from '../test-support/fake-muse-spark-server';
import { sendFinishedUtterance } from '../test-support/start-conversation-test-servers';
import {
  findSystemPrompt,
  type HindiEnglishRoom,
  startHindiEnglishRoom,
} from '../test-support/start-hindi-english-room';
import type { TestBrowserClient } from '../test-support/test-browser-client';
import { waitForCondition } from '../test-support/wait-for-condition';

// Short enough for a test to outwait, long enough for one to reconnect within (D-017).
const SHORT_GRACE_SECONDS = '0.3';

let room: HindiEnglishRoom;

afterEach(() => room.servers.stop());

function translateByPrompt(requestBody: Record<string, unknown>): ScriptedTranslation {
  return findSystemPrompt(requestBody).includes('into English')
    ? { chunks: ['Hello, friend.'] }
    : { chunks: ['नमस्ते, दोस्त।'] };
}

async function startRoom(env: Record<string, string> = {}): Promise<HindiEnglishRoom> {
  room = await startHindiEnglishRoom({ createScriptedTranslation: translateByPrompt, env });
  return room;
}

/** Ben's phone comes back on a new socket and asks for his old seat. */
async function rejoinAsBen(previousParticipantId: string): Promise<TestBrowserClient> {
  const returningBrowser = await room.servers.connectAnotherBrowser();
  returningBrowser.sendJson({
    type: 'join_room',
    roomCode: room.roomCode,
    participantName: 'Ben',
    languageCode: 'en',
    previousParticipantId,
  });
  return returningBrowser;
}

function findBen(roomState: { participants: { participantName: string; isConnected: boolean }[] }) {
  return roomState.participants.find((participant) => participant.participantName === 'Ben');
}

describe('rooms: a dropped socket keeps its seat (D-017)', () => {
  test('the other phone sees them as not connected, and nobody else can take the seat', async () => {
    await startRoom();

    room.englishBrowser.socket.close();

    const roomState = await room.hindiBrowser.waitForMessage('room_state');
    expect(roomState.participants).toHaveLength(2);
    expect(findBen(roomState)?.isConnected).toBe(false);
    const stranger = await room.servers.connectAnotherBrowser();
    stranger.sendJson({
      type: 'join_room',
      roomCode: room.roomCode,
      participantName: 'Chandra',
      languageCode: 'ta',
    });
    expect((await stranger.waitForMessage('error')).code).toBe('ROOM_FULL');
    expect(room.hindiBrowser.receivedMessages.some((m) => m.type === 'participant_left')).toBe(
      false,
    );
  });

  test('coming back with the old id takes the seat, the id and the translations back', async () => {
    await startRoom();
    room.englishBrowser.socket.close();
    await room.hindiBrowser.waitForMessage('room_state');

    const returningBrowser = await rejoinAsBen(room.englishParticipantId);

    expect((await returningBrowser.waitForMessage('room_joined')).participantId).toBe(
      room.englishParticipantId,
    );
    const roomState = await room.hindiBrowser.waitForMessage('room_state');
    expect(roomState.participants.map((participant) => participant.isConnected)).toEqual([
      true,
      true,
    ]);
    const hindiMetaConnection = await room.servers.openMicrophone(room.hindiBrowser);
    sendFinishedUtterance(hindiMetaConnection, { turnId: 0, transcript: 'नमस्ते, दोस्त।' });
    expect((await returningBrowser.waitForMessage('translation_complete')).text).toBe(
      'Hello, friend.',
    );
  });

  test('while the seat is empty, nothing is translated for it', async () => {
    await startRoom();
    room.englishBrowser.socket.close();
    await room.hindiBrowser.waitForMessage('room_state');

    const hindiMetaConnection = await room.servers.openMicrophone(room.hindiBrowser);
    sendFinishedUtterance(hindiMetaConnection, { turnId: 0, transcript: 'नमस्ते, दोस्त।' });
    await room.hindiBrowser.waitForMessage('transcript_final');
    await Bun.sleep(50);

    expect(room.servers.fakeMuseSparkServer.receivedRequestBodies).toEqual([]);
  });

  test('not back within the grace: the seat is freed and the other phone is told', async () => {
    await startRoom({ PARTICIPANT_RECONNECT_GRACE_SECONDS: SHORT_GRACE_SECONDS });

    room.englishBrowser.socket.close();

    expect((await room.hindiBrowser.waitForMessage('participant_left')).participantName).toBe(
      'Ben',
    );
    await waitForCondition(
      () =>
        room.hindiBrowser.receivedMessages.some(
          (message) => message.type === 'room_state' && message.participants.length === 1,
        ),
      'a room_state with Asha alone',
    );
    const lateBrowser = await rejoinAsBen(room.englishParticipantId);
    // The seat is gone, so he joins again as a new participant.
    expect((await lateBrowser.waitForMessage('room_joined')).participantId).not.toBe(
      room.englishParticipantId,
    );
  });

  test('a socket the API still thinks is open is replaced and closed', async () => {
    await startRoom();
    const oldSocketClosed = new Promise<number>((resolve) =>
      room.englishBrowser.socket.addEventListener('close', (event) => resolve(event.code)),
    );

    const returningBrowser = await rejoinAsBen(room.englishParticipantId);

    expect((await returningBrowser.waitForMessage('room_joined')).participantId).toBe(
      room.englishParticipantId,
    );
    expect(await oldSocketClosed).toBe(SEAT_TAKEN_OVER_CLOSE_CODE);
    await Bun.sleep(50);
    const roomStates = room.hindiBrowser.receivedMessages.filter(
      (message) => message.type === 'room_state',
    );
    expect(roomStates.at(-1)?.participants).toHaveLength(2);
    expect(room.hindiBrowser.receivedMessages.some((m) => m.type === 'participant_left')).toBe(
      false,
    );
  });

  test('an id the room never had joins as a new participant', async () => {
    await startRoom();
    room.englishBrowser.sendJson({ type: 'leave_room' });
    await room.hindiBrowser.waitForMessage('participant_left');

    const returningBrowser = await rejoinAsBen('an id from another room');

    expect((await returningBrowser.waitForMessage('room_joined')).participantId).not.toBe(
      'an id from another room',
    );
  });
});
