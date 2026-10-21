'use client';
import { useEffect, useState } from 'react';
import { LocalVideoTrack, RemoteVideoTrack } from 'livekit-client';
import type { TrackReference } from '@livekit/components-react';

// Targets only. Negotiation, capture source, movement and available bandwidth determine delivery.
export const SCREEN_QUALITIES = {
  balanced: { label: '1080p · até 30 fps', width: 1920, height: 1080, frameRate: 30, bitrate: 5_000_000 },
  motion: { label: '720p · até 60 fps', width: 1280, height: 720, frameRate: 60, bitrate: 5_000_000 },
  detail: { label: '1080p · até 60 fps', width: 1920, height: 1080, frameRate: 60, bitrate: 8_000_000 },
};
export type ScreenQuality = keyof typeof SCREEN_QUALITIES;
export function ScreenMeasurements({ track }: { track?: TrackReference }) {
  const [measurement, setMeasurement] = useState('Aguardando medições…');
  useEffect(() => {
    let active = true; let pending = false;
    let previous: { frames: number; time: number } | undefined;
    const measure = async () => {
      if (pending) return; pending = true;
      try {
        const video = track?.publication.track;
        if (!video) return;
        const dimensions = video.mediaStreamTrack.getSettings();
        if (video instanceof LocalVideoTrack) {
          const stats = await video.getSenderStats();
          const layers = stats.map(layer => `${layer.frameWidth ?? '?'}×${layer.frameHeight ?? '?'} · ${layer.framesPerSecond ?? '?'} fps`).join(' / ');
          if (active) setMeasurement(`Captura: ${dimensions.width ?? '?'}×${dimensions.height ?? '?'} · ${dimensions.frameRate?.toFixed(1) ?? '?'} fps. Envio: ${layers || 'aguardando dados'}.`);
        } else if (video instanceof RemoteVideoTrack) {
          const stats = await video.getReceiverStats();
          const time = performance.now();
          const fps = stats && previous ? Math.max(0, (stats.framesDecoded - previous.frames) * 1000 / (time - previous.time)).toFixed(1) : '?';
          if (stats) previous = { frames: stats.framesDecoded, time };
          if (active) setMeasurement(`Recebido: ${stats?.frameWidth ?? '?'}×${stats?.frameHeight ?? '?'} · ${fps} fps decodificados no intervalo.`);
        }
      } catch { if (active) setMeasurement('Medições indisponíveis neste navegador.'); }
      finally { pending = false; }
    };
    const timer = setInterval(measure, 2000); void measure();
    return () => { active = false; clearInterval(timer); };
  }, [track]);
  return <details className="screen-measurements"><summary>Qualidade medida</summary><p>{measurement}</p><p>Metas não são garantias. Conteúdo parado pode gerar menos quadros; a rede e o tamanho do player afetam a qualidade recebida.</p></details>;
}
