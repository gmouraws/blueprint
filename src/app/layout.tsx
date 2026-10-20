import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'Blueprint Room · Entre amigos',
  description: 'Uma sala privada para conversar e compartilhar a tela entre amigos.',
  robots: { index: false, follow: false, nocache: true },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
