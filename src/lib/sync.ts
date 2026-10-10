import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { DataRecord } from './model.ts';
import { Repository } from './repository.ts';
import { readPhoto } from './photos';

const url = import.meta.env.VITE_SUPABASE_URL || '';
const publicKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';
// Hard isolation: refuse the running v98 production database even if someone
// accidentally copies its environment file into this new project.
const forbiddenProductionRef = 'csjhpmqagaltnaicgryp';
if (url.includes(forbiddenProductionRef)) throw new Error('Nová aplikace nesmí používat databázi stávající produkce.');
export const cloudConfigured = Boolean(url && publicKey);
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
  const userId = repository.getSnapshot().user?.id;
  if (!supabase || !userId) return;
  if (!navigator.onLine) { repository.setStatus('offline'); return; }
  repository.setStatus('syncing');
  try {
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await supabase.from('user_records').select('id,kind,payload,field_stamps,deleted,revision').eq('user_id', userId).order('id').range(offset, offset + 499);
      if (repository.getSnapshot().user?.id !== userId) return;
      if (error) throw error;
      repository.receive((data as CloudRow[]).map(fromRow), userId);
      if (data.length < 500) break;
    }
    const ids = [...repository.getSnapshot().store.pending];
    let failures = 0;
    for (const id of ids) {
      // CAS + merge + retry handles another phone updating a field while this
      // device is uploading. New local edits stay queued until acknowledged.
      for (let attempt = 0; attempt < 4; attempt++) {
        if (repository.getSnapshot().user?.id !== userId) return;
        let current = repository.getSnapshot().store.records[id];
        if (!current || !repository.getSnapshot().store.pending.includes(id)) break;
        if (current.kind === 'photo' && !current.deleted && !current.payload.storagePath) {
          try {
            const blob = await readPhoto(userId, current.id);
            if (!blob) throw new Error('Fotka chybí v tomto zařízení.');
            const extension = blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg';
            const storagePath = `${userId}/${current.id}.${extension}`;
            const { error } = await supabase.storage.from('progress-photos').upload(storagePath, blob, { contentType: blob.type, upsert: false });
            if (repository.getSnapshot().user?.id !== userId) return;
            if (error && !error.message.toLowerCase().includes('already exists')) throw error;
            repository.patch(current.id, 'photo', { storagePath });
            current = repository.getSnapshot().store.records[id];
          } catch { failures++; break; }
        }
        const { data, error } = await supabase.rpc('commit_record', {
          record_id: current.id, record_kind: current.kind, record_payload: current.payload,
          record_stamps: current.stamps, record_deleted: current.deleted, expected_revision: current.revision,
        });
        if (repository.getSnapshot().user?.id !== userId) return;
        if (error) { failures++; break; }
        repository.receive([fromRow(data.row as CloudRow)], userId);
        if (!repository.getSnapshot().store.pending.includes(id)) break;
      }
    }
    if (repository.getSnapshot().user?.id !== userId) return;
    if (failures) throw new Error('Některé změny se nepodařilo odeslat. Zůstávají uložené v zařízení.');
    repository.setStatus(repository.getSnapshot().store.pending.length ? 'syncing' : 'synced', '', new Date().toISOString());
    if (repository.getSnapshot().store.pending.length) schedule();
  } catch (error) {
    if (repository.getSnapshot().user?.id === userId) repository.setStatus('error', error instanceof Error ? error.message : 'Databáze není připravená nebo připojení selhalo.');
  }
}
export function syncNow() {
  if (!inFlight) inFlight = runSync().finally(() => { inFlight = null; });
  return inFlight;
}
function activate(session: { user: { id: string; email?: string } } | null) {
  repository.activate(session ? { id: session.user.id, email: session.user.email || '' } : null);
  // Account changes may happen during an old request. Queue a fresh account's
  // sync after that request has settled, rather than sharing its result.
  if (inFlight) void inFlight.finally(schedule); else schedule();
}
if (supabase) {
  // Keep auth callbacks synchronous: Supabase holds its auth lock here.
  supabase.auth.onAuthStateChange((_event, session) => { window.setTimeout(() => activate(session), 0); });
  void supabase.auth.getSession().then(({ data, error }) => {
    if (error) repository.setStatus('error', error.message);
    else activate(data.session);
  });
  window.setInterval(() => { if (document.visibilityState === 'visible') void syncNow(); }, 15000);
}
window.addEventListener('online', schedule);
window.addEventListener('offline', () => { if (repository.getSnapshot().user) repository.setStatus('offline'); });
window.addEventListener('focus', schedule);
window.addEventListener('storage', event => { if (event.key?.startsWith('become-better-next:v1:')) repository.reloadFromOtherTab(); });
