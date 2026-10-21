// Keep retry metadata until both objects are gone; one failed object must not
// prevent the remaining items in the bounded batch from being cleaned.
export async function drainImageCleanup(ids: string[], removeObjects: (id: string) => Promise<void>, removeMetadata: (id: string) => Promise<void>) {
  let failed = false;
  for (const id of ids) {
    try { await removeObjects(id); await removeMetadata(id); } catch { failed = true; }
  }
  if (failed) throw new Error('Image cleanup remains pending');
}
