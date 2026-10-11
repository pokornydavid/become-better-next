import test from 'node:test';
import assert from 'node:assert/strict';
import { Repository } from '../src/lib/repository.ts';
import { emptyStore, recordsOf } from '../src/lib/model.ts';
import { addPersonalExercise, personalBests } from '../src/lib/exercises.ts';
import { clampTransform, imagePlacement, photoAlbums, photoTransform } from '../src/lib/photo-albums.ts';
const memory = () => { const values = new Map<string,string>(); return { getItem:(key:string) => values.get(key) || null,setItem:(key:string,value:string) => { values.set(key,value); } }; };
test('personal exercise preserves the user name, creates selected sets atomically and rejects blank names',() => {
  const repo = new Repository(memory()); repo.startEmpty();
  const workout = repo.add('workout',{ name:'Můj trénink',date:'2026-10-11' });
  let notifications=0; repo.subscribe(() => notifications++);
  const id=addPersonalExercise(repo,workout,'  moje tlaky NA stroji  ',4,12);
  assert.equal(notifications,1); assert.equal(repo.getSnapshot().store.records[id].payload.name,'moje tlaky NA stroji');
  assert.equal(recordsOf(repo.getSnapshot().store,'set').length,4);
  assert.ok(recordsOf(repo.getSnapshot().store,'set').every(s => s.payload.reps===12 && s.payload.exerciseId===id));
  const before=repo.exportBackup();
  assert.throws(() => addPersonalExercise(repo,workout,'  ',3,10));
  assert.throws(() => addPersonalExercise(repo,workout,'Cvik',21,10));
  assert.deepEqual(repo.exportBackup(),before);
});
test('personal maxima aggregate custom names and ignore incomplete and removed sets',() => {
  const repo=new Repository(memory()); repo.startEmpty(); const workout=repo.add('workout',{name:'A'});
  const a=addPersonalExercise(repo,workout,'Moje tlaky',1,10), b=addPersonalExercise(repo,workout,'moje   tlaky',1,10);
  const sets=recordsOf(repo.getSnapshot().store,'set');
  repo.patch(sets.find(s => s.payload.exerciseId===a)!.id,'set',{weight:50,done:true});
  repo.patch(sets.find(s => s.payload.exerciseId===b)!.id,'set',{weight:60,done:false});
  assert.equal(personalBests(repo.getSnapshot().store)[0].weight,50);
  repo.patch(sets[1].id,'set',{done:true}); assert.equal(personalBests(repo.getSnapshot().store).length,1); assert.equal(personalBests(repo.getSnapshot().store)[0].weight,60);
  repo.remove([sets[1].id]); assert.equal(personalBests(repo.getSnapshot().store)[0].weight,50);
});
test('weekly albums retain all photos, stable slot order and migrate unassigned legacy photos without dropping them',() => {
  const repo=new Repository(memory()); repo.startEmpty();
  const a=repo.add('photoAlbum',{name:'Týden 1',date:'2026-10-05'}),b=repo.add('photoAlbum',{name:'Týden 2',date:'2026-10-12'});
  for(let i=9;i>=0;i--) repo.add('photo',{albumId:a,date:'2026-10-05',order:i,caption:`A${i}`});
  for(let i=0;i<10;i++) repo.add('photo',{albumId:b,date:'2026-10-12',order:i,caption:`B${i}`});
  repo.add('photo',{date:'2026-10-04',caption:'starší'});
  const albums=photoAlbums(repo.getSnapshot().store);
  assert.equal(albums.length,3); assert.equal(albums.flatMap(a => a.photos).length,21);
  assert.equal(albums.find(album => album.id===a)!.photos[0].payload.caption,'A0');
  assert.equal(albums.find(album => album.id===b)!.photos[9].payload.caption,'B9');
  assert.equal(albums[0].virtual,true);
  repo.remove([a]); assert.equal(photoAlbums(repo.getSnapshot().store).flatMap(a => a.photos).length,21);
});
test('comparison clamps imported edits and export placement matches cover/zoom/offset',() => {
  assert.deepEqual(photoTransform(),{zoom:1,x:0,y:0,rotation:0,brightness:100,contrast:100});
  const t=clampTransform({zoom:Infinity,x:500,y:-500,rotation:300,brightness:1,contrast:999});
  assert.deepEqual(t,{zoom:1,x:100,y:-100,rotation:180,brightness:50,contrast:150});
  const p=imagePlacement(1200,1600,720,960,{...photoTransform(),zoom:2,x:10,y:-10});
  assert.deepEqual(p,{width:1440,height:1920,x:432,y:384});
  assert.deepEqual(photoAlbums(emptyStore()),[]);
});
test('failed batch persistence never exposes a partial exercise or set in the UI',() => {
  const storage=memory(); const repo=new Repository(storage); repo.startEmpty(); const workout=repo.add('workout',{name:'A'}),before=repo.exportBackup();
  storage.setItem=()=>{throw new Error('quota');};
  assert.throws(() => addPersonalExercise(repo,workout,'Můj cvik',3,10),/quota/);
  assert.deepEqual(repo.exportBackup(),before);
});
