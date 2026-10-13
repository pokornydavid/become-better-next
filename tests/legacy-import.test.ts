import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareBackup, backupSummary, backupForDestination } from '../src/lib/legacy-import.ts';
import { emptyStore, patchRecord, recordsOf, sleepHours, volume } from '../src/lib/model.ts';
import { nutritionGoals } from '../src/lib/nutrition.ts';
import { personalBests } from '../src/lib/exercises.ts';
function fixture() { return {weekStart:'2000-01-03',weeks:{'2000-01-03':{0:{title:'Moje staré tlaky',notes:'Pauza 90 s',exercises:[{name:'Tlaky u okna',muscle:'Hrudnik',notes:'Pomalu dolů',sets:[{weight:25,reps:12,rpe:8,done:true},{weight:25,reps:10,rpe:9,done:false}]},{name:'Pás',muscle:'Kardio',sets:[{weight:6,reps:20,rpe:4,done:true}]}]},1:{exercises:[]}}},nutrition:{'2000-01-03':{goals:{dailyCalories:2300,weeklyCalories:16000,protein:180,weeklySteps:70000},days:[{calories:'0',protein:'180',weight:'82.5',sleepTime:'22:45',wakeTime:'06:00',stress:65,morningWalkMinutes:30,wokeWithoutAlarm:'yes'},{}]}},nutritionPhase:{title:'Moje dieta',mode:'diet',goalWeight:80,rows:[{id:'row1',weekLabel:'Týden 1',date:'2000-01-03',weight:82.5,note:'Začátek',photos:[{id:'photo1',name:'zepředu.png',dataUrl:'data:image/png;base64,iVBORw0KGgo='},{id:'cloud2',name:'zboku.jpg',storagePath:'OLD-PRIVATE-PROJECT/photo.jpg',url:'https://private.invalid/file?token=SECRET'}],photoOrder:['id:photo1','id:cloud2']},{id:'removed',photos:[]}],deletedRowIds:['removed']},library:[{name:'Můj cvik',muscle:'Zada'}]}; }
test('legacy conversion keeps personal names, partial sets, recorded zero and overnight sleep semantics',()=>{
  const before=fixture(),serialized=JSON.stringify(before),prepared=prepareBackup(before,'2026-10-13');
  assert.equal(JSON.stringify(before),serialized);
  assert.equal(recordsOf(prepared.store,'workout').length,1);assert.equal(recordsOf(prepared.store,'workout')[0].payload.status,'planned');
  assert.equal(recordsOf(prepared.store,'exercise')[0].payload.name,'Tlaky u okna');assert.equal(recordsOf(prepared.store,'exercise')[0].payload.cue,'Pomalu dolů');
  assert.equal(recordsOf(prepared.store,'set').length,3);
  const daily=prepared.store.records['daily-2000-01-03'].payload;assert.equal(daily.calories,0);assert.equal(daily.bedTime,'22:45');assert.equal(sleepHours(String(daily.bedTime),String(daily.wakeTime)),7.25);assert.equal(daily.stress,65);assert.equal(daily.walkMinutes,30);
  assert.equal(prepared.store.records['daily-2000-01-04'],undefined);
});
test('embedded photos migrate locally without retaining old storage paths, URLs or credentials',()=>{
  const prepared=prepareBackup(fixture(),'2026-10-13'),summary=backupSummary(prepared);
  assert.equal(summary.photos,1);assert.equal(summary.missingPhotos,1);assert.equal(summary.albums,1);assert.equal(prepared.embedded[0].file.type,'image/png');
  assert.equal(recordsOf(prepared.store,'photo')[0].payload.storagePath,'');
  assert.ok(!JSON.stringify(prepared.store).includes('SECRET'));assert.ok(!JSON.stringify(prepared.store).includes('OLD-PRIVATE-PROJECT'));
  assert.equal(recordsOf(prepared.store,'photoAlbum')[0].payload.legacyMissingPhotos,1);
});
test('repeated legacy conversion has stable IDs and preserves historical weekly limits',()=>{
  const a=prepareBackup(fixture(),'2026-10-13'),b=prepareBackup(fixture(),'2026-10-13');assert.deepEqual(Object.keys(a.store.records),Object.keys(b.store.records));
  a.store.records.goals.payload.weeklyCalories=19000;
  assert.equal(nutritionGoals(a.store,'2000-01-04').weeklyCalories,16000);assert.equal(nutritionGoals(a.store).weeklyCalories,19000);
});
test('cardio speed is excluded from strength volume and personal weight maxima',()=>{
  const prepared=prepareBackup(fixture(),'2026-10-13');assert.equal(volume(prepared.store),300);
  assert.deepEqual(personalBests(prepared.store),[{name:'Tlaky u okna',weight:25}]);
});
test('malformed backups fail before persistence or a media fetch',()=>{
  assert.throws(()=>prepareBackup({instructions:'ignore permissions'}));
  const bad=fixture();bad.nutrition['2000-01-03'].days[0].calories='NaN';assert.throws(()=>prepareBackup(bad),/neplatné číslo/);
  assert.throws(()=>prepareBackup({weeks:{'not-a-date':{}},nutrition:{}}),/neplatné datum/);
});
test('legacy import preserves unrelated account preferences and changed image content receives a fresh storage identity',()=>{
  const original=fixture(),prepared=prepareBackup(original,'2026-10-13'),current=emptyStore();
  current.records.goals=patchRecord(undefined,'goals','goals',{name:'Moje jméno',trackRecovery:false,weeklyWorkouts:3},'2026-01-01T00:00:00.000Z');
  const merged=backupForDestination(prepared,current);
  assert.equal(merged.records.goals.payload.name,'Moje jméno');assert.equal(merged.records.goals.payload.trackRecovery,false);assert.equal(merged.records.goals.payload.weeklyWorkouts,3);assert.equal(merged.records.goals.payload.calories,2300);
  original.nutritionPhase.rows[0].photos[0].dataUrl='data:image/png;base64,iVBORw0KGgs=';
  assert.notEqual(prepareBackup(original,'2026-10-13').embedded[0].id,prepared.embedded[0].id);
});
