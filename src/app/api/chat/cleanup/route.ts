import { cleanupHandler } from '@/lib/server/chat-handlers';
import type { NextRequest } from 'next/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const GET = (request: NextRequest) => cleanupHandler(request);
