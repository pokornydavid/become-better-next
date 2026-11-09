import test from 'node:test';
import assert from 'node:assert/strict';
import { Repository } from '../src/lib/repository.ts';
import { recordsOf } from '../src/lib/model.ts';
import { assignExerciseMuscle, exerciseNameKey, inferredMuscle } from '../src/lib/muscles.ts';
import { addPersonalExercise, workoutExercises } from '../src/lib/exercises.ts';
import { copyWorkoutToDate } from '../src/lib/copy-workout.ts';
import { applySplitWeek, exerciseHistory, historyInRange, readSplit, saveSplit, splitDayForDate, unassignedExercises, weeklySetTotals } from '../src/lib/training-plan.ts';
function setup() {
  const values=new Map<string,string>(),storage={getItem:(k:string)=>values.get(k)||null,setItem:(k:string,v:string)=>{values.set(k,v);}};
  const repo=new Repository(storage);repo.startEmpty();return {repo,storage};
}
function exercise(repo:Repository,date:string,name:string,muscle:string,done=true,weight:number|null=50,reps=8) {
  const w=repo.add('workout',{name:'Můj plán',date,status:'planned'}),e=addPersonalExercise(repo,w,name,2,reps,muscle);
  const sets=recordsOf(repo.getSnapshot().store,'set').filter(s=>s.payload.exerciseId===e);
  for(const s of sets)repo.patch(s.id,'set',{done,weight});return {w,e,sets};
}
test('weekly series use Monday-Sunday, live ancestors and checked sets exactly once, with legacy and unassigned muscles kept separate',()=>{
  const {repo}=setup();
  exercise(repo,'2026-11-09','moje tlaky','Hrudník');
  const active=exercise(repo,'2026-11-15','Tlaky B','chest');repo.patch(active.w,'workout',{status:'active'});
  exercise(repo,'2026-11-08','Minulá neděle','Hrudník');exercise(repo,'2026-11-16','Další pondělí','Hrudník');
  exercise(repo,'2026-11-10','Neodcvičené','Hrudník',false);exercise(repo,'2026-11-10','Pás','Kardio');
  exercise(repo,'2026-11-10','Předkopy','Kvadricepsy');exercise(repo,'2026-11-10','Staré nohy','Nohy');
  exercise(repo,'2026-11-10','Bez partie','');
  const deletedWorkout=exercise(repo,'2026-11-10','Smazaný trénink','Hrudník');repo.remove([deletedWorkout.w]);
  const deletedExercise=exercise(repo,'2026-11-10','Smazaný cvik','Hrudník');repo.remove([deletedExercise.e]);
  const deletedSet=exercise(repo,'2026-11-10','Jedna série','Biceps');repo.remove([deletedSet.sets[0].id]);
  repo.patch('goals','goals',{weeklySets_chest:8,weeklySets_biceps:12});
  const result=weeklySetTotals(repo.getSnapshot().store,'2026-11-11');
  assert.equal(result.groups.find(g=>g.id==='chest')!.done,4);assert.equal(result.groups.find(g=>g.id==='chest')!.target,8);
  assert.equal(result.groups.find(g=>g.id==='quads')!.done,2);assert.equal(result.groups.find(g=>g.id==='legs')!.done,2);
  assert.equal(result.groups.find(g=>g.id==='biceps')!.done,1);assert.equal(result.unassigned,2);
  assert.deepEqual(unassignedExercises(repo.getSnapshot().store,'2026-11-11').map(e=>e.payload.name),['Bez partie']);
});
test('assigning the same personal name updates historical copies atomically; future exercises inherit it and copied unchecked sets do not add volume',()=>{
  const {repo,storage}=setup(),original=exercise(repo,'2026-11-09','  Moje   tlaky ','');
  const copy=copyWorkoutToDate(repo,original.w,'2026-11-11');
  const deleted=exercise(repo,'2026-11-12','moje tlaky','');repo.remove([deleted.e]);const deletedBefore=structuredClone(repo.getSnapshot().store.records[deleted.e]);
  const beforeSets=recordsOf(repo.getSnapshot().store,'set');let writes=0;repo.subscribe(()=>writes++);
  assignExerciseMuscle(repo,'moje tlaky','Hrudník');assert.equal(writes,1);
  assert.equal(repo.getSnapshot().store.records[original.e].payload.muscle,'Hrudník');
  assert.equal(workoutExercises(repo.getSnapshot().store,copy)[0].payload.muscle,'Hrudník');
  assert.deepEqual(recordsOf(repo.getSnapshot().store,'set'),beforeSets);assert.deepEqual(repo.getSnapshot().store.records[deleted.e],deletedBefore);
  assert.equal(weeklySetTotals(repo.getSnapshot().store,'2026-11-09').groups.find(g=>g.id==='chest')!.done,2);
  assert.equal(inferredMuscle(new Repository(storage).getSnapshot().store,'MOJE TLAKY'),'Hrudník');
  const newId=addPersonalExercise(repo,copy,'moje tlaky',1,8);assert.equal(repo.getSnapshot().store.records[newId].payload.muscle,'Hrudník');
  const snapshot=repo.exportBackup();storage.setItem=()=>{throw new Error('quota');};assert.throws(()=>assignExerciseMuscle(repo,'moje tlaky','Triceps'),/quota/);assert.deepEqual(repo.exportBackup(),snapshot);
});
test('custom split cycles continue across weeks, month boundaries and DST rather than restarting on Monday',()=>{
  const {repo,storage}=setup();saveSplit(repo,'2026-10-24',[{name:'Moje upper A',rest:false},{name:'Lower',rest:false},{name:'Volno',rest:true}]);
  const split=readSplit(new Repository(storage).getSnapshot().store);
  assert.equal(splitDayForDate(split,'2026-10-23'),null);
  assert.equal(splitDayForDate(split,'2026-10-24')!.name,'Moje upper A');
  assert.equal(splitDayForDate(split,'2026-10-25')!.name,'Lower');
  assert.equal(splitDayForDate(split,'2026-10-26')!.rest,true);
  assert.equal(splitDayForDate(split,'2026-11-01')!.rest,true);
  const before=repo.exportBackup();assert.throws(()=>saveSplit(repo,'2026-02-30',split.days));assert.throws(()=>saveSplit(repo,'2026-11-09',[{name:' ',rest:false}]));assert.deepEqual(repo.exportBackup(),before);
});
test('applying a split preserves existing workouts and daily nutrition, is repeatable and rolls back locally on quota failure',()=>{
  const {repo,storage}=setup();saveSplit(repo,'2026-11-09',[{name:'Push',rest:false},{name:'Pull',rest:false},{name:'Rest',rest:true}]);
  const existing=exercise(repo,'2026-11-10','Biceps','Biceps');const original=structuredClone(repo.getSnapshot().store.records[existing.w]);
  repo.patch('daily-2026-11-11','daily',{date:'2026-11-11',calories:2065,notes:'Ponechat'});
  const before=repo.exportBackup();storage.setItem=()=>{throw new Error('quota');};assert.throws(()=>applySplitWeek(repo,'2026-11-09'),/quota/);assert.deepEqual(repo.exportBackup(),before);
  const rebuilt=setup().repo;rebuilt.importBackup(before);const result=applySplitWeek(rebuilt,'2026-11-09');
  assert.deepEqual(result,{created:4,rested:2,skipped:1});
  assert.equal(rebuilt.getSnapshot().store.records[existing.w].payload.name,original.payload.name);
  assert.deepEqual(rebuilt.getSnapshot().store.records['daily-2026-11-11'].payload,{date:'2026-11-11',calories:2065,notes:'Ponechat',restDay:true});
  assert.equal(recordsOf(rebuilt.getSnapshot().store,'workout').length,5);
  assert.deepEqual(applySplitWeek(rebuilt,'2026-11-09'),{created:0,rested:0,skipped:5});
});
test('exercise progress groups copied names, keeps reps and missing loads honest and ignores deleted or unchecked records',()=>{
  const {repo}=setup();const first=exercise(repo,'2026-10-01','Moje tlaky','Hrudník',true,60,10);
  const second=exercise(repo,'2026-10-15','moje   TLAKY','Hrudník',true,70,6);
  exercise(repo,'2026-10-20','moje tlaky','Hrudník',true,null,8);
  exercise(repo,'2026-10-25','moje tlaky','Hrudník',false,100,10);
  const deleted=exercise(repo,'2026-10-26','moje tlaky','Hrudník',true,150,10);repo.remove([deleted.w]);
  exercise(repo,'2026-10-30','Tlaky jiná varianta','Hrudník',true,200,8);
  const history=exerciseHistory(repo.getSnapshot().store,exerciseNameKey('moje tlaky'));
  assert.equal(history.length,3);assert.equal(history[0].workoutId,first.w);assert.equal(history[1].workoutId,second.w);
  assert.deepEqual(history.map(r=>[r.weight,r.reps,r.sets,r.volume]),[[60,10,2,1200],[70,6,2,840],[null,null,2,0]]);
  assert.equal(historyInRange(history,'14','2026-10-25').length,2);
  assert.equal(historyInRange(history,'all','2026-10-02').length,1);
});
