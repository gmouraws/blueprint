const profiles: Record<string, string> = {
  'https://www.blueprint.app.br': 'blueprint-room',
  'https://blueprint-git-codex-windows-room-gmouraws-8238s-projects.vercel.app': 'blueprint-room-preview',
};
export const streamDesktopScheme = (origin: string) => profiles[origin];
export function streamDesktopUrl(origin: string, credential: unknown, intent: string) {
  const scheme = streamDesktopScheme(origin);
  if (!scheme || typeof credential !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(credential)) throw Error('Invalid handoff');
  return `${scheme}://stream?intent=${intent === 'share' ? 'share' : 'watch'}#invite=${credential}`;
}
