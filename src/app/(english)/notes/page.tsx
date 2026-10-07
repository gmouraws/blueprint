import { SectionPage } from '@/components/pages';
import { pageMetadata } from '@/lib/seo';
import { words } from '@/lib/i18n';
export const metadata = pageMetadata('en', words['en'].notes, words['en'].descriptions.notes, 'notes');
export default function Page() { return <SectionPage locale="en" section="notes" />; }
