import Entry from '@/components/entry';
import { cookies } from 'next/headers';
import { accountConfigurationStatus } from '@/lib/server/account-configuration';
import { getConfig } from '@/lib/server/config';
import { COOKIE_NAME, verifySession } from '@/lib/server/session';
import { landingLocale } from '@/lib/landing';
export const dynamic = 'force-dynamic';
export default async function Page({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const configuration = await accountConfigurationStatus();
  const session = configuration.ready ? await verifySession((await cookies()).get(COOKIE_NAME)?.value, getConfig()) : null;
  // Only presentation data crosses the boundary; the credential stays HttpOnly.
  const locale = landingLocale((await searchParams).lang) ?? landingLocale((await cookies()).get('blueprint_landing_language')?.value) ?? 'pt-BR';
  return <Entry configuration={configuration} initialNickname={session?.nickname ?? null} initialRole={session?.role ?? null} locale={locale}/>;
}
