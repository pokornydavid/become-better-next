import test from 'node:test';
import assert from 'node:assert/strict';
import { Repository } from '../src/lib/repository.ts';
import { mergeRecord, patchRecord } from '../src/lib/model.ts';
import { moveMuscle, musclesForStore, saveMuscle, setMuscleVisible } from '../src/lib/muscles.ts';
import { readSplit, saveSplit, saveSplitSetTarget, splitSetColumns, weeklySetTotals } from '../src/lib/training-plan.ts';

function setup(){const data=new Map<string,string>(),storage={getItem:(key:string)=>data.get(key)||null,setItem:(key:string,value:string)=>{data.set(key,value);}};const repo=new Repository(storage);repo.startEmpty();return {repo,storage};}

test('muscle order persists with hidden and new custom groups while preserving targets and historical records',()=>{
  const {repo,storage}=setup(),custom=saveMuscle(repo,'Předloktí');
  repo.patch('goals','goals',{weeklySets_chest:10,calories:2400});
  repo.add('exercise',{name:'Moje tlaky',muscle:'Hrudník'});
  const before=structuredClone(Object.values(repo.getSnapshot().store.records).filter(row=>row.kind!=='goals'));
  setMuscleVisible(repo,'lats',false);moveMuscle(repo,'shoulders',-1);moveMuscle(repo,'shoulders',-1);
  assert.deepEqual(musclesForStore(new Repository(storage).getSnapshot().store).slice(0,3).map(group=>group.id),['shoulders','chest','upperBack']);
  setMuscleVisible(repo,'lats',true);assert.ok(musclesForStore(repo.getSnapshot().store).some(group=>group.id==='lats'));
  assert.equal(musclesForStore(repo.getSnapshot().store).at(-1)!.id,custom);
  const added=saveMuscle(repo,'Krk');assert.equal(musclesForStore(repo.getSnapshot().store).at(-1)!.id,added);
  assert.equal(repo.getSnapshot().store.records.goals.payload.weeklySets_chest,10);
  assert.equal(repo.getSnapshot().store.records.goals.payload.calories,2400);
  assert.deepEqual(Object.values(repo.getSnapshot().store.records).filter(row=>row.kind!=='goals'),before);
});

test('legacy splits gain stable links and per-workout allocations survive renaming, reordering, rest switches and reload',()=>{
  const {repo,storage}=setup();
  repo.patch('goals','goals',{splitStart:'2026-11-09',trainingSplit:JSON.stringify([{name:'Push',rest:false},{name:'Upper',rest:false},{name:'Rest',rest:true}]),weeklySets_chest:10});
  const original=readSplit(repo.getSnapshot().store);saveSplitSetTarget(repo,'chest',original.days[0].id,6);saveSplitSetTarget(repo,'chest',original.days[1].id,4);
  saveSplit(repo,original.start,[{...original.days[1],name:'Moje upper'},original.days[0],original.days[2]]);
  const reloaded=new Repository(storage).getSnapshot().store,group=weeklySetTotals(reloaded,'2026-11-09').groups.find(group=>group.id==='chest')!;
  assert.deepEqual(group.allocation.map(day=>[day.name,day.sets]),[['Moje upper',4],['Push',6]]);
  assert.equal(group.target,10);assert.equal(group.done,0);
  const changed=readSplit(reloaded);saveSplit(repo,changed.start,changed.days.map(day=>({...day,rest:day.id===original.days[0].id||day.rest})));
  assert.equal(splitSetColumns(repo.getSnapshot().store,'2026-11-09').length,1);
  saveSplit(repo,changed.start,changed.days);assert.equal(weeklySetTotals(repo.getSnapshot().store,'2026-11-09').groups.find(group=>group.id==='chest')!.allocation[1].sets,6);
});

test('weekly planned sums use actual cycle occurrences and keep repeated same-named split days independent',()=>{
  const {repo}=setup();saveSplit(repo,'2026-11-09',[{name:'Upper',rest:false},{name:'Lower',rest:false},{name:'Rest',rest:true}]);
  const upper=readSplit(repo.getSnapshot().store).days[0];saveSplitSetTarget(repo,'chest',upper.id,4);
  const week=weeklySetTotals(repo.getSnapshot().store,'2026-11-09'),next=weeklySetTotals(repo.getSnapshot().store,'2026-11-16');
  assert.equal(week.splitColumns[0].count,3);assert.equal(week.groups.find(group=>group.id==='chest')!.planned,12);
  assert.equal(next.splitColumns[0].count,2);assert.equal(next.groups.find(group=>group.id==='chest')!.planned,8);
  assert.equal(weeklySetTotals(repo.getSnapshot().store,'2026-11-02').groups.find(group=>group.id==='chest')!.planned,0);
  saveSplit(repo,'2026-11-09',[{name:'Upper',rest:false},{name:'Upper',rest:false},{name:'Rest',rest:true}]);
  const columns=splitSetColumns(repo.getSnapshot().store,'2026-11-09');
  assert.notEqual(columns[0].id,columns[1].id);assert.deepEqual(columns.map(day=>day.label),['Upper · den 1','Upper · den 2']);
  saveSplitSetTarget(repo,'chest',columns[0].id,2);saveSplitSetTarget(repo,'chest',columns[1].id,5);
  assert.equal(weeklySetTotals(repo.getSnapshot().store,'2026-11-09').groups.find(group=>group.id==='chest')!.planned,16);
});

test('allocation and order settings merge independently across devices without overwriting weekly targets',()=>{
  const {repo}=setup();saveSplit(repo,'2026-11-09',[{name:'Push',rest:false},{name:'Upper',rest:false}]);
  const days=readSplit(repo.getSnapshot().store).days,base=repo.getSnapshot().store.records.goals;
  const local=patchRecord(base,'goals','goals',{[`splitSets_chest_${days[0].id}`]:6,muscleOrder:JSON.stringify(['shoulders','chest'])},'2030-01-01T00:00:00Z');
  const remote=patchRecord(base,'goals','goals',{[`splitSets_chest_${days[1].id}`]:4,weeklySets_chest:10},'2030-01-02T00:00:00Z');
  const merged=mergeRecord(local,remote);
  assert.equal(merged.payload[`splitSets_chest_${days[0].id}`],6);assert.equal(merged.payload[`splitSets_chest_${days[1].id}`],4);
  assert.equal(merged.payload.weeklySets_chest,10);assert.equal(merged.payload.muscleOrder,local.payload.muscleOrder);
});

test('invalid targets are rejected and failed saves leave both order and allocations unchanged',()=>{
  const {repo,storage}=setup();saveSplit(repo,'2026-11-09',[{name:'Push',rest:false},{name:'Rest',rest:true}]);
  const days=readSplit(repo.getSnapshot().store).days,before=repo.exportBackup();
  for(const invalid of [-1,.5,201,Infinity,NaN])assert.throws(()=>saveSplitSetTarget(repo,'chest',days[0].id,invalid));
  assert.throws(()=>saveSplitSetTarget(repo,'chest',days[1].id,4));assert.throws(()=>saveSplitSetTarget(repo,'missing',days[0].id,4));
  assert.deepEqual(repo.exportBackup(),before);
  storage.setItem=()=>{throw new Error('quota');};assert.throws(()=>saveSplitSetTarget(repo,'chest',days[0].id,4),/quota/);assert.throws(()=>moveMuscle(repo,'chest',1),/quota/);
  assert.deepEqual(repo.exportBackup(),before);
});
