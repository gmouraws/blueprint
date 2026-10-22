// Only a one-use, 60-second server capability crosses the OS protocol boundary.
export function streamScheme(profile) { return profile === 'production' ? 'blueprint-room' : 'blueprint-room-preview'; }
export function parseStreamLink(value, profile) {
  if (typeof value !== 'string' || value.length > 200) return null;
  const match = new RegExp(`^${streamScheme(profile)}://stream/?\\?intent=(watch|share)#invite=([A-Za-z0-9_-]{43})$`).exec(value);
  return match ? { intent: match[1], credential: match[2] } : null;
}
export function streamLinkFromArgs(args, profile) {
  const links = (Array.isArray(args) ? args : []).map(value => parseStreamLink(value, profile)).filter(Boolean);
  return links.length === 1 ? links[0] : null;
}
export function streamPage(url, origin) {
  try { const u = new URL(url); return u.origin === origin && u.protocol === 'https:' && !u.username && !u.password && u.pathname === '/stream'; } catch { return false; }
}
