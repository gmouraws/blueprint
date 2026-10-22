export const validStreamNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1e15;

// RTCStats fields are optional at runtime, despite the SDK's required TS fields.
// Inactive encodings and sources with no subscribers may omit dimensions/FPS.
// Missing measurements must remain unknown, never a fabricated quality reading.
export function streamVideoSample(stats: readonly { bytesSent?: unknown; frameWidth?: unknown; frameHeight?: unknown; framesPerSecond?: unknown }[]) {
  const result = { bytes: 0, width: 0, height: 0, fps: 0, samples: 0 };
  for (const layer of stats) {
    if (validStreamNumber(layer.bytesSent)) result.bytes += layer.bytesSent;
    if (!validStreamNumber(layer.frameWidth) || !validStreamNumber(layer.frameHeight) || !validStreamNumber(layer.framesPerSecond) || layer.frameWidth === 0 || layer.frameHeight === 0) continue;
    if (!result.samples || layer.frameWidth * layer.frameHeight > result.width * result.height) {
      result.width = layer.frameWidth; result.height = layer.frameHeight; result.fps = layer.framesPerSecond; result.samples = 1;
    }
  }
  return result;
}
