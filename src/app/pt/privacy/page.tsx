import { Privacy } from '@/components/pages';
import { pageMetadata } from '@/lib/seo';
import { words } from '@/lib/i18n';
export const metadata = pageMetadata('pt-BR', words['pt-BR'].privacy, words['pt-BR'].privacyText, 'privacy');
export default function Page() { return <Privacy locale="pt-BR" />; }
