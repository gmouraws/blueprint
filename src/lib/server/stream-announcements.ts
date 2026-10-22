import 'server-only';
import { randomUUID } from 'node:crypto';
import { Redis } from '@upstash/redis';
import { RoomServiceClient } from 'livekit-server-sdk';
import type { Config } from './config';
import { getConfig } from './config';
import { discordTarget, invitationUrl } from './stream-discord';
import { streamService } from './stream-space';
import { discordText, streamTitle } from '../stream-labels';

export const END_GRACE_MS = 20000;
type Delivery = 'ready' | 'sending' | 'sent' | 'uncertain' | 'failed';
export type Publication = { id: string; key: string; identity: string; label: number; name?: string; created: number; missing?: number; ended?: number; messageId?: string; start: Delivery; end: Delivery; edited?: boolean; retryAt?: number };
export interface AnnouncementStore { update<T>(work: (rows: Publication[]) => Promise<T>): Promise<T> }
export function announcementStore(config: Config): AnnouncementStore {
  const redis = new Redis({ url: config.UPSTASH_REDIS_REST_URL, token: config.UPSTASH_REDIS_REST_TOKEN, retry: { retries: 0 }, signal: () => AbortSignal.timeout(5000) });
  const key = `blueprint:${config.LIVEKIT_ROOM_NAME}:stream-announcements:v1`;
  return { async update(work) {
    const owner = randomUUID();
    if (await redis.set(`${key}:lock`, owner, { nx: true, px: 30000 }) !== 'OK') throw Error('Announcement busy');
    try {
      const rows = await redis.get<Publication[]>(key) ?? [];
      const result = await work(rows);
      if (await redis.eval("if redis.call('GET',KEYS[1]) ~= ARGV[1] then return 0 end redis.call('SET',KEYS[2],ARGV[2]); return 1", [`${key}:lock`, key], [owner, JSON.stringify(rows)]) !== 1) throw Error('Announcement lease lost');
      return result;
    } finally { await redis.eval("if redis.call('GET',KEYS[1]) == ARGV[1] then return redis.call('DEL',KEYS[1]) end return 0", [`${key}:lock`], [owner]); }
  } };
}
export function announcementService(config: Config, store = announcementStore(config), service = streamService(config, undefined, new RoomServiceClient(config.LIVEKIT_URL.replace('wss:', 'https:'), config.LIVEKIT_API_KEY, config.LIVEKIT_API_SECRET, { requestTimeout: 5, failover: false })), request = fetch, now = Date.now, target = discordTarget()) {
  async function reconcile() {
    if (!target) return { pending: false, wait: 0 };
    const work = await store.update(async rows => {
      // Event payloads only wake reconciliation. Current provider state wins over delayed/out-of-order events.
      const visible = await service.publicationSnapshot();
      const time = now();
      for (const row of rows.filter(item => !item.ended)) {
        const active = visible.find(item => item.key === row.key || item.identity === row.identity);
        if (active) { delete row.missing; row.identity = active.identity; }
        else { row.missing ??= time; if (time - row.missing >= END_GRACE_MS) row.ended = time; }
      }
      // Keep pending edits for recovery; terminal rows have a bounded retention.
      for (let index = rows.length - 1; index >= 0; index--) {
        const row = rows[index];
        if (row.ended && time - row.ended > 7 * 86400000 && (row.edited || !row.messageId) && row.end !== 'ready') rows.splice(index, 1);
      }
      for (const active of visible) if (active.authorized && !rows.some(row => !row.ended && row.key === active.key)) {
        if (rows.length >= 512) throw Error('Announcement journal full');
        rows.push({ id: randomUUID(), key: active.key, identity: active.identity, label: active.label, name: active.name, created: time, start: active.legacy ? 'uncertain' : 'ready', end: 'ready' });
      }
      const actions: { id: string; kind: 'start' | 'end' | 'edit'; key: string; label: number; name?: string; messageId?: string }[] = [];
      for (const row of rows) {
        if (actions.length >= 4) break;
        if ((row.retryAt ?? 0) > time) continue;
        if (!row.ended && row.start === 'ready') { row.start = 'sending'; actions.push({ ...row, kind: 'start' }); }
        if (row.ended) {
          if (row.start === 'ready') row.start = 'failed';
          if (row.messageId && !row.edited) actions.push({ ...row, kind: 'edit' });
          if (actions.length < 4 && row.end === 'ready' && row.start !== 'sending') { row.end = 'sending'; actions.push({ ...row, kind: 'end' }); }
          // A process could stop after committing the POST claim. Never replay an uncertain POST.
          if (row.start === 'sending' && time - row.ended > 60000) row.start = 'uncertain';
        }
      }
      const waits = rows.filter(row => !row.ended && row.missing !== undefined).map(row => Math.max(0, END_GRACE_MS - (time - row.missing!)));
      const backlog = rows.some(row => (row.retryAt ?? 0) > time || (!row.ended && row.start === 'ready') || (!!row.ended && ((row.end === 'ready' && !actions.some(action => action.id === row.id && action.kind === 'end')) || (row.messageId && !row.edited && !actions.some(action => action.id === row.id && action.kind === 'edit')))));
      return { actions, backlog, wait: waits.length ? Math.min(...waits) : 0 };
    });
    let pending = work.backlog;
    for (const action of work.actions) {
      let messageId: string | undefined, state: Delivery = 'uncertain', edited = false, retryAt: number | undefined;
      try {
        const title = discordText(streamTitle(action.label, action.name));
        let content = `${title} encerrada`;
        if (action.kind === 'start') {
          const viewer = await service.announcementViewer(action.key);
          content = `${title} começou. [Assistir](${invitationUrl(config.APP_ORIGIN, viewer.secret, 'watch')})`;
        }
        const url = action.kind === 'edit' ? `${target}/messages/${action.messageId}` : `${target}?wait=true`;
        const response = await request(url, { method: action.kind === 'edit' ? 'PATCH' : 'POST', redirect: 'error', signal: AbortSignal.timeout(5000), headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content, components: [], embeds: [], allowed_mentions: { parse: [] }, flags: 4 }) });
        if (response.ok) {
          if (action.kind === 'edit') edited = true;
          else { const body = await response.json(); if (typeof body?.id === 'string' && /^\d{17,20}$/.test(body.id)) { messageId = body.id; state = 'sent'; } }
        } else if (action.kind === 'edit' && response.status === 404) edited = true;
        else if (response.status === 429) {
          const body = await response.json().catch(() => null);
          retryAt = now() + Math.min(3600000, Math.max(1000, Number(body?.retry_after) * 1000 || 60000)); state = 'ready'; pending = true;
        } else if (response.status >= 400 && response.status < 500) state = 'failed';
        if (action.kind === 'edit' && !edited) pending = true;
      } catch { if (action.kind === 'edit') pending = true; }
      await store.update(async rows => {
        const row = rows.find(item => item.id === action.id); if (!row) return;
        if (action.kind === 'edit') row.edited = edited;
        else { row[action.kind] = state; if (action.kind === 'start' && messageId) row.messageId = messageId; }
        row.retryAt = retryAt;
      });
      if (action.kind !== 'edit' && (state === 'uncertain' || state === 'failed')) console.warn('stream_announcement_delivery_unconfirmed');
    }
    return { pending, wait: work.wait };
  }
  return { reconcile };
}
// Runs inside the webhook request or Next after(), never a detached in-process timer.
export async function settleStreamAnnouncements() {
  const service = announcementService(getConfig());
  const first = await service.reconcile();
  if (first.wait) { await new Promise(resolve => setTimeout(resolve, first.wait + 50)); const next = await service.reconcile(); if (next.pending) throw Error('Announcement delivery pending'); }
  if (first.pending) throw Error('Announcement delivery pending');
}
