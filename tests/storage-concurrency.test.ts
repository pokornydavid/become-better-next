import test from 'node:test';
import assert from 'node:assert/strict';
import { Repository } from '../src/lib/repository.ts';
import { recordsOf } from '../src/lib/model.ts';
import { addPersonalExercise, workoutExercises } from '../src/lib/exercises.ts';
import { copyWorkoutToDate } from '../src/lib/copy-workout.ts';

const owner={id:'owner',email:'owner@example.test'};
function setup(){const data=new Map<string,string>(),storage={getItem:(key:string)=>data.get(key)||null,setItem:(key:string,value:string)=>{data.set(key,value);}};const open=()=>{const repo=new Repository(storage);repo.activate(owner);return repo;};return {storage,open};}

test('a stale second tab sync cannot erase a Tuesday workout copied to Monday or any of its children',()=>{
  const {open}=setup(),first=open();
  const source=first.add('workout',{name:'Pull',date:'2026-11-10',status:'completed'});
  addPersonalExercise(first,source,'Moje přítahy',2,8,'Vršek zad');
  addPersonalExercise(first,source,'Moje zdvihy',2,10,'Biceps');
  first.add('workout',{name:'Pull',date:'2026-11-16',status:'planned'});
  const remote=Object.values(first.getSnapshot().store.records).map(row=>({...row,revision:1}));first.receive(remote,owner.id);
  const second=open(),copy=copyWorkoutToDate(first,source,'2026-11-16');
  second.receive(remote,owner.id);first.reloadFromOtherTab();
  for(const repo of [first,second,open()]){
    const store=repo.getSnapshot().store,exercises=workoutExercises(store,copy);
    assert.equal(store.records[copy]?.payload.date,'2026-11-16');assert.equal(exercises.length,2);
    const sets=recordsOf(store,'set').filter(set=>exercises.some(exercise=>exercise.id===set.payload.exerciseId));
    assert.equal(sets.length,4);assert.ok(sets.every(set=>set.payload.done===false));
    assert.ok([copy,...exercises.map(exercise=>exercise.id),...sets.map(set=>set.id)].every(id=>store.pending.includes(id)));
  }
});

test('stale local edits preserve other tabs newer fields, pending changes and delete tombstones',()=>{
  const {open}=setup(),first=open();first.patch('goals','goals',{calories:2200,protein:160});
  const second=open();first.patch('goals','goals',{calories:2400});second.patch('goals','goals',{protein:180});
  first.reloadFromOtherTab();assert.equal(first.getSnapshot().store.records.goals.payload.calories,2400);assert.equal(first.getSnapshot().store.records.goals.payload.protein,180);
  const workout=first.add('workout',{name:'Nesmazat kopii'});second.reloadFromOtherTab();first.remove([workout]);
  second.patch('goals','goals',{weight:80});
  assert.equal(open().getSnapshot().store.records[workout].deleted,true);
});

test('a second tab acknowledgement clears only acknowledged versions and never requeues an identical saved record',()=>{
  const {open}=setup(),first=open();first.patch('goals','goals',{calories:2200});
  const second=open(),upload={...second.getSnapshot().store.records.goals,revision:1};
  first.patch('goals','goals',{calories:2400});second.receive([upload],owner.id);
  assert.equal(second.getSnapshot().store.records.goals.payload.calories,2400);assert.ok(second.getSnapshot().store.pending.includes('goals'));
  const latest={...second.getSnapshot().store.records.goals,revision:2};second.receive([latest],owner.id);
  first.reloadFromOtherTab();assert.deepEqual(first.getSnapshot().store.pending,[]);
  first.patch('daily-2026-11-16','daily',{date:'2026-11-16',steps:1000});
  assert.deepEqual(open().getSnapshot().store.pending,['daily-2026-11-16']);
  second.receive([upload],owner.id);assert.equal(second.getSnapshot().store.records.goals.revision,2);
  assert.equal(second.getSnapshot().store.pending.includes('goals'),false);
});

test('storage events recover pending data overwritten by an old tab without causing a write loop',()=>{
  const {storage,open}=setup(),first=open(),second=open();
  const stale=JSON.stringify(second.getSnapshot().store);
  const workout=first.add('workout',{name:'Pull',date:'2026-11-16'});
  const key='become-better-next:v1:user:owner';storage.setItem(key,stale);
  first.reloadFromOtherTab();second.reloadFromOtherTab();
  assert.equal(second.getSnapshot().store.records[workout].payload.name,'Pull');
  assert.ok(open().getSnapshot().store.pending.includes(workout));
  let writes=0;const write=storage.setItem;storage.setItem=(key,value)=>{writes++;write(key,value);};
  first.reloadFromOtherTab();second.reloadFromOtherTab();assert.equal(writes,0);
});

test('merging another tabs data still fails atomically when browser storage is full',()=>{
  const {storage,open}=setup(),first=open(),second=open();first.patch('goals','goals',{calories:2400});
  const before=second.getSnapshot();storage.setItem=()=>{throw new Error('quota');};
  assert.throws(()=>second.patch('goals','goals',{protein:180}),/quota/);assert.equal(second.getSnapshot(),before);
  assert.equal(first.getSnapshot().store.records.goals.payload.calories,2400);
});
