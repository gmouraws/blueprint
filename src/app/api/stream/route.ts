import { streamHandler } from '@/lib/server/stream-handlers';
import type { NextRequest } from 'next/server';
import { after } from 'next/server';
import { settleStreamAnnouncements } from '@/lib/server/stream-announcements';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export const POST = async (request: NextRequest) => {
  const response = await streamHandler(request);
  if (response.ok) after(() => settleStreamAnnouncements().catch(() => { console.warn('stream_announcement_pending'); }));
  return response;
};
