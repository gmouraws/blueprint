const profiles: Record<string, string> = {
  'https://www.blueprint.app.br': 'blueprint-room',
  'https://blueprint-git-codex-windows-room-gmouraws-8238s-projects.vercel.app': 'blueprint-room-preview',
};
export const streamDesktopScheme = (origin: string) => profiles[origin];
export function streamDesktopCaptureState(share: boolean, sessionExpires: number, now = Date.now()) {
  if (!share || !Number.isSafeInteger(sessionExpires) || sessionExpires <= now) return { available: false, expires: 0 };
  // The native guard measures its upper bound on the PC's clock. Sending a new
  // server-issued 12-hour deadline can exceed that bound with even small skew.
  // Refresh a shorter, conservative capture lease; server authorization, the
  // absolute session expiry and the native 15-second heartbeat remain required.
  return { available: true, expires: Math.min(sessionExpires, now + 60000) };
}
export function streamDesktopUrl(origin: string, credential: unknown, intent: string) {
  const scheme = streamDesktopScheme(origin);
  if (!scheme || typeof credential !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(credential)) throw Error('Invalid handoff');
  return `${scheme}://stream?intent=${intent === 'share' ? 'share' : 'watch'}#invite=${credential}`;
}
