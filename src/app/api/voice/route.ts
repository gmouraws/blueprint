import { voiceHandler } from '@/lib/server/voice-handlers';
export const runtime = 'nodejs';
export const GET = (request: NextRequest) => voiceHandler(request);
import type { NextRequest } from 'next/server';
