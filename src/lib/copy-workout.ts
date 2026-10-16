import { recordsOf } from './model.ts';
import type { Kind, Value } from './model.ts';
import type { Repository } from './repository.ts';
import { workoutExercises } from './exercises.ts';

export function copyWorkoutToDate(repo: Repository, sourceId: string, date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(`${date}T12:00:00Z`)) || new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) !== date) throw new Error('Vyber platné datum.');
  const store = repo.getSnapshot().store, source = store.records[sourceId];
  if (!source || source.deleted || source.kind !== 'workout') throw new Error('Původní trénink už není dostupný.');
  const id = crypto.randomUUID();
  const drafts: {id: string; kind: Kind; payload: Record<string, Value>}[] = [
    {id, kind: 'workout', payload: {...source.payload, date, status: 'planned', duration: 0, startedAt: null}},
  ];
  const sets = recordsOf(store, 'set');
  for (const exercise of workoutExercises(store, sourceId)) {
    const exerciseId = crypto.randomUUID();
    drafts.push({id: exerciseId, kind: 'exercise', payload: {...exercise.payload, workoutId: id}});
    for (const set of sets.filter(s => s.payload.exerciseId === exercise.id)) {
      drafts.push({id: crypto.randomUUID(), kind: 'set', payload: {...set.payload, exerciseId, done: false, rpe: null}});
    }
  }
  if (store.records[`daily-${date}`]?.payload.restDay === true && !store.records[`daily-${date}`].deleted) {
    drafts.push({id: `daily-${date}`, kind: 'daily', payload: {date, restDay: false}});
  }
  // Persist the complete copy together, preserving existing workouts and daily logs.
  repo.updateBatch(drafts);
  return id;
}
