import { afterEach, describe, expect, test } from 'bun:test';
import { FREE_STUN_SERVERS } from '../services/ice-servers-client';
import {
  type ConversationTestServers,
  startConversationTestServers,
} from '../test-support/start-conversation-test-servers';
import { startHindiEnglishRoom } from '../test-support/start-hindi-english-room';

let servers: ConversationTestServers;
let fakeCloudflareServer: ReturnType<typeof Bun.serve> | null = null;

afterEach(() => {
  servers.stop();
  fakeCloudflareServer?.stop(true);
  fakeCloudflareServer = null;
});

const OFFER = { type: 'offer', sdp: 'v=0 fake offer' } as const;
const CANDIDATE = {
  candidate: 'candidate:1 1 udp 1 10.0.0.1 5000 typ host',
  sdpMid: '0',
  sdpMLineIndex: 0,
};

describe('the real voice: WebRTC signals between the two phones (D-023)', () => {
  test('a signal reaches the other participant, marked as from the sender', async () => {
    const room = await startHindiEnglishRoom();
    servers = room.servers;

    room.hindiBrowser.sendJson({
      type: 'webrtc_signal',
      toParticipantId: room.englishParticipantId,
      description: OFFER,
    });
    room.englishBrowser.sendJson({
      type: 'webrtc_signal',
      toParticipantId: room.hindiParticipantId,
      candidate: CANDIDATE,
    });

    expect(await room.englishBrowser.waitForMessage('webrtc_signal')).toEqual({
      type: 'webrtc_signal',
      fromParticipantId: room.hindiParticipantId,
      description: OFFER,
    });
    expect(await room.hindiBrowser.waitForMessage('webrtc_signal')).toEqual({
      type: 'webrtc_signal',
      fromParticipantId: room.englishParticipantId,
      candidate: CANDIDATE,
    });
  });

  test('a signal to someone outside the room goes nowhere', async () => {
    const room = await startHindiEnglishRoom();
    servers = room.servers;
    const strangerBrowser = await servers.connectAnotherBrowser();
    strangerBrowser.sendJson({
      type: 'create_room',
      participantName: 'Mallory',
      languageCode: 'en',
    });
    const { participantId: strangerParticipantId } =
      await strangerBrowser.waitForMessage('room_joined');

    room.hindiBrowser.sendJson({
      type: 'webrtc_signal',
      toParticipantId: strangerParticipantId,
      description: OFFER,
    });
    await Bun.sleep(50);

    expect(
      strangerBrowser.receivedMessages.some((message) => message.type === 'webrtc_signal'),
    ).toBe(false);
  });

  test('a signal with both a description and a candidate is INVALID_MESSAGE', async () => {
    const room = await startHindiEnglishRoom();
    servers = room.servers;

    room.hindiBrowser.sendJson({
      type: 'webrtc_signal',
      toParticipantId: room.englishParticipantId,
      description: OFFER,
      candidate: CANDIDATE,
    });

    expect((await room.hindiBrowser.waitForMessage('error')).code).toBe('INVALID_MESSAGE');
  });

  test('joining sends the free STUN servers when no TURN key is set', async () => {
    servers = await startConversationTestServers();
    servers.browser.sendJson({ type: 'create_room', participantName: 'Asha', languageCode: 'hi' });

    expect((await servers.browser.waitForMessage('ice_servers')).iceServers).toEqual(
      FREE_STUN_SERVERS,
    );
  });

  test('with a TURN key, joining adds the TURN credentials Cloudflare generates', async () => {
    const turnRequests: { path: string; authorization: string | null }[] = [];
    fakeCloudflareServer = Bun.serve({
      port: 0,
      fetch(request) {
        turnRequests.push({
          path: new URL(request.url).pathname,
          authorization: request.headers.get('authorization'),
        });
        return Response.json({
          iceServers: [
            {
              urls: ['turn:turn.cloudflare.com:3478?transport=udp'],
              username: 'user',
              credential: 'secret',
            },
          ],
        });
      },
    });
    servers = await startConversationTestServers({
      env: {
        CLOUDFLARE_TURN_KEY_ID: 'turn-key',
        CLOUDFLARE_TURN_API_TOKEN: 'turn-token',
        CLOUDFLARE_TURN_API_BASE_URL: `http://127.0.0.1:${fakeCloudflareServer.port}`,
      },
    });
    servers.browser.sendJson({ type: 'create_room', participantName: 'Asha', languageCode: 'hi' });

    const { iceServers } = await servers.browser.waitForMessage('ice_servers');

    expect(iceServers).toEqual([
      ...FREE_STUN_SERVERS,
      {
        urls: ['turn:turn.cloudflare.com:3478?transport=udp'],
        username: 'user',
        credential: 'secret',
      },
    ]);
    expect(turnRequests).toEqual([
      {
        path: '/v1/turn/keys/turn-key/credentials/generate-ice-servers',
        authorization: 'Bearer turn-token',
      },
    ]);
  });
});
