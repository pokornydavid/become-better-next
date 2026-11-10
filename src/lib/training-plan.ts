import { addDays, dateKey, isCardio, num, recordsOf, text, weekDates } from './model.ts';
import type { Kind, Store, Value } from './model.ts';
import type { Repository } from './repository.ts';
import { exerciseNameKey, muscleGroup, musclesForStore } from './muscles.ts';

export type SplitDay = {id?:string; name:string; rest:boolean};
type SavedSplitDay = SplitDay & {id:string};
export function validDate(date: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(`${date}T12:00:00Z`)) && new Date(`${date}T12:00:00Z`).toISOString().slice(0,10) === date;
}
export function readSplit(store: Store): {start:string; days:SavedSplitDay[]} {
  const row = store.records.goals, payload = row && !row.deleted ? row.payload : {};
  try {
    const days: unknown = JSON.parse(text(payload.trainingSplit));
    if (!Array.isArray(days) || !days.length || days.length > 28 || days.some(d => !d || typeof d.name !== 'string' || !d.name.trim() || d.name.length > 60 || typeof d.rest !== 'boolean') || !validDate(text(payload.splitStart))) return {start:'',days:[]};
    const ids=new Set<string>();
    const saved=(days as SplitDay[]).map((day,index)=>{
      let id=typeof day.id==='string'&&/^[a-zA-Z0-9-]{1,80}$/.test(day.id)?day.id:`legacy-${index+1}`;
      while(ids.has(id))id=`${id}-${index+1}`;
      ids.add(id);return {id,name:day.name,rest:day.rest};
    });
    return {start:text(payload.splitStart), days:saved};
  } catch {return {start:'',days:[]};}
}
export function saveSplit(repo: Repository, start: string, days: SplitDay[]) {
  if (!validDate(start) || !days.length || days.length > 28 || days.some(d => !d.name.trim() || d.name.trim().length > 60)) throw new Error('Vyplň datum začátku a názvy všech dnů (nejvýš 28 dnů).');
  const ids=new Set<string>();
  const saved=days.map(day=>{
    const id=day.id||crypto.randomUUID();
    if(!/^[a-zA-Z0-9-]{1,80}$/.test(id)||ids.has(id))throw new Error('Každý den splitu musí být samostatný.');
    ids.add(id);return {id,name:day.name.trim(),rest:day.rest};
  });
  repo.patch('goals', 'goals', {splitStart:start, trainingSplit:JSON.stringify(saved)});
}
export function splitDayForDate(split: ReturnType<typeof readSplit>, date: string): SavedSplitDay | null {
  if (!split.days.length || !validDate(date) || date < split.start) return null;
  const offset = Math.round((Date.parse(`${date}T12:00:00Z`) - Date.parse(`${split.start}T12:00:00Z`)) / 86400000);
  return split.days[offset % split.days.length];
}
export function splitSetColumns(store:Store,date:string) {
  const split=readSplit(store),counts=new Map<string,number>();
  for(const day of weekDates(date)) {const step=splitDayForDate(split,day);if(step&&!step.rest)counts.set(step.id,(counts.get(step.id)||0)+1);}
  return split.days.flatMap((day,index)=>day.rest?[]:[{...day,label:split.days.filter(other=>!other.rest&&exerciseNameKey(other.name)===exerciseNameKey(day.name)).length>1?`${day.name} · den ${index+1}`:day.name,count:counts.get(day.id)||0}]);
}
function splitSetValue(store:Store,muscleId:string,dayId:string) {
  const row=store.records.goals,value=row&&!row.deleted?row.payload[`splitSets_${muscleId}_${dayId}`]:null;
  return typeof value==='number'&&Number.isInteger(value)&&value>=0&&value<=200?value:0;
}
export function saveSplitSetTarget(repo:Repository,muscleId:string,dayId:string,value:number) {
  const store=repo.getSnapshot().store;
  if(!musclesForStore(store,true).some(group=>group.id===muscleId)||!readSplit(store).days.some(day=>day.id===dayId&&!day.rest))throw new Error('Partie nebo den splitu už není dostupný.');
  if(!Number.isInteger(value)||value<0||value>200)throw new Error('Napiš celé číslo od 0 do 200 sérií.');
  repo.patch('goals','goals',{[`splitSets_${muscleId}_${dayId}`]:value});
}
export function applySplitWeek(repo: Repository, date: string) {
  const store = repo.getSnapshot().store, split = readSplit(store);
  if (!split.days.length || !validDate(date)) throw new Error('Nejdřív ulož svůj split.');
  const workouts = recordsOf(store,'workout'), drafts: {id?:string;kind:Kind;payload:Record<string,Value>}[] = [];
  let created = 0, rested = 0, skipped = 0;
  for (const day of weekDates(date)) {
    const step = splitDayForDate(split,day);
    if (!step) continue;
    if (workouts.some(w => w.payload.date === day)) {skipped++;continue;}
    const daily = store.records[`daily-${day}`];
    if (step.rest) {
      if (daily?.deleted) {skipped++;continue;}
      if (daily?.payload.restDay !== true) {drafts.push({id:`daily-${day}`,kind:'daily',payload:{date:day,restDay:true}});rested++;}
    } else {
      drafts.push({kind:'workout',payload:{date:day,name:step.name,status:'planned',duration:0,notes:'',startedAt:null,durationSeconds:null,finishedAt:null}}); created++;
      if (daily && !daily.deleted && daily.payload.restDay === true) drafts.push({id:daily.id,kind:'daily',payload:{restDay:false}});
    }
  }
  if (drafts.length) repo.updateBatch(drafts);
  return {created,rested,skipped};
}
export function weeklySetTotals(store: Store, date: string) {
  const dates = new Set(weekDates(date)), workouts = new Map(recordsOf(store,'workout').filter(w => dates.has(text(w.payload.date))).map(w=>[w.id,w]));
  const exercises = new Map(recordsOf(store,'exercise').filter(e => workouts.has(text(e.payload.workoutId)) && !isCardio(e)).map(e=>[e.id,e]));
  const totals = new Map<string,number>(); let unassigned = 0;
  for (const set of recordsOf(store,'set')) {
    const exercise = exercises.get(text(set.payload.exerciseId));
    if (!exercise || set.payload.done !== true) continue;
    const group = muscleGroup(text(exercise.payload.muscle),store);
    if (group) totals.set(group.id, (totals.get(group.id) || 0) + 1); else unassigned++;
  }
  const goals = store.records.goals && !store.records.goals.deleted ? store.records.goals.payload : {};
  const splitColumns=splitSetColumns(store,date);
  return {unassigned,splitColumns,groups:musclesForStore(store).map(group => {
    const allocation=splitColumns.map(day=>({...day,sets:splitSetValue(store,group.id,day.id)}));
    return {...group,done:totals.get(group.id)||0,target:Math.max(0,Math.min(200,Math.round(num(goals[`weeklySets_${group.id}`])))),allocation,planned:allocation.reduce((sum,day)=>sum+day.sets*day.count,0)};
  })};
}
export function unassignedExercises(store: Store, date: string) {
  const workouts = new Set(recordsOf(store,'workout').filter(w => weekDates(date).includes(text(w.payload.date))).map(w=>w.id));
  const seen = new Set<string>();
  return recordsOf(store,'exercise').filter(e => {
    const key = exerciseNameKey(text(e.payload.name));
    if (!key || seen.has(key) || !workouts.has(text(e.payload.workoutId)) || isCardio(e) || muscleGroup(text(e.payload.muscle),store)) return false;
    seen.add(key); return true;
  });
}
export type ExerciseSession = {workoutId:string;date:string;name:string;sets:number;weight:number|null;reps:number|null;volume:number};
export function exerciseHistory(store: Store, key: string): ExerciseSession[] {
  const workouts = new Map(recordsOf(store,'workout').map(w=>[w.id,w])), exercises = new Map(recordsOf(store,'exercise').filter(e=>!isCardio(e) && exerciseNameKey(text(e.payload.name)) === key && workouts.has(text(e.payload.workoutId))).map(e=>[e.id,e]));
  const history = new Map<string,ExerciseSession>();
  for (const set of recordsOf(store,'set')) {
    const exercise = exercises.get(text(set.payload.exerciseId)); if (!exercise || set.payload.done !== true) continue;
    const workout = workouts.get(text(exercise.payload.workoutId))!, date = text(workout.payload.date); if (!validDate(date)) continue;
    const row = history.get(workout.id) || {workoutId:workout.id,date,name:text(workout.payload.name),sets:0,weight:null,reps:null,volume:0};
    row.sets++;
    const weight=set.payload.weight, reps=set.payload.reps;
    if (typeof weight==='number' && Number.isFinite(weight) && weight>=0 && typeof reps==='number' && Number.isFinite(reps) && reps>0) {
      row.volume+=weight*reps;
      if (row.weight===null || weight>row.weight || (weight===row.weight && reps>(row.reps||0))) {row.weight=weight;row.reps=reps;}
    }
    history.set(workout.id,row);
  }
  return [...history.values()].sort((a,b)=>a.date.localeCompare(b.date)||a.workoutId.localeCompare(b.workoutId));
}
export function historyExerciseNames(store: Store) {
  const names = new Map<string,string>(), workouts = new Set(recordsOf(store,'workout').map(w=>w.id));
  for (const e of recordsOf(store,'exercise')) if (!isCardio(e) && workouts.has(text(e.payload.workoutId)) && text(e.payload.name).trim()) names.set(exerciseNameKey(text(e.payload.name)),text(e.payload.name));
  return [...names].sort((a,b)=>a[1].localeCompare(b[1],'cs'));
}
export function historyInRange(history: ExerciseSession[], range: string, today = dateKey()) {
  const start = range === 'all' ? '' : addDays(today, 1-Number(range));
  return history.filter(row=>row.date<=today && (!start || row.date>=start));
}
export function watchedExerciseNames(store:Store) {
  const row=store.records.goals,goals=row&&!row.deleted?row.payload:{};
  return historyExerciseNames(store).filter(([key])=>goals[`watchExercise_${encodeURIComponent(key)}`]===true);
}
export function watchExercise(repo:Repository,key:string,enabled:boolean) {
  key=exerciseNameKey(key);
  if(!key||key.length>120||(enabled&&!historyExerciseNames(repo.getSnapshot().store).some(([name])=>name===key)))throw new Error('Vyber cvik ze svých tréninků.');
  repo.patch('goals','goals',{[`watchExercise_${encodeURIComponent(key)}`]:enabled});
}
