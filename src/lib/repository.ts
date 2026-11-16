import { createDemo } from './demo.ts';
import { emptyStore, equivalent, mergeRecord, patchRecord, recordStamp, validateStore } from './model.ts';
import type { DataRecord, Kind, Store, Value } from './model.ts';

export type SyncState = 'local' | 'offline' | 'syncing' | 'synced' | 'error';
export type Snapshot = { store: Store; user: { id: string; email: string; displayName?: string } | null; status: SyncState; error: string; lastSync: string; configured: boolean };
export const STORAGE_PREFIX = 'become-better-next:v1:';
function sameStore(a:Store,b:Store) {
  const ids=Object.keys(a.records),pending=new Set(b.pending);
  return a.demo===b.demo&&ids.length===Object.keys(b.records).length&&ids.every(id=>b.records[id]&&a.records[id].revision===b.records[id].revision&&equivalent(a.records[id],b.records[id]))&&a.pending.length===pending.size&&a.pending.every(id=>pending.has(id));
}
function mergeStored(local:Store,saved:Store):Store {
  const records={...saved.records},pending=new Set([...local.pending,...saved.pending]);
  const localPending=new Set(local.pending),savedPending=new Set(saved.pending);
  for(const [id,row] of Object.entries(local.records)) {
    const other=saved.records[id];
    if(!other){records[id]=row;continue;}
    const merged={...mergeRecord(row,other),revision:Math.max(row.revision,other.revision)};
    records[id]=merged;
    const acknowledged=(!localPending.has(id)&&row.revision>0&&row.revision===merged.revision&&equivalent(row,merged))||(!savedPending.has(id)&&other.revision>0&&other.revision===merged.revision&&equivalent(other,merged));
    if(acknowledged)pending.delete(id);
    else if(localPending.has(id)||savedPending.has(id)||!equivalent(row,other))pending.add(id);
  }
  return {...saved,records,pending:[...pending]};
}
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
  private currentStore() {
    const saved=this.read(this.key,this.snapshot.store);
    return this.snapshot.user?mergeStored(this.snapshot.store,saved):saved;
  }
  private persist(store: Store) {
    if(this.snapshot.user)store=mergeStored(store,this.read(this.key,this.snapshot.store));
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
    const saved=this.read(this.key,this.snapshot.store),store=this.snapshot.user?mergeStored(this.snapshot.store,saved):saved;
    // Recover local pending changes if another tab wrote a stale snapshot. Do not
    // write identical data back, which would cause storage-event ping-pong.
    if(!sameStore(store,saved))this.storage.setItem(this.key,JSON.stringify(store));
    if(!sameStore(store,this.snapshot.store)){this.snapshot={...this.snapshot,store};this.emit();}
    this.onDirty?.();
  }
  nextStamp(store=this.currentStore()) {
    const greatest = Object.values(store.records).reduce((max, r) => recordStamp(r) > max ? recordStamp(r) : max, this.stamp);
    this.stamp = new Date(Math.max(Date.now(), (Date.parse(greatest) || 0) + 1)).toISOString(); return this.stamp;
  }
  patch(id: string, kind: Kind, patch: Record<string, Value>) {
    const store = this.currentStore();
    const record = patchRecord(store.records[id], id, kind, patch, this.nextStamp(store));
    this.persist({ ...store, records: { ...store.records, [id]: record }, pending: [...new Set([...store.pending, id])] }); this.onDirty?.();
    return id;
  }
  add(kind: Kind, payload: Record<string, Value>) { return this.patch(crypto.randomUUID(), kind, payload); }
  addBatch(drafts: { id?: string; kind: Kind; payload: Record<string, Value> }[]) {
    const store = this.currentStore(), records = { ...store.records }, stamp = this.nextStamp(store);
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
    const store = this.currentStore(), records = { ...store.records }, stamp = this.nextStamp(store);
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
    const store = this.currentStore(), records = { ...store.records }, stamp = this.nextStamp(store);
    for (const id of ids) if (records[id]) records[id] = { ...records[id], deleted: true, stamps: { ...records[id].stamps, _deleted: stamp } };
    this.persist({ ...store, records, pending: [...new Set([...store.pending, ...ids.filter(id => Boolean(records[id]))])] }); this.onDirty?.();
  }
  receive(remote: DataRecord[], userId: string) {
    if (this.snapshot.user?.id !== userId) return;
    const store = this.currentStore(), records = { ...store.records }, pending = new Set(store.pending);
    for (const row of remote) {
      const local = records[row.id];
      if(local&&local.revision>row.revision)continue;
      const merged = local ? mergeRecord(local, row) : row;
      records[row.id] = merged;
      if (equivalent(merged, row)) pending.delete(row.id); else pending.add(row.id);
    }
    this.persist({ ...store, records, pending: [...pending] });
  }
  importBackup(input: unknown) {
    const incoming = validateStore(input), store = this.currentStore(), records = { ...store.records };
    // Imported data is an explicit change on this account; fresh stamps and
    // fresh server revisions prevent another account's revisions being reused.
    const stamp = this.nextStamp(store);
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
