import test from 'node:test';
import assert from 'node:assert/strict';
import { Repository } from '../src/lib/repository.ts';
import { recordsOf } from '../src/lib/model.ts';
import { addPersonalExercise } from '../src/lib/exercises.ts';
import { assignExerciseMuscle, inferredMuscle, muscleGroup, musclesForStore, saveMuscle, setMuscleVisible } from '../src/lib/muscles.ts';
import { exerciseHistory, watchedExerciseNames, watchExercise, weeklySetTotals } from '../src/lib/training-plan.ts';
function setup(){const data=new Map<string,string>(),storage={getItem:(k:string)=>data.get(k)||null,setItem:(k:string,v:string)=>{data.set(k,v);}};const repo=new Repository(storage);repo.startEmpty();return {repo,storage};}
function loggedExercise(repo:Repository,name:string,muscle:string){const workout=repo.add('workout',{name:'Moje upper',date:'2026-11-09'}),id=addPersonalExercise(repo,workout,name,2,10,muscle);for(const set of recordsOf(repo.getSnapshot().store,'set').filter(s=>s.payload.exerciseId===id))repo.patch(set.id,'set',{weight:50,done:true});return id;}

test('back defaults split into lats and upper back without guessing legacy classification or deleting old targets',()=>{
  const {repo}=setup();repo.patch('goals','goals',{weeklySets_back:8});
  const labels=musclesForStore(repo.getSnapshot().store).map(g=>g.label);
  assert.ok(labels.includes('Křídla / laty'));assert.ok(labels.includes('Vršek zad'));
  for(const old of ['Záda','Hýždě','Nohy bez upřesnění'])assert.ok(!labels.includes(old));
  loggedExercise(repo,'Stahování','Křídla');loggedExercise(repo,'Přítahy','Vršek zad');loggedExercise(repo,'Starý cvik','Záda');
  const totals=weeklySetTotals(repo.getSnapshot().store,'2026-11-09');
  assert.equal(totals.groups.find(g=>g.id==='lats')!.done,2);assert.equal(totals.groups.find(g=>g.id==='upperBack')!.done,2);assert.equal(totals.unassigned,2);
  assert.equal(repo.getSnapshot().store.records.goals.payload.weeklySets_back,8);assert.equal(muscleGroup('Záda'),undefined);
});
test('custom muscle renames retain stable exercise links, targets and inheritance; hiding never removes historical sets',()=>{
  const {repo,storage}=setup(),id=saveMuscle(repo,'Předloktí'),value=`custom:${id}`;
  const exercise=loggedExercise(repo,'Moje zdvihy',value);repo.patch('goals','goals',{[`weeklySets_${id}`]:6,calories:2400});
  const sets=structuredClone(recordsOf(repo.getSnapshot().store,'set'));
  saveMuscle(repo,'Úchop',id);
  assert.equal(inferredMuscle(repo.getSnapshot().store,'moje ZDVIHY'),value);
  assert.equal(muscleGroup(value,repo.getSnapshot().store)!.label,'Úchop');
  let totals=weeklySetTotals(new Repository(storage).getSnapshot().store,'2026-11-09');assert.equal(totals.groups.find(g=>g.id===id)!.done,2);assert.equal(totals.groups.find(g=>g.id===id)!.target,6);
  setMuscleVisible(repo,id,false);totals=weeklySetTotals(repo.getSnapshot().store,'2026-11-09');assert.ok(!totals.groups.some(g=>g.id===id));assert.equal(totals.unassigned,0);
  assert.equal(repo.getSnapshot().store.records[exercise].payload.muscle,value);assert.deepEqual(recordsOf(repo.getSnapshot().store,'set'),sets);
  setMuscleVisible(repo,id,true);assert.equal(weeklySetTotals(repo.getSnapshot().store,'2026-11-09').groups.find(g=>g.id===id)!.done,2);
  assert.throws(()=>saveMuscle(repo,'  úchop '),/už/);assert.throws(()=>saveMuscle(repo,'Biceps'),/už/);assert.throws(()=>saveMuscle(repo,''));
  const before=repo.exportBackup();storage.setItem=()=>{throw new Error('quota');};assert.throws(()=>saveMuscle(repo,'Jiné'),/quota/);assert.deepEqual(repo.exportBackup(),before);
});
test('renaming a default muscle retains its canonical value and target; hidden muscles remain available on existing records',()=>{
  const {repo}=setup();loggedExercise(repo,'Biceps zdvih','Biceps');repo.patch('goals','goals',{weeklySets_biceps:12});
  saveMuscle(repo,'Moje bicepsy','biceps');setMuscleVisible(repo,'biceps',false);
  assert.ok(!musclesForStore(repo.getSnapshot().store).some(g=>g.id==='biceps'));
  assert.equal(muscleGroup('Biceps',repo.getSnapshot().store)!.label,'Moje bicepsy');
  assignExerciseMuscle(repo,'Biceps zdvih','Biceps');setMuscleVisible(repo,'biceps',true);
  const row=weeklySetTotals(repo.getSnapshot().store,'2026-11-09').groups.find(g=>g.id==='biceps')!;
  assert.equal(row.done,2);assert.equal(row.target,12);assert.equal(row.label,'Moje bicepsy');
});
test('exercise watchlist starts empty, contains only selected personal names and can be removed without deleting history',()=>{
  const {repo,storage}=setup();loggedExercise(repo,'Moje tlaky','Hrudník');loggedExercise(repo,'Jiný cvik','Hrudník');
  repo.patch('goals','goals',{calories:2400});assert.deepEqual(watchedExerciseNames(repo.getSnapshot().store),[]);
  watchExercise(repo,'  MOJE   tlaky ',true);assert.deepEqual(watchedExerciseNames(repo.getSnapshot().store),[['moje tlaky','Moje tlaky']]);
  const before=structuredClone(exerciseHistory(repo.getSnapshot().store,'moje tlaky'));
  watchExercise(repo,'moje tlaky',false);assert.deepEqual(watchedExerciseNames(new Repository(storage).getSnapshot().store),[]);
  assert.deepEqual(exerciseHistory(repo.getSnapshot().store,'moje tlaky'),before);assert.equal(repo.getSnapshot().store.records.goals.payload.calories,2400);
  watchExercise(repo,'moje tlaky',true);assert.equal(watchedExerciseNames(repo.getSnapshot().store).length,1);
  assert.throws(()=>watchExercise(repo,'Cizí knihovna',true),/Vyber/);
});
