import { viewHandler } from '@/lib/server/view-handler';
import type { NextRequest } from 'next/server';
export const POST = (request: NextRequest) => viewHandler(request);
