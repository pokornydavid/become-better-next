import type { DataRecord, Store } from './model.ts';
import { num, recordsOf, text, weekDates } from './model.ts';
export type Album = { id: string; name: string; date: string; photos: DataRecord[]; virtual: boolean; phaseId?: string; week?: number };
export const photoCount = (count: number) => `${count} ${count === 1 ? 'fotka' : count > 1 && count < 5 ? 'fotky' : 'fotek'}`;
export function photoAlbums(store: Store): Album[] {
  const albums = new Map<string, Album>(recordsOf(store, 'photoAlbum').map(r => [r.id, { id: r.id, name: text(r.payload.name), date: text(r.payload.date), phaseId: text(r.payload.phaseId), week: num(r.payload.week), photos: [] as DataRecord[], virtual: false }]));
  for (const photo of recordsOf(store, 'photo')) {
    let id = text(photo.payload.albumId);
    if (!albums.has(id)) {
      const date = weekDates(text(photo.payload.date))[0]; id = `week:${date}`;
      if (!albums.has(id)) albums.set(id, { id, name: 'Starší fotky', date, photos: [], virtual: true });
    }
    albums.get(id)!.photos.push(photo);
  }
  for (const album of albums.values()) album.photos.sort((a, b) => num(a.payload.order) - num(b.payload.order) || a.id.localeCompare(b.id));
  return [...albums.values()].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}
export type PhotoTransform = { zoom: number; x: number; y: number; rotation: number; brightness: number; contrast: number };
export const defaultTransform: PhotoTransform = { zoom: 1, x: 0, y: 0, rotation: 0, brightness: 100, contrast: 100 };
export function photoTransform(photo?: DataRecord): PhotoTransform {
  const p = photo?.payload || {};
  return clampTransform({ zoom: p.zoom ?? 1, x: p.x ?? 0, y: p.y ?? 0, rotation: p.rotation ?? 0, brightness: p.brightness ?? 100, contrast: p.contrast ?? 100 });
}
export function clampTransform(input: Record<string, unknown>): PhotoTransform {
  const clamp = (key: keyof PhotoTransform, min: number, max: number) => { const value = Number(input[key]); return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : defaultTransform[key]; };
  return { zoom: clamp('zoom', .75, 3), x: clamp('x', -100, 100), y: clamp('y', -100, 100), rotation: clamp('rotation', -180, 180), brightness: clamp('brightness', 50, 150), contrast: clamp('contrast', 50, 150) };
}
export function imagePlacement(width: number, height: number, frameWidth: number, frameHeight: number, t: PhotoTransform) {
  const scale = Math.max(frameWidth / width, frameHeight / height) * t.zoom;
  return { width: width * scale, height: height * scale, x: frameWidth / 2 + t.x / 100 * frameWidth, y: frameHeight / 2 + t.y / 100 * frameHeight };
}
