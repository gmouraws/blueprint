import { cleanupHandler } from '@/lib/server/chat-handlers';
import type { NextRequest } from 'next/server';
import { cleanChat } from '@/lib/server/chat-store';
import { getConfig } from '@/lib/server/config';
import { streamService } from '@/lib/server/stream-space';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const GET = (request: NextRequest) => cleanupHandler(request, async () => {
  await cleanChat();
  if (await streamService(getConfig()).cleanup()) throw new Error('Stream cleanup pending');
});
