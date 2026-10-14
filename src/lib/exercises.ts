import type { Store } from './model.ts';
import { num, recordsOf, text } from './model.ts';
import type { Repository } from './repository.ts';

export const exerciseNameKey = (name: string) => name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('cs-CZ');
export function workoutExercises(store: Store, workoutId?: string) {
  return recordsOf(store, 'exercise').filter(e => e.payload.workoutId === workoutId)
    .sort((a, b) => num(a.payload.order) - num(b.payload.order) || a.id.localeCompare(b.id));
}
export function moveExercise(repo: Repository, workoutId: string, exerciseId: string, direction: -1 | 1) {
  const store = repo.getSnapshot().store, workout = store.records[workoutId];
  if (!workout || workout.deleted || workout.kind !== 'workout') throw new Error('Trénink už není dostupný.');
  const exercises = workoutExercises(store, workoutId), index = exercises.findIndex(e => e.id === exerciseId), target = index + direction;
  if (index < 0 || target < 0 || target >= exercises.length) return;
  [exercises[index], exercises[target]] = [exercises[target], exercises[index]];
  // Save the entire local reorder once; IDs and their completed sets stay intact.
  repo.updateBatch(exercises.flatMap((exercise, order) => exercise.payload.order === order ? [] : [{ id: exercise.id, kind: 'exercise' as const, payload: { order } }]));
}
export function addPersonalExercise(repo: Repository, workoutId: string, name: string, count: number, reps: number) {
  name = name.trim();
  if (!name || name.length > 120) throw new Error('Napiš název cviku, nejvýš 120 znaků.');
  if (!Number.isInteger(count) || count < 1 || count > 20 || !Number.isInteger(reps) || reps < 1 || reps > 1000) throw new Error('Zkontroluj počet sérií a opakování.');
  const store = repo.getSnapshot().store;
  if (!store.records[workoutId] || store.records[workoutId].deleted || store.records[workoutId].kind !== 'workout') throw new Error('Nejdřív vytvoř trénink.');
  const id = crypto.randomUUID();
  const order = Math.max(-1, ...recordsOf(store, 'exercise').filter(e => e.payload.workoutId === workoutId).map(e => num(e.payload.order))) + 1;
  repo.addBatch([
    { id, kind: 'exercise', payload: { workoutId, name, muscle: '', catalogId: '', order } },
    ...Array.from({ length: count }, (_, i) => ({ kind: 'set' as const, payload: { exerciseId: id, weight: null, reps, done: false, rpe: null, order: i } })),
  ]);
  return id;
}
export function personalBests(store: Store) {
  const exercises = recordsOf(store, 'exercise'), byId = new Map(exercises.map(e => [e.id, e]));
  const bests = new Map<string, { name: string; weight: number }>();
  for (const set of recordsOf(store, 'set')) {
    const exercise = byId.get(text(set.payload.exerciseId));
    if (!exercise || exercise.payload.muscle === 'Kardio' || exercise.payload.type === 'cardio' || !set.payload.done || num(set.payload.weight) <= 0) continue;
    const name = text(exercise.payload.name), key = exerciseNameKey(name), weight = num(set.payload.weight);
    if (!bests.has(key) || bests.get(key)!.weight < weight) bests.set(key, { name, weight });
  }
  return [...bests.values()].sort((a, b) => b.weight - a.weight);
}
