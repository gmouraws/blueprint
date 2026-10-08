import { Privacy } from '@/components/pages';
import { pageMetadata } from '@/lib/seo';
import { words } from '@/lib/i18n';
export const metadata = pageMetadata('en', words['en'].privacy, words['en'].privacyText, 'privacy');
export default function Page() { return <Privacy locale="en" />; }
