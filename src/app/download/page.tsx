import { cookies } from 'next/headers';
import { PrivateDownload } from '@/components/private-download';
import { COOKIE_NAME, verifySession } from '@/lib/server/session';
export const dynamic = 'force-dynamic';
export default async function Page() {
  let authenticated = false;
  try { authenticated = !!await verifySession((await cookies()).get(COOKIE_NAME)?.value); } catch { /* Fail closed without exposing configuration. */ }
  return <PrivateDownload authenticated={authenticated}/>;
}
