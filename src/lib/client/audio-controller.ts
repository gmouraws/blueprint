export type AudioAction = 'microphone' | 'listening' | 'all';
type MicrophoneState = { enabled: boolean; track?: unknown; device?: string };
type Ports = {
  microphone: () => MicrophoneState;
  available: () => boolean;
  setMicrophone: (enabled: boolean, existingOnly?: boolean) => Promise<boolean>;
  changed: (state: { muted: boolean; combined: boolean; busy: boolean }) => void;
};

// Transient call state only: preferences must never restore capture automatically.
export class AudioController {
  private muted = false;
  private snapshot?: MicrophoneState & { muted: boolean };
  private busy = false;
  private generation = 0;
  constructor(private ports: Ports) {}
  private emit() { this.ports.changed({ muted: this.muted, combined: !!this.snapshot, busy: this.busy }); }
  invalidate() { this.generation++; this.snapshot = undefined; this.busy = false; this.emit(); }
  async dispatch(action: AudioAction) {
    // Listening remains independent even while microphone permission is pending.
    if (action === 'listening') {
      this.snapshot = undefined; this.muted = !this.muted; this.emit(); return;
    }
    // A combined mute can cancel an in-flight activation; restoration cannot.
    if (this.busy && !(action === 'all' && !this.snapshot)) return;
    if (action === 'microphone' && !this.ports.available()) return;
    const version = ++this.generation;
    const snapshot = this.snapshot;
    if (action === 'all' && !snapshot) {
      this.snapshot = { ...this.ports.microphone(), muted: this.muted };
      this.muted = true;
    } else {
      this.snapshot = undefined;
      if (action === 'all') this.muted = snapshot!.muted;
    }
    this.busy = true; this.emit();
    try {
      if (action === 'all' && snapshot) {
        const current = this.ports.microphone();
        if (snapshot.enabled && snapshot.track && current.track === snapshot.track && current.device === snapshot.device && this.ports.available()) {
          await this.ports.setMicrophone(true, true);
        }
      } else {
        const success = await this.ports.setMicrophone(action === 'microphone' ? !this.ports.microphone().enabled : false);
        if (!success && version === this.generation) this.snapshot = undefined;
      }
    } finally {
      if (version === this.generation) { this.busy = false; this.emit(); }
    }
  }
}
