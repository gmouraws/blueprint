export function messageParts(text: string): { text: string; href?: string }[] {
  const parts: { text: string; href?: string }[] = []; let offset = 0;
  for (const match of text.matchAll(/https?:\/\/[^\s<>"']+/gu)) {
    const start = match.index!;
    if (start > offset) parts.push({ text: text.slice(offset, start) });
    const candidate = match[0].replace(/[.,!?:;\])}]+$/u, '');
    let href: string | undefined;
    try { const url = new URL(candidate); if (['http:', 'https:'].includes(url.protocol) && !url.username && !url.password) href = url.href; } catch { /* Keep malformed URLs as text. */ }
    parts.push({ text: candidate, href });
    if (candidate.length < match[0].length) parts.push({ text: match[0].slice(candidate.length) });
    offset = start + match[0].length;
  }
  if (offset < text.length) parts.push({ text: text.slice(offset) });
  return parts;
}
