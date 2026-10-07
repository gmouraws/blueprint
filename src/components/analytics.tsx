'use client';
import { Analytics } from '@vercel/analytics/next';
import { privatePageview } from '@/lib/analytics';
export function WebAnalytics() { return <Analytics beforeSend={privatePageview} />; }
