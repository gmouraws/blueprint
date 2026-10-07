import '../globals.css';
import type { ReactNode } from 'react';
import { Shell } from '@/components/shell';
export const metadata = { title: { default: 'Blueprint', template: '%s · Blueprint' } };
export default function Layout({children}: {children: ReactNode}) { return <Shell locale="en">{children}</Shell>; }
