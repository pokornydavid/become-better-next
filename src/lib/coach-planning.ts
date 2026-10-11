import { patchRecord, recordStamp } from './model.ts';
import type { Store, Value } from './model.ts';
import { validDate } from './progress-phases.ts';
import type { Draft } from './progress-phases.ts';
export const coachGoalFields = [
  { key: 'weeklyCalories', label: 'Týdenní limit / kcal', min: 1, max: 140000 },
  { key: 'calories', label: 'Denní cíl / kcal', min: 1, max: 20000 },
  { key: 'protein', label: 'Bílkoviny / g denně', min: 0, max: 2000 },
  { key: 'carbs', label: 'Sacharidy / g denně', min: 0, max: 2000 },
  { key: 'fat', label: 'Tuky / g denně', min: 0, max: 2000 },
  { key: 'weight', label: 'Cílová váha / kg', min: 20, max: 500 },
  { key: 'weeklyWorkouts', label: 'Tréninků za týden', min: 1, max: 14 },
];
export function validateCoachGoals(patch: Record<string, Value>) {
  if (!Object.keys(patch).length) throw new Error('Nejdřív uprav některý cíl.');
  for (const [key, value] of Object.entries(patch)) {
    if (key === 'mode' && ['diet', 'bulk', 'maintain'].includes(String(value))) continue;
    const field = coachGoalFields.find(f => f.key === key);
    if (!field || typeof value !== 'number' || !Number.isFinite(value) || value < field.min || value > field.max || (key !== 'weight' && !Number.isInteger(value))) throw new Error('Zkontroluj zadané cíle klienta.');
  }
  return patch;
}
export type PlannedExercise = { name: string; sets: number; reps: number; weight: number | null };
export type WorkoutPlan = { name: string; date: string; notes: string; exercises: PlannedExercise[] };
export function validateWorkoutPlan(plan: WorkoutPlan) {
  if (!plan.name.trim() || plan.name.trim().length > 120 || !validDate(plan.date) || plan.notes.length > 1000 || !plan.exercises.length || plan.exercises.length > 20) throw new Error('Vyplň název, datum a 1–20 cviků.');
  for (const e of plan.exercises) if (!e.name.trim() || e.name.trim().length > 120 || !Number.isInteger(e.sets) || e.sets < 1 || e.sets > 20 || !Number.isInteger(e.reps) || e.reps < 1 || e.reps > 1000 || (e.weight !== null && (!Number.isFinite(e.weight) || e.weight < 0 || e.weight > 1000))) throw new Error('U cviků zkontroluj název, série, opakování a váhu.');
  return plan;
}
export function workoutPlanDrafts(input: WorkoutPlan, team: string, actor: string, trainer: string): Draft[] {
  const plan = validateWorkoutPlan(input), id = crypto.randomUUID();
  const drafts: Draft[] = [{ id, kind: 'workout', payload: { name: plan.name.trim(), date: plan.date, notes: plan.notes, status: 'planned', startedAt: '', finishedAt: '', assignedTeam: team, assignedBy: actor, trainer } }];
  plan.exercises.forEach((e, order) => {
    const exerciseId = crypto.randomUUID();
    drafts.push({ id: exerciseId, kind: 'exercise', payload: { workoutId: id, name: e.name.trim(), order, muscle: 'Vlastní', equipment: '', cue: '' } });
    for (let i = 0; i < e.sets; i++) drafts.push({ kind: 'set', payload: { exerciseId, order: i, reps: e.reps, weight: e.weight, done: false, rpe: null } });
  });
  return drafts;
}
// The trainer demo has its own store. Never write client data into the signed-in
// user's repository. A single replacement keeps each local action atomic.
export function applyClientDrafts(store: Store, drafts: Draft[]): Store {
  const greatest = Object.values(store.records).reduce((max, r) => recordStamp(r) > max ? recordStamp(r) : max, '');
  const stamp = new Date(Math.max(Date.now(), (Date.parse(greatest) || 0) + 1)).toISOString(), records = { ...store.records };
  for (const draft of drafts) {
    const id = draft.id || crypto.randomUUID(), previous = records[id];
    if (previous && (previous.kind !== draft.kind || previous.deleted)) throw new Error('Záznam klienta nelze změnit.');
    records[id] = { ...patchRecord(previous, id, draft.kind, draft.payload, stamp), revision: (previous?.revision || 0) + 1 };
  }
  return { ...store, records };
}
