import { imageHandlers } from '@/lib/server/image-handlers';
export const runtime = 'nodejs';
export const maxDuration = 60;
export const POST = (request: NextRequest) => imageHandlers()(request);
import type { NextRequest } from 'next/server';
