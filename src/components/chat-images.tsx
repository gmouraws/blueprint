'use client';
/* eslint-disable @next/next/no-img-element -- Authenticated image routes must bypass public image optimization/cache. */
import { useEffect, useRef, useState, type ClipboardEvent, type DragEvent, type ReactNode } from 'react';
import { put } from '@vercel/blob/client';
import { IMAGE_TYPES, MAX_IMAGE_BYTES, type ChatImage } from '@/lib/images';
import { Icon } from './icons';

async function request(body: object, signal: AbortSignal) {
  const response = await fetch('/api/attachments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal, cache: 'no-store' });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Não foi possível enviar a imagem.');
  return result;
}
export function useChatImage() {
  const [pending, setPending] = useState<{ file: File; url: string; requestId: string; image?: ChatImage } | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState('');
  const controller = useRef<AbortController | null>(null);
  const objectUrl = useRef('');
  useEffect(() => () => { controller.current?.abort(); if (objectUrl.current) URL.revokeObjectURL(objectUrl.current); }, []);
  function remove() { if (progress !== null) return; if (objectUrl.current) URL.revokeObjectURL(objectUrl.current); objectUrl.current = ''; setPending(null); setError(''); }
  function choose(file?: File) {
    if (!file || progress !== null) return;
    if (!(IMAGE_TYPES as readonly string[]).includes(file.type) || file.size > MAX_IMAGE_BYTES || file.size === 0) { setError('Escolha JPEG, PNG ou WebP de até 5 MB. Uma imagem por mensagem.'); return; }
    remove(); objectUrl.current = URL.createObjectURL(file);
    setPending({ file, url: objectUrl.current, requestId: crypto.randomUUID() });
  }
  function paste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const file = [...event.clipboardData.files].find(item => item.type.startsWith('image/'));
    if (file) { event.preventDefault(); choose(file); }
  }
  function drop(event: DragEvent) {
    if (event.dataTransfer.files.length) { event.preventDefault(); choose(event.dataTransfer.files[0]); }
  }
  async function upload() {
    if (!pending) return undefined;
    if (pending.image) return pending.image.id;
    const operation = new AbortController(); controller.current = operation; setProgress(0); setError('');
    const signal = AbortSignal.any([operation.signal, AbortSignal.timeout(120000)]);
    try {
      const prepared = await request({ action: 'prepare', requestId: pending.requestId, contentType: pending.file.type, size: pending.file.size }, signal);
      if (prepared.token) {
        await put(prepared.pathname, pending.file, { access: 'private', token: prepared.token, contentType: pending.file.type, abortSignal: signal, onUploadProgress: value => setProgress(Math.min(95, Math.round(value.percentage * 0.95))) });
      }
      setProgress(95);
      const image = prepared.ready ? prepared.image : (await request({ action: 'complete', id: prepared.id }, signal)).image;
      if (!signal.aborted) setPending(value => value ? { ...value, image } : value);
      return image.id as string;
    } finally { setProgress(null); controller.current = null; }
  }
  return { pending, progress, error, choose, remove, paste, drop, upload };
}
export function ImageAttachmentButton({ image, disabled }: { image: ReturnType<typeof useChatImage>; disabled: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  return <>
    <input ref={input} type="file" accept={IMAGE_TYPES.join(',')} className="sr-only" tabIndex={-1} aria-label="Selecionar imagem" disabled={disabled} onChange={event => { image.choose(event.target.files?.[0]); event.target.value = ''; }} />
    <button type="button" className="icon-button attachment-button" disabled={disabled} onClick={() => input.current?.click()} aria-label="Anexar imagem" title="Anexar imagem de até 5 MB"><Icon name="attachment" /></button>
  </>;
}
export function ImageComposer({ image, disabled }: { image: ReturnType<typeof useChatImage>; disabled: boolean }) {
  if (!image.pending && image.progress === null && !image.error) return null;
  return <div className="image-composer">
    {image.pending && <div className="image-preview"><img src={image.pending.url} alt="Prévia da imagem a enviar" /><span>{image.pending.file.name}</span><button type="button" disabled={disabled} onClick={image.remove} aria-label="Remover imagem antes de enviar"><Icon name="close" /></button></div>}
    {image.progress !== null && <div role="status"><progress max={100} value={image.progress} aria-label="Envio da imagem" /><span>{image.progress < 95 ? 'Enviando imagem… ' + image.progress + '%' : 'Validando imagem…'}</span></div>}
    {image.error && <p className="error" role="alert">{image.error}</p>}
  </div>;
}
export function MessageImage({ image, children }: { image: ChatImage; children?: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const url = '/api/attachments/' + image.id;
  return <div className="message-image">
    {failed ? <p className="muted">Imagem indisponível ou acesso expirado.</p> : <button type="button" aria-label="Ampliar imagem da mensagem" onClick={() => { setOpen(true); dialog.current?.showModal(); }}><img src={url} width={image.width} height={image.height} alt="Imagem compartilhada na conversa" loading="lazy" onError={() => setFailed(true)} /></button>}
    {children}
    <dialog ref={dialog} className="image-dialog" aria-label="Imagem ampliada" onClose={() => setOpen(false)}><button autoFocus onClick={() => dialog.current?.close()} aria-label="Fechar imagem ampliada"><Icon name="close" />Fechar</button>{open && <img src={url} alt="Imagem compartilhada ampliada" />}</dialog>
  </div>;
}
