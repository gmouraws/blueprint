// A reviewed, published production-targeted installer is required before enabling this manifest.
// Draft releases/CI artifacts must never be exposed here.
export type WindowsRelease = { version: string; url: string; sha256: string; checksumUrl: string; profile: 'production'; approved: true };
export const windowsRelease: WindowsRelease | null = {
  version: '0.1.3', profile: 'production', approved: true,
  url: 'https://github.com/gmouraws/blueprint/releases/download/windows-v0.1.3/Blueprint-Room-production-0.1.3-x64-setup.exe',
  checksumUrl: 'https://github.com/gmouraws/blueprint/releases/download/windows-v0.1.3/SHA256SUMS-production.txt',
  sha256: '8ce762966d206758027374f4c6f59c1147ed733ae572c3ca7281857faf76645e',
};
export function validWindowsRelease(release: WindowsRelease | null) {
  if (!release || release.approved !== true || release.profile !== 'production' || !/^\d+\.\d+\.\d+(?:-[\w.]+)?$/.test(release.version) || !/^[a-f0-9]{64}$/.test(release.sha256)) return false;
  const base = `https://github.com/gmouraws/blueprint/releases/download/windows-v${release.version}/`;
  return release.url === `${base}Blueprint-Room-production-${release.version}-x64-setup.exe` && release.checksumUrl === `${base}SHA256SUMS-production.txt`;
}
