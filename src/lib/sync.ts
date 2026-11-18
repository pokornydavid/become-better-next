import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { DataRecord } from './model.ts';
import { Repository } from './repository.ts';
import { readPhoto } from './photos';
import { createAuthSignal } from './auth';
import { syncRecords } from './sync-cycle.ts';

const url = import.meta.env.VITE_SUPABASE_URL || '';
const publicKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';
// Hard isolation: refuse the running v98 production database even if someone
// accidentally copies its environment file into this new project.
const forbiddenProductionRef = 'csjhpmqagaltnaicgryp';
if (url.includes(forbiddenProductionRef)) throw new Error('Nová aplikace nesmí používat databázi stávající produkce.');
export const cloudConfigured = Boolean(url && publicKey);
export const authSignal = createAuthSignal(!cloudConfigured);
export const repository = new Repository(localStorage, cloudConfigured);
export const supabase: SupabaseClient | null = cloudConfigured ? createClient(url, publicKey, {
  auth: { storageKey: 'become-better-next:auth', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  global: { fetch: (input, init) => {
    const signal = init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000);
    return fetch(input, { ...init, signal });
  } },
}) : null;

type CloudRow = { id: string; kind: DataRecord['kind']; payload: DataRecord['payload']; field_stamps: DataRecord['stamps']; deleted: boolean; revision: number };
const fromRow = (r: CloudRow): DataRecord => ({ id: r.id, kind: r.kind, payload: r.payload, stamps: r.field_stamps, deleted: r.deleted, revision: r.revision });
let inFlight: Promise<void> | null = null;
let timer = 0;
function schedule() { clearTimeout(timer); timer = window.setTimeout(() => { void syncNow(); }, 750); }
repository.onDirty = schedule;
async function runSync() {
  const client = supabase;
  if (!client || !repository.getSnapshot().user) return;
  const retry = await syncRecords(repository, {
    async fetchPage(userId, offset, limit) {
      const { data, error } = await client.from('user_records').select('id,kind,payload,field_stamps,deleted,revision').eq('user_id', userId).order('id').range(offset, offset + limit - 1);
      if (error) throw error;
      return (data as CloudRow[]).map(fromRow);
    },
    async commit(current) {
      const { data, error } = await client.rpc('commit_record', {
        record_id: current.id, record_kind: current.kind, record_payload: current.payload,
        record_stamps: current.stamps, record_deleted: current.deleted, expected_revision: current.revision,
      });
      if (error) throw error;
      return fromRow(data.row as CloudRow);
    },
    async prepare(current, userId) {
      if (current.kind !== 'photo' || current.deleted || current.payload.storagePath) return;
      const blob = await readPhoto(userId, current.id);
      if (!blob) throw new Error('Fotka chybí v tomto zařízení.');
      if (repository.getSnapshot().user?.id !== userId) return;
      const extension = blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg';
      const storagePath = userId + '/' + current.id + '.' + extension;
      const { error } = await client.storage.from('progress-photos').upload(storagePath, blob, { contentType: blob.type, upsert: false });
      if (repository.getSnapshot().user?.id !== userId) return;
      if (error && !error.message.toLowerCase().includes('already exists')) throw error;
      repository.patch(current.id, 'photo', { storagePath });
    },
  }, navigator.onLine);
  if (retry) schedule();
}
export function syncNow() {
  if (!inFlight) inFlight = runSync().finally(() => { inFlight = null; });
  return inFlight;
}
function activate(session: { user: { id: string; email?: string; user_metadata?: Record<string, unknown> } } | null) {
  repository.activate(session ? { id: session.user.id, email: session.user.email || '', displayName: typeof session.user.user_metadata?.display_name === 'string' ? session.user.user_metadata.display_name.slice(0,80) : '' } : null);
  // Account changes may happen during an old request. Queue a fresh account's
  // sync after that request has settled, rather than sharing its result.
  if (inFlight) void inFlight.finally(schedule); else schedule();
}
if (supabase) {
  // Keep auth callbacks synchronous: Supabase holds its auth lock here.
  supabase.auth.onAuthStateChange((event, session) => { window.setTimeout(() => { if (event === 'PASSWORD_RECOVERY') authSignal.set({ recovery: true }); activate(session); }, 0); });
  void supabase.auth.getSession().then(({ data, error }) => {
    if (error) repository.setStatus('error', error.message);
    else activate(data.session);
  }).catch(() => repository.setStatus('error','Účet se nepodařilo načíst. Zkontroluj připojení.')).finally(() => authSignal.set({ ready: true }));
  window.setInterval(() => { if (document.visibilityState === 'visible') void syncNow(); }, 15000);
}
window.addEventListener('online', schedule);
window.addEventListener('offline', () => { if (repository.getSnapshot().user) repository.setStatus('offline'); });
window.addEventListener('focus', schedule);
// Installed mobile apps often resume without a window focus event. Start a
// transfer immediately on hide, too: the 750 ms timer may be frozen by the OS.
document.addEventListener('visibilitychange', () => { void syncNow(); });
window.addEventListener('pageshow', () => { void syncNow(); });
window.addEventListener('pagehide', () => { void syncNow(); });
window.addEventListener('storage', event => { if (event.key?.startsWith('become-better-next:v1:')) repository.reloadFromOtherTab(); });
