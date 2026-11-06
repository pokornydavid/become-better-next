import test from 'node:test';
import assert from 'node:assert/strict';
import { Repository } from '../src/lib/repository.ts';
import { completedWorkoutTiming, formatWorkoutTime, restDurationSeconds, workoutDurationSeconds } from '../src/lib/workout-timing.ts';

test('rest preference persists and merges with independent goals from another device', () => {
  const data = new Map<string, string>();
  const storage = {getItem: (key: string) => data.get(key) || null, setItem: (key: string, value: string) => {data.set(key, value);}};
  const repo = new Repository(storage); repo.activate({id: 'test-owner', email: 'test@example.test'});
  repo.patch('goals', 'goals', {restSeconds: 180, calories: 2400});
  const reopened = new Repository(storage); reopened.activate({id: 'test-owner', email: 'test@example.test'});
  assert.equal(restDurationSeconds(reopened.getSnapshot().store.records.goals.payload), 180);
  const remote = structuredClone(reopened.getSnapshot().store.records.goals);
  remote.payload.calories = 2500; remote.stamps.calories = '2099-01-01T00:00:00.000Z';
  reopened.receive([remote], 'test-owner');
  assert.equal(restDurationSeconds(reopened.getSnapshot().store.records.goals.payload), 180);
  assert.equal(reopened.getSnapshot().store.records.goals.payload.calories, 2500);
  assert.equal(formatWorkoutTime(restDurationSeconds({restSeconds: 180})), '03:00');
  for (const invalid of [null, '180', -1, 0, 29, 1801, Infinity, NaN]) assert.equal(restDurationSeconds({restSeconds: invalid}), 90);
});

test('elapsed time survives reopening and a long background gap, then freezes on completion', () => {
  const data = new Map<string, string>();
  const storage = {getItem: (key: string) => data.get(key) || null, setItem: (key: string, value: string) => {data.set(key, value);}};
  const repo = new Repository(storage); repo.startEmpty();
  const start = Date.UTC(2026, 10, 6, 10, 0, 0);
  const id = repo.add('workout', {name: 'LOWER', status: 'active', startedAt: start});
  assert.equal(workoutDurationSeconds(repo.getSnapshot().store.records[id].payload, start + 1600), 1);
  const reopened = new Repository(storage), payload = reopened.getSnapshot().store.records[id].payload;
  // No timer ticks are needed while the browser is suspended.
  const finish = start + 3723456;
  assert.equal(formatWorkoutTime(workoutDurationSeconds(payload, finish)), '1:02:03');
  const timing = completedWorkoutTiming(payload, finish);
  reopened.patch(id, 'workout', timing);
  assert.equal(timing.duration, 62); assert.equal(timing.finishedAt, finish);
  const saved = new Repository(storage).getSnapshot().store.records[id].payload;
  assert.equal(workoutDurationSeconds(saved, finish + 3600000), 3723);
  assert.throws(() => completedWorkoutTiming(saved, finish + 1000));
});

test('old completed workouts retain their stored duration and invalid starts do not count from the epoch', () => {
  assert.equal(formatWorkoutTime(workoutDurationSeconds({status: 'completed', duration: 173}, Date.now())), '2:53:00');
  assert.equal(workoutDurationSeconds({status: 'completed', durationSeconds: 0, duration: 1}, Date.now()), 0);
  assert.equal(workoutDurationSeconds({status: 'planned', startedAt: 123, durationSeconds: 3600}, Date.now()), null);
  for (const invalid of [undefined, null, 0, '123', Infinity, NaN]) {
    const payload = {status: 'active', startedAt: invalid ?? null};
    assert.equal(workoutDurationSeconds(payload, Date.now()), null);
    assert.throws(() => completedWorkoutTiming(payload, Date.now()));
  }
  assert.equal(formatWorkoutTime(null), '—');
});
