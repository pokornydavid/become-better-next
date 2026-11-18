import test from 'node:test';
import assert from 'node:assert/strict';
import { Repository, STORAGE_PREFIX } from '../src/lib/repository.ts';
import { recordsOf, patchRecord } from '../src/lib/model.ts';
import type { DataRecord } from '../src/lib/model.ts';
import { syncRecords } from '../src/lib/sync-cycle.ts';
import type { RecordTransport } from '../src/lib/sync-cycle.ts';
import { addPersonalExercise } from '../src/lib/exercises.ts';
import { copyWorkoutToDate } from '../src/lib/copy-workout.ts';
import { selectWorkout } from '../src/lib/workout-selection.ts';
import { exerciseHistory } from '../src/lib/training-plan.ts';

const owner = { id: 'owner', email: 'owner@example.test' };
function device() {
  const values = new Map<string, string>();
  const storage = {getItem: (key: string) => values.get(key) || null, setItem: (key: string, value: string) => { values.set(key, value); }};
  const open = () => { const repo = new Repository(storage, true); repo.activate(owner); return repo; };
  return {repo: open(), values, open};
}
function cloud() {
  const rows = new Map<string, DataRecord>();
  const transport: RecordTransport = {
    async fetchPage(_user, offset, limit) { return structuredClone([...rows.values()].sort((a,b) => a.id.localeCompare(b.id)).slice(offset, offset + limit)); },
    async commit(record) {
      const previous = rows.get(record.id);
      if (previous && previous.revision !== record.revision) return structuredClone(previous);
      assert.equal(record.revision, previous?.revision || 0);
      const next = structuredClone({...record, revision: record.revision + 1});
      rows.set(record.id, next); return structuredClone(next);
    },
  };
  return {rows, transport};
}
function workout(repo: Repository, date: string) {
  const id = repo.add('workout', {name: 'Pull', date, status: 'completed'});
  const exercise = addPersonalExercise(repo, id, 'Moje přítahy', 2, 8, 'Vršek zad');
  const sets = recordsOf(repo.getSnapshot().store, 'set').filter(s => s.payload.exerciseId === exercise);
  for (const set of sets) repo.patch(set.id, 'set', {weight: 72.5, reps: 9, done: true});
  return {id, exercise, sets};
}

test('Monday phone loads, reps and exercise notes reach a separate PC without changing Tuesday or copied plans', async () => {
  const phone = device(), pc = device(), server = cloud();
  const monday = workout(phone.repo, '2026-11-16');
  phone.repo.patch(monday.exercise, 'exercise', {notes: 'Příště pomaleji, hlídat techniku'});
  const copy = copyWorkoutToDate(phone.repo, monday.id, '2026-11-16');
  const tuesday = workout(phone.repo, '2026-11-17');
  const before = structuredClone(phone.repo.getSnapshot().store.records);
  await syncRecords(phone.repo, server.transport, true);
  await syncRecords(pc.repo, server.transport, true);
  assert.equal(pc.repo.getSnapshot().status, 'synced');
  assert.deepEqual(pc.repo.getSnapshot().store.pending, []);
  for (const [id, row] of Object.entries(before)) {
    assert.deepEqual(pc.repo.getSnapshot().store.records[id].payload, row.payload);
    assert.deepEqual(pc.repo.getSnapshot().store.records[id].stamps, row.stamps);
  }
  assert.equal(selectWorkout(pc.repo.getSnapshot().store, '2026-11-16')?.id, monday.id);
  assert.equal(selectWorkout(pc.repo.getSnapshot().store, '2026-11-16', copy)?.id, copy);
  assert.equal(selectWorkout(pc.repo.getSnapshot().store, '2026-11-17')?.id, tuesday.id);
  const history = exerciseHistory(pc.repo.getSnapshot().store, 'moje přítahy');
  assert.equal(history[0].notes[0], 'Příště pomaleji, hlídat techniku');
  assert.equal(history[0].weight, 72.5); assert.equal(history[0].reps, 9);
  assert.equal(recordsOf(pc.repo.getSnapshot().store, 'exercise').find(e => e.payload.workoutId === copy)?.payload.notes, '');
});

test('reopening an account recovers a missing upload queue, including tombstones, without touching payloads or demo data', async () => {
  const phone = device(), pc = device(), server = cloud(), session = workout(phone.repo, '2026-11-16');
  const removed = phone.repo.add('exercise', {workoutId: session.id, name: 'Smazaný'});
  phone.repo.remove([removed]);
  const saved = structuredClone(phone.repo.getSnapshot().store);
  const damaged = {...saved, pending: []};
  phone.values.set(`${STORAGE_PREFIX}user:owner`, JSON.stringify(damaged));
  const reopened = phone.open();
  assert.deepEqual(reopened.getSnapshot().store.records, saved.records);
  assert.equal(reopened.getSnapshot().store.pending.length, Object.keys(saved.records).length);
  await syncRecords(reopened, server.transport, true); await syncRecords(pc.repo, server.transport, true);
  assert.equal(pc.repo.getSnapshot().store.records[session.sets[0].id].payload.weight, 72.5);
  assert.equal(pc.repo.getSnapshot().store.records[removed].deleted, true);
  const demoStorage = {getItem: () => JSON.stringify(damaged), setItem: () => {}};
  assert.deepEqual(new Repository(demoStorage).getSnapshot().store.pending, []);
});

test('offline edits survive reopening and merge with independent PC edits through CAS conflicts', async () => {
  const phone = device(), pc = device(), server = cloud(), session = workout(phone.repo, '2026-11-16');
  await syncRecords(phone.repo, server.transport, true); await syncRecords(pc.repo, server.transport, true);
  phone.repo.patch(session.sets[0].id, 'set', {weight: 80});
  await syncRecords(phone.repo, server.transport, false);
  assert.equal(phone.repo.getSnapshot().status, 'offline');
  const reopened = phone.open();
  let conflicted = false;
  const transport = {...server.transport, async commit(record: DataRecord) {
    if (!conflicted) {
      conflicted = true;
      const previous = server.rows.get(record.id)!;
      server.rows.set(record.id, {...patchRecord(previous, record.id, 'set', {reps: 11}, '2099-01-01T00:00:00.000Z'), revision: previous.revision + 1});
    }
    return server.transport.commit(record);
  }};
  await syncRecords(reopened, transport, true); await syncRecords(pc.repo, server.transport, true);
  const result = pc.repo.getSnapshot().store.records[session.sets[0].id];
  assert.equal(result.payload.weight, 80); assert.equal(result.payload.reps, 11);
  assert.equal(result.payload.done, true); assert.deepEqual(reopened.getSnapshot().store.pending, []);
});

test('a thrown upload failure does not strand the remaining sets and retries preserve every value', async () => {
  const phone = device(), pc = device(), server = cloud(), session = workout(phone.repo, '2026-11-16');
  let failed = false;
  const transport = {...server.transport, async commit(record: DataRecord) {
    if (!failed) { failed = true; throw new Error('connection lost'); }
    return server.transport.commit(record);
  }};
  await syncRecords(phone.repo, transport, true);
  assert.equal(phone.repo.getSnapshot().status, 'error');
  assert.equal(phone.repo.getSnapshot().store.pending.length, 1);
  assert.ok(server.rows.has(session.sets[1].id));
  await syncRecords(phone.repo, server.transport, true); await syncRecords(pc.repo, server.transport, true);
  assert.equal(pc.repo.getSnapshot().store.records[session.sets[0].id].payload.reps, 9);
  assert.equal(phone.repo.getSnapshot().status, 'synced');
});

test('account switching while downloading or uploading never leaks old records into the new account', async () => {
  const phone = device(), server = cloud(); workout(phone.repo, '2026-11-16');
  await syncRecords(phone.repo, {...server.transport, async commit(record) {
    const result = await server.transport.commit(record);
    phone.repo.activate({id: 'other', email: 'other@example.test'}); return result;
  }}, true);
  assert.deepEqual(phone.repo.getSnapshot().store.records, {});
  phone.repo.activate(owner);
  assert.ok(phone.repo.getSnapshot().store.pending.length > 0);
  await syncRecords(phone.repo, {...server.transport, async fetchPage() {
    phone.repo.activate({id: 'other', email: 'other@example.test'}); return [...server.rows.values()];
  }}, true);
  assert.deepEqual(phone.repo.getSnapshot().store.records, {});
});

test('identical plans select deterministically, explicit selections win, deleted sessions and sets stay excluded', () => {
  const phone = device(), monday = workout(phone.repo, '2026-11-16');
  const copy = copyWorkoutToDate(phone.repo, monday.id, '2026-11-16');
  phone.repo.patch(copy, 'workout', {status: 'active'});
  assert.equal(selectWorkout(phone.repo.getSnapshot().store, '2026-11-16')?.id, monday.id);
  const before = structuredClone(phone.repo.getSnapshot().store.records);
  const reversed = {...phone.repo.getSnapshot().store, records: Object.fromEntries(Object.entries(before).reverse())};
  assert.equal(selectWorkout(reversed, '2026-11-16')?.id, monday.id);
  assert.deepEqual(phone.repo.getSnapshot().store.records, before);
  phone.repo.remove([monday.id]);
  assert.equal(selectWorkout(phone.repo.getSnapshot().store, '2026-11-16')?.id, copy);
  assert.equal(selectWorkout(phone.repo.getSnapshot().store, '2026-11-17'), undefined);
});
