import { addDays, dateKey, num, recordsOf, text } from './model.ts';
import type { DataRecord, Kind, Store, Value } from './model.ts';
export type Draft = { id?: string; kind: Kind; payload: Record<string, Value> };
export type PhaseInput = { name: string; type: string; start: string; weeks: number; goal: string; targetWeight: number | null };
export const phaseTypes = { diet: 'Dieta', bulk: 'Objemová fáze', maintain: 'Udržování', custom: 'Vlastní fáze' };
export function validDate(date: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(`${date}T12:00:00`)) && dateKey(new Date(`${date}T12:00:00`)) === date;
}
function validatePhase(input: PhaseInput) {
  if (!input.name.trim() || input.name.trim().length > 80 || !Object.hasOwn(phaseTypes, input.type) || !validDate(input.start) || !Number.isInteger(input.weeks) || input.weeks < 1 || input.weeks > 52 || input.goal.length > 500 || (input.targetWeight !== null && (!Number.isFinite(input.targetWeight) || input.targetWeight < 20 || input.targetWeight > 500))) throw new Error('Zkontroluj název, datum, délku 1–52 týdnů a cíl fáze.');
  if (!validDate(addDays(input.start, input.weeks * 7 - 1))) throw new Error('Vyber platný rozsah dat fáze.');
}
export function phaseDrafts(input: PhaseInput): Draft[] {
  validatePhase(input);
  const phaseId = crypto.randomUUID();
  return [{ id: phaseId, kind: 'progressPhase', payload: { ...input, name: input.name.trim() } }, ...Array.from({ length: input.weeks }, (_, i): Draft => ({ kind: 'photoAlbum', payload: { name: `Týden ${i + 1}`, date: addDays(input.start, i * 7), phaseId, week: i + 1 } }))];
}
export function phaseChanges(store: Store, id: string, input: PhaseInput) {
  validatePhase(input);
  const phase = store.records[id];
  if (!phase || phase.deleted || phase.kind !== 'progressPhase') throw new Error('Fáze už není dostupná.');
  const albums = recordsOf(store, 'photoAlbum').filter(a => a.payload.phaseId === id), photos = recordsOf(store, 'photo');
  const patch = Object.fromEntries(Object.entries({ ...input, name: input.name.trim() }).filter(([key, value]) => phase.payload[key] !== value));
  const removed: string[] = [], drafts: Draft[] = Object.keys(patch).length ? [{ id, kind: 'progressPhase', payload: patch }] : [];
  for (const album of albums.filter(a => num(a.payload.week) > input.weeks)) {
    if (photos.some(p => p.payload.albumId === album.id)) throw new Error(`${text(album.payload.name)} má fotky. Před zkrácením je přesuň do jiné složky.`);
    removed.push(album.id);
  }
  for (let i = 1; i <= input.weeks; i++) {
    const album = albums.find(a => num(a.payload.week) === i), date = addDays(input.start, (i - 1) * 7);
    if (!album) drafts.push({ kind: 'photoAlbum', payload: { name: `Týden ${i}`, date, phaseId: id, week: i } });
    else if (album.payload.date !== date) drafts.push({ id: album.id, kind: 'photoAlbum', payload: { date } });
    if (album && album.payload.date !== date) for (const photo of photos.filter(p => p.payload.albumId === album.id)) drafts.push({ id: photo.id, kind: 'photo', payload: { date } });
  }
  return { drafts, removed };
}
export function progressPhases(store: Store) { return recordsOf(store, 'progressPhase').sort((a, b) => text(b.payload.start).localeCompare(text(a.payload.start)) || b.id.localeCompare(a.id)); }
export function phaseTiming(phase: DataRecord, today = dateKey()) {
  const start = text(phase.payload.start), weeks = num(phase.payload.weeks), end = addDays(start, weeks * 7 - 1);
  const elapsedDays = Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) / 86400000);
  return { end, currentWeek: Math.min(weeks, Math.max(1, Math.floor(elapsedDays / 7) + 1)), status: today < start ? 'planned' : today > end ? 'completed' : 'active', progress: Math.max(0, Math.min(1, (elapsedDays + 1) / (weeks * 7))) };
}
