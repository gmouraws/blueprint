// A reviewed, published production-targeted installer is required before enabling this manifest.
// Draft releases/CI artifacts must never be exposed here.
export type WindowsRelease = { version: string; url: string; sha256: string; checksumUrl: string; profile: 'production'; approved: true };
export const windowsRelease: WindowsRelease | null = {
  version: '0.1.6', profile: 'production', approved: true,
  url: 'https://github.com/gmouraws/blueprint/releases/download/windows-v0.1.6/Blueprint-Room-production-0.1.6-x64-setup.exe',
  checksumUrl: 'https://github.com/gmouraws/blueprint/releases/download/windows-v0.1.6/SHA256SUMS-production.txt',
  sha256: 'e01c3db9a3b85c6a378b3e047292a3dca847892b9f00a8d3716dec52ef1f8e55',
};
export function validWindowsRelease(release: WindowsRelease | null) {
  if (!release || release.approved !== true || release.profile !== 'production' || !/^\d+\.\d+\.\d+(?:-[\w.]+)?$/.test(release.version) || !/^[a-f0-9]{64}$/.test(release.sha256)) return false;
  const base = `https://github.com/gmouraws/blueprint/releases/download/windows-v${release.version}/`;
  return release.url === `${base}Blueprint-Room-production-${release.version}-x64-setup.exe` && release.checksumUrl === `${base}SHA256SUMS-production.txt`;
}
