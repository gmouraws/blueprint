import type { AudioAction } from './client/audio-controller';
import type { Shortcuts } from './client/shortcuts';
export type DesktopState = { bindings: Shortcuts; available: boolean; microphone: boolean; muted: boolean; combined: boolean };
declare global {
  interface Window {
    blueprintStreamDesktop?: {
      version: 1;
      diagnostic?(stage: 'ticket_redeemed' | 'ticket_rejected' | 'media_connected' | 'media_failed'): Promise<void>;
      consumeInvite(): Promise<string | null>;
      configure(state: { available: boolean; expires: number }): Promise<{ ready: boolean }>;
    };
    blueprintDesktop?: {
      configure(state: DesktopState): Promise<{ conflicts: string[] }>;
      onAction(callback: (action: AudioAction) => void): () => void;
      onConflicts(callback: (conflicts: string[]) => void): () => void;
      settings(): Promise<{ startup: boolean; profile: string; version: string }>;
      startup(enabled: boolean): Promise<boolean>;
    };
  }
}
