import { addDays, dateKey, isCardio, num, recordsOf, text, weekDates } from './model.ts';
import type { Kind, Store, Value } from './model.ts';
import type { Repository } from './repository.ts';
import { exerciseNameKey, muscleGroup, muscleGroups } from './muscles.ts';

export type SplitDay = {name:string; rest:boolean};
export function validDate(date: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(`${date}T12:00:00Z`)) && new Date(`${date}T12:00:00Z`).toISOString().slice(0,10) === date;
}
export function readSplit(store: Store): {start:string; days:SplitDay[]} {
  const row = store.records.goals, payload = row && !row.deleted ? row.payload : {};
  try {
    const days: unknown = JSON.parse(text(payload.trainingSplit));
    if (!Array.isArray(days) || !days.length || days.length > 28 || days.some(d => !d || typeof d.name !== 'string' || !d.name.trim() || d.name.length > 60 || typeof d.rest !== 'boolean') || !validDate(text(payload.splitStart))) return {start:'',days:[]};
    return {start:text(payload.splitStart), days:days as SplitDay[]};
  } catch {return {start:'',days:[]};}
}
export function saveSplit(repo: Repository, start: string, days: SplitDay[]) {
  if (!validDate(start) || !days.length || days.length > 28 || days.some(d => !d.name.trim() || d.name.trim().length > 60)) throw new Error('Vyplň datum začátku a názvy všech dnů (nejvýš 28 dnů).');
  repo.patch('goals', 'goals', {splitStart:start, trainingSplit:JSON.stringify(days.map(d => ({name:d.name.trim(),rest:d.rest})))});
}
export function splitDayForDate(split: ReturnType<typeof readSplit>, date: string): SplitDay | null {
  if (!split.days.length || !validDate(date) || date < split.start) return null;
  const offset = Math.round((Date.parse(`${date}T12:00:00Z`) - Date.parse(`${split.start}T12:00:00Z`)) / 86400000);
  return split.days[offset % split.days.length];
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
    const group = muscleGroup(text(exercise.payload.muscle));
    if (group) totals.set(group.id, (totals.get(group.id) || 0) + 1); else unassigned++;
  }
  const goals = store.records.goals && !store.records.goals.deleted ? store.records.goals.payload : {};
  return {unassigned, groups:muscleGroups.map(group => ({...group,done:totals.get(group.id)||0,target:Math.max(0,Math.min(200,Math.round(num(goals[`weeklySets_${group.id}`]))))}))};
}
export function unassignedExercises(store: Store, date: string) {
  const workouts = new Set(recordsOf(store,'workout').filter(w => weekDates(date).includes(text(w.payload.date))).map(w=>w.id));
  const seen = new Set<string>();
  return recordsOf(store,'exercise').filter(e => {
    const key = exerciseNameKey(text(e.payload.name));
    if (!key || seen.has(key) || !workouts.has(text(e.payload.workoutId)) || isCardio(e) || muscleGroup(text(e.payload.muscle))) return false;
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
