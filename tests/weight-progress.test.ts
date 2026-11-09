import test from 'node:test';
import assert from 'node:assert/strict';
import { patchRecord } from '../src/lib/model.ts';
import { weightDifference, weightEntries, weightsInRange, weightSummary } from '../src/lib/weight-progress.ts';

// Synthetic observations only; no personal measurements.
const record=(id:string,date:string,weight:number|string|null,stamp='2026-11-09T10:00:00.000Z')=>patchRecord(undefined,id,'measurement',{date,weight},stamp);
test('weight entries retain precise dated observations, sort deterministically and ignore deleted or invalid values without modifying source records',()=>{
  const deleted=record('deleted','2026-11-09',50);deleted.deleted=true;
  const records=[record('latest','2026-11-09',98.8),record('first','2026-10-12',100.1),record('earlier-same-day','2026-11-09',99,'2026-11-09T08:00:00.000Z'),deleted,record('future','2026-11-10',73),record('invalid-date','2026-02-30',80),record('missing','2026-11-01',null),record('string','2026-11-01','80'),record('zero','2026-11-01',0),record('negative','2026-11-01',-1),record('infinite','2026-11-01',Infinity)];
  const before=structuredClone(records),entries=weightEntries(records,'2026-11-09');
  assert.deepEqual(entries.map(e=>e.id),['first','earlier-same-day','latest']);assert.deepEqual(entries.map(e=>e.weight),[100.1,99,98.8]);assert.deepEqual(records,before);
});
test('weight summaries express total loss and last change exactly, handle gains and same weights, and never invent a change from one measurement',()=>{
  const entries=weightEntries([record('a','2026-10-12',100.1),record('b','2026-11-05',99.4),record('c','2026-11-09',98.8)],'2026-11-09');
  const summary=weightSummary(entries);assert.equal(summary.total,-1.3);assert.equal(summary.change,-.6);assert.equal(summary.previous!.date,'2026-11-05');
  assert.equal(weightDifference(50.05,49.95),.1);assert.equal(weightDifference(98.8,98.8),0);assert.ok(!Object.is(weightDifference(98.8,98.8),-0));
  assert.equal(weightSummary([entries[0]]).total,null);assert.equal(weightSummary([entries[0]]).change,null);assert.equal(weightSummary([]).total,null);assert.equal(weightSummary([]).last,undefined);
});
test('weight periods include today and their exact boundary, do not interpolate gaps and compare only actual weigh-ins within the selected period',()=>{
  const entries=weightEntries([record('old','2026-10-10',102),record('month','2026-10-11',101.5),record('outside-fortnight','2026-10-26',100.9),record('fortnight','2026-10-27',100.5),record('today','2026-11-09',98.8)],'2026-11-09');
  assert.deepEqual(weightsInRange(entries,'14','2026-11-09').map(e=>e.id),['fortnight','today']);
  assert.equal(weightSummary(weightsInRange(entries,'14','2026-11-09')).total,-1.7);
  assert.deepEqual(weightsInRange(entries,'30','2026-11-09').map(e=>e.id),['month','outside-fortnight','fortnight','today']);
  assert.deepEqual(weightsInRange(entries,'all','2026-11-09'),entries);
  assert.equal(weightsInRange(entries,'14','2027-01-01').length,0);
});
