import Entry from '@/components/entry';
import { configuration } from '@/lib/server/config';
export const dynamic = 'force-dynamic';
export default function Page() { return <Entry configured={configuration().success} />; }
