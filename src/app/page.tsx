import Entry from '@/components/entry';
import { cookies } from 'next/headers';
import { accountConfigurationStatus } from '@/lib/server/account-configuration';
import { getConfig } from '@/lib/server/config';
import { COOKIE_NAME, verifySession } from '@/lib/server/session';
export const dynamic = 'force-dynamic';
export default async function Page() {
  const configuration = await accountConfigurationStatus();
  const session = configuration.ready ? await verifySession((await cookies()).get(COOKIE_NAME)?.value, getConfig()) : null;
  // Only presentation data crosses the boundary; the credential stays HttpOnly.
  return <Entry configuration={configuration} initialNickname={session?.nickname ?? null} />;
}
