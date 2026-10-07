import { About } from '@/components/pages';
import { pageMetadata } from '@/lib/seo';
import { words } from '@/lib/i18n';
export const metadata = pageMetadata('pt-BR', words['pt-BR'].about, words['pt-BR'].aboutText, 'about');
export default function Page() { return <About locale="pt-BR" />; }
