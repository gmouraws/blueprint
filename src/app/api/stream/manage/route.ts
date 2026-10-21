import { streamHandler } from '@/lib/server/stream-handlers';
import type { NextRequest } from 'next/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const POST = (request: NextRequest) => streamHandler(request, true);
