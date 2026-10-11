export type Value = string | number | boolean | null;
export type Kind = 'workout' | 'exercise' | 'set' | 'daily' | 'goals' | 'measurement' | 'library' | 'photo' | 'photoAlbum' | 'progressPhase';
export type DataRecord = {
  id: string; kind: Kind; payload: Record<string, Value>;
  stamps: Record<string, string>; deleted: boolean; revision: number;
};
export type Store = { version: 1; records: Record<string, DataRecord>; pending: string[]; demo: boolean };
export const KINDS: Kind[] = ['workout', 'exercise', 'set', 'daily', 'goals', 'measurement', 'library', 'photo', 'photoAlbum', 'progressPhase'];
export const emptyStore = (): Store => ({ version: 1, records: {}, pending: [], demo: false });
export const dateKey = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
export function addDays(date: string, days: number) { const d = new Date(`${date}T12:00:00`); d.setDate(d.getDate() + days); return dateKey(d); }
export function weekDates(date: string) { const d = new Date(`${date}T12:00:00`); const monday = addDays(date, -((d.getDay() + 6) % 7)); return Array.from({ length: 7 }, (_, i) => addDays(monday, i)); }
export const displayDate = (date: string, options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' }) => new Intl.DateTimeFormat('cs-CZ', options).format(new Date(`${date}T12:00:00`));
export const num = (value: Value | undefined) => Number(value) || 0;
export const text = (value: Value | undefined) => typeof value === 'string' ? value : '';
export const recordsOf = (store: Store, kind: Kind) => Object.values(store.records).filter(r => r.kind === kind && !r.deleted);
export const recordStamp = (r: DataRecord) => Object.values(r.stamps).sort().at(-1) || '';
export function patchRecord(previous: DataRecord | undefined, id: string, kind: Kind, patch: Record<string, Value>, stamp: string): DataRecord {
  const stamps = { ...previous?.stamps };
  for (const key of Object.keys(patch)) stamps[key] = stamp;
  return { id, kind, payload: { ...previous?.payload, ...patch }, stamps, deleted: previous?.deleted ?? false, revision: previous?.revision ?? 0 };
}
// Independent fields merge deterministically. A deletion has its own timestamp,
// so an old offline device cannot resurrect a removed workout or set.
export function mergeRecord(local: DataRecord, remote: DataRecord): DataRecord {
  const payload: Record<string, Value> = {}, stamps: Record<string, string> = {};
  for (const key of new Set([...Object.keys(local.payload), ...Object.keys(remote.payload), ...Object.keys(local.stamps), ...Object.keys(remote.stamps)])) {
    const a = local.stamps[key] || '', b = remote.stamps[key] || '';
    const preferLocal = a > b || (a === b && JSON.stringify(local.payload[key] ?? null) > JSON.stringify(remote.payload[key] ?? null));
    if (key !== '_deleted') payload[key] = (preferLocal ? local.payload[key] : remote.payload[key]) ?? null;
    stamps[key] = a > b ? a : b;
  }
  const aDelete = local.stamps._deleted || '', bDelete = remote.stamps._deleted || '';
  const deleted = aDelete === bDelete ? local.deleted || remote.deleted : aDelete > bDelete ? local.deleted : remote.deleted;
  return { ...remote, payload, stamps, deleted, revision: remote.revision };
}
export function equivalent(a: DataRecord, b: DataRecord) {
  const keys = [...new Set([...Object.keys(a.payload), ...Object.keys(b.payload), ...Object.keys(a.stamps), ...Object.keys(b.stamps)])];
  return a.deleted === b.deleted && keys.every(key => a.payload[key] === b.payload[key] && a.stamps[key] === b.stamps[key]);
}
export function validateStore(input: unknown): Store {
  if (!input || typeof input !== 'object') throw new Error('Záloha není platná.');
  const raw = input as Partial<Store>;
  if (raw.version !== 1 || !raw.records || typeof raw.records !== 'object' || Array.isArray(raw.records)) throw new Error('Nepodporovaný formát zálohy.');
  const records: Record<string, DataRecord> = {};
  const entries = Object.entries(raw.records);
  if (entries.length > 50000) throw new Error('Záloha je příliš velká.');
  for (const [id, record] of entries) {
    if (['__proto__', 'prototype', 'constructor'].includes(id) || id.length > 200 || !id || !record || record.id !== id || !KINDS.includes(record.kind) || !record.payload || typeof record.payload !== 'object' || Array.isArray(record.payload) || !record.stamps || typeof record.stamps !== 'object' || Array.isArray(record.stamps) || typeof record.deleted !== 'boolean') throw new Error('Záloha obsahuje neplatný záznam.');
    for (const [key, value] of Object.entries(record.payload)) {
      if (['__proto__', 'prototype', 'constructor'].includes(key) || (value !== null && !['string', 'number', 'boolean'].includes(typeof value))) throw new Error('Neplatná data v záloze.');
      if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('Neplatné číslo v záloze.');
    }
    for (const stamp of Object.values(record.stamps)) if (typeof stamp !== 'string' || !Number.isFinite(Date.parse(stamp))) throw new Error('Neplatné datum v záloze.');
    records[id] = { ...record, revision: Number.isInteger(record.revision) ? record.revision : 0 };
  }
  return { version: 1, records, pending: [], demo: Boolean(raw.demo) };
}
export function sleepHours(bedTime: string, wakeTime: string) {
  if (!/^\d{2}:\d{2}$/.test(bedTime) || !/^\d{2}:\d{2}$/.test(wakeTime)) return 0;
  const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
  return ((minutes(wakeTime) - minutes(bedTime) + 1440) % 1440) / 60;
}
export function volume(store: Store, workoutId?: string) {
  const exercises = recordsOf(store, 'exercise').filter(e => !workoutId || e.payload.workoutId === workoutId);
  const ids = new Set(exercises.map(e => e.id));
  return recordsOf(store, 'set').filter(s => ids.has(text(s.payload.exerciseId)) && s.payload.done).reduce((v, s) => v + num(s.payload.weight) * num(s.payload.reps), 0);
}
