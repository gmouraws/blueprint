import { SectionPage } from '@/components/pages';
import { pageMetadata } from '@/lib/seo';
import { words } from '@/lib/i18n';
export const metadata = pageMetadata('en', words['en'].builds, words['en'].descriptions.builds, 'builds');
export default function Page() { return <SectionPage locale="en" section="builds" />; }
