import { Brand } from '@/components/icons';
import { WindowsDownload } from '@/components/windows-download';
import { DesktopSettings } from '@/components/desktop-settings';
import Link from 'next/link';
export const dynamic = 'force-dynamic';
export default function Page() {
  return <main className="entry-page"><header className="entry-header"><Brand/><Link href="/admin" className="muted">Administração</Link></header>
    <section className="entry-content"><div className="entry-form-section"><h1>Compartilhe sua tela</h1>
      <p>Use <strong>/blueprint</strong> no Discord ou abra um convite privado para transmitir e assistir.</p>
      <p className="muted">A conversa fica no Discord. Aqui, somente a tela e o áudio que você escolher.</p>
      <Link className="primary join-button" href="/stream">Abrir transmissões</Link>
      <DesktopSettings/><WindowsDownload/>
    </div></section></main>;
}
