import { Home } from '@/components/pages';
import { pageMetadata } from '@/lib/seo';
import { words } from '@/lib/i18n';
export const metadata = pageMetadata('en', words['en'].lab, words['en'].intro);
export default function Page() { return <Home locale="en" />; }
