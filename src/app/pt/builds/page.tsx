import { SectionPage } from '@/components/pages';
import { pageMetadata } from '@/lib/seo';
import { words } from '@/lib/i18n';
export const metadata = pageMetadata('pt-BR', words['pt-BR'].builds, words['pt-BR'].descriptions.builds, 'builds');
export default function Page() { return <SectionPage locale="pt-BR" section="builds" />; }
