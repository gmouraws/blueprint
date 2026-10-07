export function privatePageview<T extends { type: string; url: string }>(event: T): T | null {
  if (event.type !== 'pageview') return null;
  const url = new URL(event.url);
  url.search = ''; url.hash = '';
  return { ...event, url: url.toString() };
}
