import test from 'node:test';
import assert from 'node:assert/strict';
import { Repository } from '../src/lib/repository.ts';
import { recordsOf } from '../src/lib/model.ts';
import { addPersonalExercise, workoutExercises } from '../src/lib/exercises.ts';
import { copyWorkoutToDate } from '../src/lib/copy-workout.ts';

function setup() {
  const values = new Map<string, string>();
  const storage = {getItem: (key: string) => values.get(key) || null, setItem: (key: string, value: string) => {values.set(key, value);}};
  const repo = new Repository(storage); repo.startEmpty();
  return {repo, storage};
}
test('copying preserves completed source, custom order and loads while creating a fresh plan on an occupied rest day', () => {
  const {repo, storage} = setup();
  const source = repo.add('workout', {name: 'Moje nohy', date: '2026-10-13', status: 'completed', duration: 173, startedAt: 123, notes: 'Poznámka'});
  const first = addPersonalExercise(repo, source, 'předkopy', 2, 7), second = addPersonalExercise(repo, source, 'lýtka', 1, 12);
  repo.patch(first, 'exercise', {order: 1}); repo.patch(second, 'exercise', {order: 0});
  const set = recordsOf(repo.getSnapshot().store, 'set').find(s => s.payload.exerciseId === first)!;
  repo.patch(set.id, 'set', {weight: 105, done: true, rpe: 9});
  const existing = repo.add('workout', {name: 'Jiný plán', date: '2026-11-01'});
  repo.patch('daily-2026-11-01', 'daily', {date: '2026-11-01', restDay: true, calories: 2065, steps: 12877});
  const before = structuredClone(repo.getSnapshot().store.records);
  let writes = 0; repo.subscribe(() => writes++);
  const id = copyWorkoutToDate(repo, source, '2026-11-01'), store = repo.getSnapshot().store;
  assert.equal(writes, 1);
  assert.deepEqual(store.records[source], before[source]); assert.deepEqual(store.records[existing], before[existing]);
  assert.deepEqual(store.records[set.id], before[set.id]);
  assert.deepEqual(store.records[id].payload, {...before[source].payload, date: '2026-11-01', status: 'planned', duration: 0, startedAt: null});
  const exercises = workoutExercises(store, id);
  assert.deepEqual(exercises.map(e => e.payload.name), ['lýtka', 'předkopy']);
  assert.ok(exercises.every(e => !before[e.id]));
  const sets = recordsOf(store, 'set').filter(s => exercises.some(e => e.id === s.payload.exerciseId));
  assert.equal(sets.length, 3); assert.ok(sets.every(s => s.payload.done === false && s.payload.rpe === null && !before[s.id]));
  assert.ok(sets.some(s => s.payload.weight === 105 && s.payload.reps === 7));
  assert.deepEqual(store.records['daily-2026-11-01'].payload, {date: '2026-11-01', restDay: false, calories: 2065, steps: 12877});
  assert.ok([id, ...exercises.map(e => e.id), ...sets.map(s => s.id)].every(key => store.pending.includes(key)));
  assert.equal(new Repository(storage).getSnapshot().store.records[id].payload.date, '2026-11-01');
});
test('copying fails without a partial plan for invalid dates, deleted source or full storage', () => {
  const {repo, storage} = setup();
  const source = repo.add('workout', {name: 'Upper', date: '2026-10-13'});
  addPersonalExercise(repo, source, 'moje tlaky', 3, 10);
  let before = repo.exportBackup();
  for (const date of ['2026-02-30', '', '2026-13-01']) assert.throws(() => copyWorkoutToDate(repo, source, date), /datum/);
  assert.deepEqual(repo.exportBackup(), before);
  storage.setItem = () => {throw new Error('quota');};
  assert.throws(() => copyWorkoutToDate(repo, source, '2026-10-16'), /quota/);
  assert.deepEqual(repo.exportBackup(), before);
  const other = setup().repo; const deleted = other.add('workout', {name: 'Smazaný'}); other.remove([deleted]); before = other.exportBackup();
  assert.throws(() => copyWorkoutToDate(other, deleted, '2026-10-16'), /dostupný/); assert.deepEqual(other.exportBackup(), before);
});
