import type { NextRequest } from 'next/server';
import { imageHandlers } from '@/lib/server/image-handlers';
export const runtime = 'nodejs';
export const GET = async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => imageHandlers()(request, (await params).id);
