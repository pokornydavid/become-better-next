import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyStore, patchRecord, recordsOf, mergeRecord } from '../src/lib/model.ts';
import { weeklyNutrition, nutritionGoals } from '../src/lib/nutrition.ts';
import { phaseChanges, phaseDrafts, phaseTiming, validDate } from '../src/lib/progress-phases.ts';
import { applyClientDrafts, validateCoachGoals, workoutPlanDrafts } from '../src/lib/coach-planning.ts';
import { photoAlbums } from '../src/lib/photo-albums.ts';
import { Repository } from '../src/lib/repository.ts';
const stamp = '2026-10-12T12:00:00.000Z';
test('weekly allowance preserves the explicit weekly limit, counts a logged zero, and allocates the remainder exactly', () => {
  let store = emptyStore();
  assert.equal(nutritionGoals(store).weeklyCalories, 16800);
  store = applyClientDrafts(store, [{ id: 'goals', kind: 'goals', payload: { calories: 2500, weeklyCalories: 16000 } }, { id: 'daily-2026-10-12', kind: 'daily', payload: { calories: 2800 } }, { id: 'daily-2026-10-13', kind: 'daily', payload: { calories: 0 } }]);
  const week = weeklyNutrition(store, '2026-10-14');
  assert.equal(week.consumed, 2800); assert.equal(week.remaining, 13200); assert.equal(week.unlogged, 5);
  assert.equal(week.days[1].logged, true); assert.equal(week.days[1].allowance, null);
  assert.equal(week.days.reduce((sum, day) => sum + (day.allowance || 0), 0), 13200);
  store = applyClientDrafts(store, [{ id: 'goals', kind: 'goals', payload: { weeklyCalories: 16003 } }]);
  assert.equal(weeklyNutrition(store, '2026-10-14').days.reduce((sum,d) => sum + (d.allowance || 0), 0), 13203);
});
test('weekly allowance ignores deleted daily logs, retains past gaps and does not produce negative allowances', () => {
  const store = emptyStore();
  for (let i = 12; i <= 18; i++) store.records[`daily-2026-10-${i}`] = patchRecord(undefined, `daily-2026-10-${i}`, 'daily', { calories: 3000 }, stamp);
  const finished = weeklyNutrition(store, '2026-10-18'); assert.equal(finished.unlogged, 0); assert.equal(finished.over, 4200); assert.equal(finished.remaining, 0);
  store.records['daily-2026-10-12'].deleted = true;
  const gap = weeklyNutrition(store, '2026-10-18'); assert.equal(gap.unlogged, 1); assert.equal(gap.days[0].allowance, 0);
  assert.equal(weeklyNutrition(store, '2026-10-25').consumed, 0);
});
test('a phase creates exactly five dated photo folders and preserves unrelated photos', () => {
  const drafts = phaseDrafts({ name: 'Moje dieta', type: 'diet', start: '2026-10-12', weeks: 5, goal: 'Udržet sílu', targetWeight: 80 });
  const before = applyClientDrafts(emptyStore(), [{ id: 'original-photo', kind: 'photo', payload: { date: '2026-10-01', caption: 'Původní fotka' } }]);
  const store = applyClientDrafts(before, drafts), phase = store.records[drafts[0].id!];
  assert.equal(recordsOf(store, 'photoAlbum').length, 5); assert.equal(recordsOf(store, 'photo').length, 1);
  assert.deepEqual(photoAlbums(store).filter(a => a.phaseId === phase.id).map(a => [a.week, a.date]), [[1,'2026-10-12'],[2,'2026-10-19'],[3,'2026-10-26'],[4,'2026-11-02'],[5,'2026-11-09']]);
  assert.equal(phaseTiming(phase,'2026-10-11').status, 'planned'); assert.equal(phaseTiming(phase,'2026-10-19').currentWeek, 2);
  assert.equal(phaseTiming(phase,'2026-11-15').status, 'active'); assert.equal(phaseTiming(phase,'2026-11-16').status, 'completed');
  assert.equal(validDate('2026-02-31'), false);
  assert.throws(() => phaseDrafts({ name:'X', type:'diet', start:'2026-10-12', weeks:0, goal:'', targetWeight:null }));
});
test('phase and all folders save atomically when browser storage is full', () => {
  const repo = new Repository({ getItem: () => null, setItem: () => { throw new Error('Quota'); } });
  const before = repo.getSnapshot().store;
  assert.throws(() => repo.addBatch(phaseDrafts({ name:'Objem', type:'bulk', start:'2026-10-12', weeks:5, goal:'Síla', targetWeight:null })), /Quota/);
  assert.strictEqual(repo.getSnapshot().store, before);
});
test('editing phase dates preserves photo identities and refuses to discard a populated later week', () => {
  const input = { name:'Dieta',type:'diet',start:'2026-10-12',weeks:5,goal:'Síla',targetWeight:null };
  const drafts = phaseDrafts(input), id = drafts[0].id!, store = applyClientDrafts(emptyStore(),drafts);
  const albums = photoAlbums(store);
  const populated = applyClientDrafts(store,[{ id:'keep-photo',kind:'photo',payload:{albumId:albums[4].id,date:albums[4].date,storagePath:'original.png',zoom:1.2} }]);
  assert.throws(() => phaseChanges(populated,id,{...input,weeks:4}),/má fotky/);
  const changes = phaseChanges(populated,id,{...input,start:'2026-10-13',weeks:6}), updated = applyClientDrafts(populated,changes.drafts);
  assert.equal(recordsOf(updated,'photoAlbum').length,6); assert.equal(updated.records['keep-photo'].payload.date,'2026-11-10');
  assert.equal(updated.records['keep-photo'].payload.storagePath,'original.png'); assert.equal(updated.records['keep-photo'].payload.zoom,1.2);
  assert.equal(photoAlbums(updated)[4].id,albums[4].id);
  assert.deepEqual(phaseChanges(store,id,{...input,weeks:3}).removed.sort(),albums.slice(3).map(a=>a.id).sort());
});
test('multi-record phase edits do not expose partial writes on quota failure', () => {
  let fail = false;
  const repo = new Repository({getItem:()=>null,setItem:()=>{if(fail) throw new Error('Quota');}});
  const input = {name:'Objem',type:'bulk',start:'2026-10-12',weeks:5,goal:'Síla',targetWeight:null}, drafts=phaseDrafts(input);
  repo.addBatch(drafts); const before=repo.getSnapshot().store; fail=true;
  const changes=phaseChanges(before,drafts[0].id!,{...input,start:'2026-10-19',weeks:6});
  assert.throws(()=>repo.updateBatch(changes.drafts,changes.removed),/Quota/); assert.strictEqual(repo.getSnapshot().store,before);
});
test('trainer planning uses personal names, creates incomplete sets and preserves independent client goals', () => {
  const before = applyClientDrafts(emptyStore(), [{ id:'goals', kind:'goals', payload:{ name:'Klient', sleep:8, calories:2400 } }]);
  const drafts = workoutPlanDrafts({ name:'Vlastní trénink',date:'2026-10-12',notes:'Pauza 90 s',exercises:[{name:'Moje tlaky',sets:4,reps:12,weight:25},{name:'Přítahy u okna',sets:2,reps:10,weight:null}] },'team','coach','Trenér');
  const store = applyClientDrafts(before,[{id:'goals',kind:'goals',payload:validateCoachGoals({weeklyCalories:16000,protein:180})},...drafts]);
  assert.equal(recordsOf(store,'set').length,6); assert.ok(recordsOf(store,'set').every(s => !s.payload.done));
  assert.equal(store.records.goals.payload.name,'Klient'); assert.equal(store.records.goals.payload.sleep,8); assert.equal(store.records.goals.stamps.name,before.records.goals.stamps.name);
  assert.equal(recordsOf(store,'exercise')[0].payload.name,'Moje tlaky'); assert.equal(recordsOf(store,'workout')[0].payload.assignedBy,'coach');
  assert.throws(() => validateCoachGoals({name:'Neoprávněná změna'})); assert.throws(() => validateCoachGoals({calories:-1}));
  assert.throws(() => workoutPlanDrafts({name:'X',date:'2026-10-12',notes:'',exercises:[{name:'X',sets:1.5,reps:10,weight:null}]},'team','coach','Trenér'));
  const merged = mergeRecord(before.records.goals, store.records.goals); assert.equal(merged.payload.weeklyCalories,16000); assert.equal(merged.payload.name,'Klient');
});
