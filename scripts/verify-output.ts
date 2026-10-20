import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const appPaths = JSON.parse(readFileSync('.next/server/app-paths-manifest.json', 'utf8'));
const prerender = JSON.parse(readFileSync('.next/prerender-manifest.json', 'utf8'));
assert.ok(!Object.hasOwn(prerender.routes, '/'), 'Entry configuration must be evaluated at request time, not prerendered');
for (const route of ['/page', '/api/login/route', '/api/token/route', '/api/logout/route', '/api/chat/route', '/api/chat/cleanup/route', '/robots.txt/route']) assert.ok(appPaths[route], `Missing route: ${route}`);
assert.ok(!Object.keys(appPaths).some(route => /\/(?:pt|about|privacy|builds|notes|experiments|sitemap\.xml)(?:\/|$)/.test(route)), 'Obsolete public route emitted');
function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(path.join(directory, entry.name)) : [path.join(directory, entry.name)]);
}
const secrets = ['ROOM_PASSWORD', 'SESSION_SECRET', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET', 'UPSTASH_REDIS_REST_TOKEN', 'DATABASE_URL', 'DATABASE_URL_UNPOOLED', 'CRON_SECRET'].map(key => process.env[key]).filter((value): value is string => !!value && value.length >= 8);
for (const file of files('.next/static').filter(file => /\.(?:js|map|html)$/.test(file))) {
  const contents = readFileSync(file, 'utf8');
  assert.ok(secrets.every(secret => !contents.includes(secret)), `Server secret found in browser artifact: ${file}`);
  assert.ok(!contents.includes('@vercel/analytics'), 'Analytics included in browser output');
}
assert.ok(!existsSync('src/app/sitemap.ts') && !existsSync('content'), 'Old public content retained');
console.log(`Verified private-room routes, removed public content/analytics, and browser secret isolation (${secrets.length} configured secret values checked).`);
