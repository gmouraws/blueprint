import { after } from 'next/server';
import { discordHandler } from '@/lib/server/discord-interactions';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;
export const POST = (request: Request) => discordHandler(request, after);
