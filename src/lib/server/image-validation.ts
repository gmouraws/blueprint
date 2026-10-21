import 'server-only';
import sharp from 'sharp';
import { MAX_IMAGE_BYTES } from '../images';

export class InvalidImage extends Error {}
export async function normalizeImage(bytes: Buffer, declaredType: string) {
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw new InvalidImage();
  try {
    const decoder = sharp(bytes, { limitInputPixels: 20_000_000, failOn: 'warning', animated: false });
    const metadata = await decoder.metadata();
    const mime = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }[metadata.format as 'jpeg' | 'png' | 'webp'];
    if (!mime || mime !== declaredType || !metadata.width || !metadata.height || metadata.width > 8192 || metadata.height > 8192 || (metadata.pages ?? 1) !== 1) throw new InvalidImage();
    // Force complete decoding, strip metadata and normalize the delivered format.
    const { data, info } = await decoder.rotate().webp({ quality: 85 }).toBuffer({ resolveWithObject: true });
    if (data.length > MAX_IMAGE_BYTES) throw new InvalidImage();
    return { bytes: data, width: info.width, height: info.height, size: data.length };
  } catch { throw new InvalidImage(); }
}
export async function boundedImage(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const part = await reader.read(); if (part.done) break;
      size += part.value.length;
      if (size > MAX_IMAGE_BYTES) { await reader.cancel(); throw new InvalidImage(); }
      chunks.push(part.value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks);
}
