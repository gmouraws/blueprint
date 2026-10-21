import 'server-only';
import { z } from 'zod';
import { configurationStatus, type ConfigurationStatus } from './config';
import { accountTransaction } from './account-db';
export async function accountConfigurationStatus(): Promise<ConfigurationStatus> {
  const status = configurationStatus();
  const required = { BETTER_AUTH_SECRET: z.string().min(32), RESEND_API_KEY: z.string().startsWith('re_').min(20), RESEND_FROM: z.string().email(), DATABASE_URL: z.string().min(1) };
  for (const [name, schema] of Object.entries(required)) {
    const value = process.env[name];
    if (!schema.safeParse(value).success || value?.includes('replace-with')) status.issues.push({ name, status: !value ? 'missing' : value.includes('replace-with') ? 'placeholder' : 'invalid' });
  }
  if (!status.issues.length) {
    try {
      await accountTransaction(async db => {
        await db.query('SELECT id FROM blueprint_user LIMIT 0');
        const bootstrap = await db.query("SELECT 1 FROM blueprint_user WHERE role = 'owner' AND status = 'active' UNION ALL SELECT 1 FROM blueprint_invitation WHERE role = 'owner' AND revoked_at IS NULL AND accepted_at IS NULL AND expires_at > now() LIMIT 1");
        if (!bootstrap.rows.length) status.issues.push({ name: 'OWNER_BOOTSTRAP', status: 'missing' });
      });
    } catch { status.issues.push({ name: 'ACCOUNT_DATABASE', status: 'invalid' }); }
  }
  return { ready: !status.issues.length, issues: status.issues };
}
