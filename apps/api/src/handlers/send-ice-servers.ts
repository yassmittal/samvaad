import type { ConversationConnection } from './conversation-connection';

/** After `room_joined`: where this phone looks for the other one, for the real voice (D-023). */
export async function sendIceServers(connection: ConversationConnection): Promise<void> {
  const iceServers = await connection.iceServersClient.findIceServers();
  connection.sendServerMessage({ type: 'ice_servers', iceServers });
}
