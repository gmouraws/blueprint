import { cleanupHandler } from '@/lib/server/chat-handlers';
import type { NextRequest } from 'next/server';
import { cleanChat } from '@/lib/server/chat-store';
import { getConfig } from '@/lib/server/config';
import { streamService } from '@/lib/server/stream-space';
import { settleStreamAnnouncements } from '@/lib/server/stream-announcements';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export const GET = (request: NextRequest) => cleanupHandler(request, async () => {
  await cleanChat();
  if (await streamService(getConfig()).cleanup()) throw new Error('Stream cleanup pending');
  await settleStreamAnnouncements();
});
