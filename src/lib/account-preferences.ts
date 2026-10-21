import { z } from 'zod';
import { validateShortcuts, type Shortcuts } from './client/shortcuts';
export const platforms = ['windows', 'mac', 'other', 'browser', 'windowsDesktop'] as const;
export const bindingsSchema = z.object({ microphone: z.string(), listening: z.string(), all: z.string() }).strict().refine(value => JSON.stringify(validateShortcuts(value)) === JSON.stringify(value));
export const accountPreferencesSchema = z.object({
  sounds: z.boolean().optional(), screenVolume: z.number().int().min(0).max(100).optional(),
  shortcuts: z.object({ windows: bindingsSchema.optional(), mac: bindingsSchema.optional(), other: bindingsSchema.optional(), browser: bindingsSchema.optional(), windowsDesktop: bindingsSchema.optional() }).strict().optional(),
}).strict();
export type AccountPreferences = { sounds?: boolean; screenVolume?: number; shortcuts?: Partial<Record<typeof platforms[number], Shortcuts>> };
export function accountPreferences(value: unknown): AccountPreferences { return accountPreferencesSchema.safeParse(value).data ?? {}; }
