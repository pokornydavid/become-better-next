import type { DataRecord, Store } from './model.ts';
import { recordsOf, text } from './model.ts';

export function workoutSummary(store: Store, workoutId: string) {
  const exercises = new Set(recordsOf(store, 'exercise').filter(e => e.payload.workoutId === workoutId).map(e => e.id));
  const sets = recordsOf(store, 'set').filter(s => exercises.has(text(s.payload.exerciseId)));
  return { exercises: exercises.size, done: sets.filter(s => s.payload.done === true).length, sets: sets.length };
}

// A copied plan and the actual logged session can coexist on the same date.
// Select the logged session consistently on every device, preserving all copies.
export function selectWorkout(store: Store, date: string, selectedId = ''): DataRecord | undefined {
  const candidates = recordsOf(store, 'workout').filter(w => w.payload.date === date);
  const explicit = candidates.find(w => w.id === selectedId);
  if (explicit) return explicit;
  const rank = (w: DataRecord) => {
    const summary = workoutSummary(store, w.id);
    return w.payload.status === 'active' && summary.done > 0 ? 5
      : summary.done > 0 ? 4 : w.payload.status === 'completed' ? 3
      : w.payload.status === 'active' ? 2 : summary.exercises > 0 ? 1 : 0;
  };
  return candidates.sort((a, b) => rank(b) - rank(a) || a.id.localeCompare(b.id))[0];
}
