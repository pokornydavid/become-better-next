import { num, weekDates } from './model.ts';
import type { Store, Value } from './model.ts';

export const defaultGoals = { calories: 2400, protein: 180, carbs: 270, fat: 65, steps: 10000, sleep: 8, weight: 80, weeklyWorkouts: 4, mode: 'maintain', phase: '', name: '' };
export function nutritionGoals(store: Store): Record<string, Value> & { weeklyCalories: number } {
  const record = store.records.goals;
  const goals: Record<string, Value> = { ...defaultGoals, ...(record && !record.deleted ? record.payload : {}) };
  return { ...goals, weeklyCalories: num(goals.weeklyCalories) > 0 ? num(goals.weeklyCalories) : num(goals.calories) * 7 };
}
export function weeklyNutrition(store: Store, date: string) {
  const goals = nutritionGoals(store), dates = weekDates(date);
  const days = dates.map(date => {
    const record = store.records[`daily-${date}`], value = record && !record.deleted ? record.payload.calories : null;
    const logged = typeof value === 'number' && Number.isFinite(value) && value >= 0;
    return { date, logged, calories: logged ? value : 0 };
  });
  const consumed = days.reduce((sum, day) => sum + day.calories, 0);
  const remaining = Math.max(0, goals.weeklyCalories - consumed), unlogged = days.filter(d => !d.logged).length;
  const base = unlogged ? Math.floor(remaining / unlogged) : 0;
  let remainder = unlogged ? Math.round(remaining - base * unlogged) : 0;
  return { limit: goals.weeklyCalories, consumed, remaining, over: Math.max(0, consumed - goals.weeklyCalories), unlogged,
    days: days.map(d => ({ ...d, allowance: d.logged ? null : base + (remainder-- > 0 ? 1 : 0) })) };
}
