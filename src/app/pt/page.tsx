import { Home } from '@/components/pages';
import { pageMetadata } from '@/lib/seo';
import { words } from '@/lib/i18n';
export const metadata = pageMetadata('pt-BR', words['pt-BR'].lab, words['pt-BR'].intro);
export default function Page() { return <Home locale="pt-BR" />; }
