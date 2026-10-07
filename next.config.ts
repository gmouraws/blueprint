import type { NextConfig } from 'next';
const production = process.env.VERCEL_ENV === 'production';
const config: NextConfig = {
  agentRules: false,
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'no-referrer' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      { key: 'Content-Security-Policy', value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'" },
      ...(!production ? [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] : []),
    ] }];
  },
};
export default config;
