import { createDemo } from './demo.ts';
import { emptyStore, equivalent, mergeRecord, patchRecord, recordStamp, validateStore } from './model.ts';
import type { DataRecord, Kind, Store, Value } from './model.ts';

export type SyncState = 'local' | 'offline' | 'syncing' | 'synced' | 'error';
export type Snapshot = { store: Store; user: { id: string; email: string; displayName?: string } | null; status: SyncState; error: string; lastSync: string; configured: boolean };
export const STORAGE_PREFIX = 'become-better-next:v1:';
export class Repository {
  private key = `${STORAGE_PREFIX}demo`;
  private listeners = new Set<() => void>();
  private stamp = '';
  private snapshot: Snapshot;
  private storage: Pick<Storage, 'getItem' | 'setItem'>;
  onDirty?: () => void;
  constructor(storage: Pick<Storage, 'getItem' | 'setItem'>, configured = false) {
    this.storage = storage;
    this.snapshot = { store: this.read(this.key, createDemo()), user: null, status: 'local', error: '', lastSync: '', configured };
  }
  private read(key: string, fallback: Store): Store {
    const raw = this.storage.getItem(key);
    if (!raw) return fallback;
    try {
      const parsed = JSON.parse(raw), store = validateStore(parsed);
      store.pending = Array.isArray(parsed.pending) ? parsed.pending.filter((id: unknown) => typeof id === 'string' && Boolean(store.records[id])) : [];
      return store;
    } catch { throw new Error('Uložená data se nepodařilo načíst. Nevymazávej data prohlížeče; nejdřív je zazálohuj.'); }
  }
  getSnapshot = () => this.snapshot;
  subscribe = (callback: () => void) => { this.listeners.add(callback); return () => { this.listeners.delete(callback); }; };
  private emit() { for (const listener of this.listeners) listener(); }
  private persist(store: Store) {
    // Write before changing the UI. A full browser storage must never masquerade
    // as a successful save.
    this.storage.setItem(this.key, JSON.stringify(store));
    this.snapshot = { ...this.snapshot, store }; this.emit();
  }
  setStatus(status: SyncState, error = '', lastSync = this.snapshot.lastSync) { this.snapshot = { ...this.snapshot, status, error, lastSync }; this.emit(); }
  activate(user: Snapshot['user']) {
    const key = `${STORAGE_PREFIX}${user ? `user:${user.id}` : 'demo'}`;
    if (this.key === key && this.snapshot.user?.email === user?.email && this.snapshot.user?.displayName === user?.displayName) return;
    const store = this.read(key, user ? emptyStore() : createDemo());
    this.key = key;
    this.snapshot = { ...this.snapshot, user, store, status: user ? 'syncing' : 'local', error: '', lastSync: '' }; this.emit();
  }
  reloadFromOtherTab() {
    const store = this.read(this.key, this.snapshot.store);
    this.snapshot = { ...this.snapshot, store }; this.emit(); this.onDirty?.();
  }
  nextStamp() {
    const greatest = Object.values(this.snapshot.store.records).reduce((max, r) => recordStamp(r) > max ? recordStamp(r) : max, this.stamp);
    this.stamp = new Date(Math.max(Date.now(), (Date.parse(greatest) || 0) + 1)).toISOString(); return this.stamp;
  }
  patch(id: string, kind: Kind, patch: Record<string, Value>) {
    const store = this.snapshot.store;
    const record = patchRecord(store.records[id], id, kind, patch, this.nextStamp());
    this.persist({ ...store, records: { ...store.records, [id]: record }, pending: [...new Set([...store.pending, id])] }); this.onDirty?.();
    return id;
  }
  add(kind: Kind, payload: Record<string, Value>) { return this.patch(crypto.randomUUID(), kind, payload); }
  addBatch(drafts: { id?: string; kind: Kind; payload: Record<string, Value> }[]) {
    const store = this.snapshot.store, records = { ...store.records }, stamp = this.nextStamp();
    const ids = drafts.map(draft => {
      const id = draft.id || crypto.randomUUID();
      if (records[id]) throw new Error('Záznam už existuje.');
      records[id] = patchRecord(undefined, id, draft.kind, draft.payload, stamp);
      return id;
    });
    this.persist({ ...store, records, pending: [...new Set([...store.pending, ...ids])] }); this.onDirty?.();
    return ids;
  }
  updateBatch(drafts: { id?: string; kind: Kind; payload: Record<string, Value> }[], removed: string[] = []) {
    const store = this.snapshot.store, records = { ...store.records }, stamp = this.nextStamp();
    const changed = drafts.map(draft => {
      const id = draft.id || crypto.randomUUID(), previous = records[id];
      if (previous && (previous.kind !== draft.kind || previous.deleted)) throw new Error('Záznam nelze upravit.');
      records[id] = patchRecord(previous, id, draft.kind, draft.payload, stamp);
      return id;
    });
    for (const id of removed) if (records[id]) { records[id] = { ...records[id], deleted: true, stamps: { ...records[id].stamps, _deleted: stamp } }; changed.push(id); }
    this.persist({ ...store, records, pending: [...new Set([...store.pending, ...changed])] }); this.onDirty?.();
  }
  remove(ids: string[]) {
    const store = this.snapshot.store, records = { ...store.records }, stamp = this.nextStamp();
    for (const id of ids) if (records[id]) records[id] = { ...records[id], deleted: true, stamps: { ...records[id].stamps, _deleted: stamp } };
    this.persist({ ...store, records, pending: [...new Set([...store.pending, ...ids.filter(id => Boolean(records[id]))])] }); this.onDirty?.();
  }
  receive(remote: DataRecord[], userId: string) {
    if (this.snapshot.user?.id !== userId) return;
    const store = this.snapshot.store, records = { ...store.records }, pending = new Set(store.pending);
    for (const row of remote) {
      const local = records[row.id];
      const merged = local ? mergeRecord(local, row) : row;
      records[row.id] = merged;
      if (equivalent(merged, row)) pending.delete(row.id); else pending.add(row.id);
    }
    this.persist({ ...store, records, pending: [...pending] });
  }
  importBackup(input: unknown) {
    const incoming = validateStore(input), store = this.snapshot.store, records = { ...store.records };
    // Imported data is an explicit change on this account; fresh stamps and
    // fresh server revisions prevent another account's revisions being reused.
    const stamp = this.nextStamp();
    for (const row of Object.values(incoming.records)) {
      const previous = records[row.id];
      records[row.id] = { ...row, stamps: Object.fromEntries([...Object.keys(row.payload), '_deleted'].map(k => [k, stamp])), revision: previous?.revision || 0 };
    }
    this.persist({ ...store, records, pending: [...new Set([...store.pending, ...Object.keys(incoming.records)])] }); this.onDirty?.();
  }
  exportBackup() { return { ...this.snapshot.store, pending: [] }; }
  startEmpty() {
    if (this.snapshot.user) throw new Error('Tato akce je dostupná jen pro místní ukázku.');
    this.persist(emptyStore()); this.setStatus('local');
  }
  restoreDemo() {
    if (this.snapshot.user) throw new Error('Ukázku nelze vložit do přihlášeného účtu.');
    this.persist(createDemo()); this.setStatus('local');
  }
}
