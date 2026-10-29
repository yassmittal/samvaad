import type { Metadata } from 'next';
import { TableConversation } from '@/features/conversation/table-conversation';

export const metadata: Metadata = { title: 'Table mode · Samvaad' };

export default function TablePage() {
  return <TableConversation />;
}
