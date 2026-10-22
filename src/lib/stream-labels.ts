// Display labels only. Never use names as identity or authorization keys.
export function streamDisplayName(value: unknown): string | undefined {
  if (typeof value !== 'string') return;
  const clean = value.slice(0, 256).normalize('NFKC').replace(/[\p{Cc}\p{Cf}]/gu, ' ').replace(/\s+/gu, ' ').trim();
  return Array.from(clean).slice(0, 48).join('') || undefined;
}
export function discordDisplayName(member: { nick?: unknown; user: { global_name?: unknown; username?: unknown } }) {
  return streamDisplayName(member.nick) ?? streamDisplayName(member.user.global_name) ?? streamDisplayName(member.user.username);
}
export function streamTitle(label: number, name?: string) {
  const clean = streamDisplayName(name);
  return clean ? `Transmissão de ${clean}` : `Transmissão ${label}`;
}
export function discordText(value: string) { return value.replace(/([\\`*_{}\[\]()<>#+\-.!|~])/g, '\\$1'); }
export const STREAM_VIEW_ATTRIBUTE = 'blueprint.stream.video';
