import { SectionPage } from '@/components/pages';
import { pageMetadata } from '@/lib/seo';
import { words } from '@/lib/i18n';
export const metadata = pageMetadata('pt-BR', words['pt-BR'].experiments, words['pt-BR'].descriptions.experiments, 'experiments');
export default function Page() { return <SectionPage locale="pt-BR" section="experiments" />; }
