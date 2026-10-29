import { roomCodeSchema } from '@samvaad/shared';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { RoomConversation } from '@/features/rooms/room-conversation';

export const metadata: Metadata = { title: 'Join a room · Samvaad' };

export default async function RoomPage({ params }: PageProps<'/room/[roomCode]'>) {
  const parseResult = roomCodeSchema.safeParse((await params).roomCode);
  if (!parseResult.success) {
    notFound();
  }
  return <RoomConversation requestedRoomCode={parseResult.data} />;
}
