import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'Blueprint · Transmissões',
  description: 'Transmissões privadas de tela e áudio entre amigos.',
  robots: { index: false, follow: false, nocache: true },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
