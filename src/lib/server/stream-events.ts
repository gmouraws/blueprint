import { WebhookReceiver } from 'livekit-server-sdk';
import { getConfig } from './config';
import { streamRoom } from './stream-space';
import { settleStreamAnnouncements } from './stream-announcements';



export const streamEventServices = { getConfig, settle: settleStreamAnnouncements };
export async function streamEventHandler(request: Request, deps = streamEventServices) {
  const headers = { 'Cache-Control': 'no-store' };
  try {
    const config = deps.getConfig();
    if (!request.headers.get('authorization')) return new Response(null, { status: 401, headers });
    if (Number(request.headers.get('content-length')) > 65536) return new Response(null, { status: 413, headers });
    const reader = request.body?.getReader(); if (!reader) return new Response(null, { status: 400, headers });
    const chunks: Uint8Array[] = []; let length = 0;
    const timeout = setTimeout(() => void reader.cancel(), 5000);
    try { while (true) { const chunk = await reader.read(); if (chunk.done) break; length += chunk.value.length; if (length > 65536) { await reader.cancel(); return new Response(null, { status: 413, headers }); } chunks.push(chunk.value); } } finally { clearTimeout(timeout); reader.releaseLock(); }
    let event;
    try { event = await new WebhookReceiver(config.LIVEKIT_API_KEY, config.LIVEKIT_API_SECRET).receive(Buffer.concat(chunks).toString('utf8'), request.headers.get('authorization')!); }
    catch { return new Response(null, { status: 401, headers }); }
    if (event.room?.name === streamRoom(config) && ['track_published', 'track_unpublished', 'participant_joined', 'participant_left', 'room_finished'].includes(event.event ?? '')) await deps.settle();
    return new Response(null, { status: 204, headers });
  } catch { return new Response(null, { status: 503, headers }); }
}
