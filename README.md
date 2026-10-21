# Blueprint Room

A private browser room for up to eight friends: voice, screen sharing, and one shared text channel with 30-day history and private images. All application UI is Brazilian Portuguese. Code and repository documentation are English.

Next.js App Router on the existing Vercel project serves the UI, signed sessions, and token endpoints. Official LiveKit SDKs connect browsers directly to LiveKit Cloud. Upstash Redis enforces authentication rate limits and combined admission across two voice rooms. Neon PostgreSQL stores chat and attachment metadata; private Vercel Blob stores validated images. No webcam, recordings, transcription, AI or analytics. The two-room/image extension is Preview-only until separately approved.

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

The owner has authorized production replacement through the existing Git integration. This authorization does not establish that multi-user voice or screen sharing has passed real-device testing; see [release scope and rollback](docs/RELEASE.md). The old public website remains recoverable at `9cebdeb8e924c69ca16d92be8bb2774c217f682e`; see the recovery procedure in the setup guide.
