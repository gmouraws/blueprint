import type { Room } from 'livekit-client';

export class VoiceConnectionTimeout extends Error {}

// Cloud region retries can outlast individual SDK transport timeouts.
// Always cancel the old connection before allowing another attempt.
export async function connectRoom(room: Pick<Room, 'connect' | 'disconnect'>, serverUrl: string, token: string, timeoutMs = 35000) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      room.connect(serverUrl, token, { autoSubscribe: true }),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new VoiceConnectionTimeout()), timeoutMs); }),
    ]);
  } catch (error) {
    await room.disconnect(true);
    throw error;
  } finally { clearTimeout(timer); }
}
