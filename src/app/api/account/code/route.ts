import { accountAuthHandler } from '@/lib/server/account-auth-handlers';
import type { NextRequest } from 'next/server';
export const POST = (request: NextRequest) => accountAuthHandler(request);
