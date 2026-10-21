# Chat storage and retention

## Provisioned resources

The owner authorized free Neon provisioning through the existing Blueprint Vercel Marketplace integration. The owner completed Vercel login, Neon terms acceptance and email activation. Plan `free_v3` was verified before creation and afterwards: **Free, no payment method required**. No upgrade, billing add-on, Neon Auth, Neon Realtime or automatic branch cloning was enabled.

| Environment | Neon project | Vercel store | Connection scope |
| --- | --- | --- | --- |
| Preview | `blueprint-room-preview` / `wispy-art-99499480` | `store_w238yA5jRirM7vFp` | Preview only |
| Production | `blueprint-room-production` / `green-poetry-18415626` | `store_iH1YSmxS7vii5LKz` | Production only |

Both are in AWS US East 1 / Vercel `iad1`, connected exclusively to Blueprint project `prj_hNhWNMGea9fQLySMr6CfR92BodNS`. Each has its own credentials and environment marker. Their schema v1 migrations were executed through the authenticated Neon SQL Editor; subsequent queries confirmed the correct environment, schema version and zero existing messages. Provisioning a production database is not an application deployment: main and the production application were not changed.

A separate Preview-only SQL transaction verified environment mismatch rejection, idempotent insertion, 30-day read exclusion and expired-row cleanup, then rolled back its disposable records. After deployment, the owner authenticated in Preview and a browser check saved one clearly identified verification message, reloaded the page and recovered it through Chat without joining voice. This separately verified the real session/Redis/HTTP/Neon path. The verification message remains only in Preview and follows normal retention.

## Variables

- `DATABASE_URL`: server-only pooled TLS connection, automatically installed by Marketplace with distinct Preview and Production values. Required only by chat operations, not to join voice. Never use Production credentials locally.
- `DATABASE_URL_UNPOOLED`: automatically supplied direct connection; optional for administrative tooling. This implementation uses `DATABASE_URL` with the HTTP driver, including migrations.
- `CRON_SECRET`: separate random 48-byte secrets generated and saved as sensitive variables for Preview and Production; authorizes only cleanup, not chat access. Never send it to the browser or include it in a URL.
- `CHAT_ENVIRONMENT`: explicitly `development`, `preview` or `production` for local administration. On Vercel, trusted `VERCEL_ENV` is authoritative and cannot be overridden by this variable.

Marketplace also adds PostgreSQL compatibility variables; the application does not read them. Existing authentication, LiveKit and Redis variables are unchanged. No `NEXT_PUBLIC_` database configuration exists. The two databases are independent rather than clones. Preview credentials have no access to Production; the application also refuses an environment-marker mismatch.

## Migration and verification

`migrations/001-chat.sql` is the schema source. It creates two tables, the expiry index and two PostgreSQL functions; it does not publish content or seed production history. The application never migrates during requests or builds. The migration script is transactional, repeatable and refuses to relabel an already-bound database.

For local administrative execution, place only the intended database connection and `CHAT_ENVIRONMENT` in an ignored `.env.chat.local`, supplied through secure provider tooling. Never paste credentials into tickets or terminal arguments. Run:

```sh
node --env-file=.env.chat.local --conditions=react-server --import tsx scripts/migrate-chat.ts
node --env-file=.env.chat.local --conditions=react-server --import tsx scripts/cleanup-chat.ts
```

If variables are already injected securely into the process, use `npm run db:migrate` or `npm run db:cleanup`. A failed command emits no raw provider error or connection string. Alternatively, the authenticated Neon SQL Editor can execute the migration inside `BEGIN`/`COMMIT`, followed by an environment insertion (`preview` or `production`, schema version `1`) and `blueprint_chat_assert_environment` for that environment. Never change an existing environment marker to make a mismatch pass.

Verify with a metadata-only query:

```sql
SELECT environment, schema_version FROM blueprint_chat_environment;
```

Future migrations must preserve backwards compatibility with the deployed application and retain the environment check. A rollback of application code does not roll back or delete chat history. Do not drop either database as part of routine release rollback.

## Retention and scheduler

Every read excludes `created_at <= now() - interval '30 days'`. The browser also removes already-loaded messages at expiry using a server-time offset. Cleanup deletes only expired rows; duplicate cleanup invocations are safe.

`vercel.json` schedules `/api/chat/cleanup` daily at `0 5 * * *` (UTC). Vercel supplies `Authorization: Bearer <CRON_SECRET>`; requests without a valid secret return 401. After a future authorized Production merge/deployment, verify the job in Project Settings → Cron Jobs and execute one Run Now check. No cron invocation is claimed before that release. Hobby has once-daily minimum frequency and approximate per-hour timing; failed invocations are not automatically retried. Check failed runs privately and rerun cleanup after restoring the database.

**Preview limitation:** Vercel does not schedule Preview cron jobs. Run `db:cleanup` against Preview's isolated database during Preview acceptance and periodically while keeping the Preview active. Expired rows are immediately excluded from history even without this physical cleanup. No extra scheduler/service or paid plan was introduced. Provider backup/history retention is separate from application visibility; deleting a row does not promise instantaneous erasure from provider backups.

## Capacity, privacy and operations

The installed Free plan advertises 1 GB per project and 100 CU-hours per project. The app does not auto-upgrade. Polling occurs only on visible pages, every ten seconds while viewing Chat or connected to voice. Authentication/rate-limit/database failure is reported; messages are never silently sent through an unsaved fallback. Monitor finite database, Redis and Vercel quotas privately. Continuously open clients consume compute and requests even in a small group.

Chat is plain text, at most 2000 UTF-8 bytes. Sender and timestamps come from the validated session/database. A request UUID is saved only to prevent duplicate writes. No message bodies, credentials or session tokens are logged; no analytics, read receipts, uploads, editing or extra channels were added. Shared-password access is suitable only for the approved trusted group. Members and providers can retain their own copies; this is not end-to-end encryption against the storage provider.

Sources: [Neon managed integration](https://neon.com/docs/guides/vercel-managed-integration), [Neon driver](https://neon.com/docs/serverless/serverless-driver), [Vercel Cron deployment scope](https://vercel.com/docs/cron-jobs/quickstart), [Cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing), [Cron security and failure behavior](https://vercel.com/docs/cron-jobs/manage-cron-jobs).

## Preview image extension (ADR-013)

Run both migrations in order using `npm run db:migrate` against only the intended environment. Migration 002 adds owner-bound attachment metadata and the atomic image/message write function; it is safe to rerun and does not delete existing messages. The environment binding remains mandatory. Do not deploy this feature before migration 002 exists in that environment.

`blueprint-room-images-preview` is a private Blob store in IAD1 on the existing Hobby plan, connected only to Blueprint Preview. `BLOB_READ_WRITE_TOKEN` is sensitive and scoped to Preview; `BLOB_ENVIRONMENT=preview` is also Preview-only. No paid plan or automatic upgrade was enabled. Production storage and schema are unchanged by this extension. Before a separately authorized production release, create a distinct private Production store, bind its environment, apply migration 002 there, and verify cleanup. Free storage/operation limits still apply; uploads fail visibly when the provider refuses them.

The existing cleanup endpoint/CLI also removes expired objects and orphaned uploads in batches of 100. Repeat maintenance for a backlog; failures preserve metadata so deletion can be retried. Never reuse a Production database or Blob token locally/in Preview. Never include credentials or client upload tokens in screenshots or logs.
