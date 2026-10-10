import test from 'node:test';
import assert from 'node:assert/strict';
import { addDays, equivalent, mergeRecord, patchRecord, sleepHours, weekDates, validateStore } from '../src/lib/model.ts';
import { Repository, STORAGE_PREFIX } from '../src/lib/repository.ts';
const a = '2026-10-10T08:00:00.000Z', b = '2026-10-10T08:00:01.000Z';
function memory() { const values = new Map<string, string>(); return { getItem: (k: string) => values.get(k) || null, setItem: (k: string, v: string) => { values.set(k, v); }, values }; }
test('PC calories and phone sleep merge independently', () => {
  const base = patchRecord(undefined, 'day', 'daily', { calories: 2000, bedTime: '23:00' }, a);
  const pc = patchRecord(base, 'day', 'daily', { calories: 2400 }, b);
  const phone = { ...patchRecord(base, 'day', 'daily', { bedTime: '22:30' }, b), revision: 3 };
  const merged = mergeRecord(pc, phone);
  assert.equal(merged.payload.calories, 2400); assert.equal(merged.payload.bedTime, '22:30'); assert.equal(merged.revision, 3);
});
test('concurrent same-field ties converge in either merge direction', () => {
  const x = patchRecord(undefined, 'day', 'daily', { calories: 2200 }, a);
  const y = patchRecord(undefined, 'day', 'daily', { calories: 2400 }, a);
  assert.ok(equivalent(mergeRecord(x, y), mergeRecord(y, x)));
});
test('older offline changes cannot revive deleted workout', () => {
  const base = patchRecord(undefined, 'w', 'workout', { name: 'Upper' }, a);
  const removed = { ...base, deleted: true, stamps: { ...base.stamps, _deleted: b }, revision: 2 };
  assert.equal(mergeRecord(base, removed).deleted, true); assert.equal(mergeRecord(removed, base).deleted, true);
});
test('equal deletion timestamps resolve in favor of deletion', () => {
  const r = patchRecord(undefined, 'w', 'workout', { name: 'Upper' }, a);
  const alive = { ...r, stamps: { ...r.stamps, _deleted: b } }, dead = { ...alive, deleted: true };
  assert.equal(mergeRecord(alive, dead).deleted, true); assert.equal(mergeRecord(dead, alive).deleted, true);
});
test('pending writes survive closing and reopening app', () => {
  const storage = memory(), r = new Repository(storage); r.startEmpty(); r.patch('day', 'daily', { calories: 2300 });
  const reopened = new Repository(storage); assert.equal(reopened.getSnapshot().store.records.day.payload.calories, 2300); assert.deepEqual(reopened.getSnapshot().store.pending, ['day']);
});
test('accounts and the existing production app have isolated storage', () => {
  const storage = memory(); storage.setItem('fit-plan-local-v1', '{"protected":true}');
  const r = new Repository(storage, true); r.activate({ id: 'A', email: 'a@example.test' }); r.patch('day', 'daily', { calories: 2400 });
  r.activate({ id: 'B', email: 'b@example.test' }); assert.equal(r.getSnapshot().store.records.day, undefined);
  r.activate({ id: 'A', email: 'a@example.test' }); assert.equal(r.getSnapshot().store.records.day.payload.calories, 2400);
  assert.equal(storage.getItem('fit-plan-local-v1'), '{"protected":true}'); assert.ok(STORAGE_PREFIX.startsWith('become-better-next:'));
});
test('late response from signed-out account is ignored', () => {
  const r = new Repository(memory(), true); r.activate({ id: 'A', email: 'a@example.test' }); r.activate({ id: 'B', email: 'b@example.test' });
  r.receive([patchRecord(undefined, 'secret', 'daily', { calories: 2400 }, a)], 'A'); assert.equal(r.getSnapshot().store.records.secret, undefined);
});
test('an edit during upload remains pending until its own acknowledgement', () => {
  const r = new Repository(memory(), true); r.activate({ id: 'A', email: 'a@example.test' });
  r.patch('day', 'daily', { calories: 2100 }); const uploaded = { ...r.getSnapshot().store.records.day, revision: 1 };
  r.patch('day', 'daily', { calories: 2400 }); r.receive([uploaded], 'A');
  assert.equal(r.getSnapshot().store.records.day.payload.calories, 2400); assert.deepEqual(r.getSnapshot().store.pending, ['day']);
  r.receive([{ ...r.getSnapshot().store.records.day, revision: 2 }], 'A'); assert.deepEqual(r.getSnapshot().store.pending, []);
});
test('failed browser persistence never reports a successful change', () => {
  const r = new Repository({ getItem: () => null, setItem: () => { throw new Error('Quota exceeded'); } });
  const before = r.getSnapshot(); assert.throws(() => r.patch('day', 'daily', { calories: 2400 }), /Quota/); assert.equal(r.getSnapshot(), before);
});
test('import uses fresh account revision and queues every historical record', () => {
  const r = new Repository(memory()); r.startEmpty(); const s = { version: 1, records: { day: { ...patchRecord(undefined, 'day', 'daily', { calories: 2400 }, a), revision: 50 } } };
  r.importBackup(s); assert.equal(r.getSnapshot().store.records.day.revision, 0); assert.deepEqual(r.getSnapshot().store.pending, ['day']);
});
test('demo data never automatically enters an authenticated account', () => {
  const r = new Repository(memory()); assert.ok(Object.keys(r.getSnapshot().store.records).length > 0); r.activate({ id: 'A', email: 'a@example.test' }); assert.deepEqual(r.getSnapshot().store.records, {});
});
test('malformed backup cannot replace valid local data', () => {
  const r = new Repository(memory()); const before = r.getSnapshot(); assert.throws(() => r.importBackup({ version: 98 }), /formát/); assert.equal(r.getSnapshot(), before);
  assert.throws(() => validateStore({ version: 1, records: { bad: { ...patchRecord(undefined, 'bad', 'daily', { calories: 2400 }, a), payload: { calories: [] } } } }), /Neplatná data/);
});
test('date navigation respects local days across month and DST changes', () => {
  assert.equal(addDays('2026-10-31', 1), '2026-11-01'); assert.equal(weekDates('2026-10-11')[0], '2026-10-05'); assert.equal(addDays('2026-10-25', 1), '2026-10-26');
});
test('sleep crosses midnight and rejects missing times', () => { assert.equal(sleepHours('23:00', '06:45'), 7.75); assert.equal(sleepHours('', '06:45'), 0); });
test('restoring the local demo resets modified training status', () => {
  const storage = memory(), r = new Repository(storage);
  const workout = Object.values(r.getSnapshot().store.records).find(row => row.kind === 'workout' && row.payload.status === 'planned')!;
  r.patch(workout.id, 'workout', { status: 'active' }); r.startEmpty(); r.restoreDemo();
  const reopened = new Repository(storage);
  assert.ok(Object.values(reopened.getSnapshot().store.records).some(row => row.kind === 'workout' && row.payload.status === 'planned'));
  assert.ok(!Object.values(reopened.getSnapshot().store.records).some(row => row.payload.status === 'active'));
});
