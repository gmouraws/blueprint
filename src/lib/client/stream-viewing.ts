export type Viewing = { connectionId: string; trackSid: string | null };
export function confirmedVideoSid(connected: boolean, publications: Iterable<{ source: string; isSubscribed: boolean; track?: unknown; trackSid: string }>) {
  if (connected) for (const publication of publications) if (publication.source === 'screen_share' && publication.isSubscribed && publication.track) return publication.trackSid;
  return null;
}

// Serialize updates so a slow previous subscription cannot overwrite a newer one.
// Call sync on SDK subscription events and existing discovery ticks (retry after failure).
export function viewingReporter(read: () => Viewing | null, send: (value: Viewing) => Promise<unknown>) {
  let active = true, dirty = false, last = '', running: Promise<void> | undefined;
  const sync = () => {
    dirty = true;
    if (!running) running = (async () => {
      while (active && dirty) {
        dirty = false;
        const value = read(); if (!value) { last = ''; continue; }
        const key = JSON.stringify(value); if (key === last) continue;
        try { await send(value); last = key; } catch { /* Metrics never interrupt media; next event/discovery retries. */ }
      }
    })().finally(() => { running = undefined; if (active && dirty) void sync(); });
    return running;
  };
  return { sync, stop: () => { active = false; } };
}
