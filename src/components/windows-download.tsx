import { validWindowsRelease, windowsRelease } from '@/lib/windows-release';
export function WindowsDownload() {
  if (!validWindowsRelease(windowsRelease) || !windowsRelease) return null;
  return <aside className="windows-download"><a href={windowsRelease.url} target="_blank" rel="noopener noreferrer">Baixar para Windows</a><p className="muted">{windowsRelease.version} · Windows x64 · Versão de teste sem assinatura</p><a href={windowsRelease.checksumUrl} target="_blank" rel="noopener noreferrer">Verificar SHA-256</a><details><summary>Checksum do instalador</summary><code>{windowsRelease.sha256}</code></details></aside>;
}
