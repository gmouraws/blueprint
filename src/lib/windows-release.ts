// A reviewed, published production-targeted installer is required before enabling this manifest.
// Draft releases/CI artifacts must never be exposed here.
export type WindowsRelease = { version: string; url: string; sha256: string; checksumUrl: string; profile: 'production'; approved: true };
export const windowsRelease: WindowsRelease | null = null;
export function validWindowsRelease(release: WindowsRelease | null) {
  if (!release || release.approved !== true || release.profile !== 'production' || !/^\d+\.\d+\.\d+(?:-[\w.]+)?$/.test(release.version) || !/^[a-f0-9]{64}$/.test(release.sha256)) return false;
  const base = 'https://github.com/gmouraws/blueprint/releases/download/';
  return release.url.startsWith(base) && /\/Blueprint-Room-production-[\w.-]+-x64-setup\.exe$/.test(release.url) && release.checksumUrl.startsWith(base) && release.checksumUrl.endsWith('/SHA256SUMS-production.txt');
}
