import type { NextRequest } from 'next/server';
import { windowsHandler } from '@/lib/server/windows-handlers';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;
export const POST = (request: NextRequest) => windowsHandler(request);
