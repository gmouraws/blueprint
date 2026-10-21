import type { NextRequest } from 'next/server';
import { voiceHandler } from '@/lib/server/voice-handlers';
export const runtime = 'nodejs';
export const POST = (request: NextRequest) => voiceHandler(request, true);
