import type { Metadata } from 'next';
import { RoomConversation } from '@/features/rooms/room-conversation';

export const metadata: Metadata = { title: 'Start a call · Samvaad' };

export default function NewRoomPage() {
  return <RoomConversation requestedRoomCode={null} />;
}
