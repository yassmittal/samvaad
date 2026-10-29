/** The link that opens a room's join screen, such as `https://…/room/K7MQ2X`. */
export function createRoomUrl({ origin, roomCode }: { origin: string; roomCode: string }): string {
  return new URL(`/room/${roomCode}`, origin).toString();
}
