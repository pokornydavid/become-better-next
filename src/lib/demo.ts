import { addDays, dateKey, patchRecord, weekDates } from './model.ts';
import type { Store } from './model.ts';
import { catalog, templates } from './catalog.ts';
export function createDemo(): Store {
  const store: Store = { version: 1, records: {}, pending: [], demo: true };
  const now = dateKey(), week = weekDates(now);
  const stamp = new Date().toISOString();
  const add = (id: string, kind: Parameters<typeof patchRecord>[2], payload: Parameters<typeof patchRecord>[3]) => { store.records[id] = patchRecord(undefined, id, kind, payload, stamp); };
  add('goals', 'goals', { calories: 2400, protein: 180, carbs: 270, fat: 65, steps: 10000, sleep: 8, weight: 80, mode: 'maintain', name: 'Davide', weeklyWorkouts: 4, phase: 'Budování síly', startDate: week[0] });
  for (let i = 0; i < 14; i++) {
    const date = addDays(now, i - 13);
    add(`daily-${date}`, 'daily', { date, calories: 1950 + (i % 4) * 120, protein: 145 + (i % 3) * 15, carbs: 205 + i % 4 * 12, fat: 51 + i % 3 * 4, steps: 7400 + i % 5 * 850, bedTime: '23:00', wakeTime: '06:45', sleepQuality: 78 + i % 4 * 4, stress: 3, bookPages: 15, water: 2.1, walk: i % 3 !== 0, notes: '', sleepNotes: '' });
  }
  for (let i = 0; i < 8; i++) add(`measurement-demo-${i}`, 'measurement', { date: addDays(now, -49 + i * 7), weight: Number((82.4 - i * 0.25).toFixed(1)), waist: 85 - i * .3, notes: '' });
  const dates = [addDays(week[0], -7), addDays(week[0], -5), addDays(week[0], -3), week[0], week[2], now];
  [...new Set(dates)].forEach((date, i) => {
    const template = templates[i % 2], workoutId = `demo-workout-${date}`;
    const completed = date < now;
    add(workoutId, 'workout', { name: template.name, date, status: completed ? 'completed' : 'planned', duration: completed ? 52 : 0, template: template.id, notes: '' });
    template.exercises.forEach((key, index) => {
      const item = catalog.find(e => e.id === key)!, exerciseId = `${workoutId}-e${index}`;
      add(exerciseId, 'exercise', { workoutId, name: item.name, muscle: item.muscle, catalogId: key, order: index });
      for (let s = 0; s < 3; s++) add(`${exerciseId}-s${s}`, 'set', { exerciseId, weight: [80, 55, 28, 10, 22][index], reps: 10 - s, done: completed, order: s, rpe: 8 });
    });
  });
  return store;
}
