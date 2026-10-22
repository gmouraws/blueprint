'use client';
import { useEffect, useState } from 'react';
import { ConnectionState, LocalVideoTrack, LocalAudioTrack, RemoteVideoTrack, RemoteAudioTrack, type Room } from 'livekit-client';
type Day = { day: string; connectedSeconds: number; sentVideo: number; sentAudio: number; receivedVideo: number; receivedAudio: number; samples: number; width: number; height: number; fps: number };
const key = 'blueprint:stream-usage:v1';
function validate(rows: unknown): Day[] {
  if (!Array.isArray(rows)) return [];
  return rows.filter((row): row is Day => !!row && typeof row.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(row.day) && ['connectedSeconds','sentVideo','sentAudio','receivedVideo','receivedAudio','samples','width','height','fps'].every(field => Number.isFinite(row[field]) && row[field] >= 0)).slice(-28).map(row => ({day: row.day, connectedSeconds: row.connectedSeconds, sentVideo: row.sentVideo, sentAudio: row.sentAudio, receivedVideo: row.receivedVideo, receivedAudio: row.receivedAudio, samples: row.samples, width: row.width, height: row.height, fps: row.fps}));
}
async function read(): Promise<Day[]> {
  try {
    const native = window.blueprintStreamDesktop;
    return validate(native?.usageRead ? await native.usageRead() : JSON.parse(localStorage.getItem(key) ?? '[]'));
  } catch { return []; }
}
export function StreamMetrics({ room }: { room: Room }) {
  const [rows, setRows] = useState<Day[]>([]);
  useEffect(() => {
    let active = true, busy = false, previousTime = performance.now();
    const previous = new Map<string, number>();
    async function sample() {
      if (busy) return;
      busy = true;
      try {
        const time = performance.now(), seconds = Math.min(20, Math.max(0, (time - previousTime) / 1000)); previousTime = time;
        if (room.state !== ConnectionState.Connected) { previous.clear(); return; }
        const row: Day = { day: new Date().toISOString().slice(0,10), connectedSeconds: seconds, sentVideo: 0, sentAudio: 0, receivedVideo: 0, receivedAudio: 0, samples: 0, width: 0, height: 0, fps: 0 };
        const participants = [room.localParticipant, ...room.remoteParticipants.values()];
        for (const participant of participants) for (const publication of participant.trackPublications.values()) {
          const track = publication.track; if (!track) continue;
          let bytes = 0;
          let field: 'sentVideo' | 'sentAudio' | 'receivedVideo' | 'receivedAudio';
          if (track instanceof LocalVideoTrack) {
            const stats = await track.getSenderStats(); bytes = stats.reduce((sum, layer) => sum + (layer.bytesSent ?? 0), 0); field = 'sentVideo';
            const layer = stats.reduce<(typeof stats)[number] | undefined>((largest, value) => !largest || value.frameWidth * value.frameHeight > largest.frameWidth * largest.frameHeight ? value : largest, undefined);
            if (layer) { row.samples++; row.width = layer.frameWidth; row.height = layer.frameHeight; row.fps = layer.framesPerSecond; }
          } else if (track instanceof LocalAudioTrack) { bytes = (await track.getSenderStats())?.bytesSent ?? 0; field = 'sentAudio'; }
          else if (track instanceof RemoteVideoTrack) { bytes = (await track.getReceiverStats())?.bytesReceived ?? 0; field = 'receivedVideo'; }
          else if (track instanceof RemoteAudioTrack) { bytes = (await track.getReceiverStats())?.bytesReceived ?? 0; field = 'receivedAudio'; }
          else continue;
          const old = previous.get(publication.trackSid); previous.set(publication.trackSid, bytes);
          if (old !== undefined && bytes >= old) row[field] += bytes - old;
        }
        if (!active) return;
        const history = (await read()).filter(item => Date.parse(item.day) >= Date.now() - 28 * 86400000);
        const day = history.find(item => item.day === row.day);
        if (day) { for (const field of ['connectedSeconds','sentVideo','sentAudio','receivedVideo','receivedAudio','samples'] as const) day[field] += row[field]; if (row.samples) { day.width = row.width; day.height = row.height; day.fps = row.fps; } }
        else history.push(row);
        try { if (window.blueprintStreamDesktop?.usageWrite) await window.blueprintStreamDesktop.usageWrite(history.slice(-28)); else localStorage.setItem(key, JSON.stringify(history.slice(-28))); } catch { /* Optional device-local estimates. */ }
        setRows(history);
      } catch { /* Missing browser stats must never interrupt media. */ }
      finally { busy = false; }
    }
    const timer = setInterval(() => void sample(), 10000);
    return () => { active = false; clearInterval(timer); };
  }, [room]);
  return <details className="screen-measurements" onToggle={event => { if (event.currentTarget.open) void read().then(setRows); }}><summary>Consumo neste dispositivo</summary>
    <p className="muted">Estimativas locais por até 28 dias, sem conteúdo ou identidade. Amostragem a cada 10 segundos; não substitui a fatura do LiveKit e pode subestimar sessões curtas. Tráfego de áudio separado; overhead não incluído.</p>
    {rows.map(row => <p key={row.day}>{row.day}: {(row.connectedSeconds / 60).toFixed(1)} min conectados · vídeo enviado {(row.sentVideo / 1e6).toFixed(1)} MB · áudio enviado {(row.sentAudio / 1e6).toFixed(1)} MB · vídeo recebido {(row.receivedVideo / 1e6).toFixed(1)} MB · áudio recebido {(row.receivedAudio / 1e6).toFixed(1)} MB{row.samples > 0 && ` · último envio ${row.width}×${row.height}, ${row.fps.toFixed(1)} fps`}</p>)}
    <button onClick={() => { try { if (window.blueprintStreamDesktop?.usageWrite) void window.blueprintStreamDesktop.usageWrite([]).catch(() => undefined); else localStorage.removeItem(key); } catch {} setRows([]); }}>Limpar medições locais</button>
  </details>;
}
