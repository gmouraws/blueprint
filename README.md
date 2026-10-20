# Blueprint Room

A private browser room for five friends: voice, screen sharing, and one ephemeral text channel. All application UI is Brazilian Portuguese. Code and repository documentation are English.

Next.js App Router on the existing Vercel project serves the UI, signed sessions, and token endpoints. Official LiveKit SDKs connect browsers directly to LiveKit Cloud. Upstash Redis stores short-lived authentication rate-limit counters only. No webcam, recordings, transcription, AI, analytics, or chat database.

```sh
npm ci
# Copy .env.example to .env.local and replace every placeholder.
npm run dev
```

Without valid configuration the entry page explicitly says configuration is required; there is no simulated call mode. See [setup and deployment](docs/IMPLEMENTATION.md), [security and architecture](docs/ARCHITECTURE.md), and [manual acceptance](docs/ACCEPTANCE.md).

```sh
npm run check
npm run build
npx playwright install chromium
npm run test:e2e
```

This branch is for preview review only. Do not merge or promote it until real-device acceptance is complete. The old public website remains recoverable at `9cebdeb8e924c69ca16d92be8bb2774c217f682e`; see the recovery procedure in the setup guide.
