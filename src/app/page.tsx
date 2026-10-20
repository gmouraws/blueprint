import Entry from '@/components/entry';
import { configurationStatus } from '@/lib/server/config';
export const dynamic = 'force-dynamic';
export default function Page() { return <Entry configuration={configurationStatus()} />; }
