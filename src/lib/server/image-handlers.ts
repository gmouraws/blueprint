import 'server-only';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { allowedOrigins, getConfig } from './config';
import { COOKIE_NAME, verifySession } from './session';
import { json, readBody } from './handlers';
import { rateLimit, LimitError } from './rate-limit';
import { completeImage, downloadImage, ImageUnavailable, prepareImage } from './image-store';
import { InvalidImage } from './image-validation';
import { IMAGE_TYPES, MAX_IMAGE_BYTES } from '../images';

const write = z.discriminatedUnion('action', [
  z.object({ action: z.literal('prepare'), requestId: z.uuid(), contentType: z.enum(IMAGE_TYPES), size: z.number().int().min(1).max(MAX_IMAGE_BYTES) }).strict(),
  z.object({ action: z.literal('complete'), id: z.uuid() }).strict(),
]);
export const imageServices = { getConfig, rateLimit, prepareImage, completeImage, downloadImage };
export function imageHandlers(deps = imageServices) {
  return async (request: NextRequest, id?: string) => {
    try {
      const config = deps.getConfig(); const origin = request.headers.get('origin');
      if (request.headers.get('sec-fetch-site') === 'cross-site' || ((!id || origin) && !allowedOrigins(config).includes(origin ?? ''))) return json({ error: 'Origem não permitida.' }, 403);
      const session = await verifySession(request.cookies.get(COOKIE_NAME)?.value, config);
      if (!session) return json({ error: 'Seu acesso expirou. Volte à entrada.' }, 401);
      await deps.rateLimit(config, id ? 'image-read' : 'image-write', session.identity);
      if (id) {
        if (!z.uuid().safeParse(id).success) return json({ error: 'Imagem não encontrada.' }, 404);
        const image = await deps.downloadImage(id);
        if (!image || image.statusCode !== 200) return json({ error: 'Imagem não encontrada ou expirada.' }, 404);
        return new Response(image.stream, { headers: { 'Content-Type': 'image/webp', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': 'inline; filename="imagem.webp"' } });
      }
      const parsed = write.safeParse(await readBody(request).catch(() => null));
      if (!parsed.success) throw new InvalidImage();
      return json(parsed.data.action === 'prepare' ? await deps.prepareImage(session, parsed.data) : { image: await deps.completeImage(session, parsed.data.id) });
    } catch (failure) {
      if (failure instanceof InvalidImage) return json({ error: 'Imagem inválida. Use JPEG, PNG ou WebP de até 5 MB, sem animação e com até 20 megapixels.' }, 400);
      if (failure instanceof LimitError) return json({ error: 'Muitas solicitações de imagem. Aguarde e tente novamente.' }, failure.status, { 'Retry-After': String(failure.retryAfter) });
      if (failure instanceof ImageUnavailable) return json({ error: 'Imagens indisponíveis. O responsável precisa verificar o armazenamento privado deste ambiente, ou aguardar a validação em andamento.' }, 503);
      return json({ error: 'Não foi possível concluir a operação da imagem. Tente novamente.' }, 503);
    }
  };
}
