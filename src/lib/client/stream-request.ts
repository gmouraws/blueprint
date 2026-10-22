export class StreamRequestError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

// Retry only a fenced-lock rejection: the server has not started the operation.
// Network failures and other 409s may be ambiguous and must never replay tickets.
export async function streamRequest(body: object, keepalive = false, deps = {
  fetch: globalThis.fetch,
  wait: (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)),
}) {
  const signal = AbortSignal.timeout(15000);
  for (let attempt = 0; ; attempt++) {
    const response = await deps.fetch('/api/stream', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store', keepalive, signal });
    const result = await response.json();
    if (response.status === 409 && result.code === 'STREAM_BUSY' && attempt < 3 && !keepalive) {
      await deps.wait(300 * 2 ** attempt + Math.floor(Math.random() * 200));
      signal.throwIfAborted();
      continue;
    }
    if (!response.ok) throw new StreamRequestError(result.error || 'Espaço indisponível.', response.status);
    return result;
  }
}
