import { streamEventHandler } from '@/lib/server/stream-events';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export const POST = (request: Request) => streamEventHandler(request);
