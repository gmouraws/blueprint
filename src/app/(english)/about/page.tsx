import { About } from '@/components/pages';
import { pageMetadata } from '@/lib/seo';
import { words } from '@/lib/i18n';
export const metadata = pageMetadata('en', words['en'].about, words['en'].aboutText, 'about');
export default function Page() { return <About locale="en" />; }
