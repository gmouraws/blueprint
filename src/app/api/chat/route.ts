import { chatHandlers } from '@/lib/server/chat-handlers';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const { GET, POST } = chatHandlers();
