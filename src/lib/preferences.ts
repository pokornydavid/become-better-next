import type { Store } from './model.ts';
export type Tracker = 'training' | 'nutrition' | 'recovery' | 'progress';
export const trackerOptions = [
  { key: 'training', field: 'trackTraining', label: 'Trénink', description: 'Plán, série a týdenní tréninkový cíl.' },
  { key: 'nutrition', field: 'trackNutrition', label: 'Výživa', description: 'Kalorie, makra a týdenní rozpočet.' },
  { key: 'recovery', field: 'trackRecovery', label: 'Regenerace', description: 'Spánek, kroky a každodenní návyky.' },
  { key: 'progress', field: 'trackProgress', label: 'Progres', description: 'Měření, fotky a dietní nebo objemové fáze.' },
] as const;
export function trackerPreferences(store: Store): Record<Tracker, boolean> & { theme: 'dark' | 'light' } {
  const row = store.records.goals, goals = row && !row.deleted ? row.payload : {};
  return { training: goals.trackTraining !== false, nutrition: goals.trackNutrition !== false, recovery: goals.trackRecovery !== false, progress: goals.trackProgress !== false, theme: goals.theme === 'light' ? 'light' : 'dark' };
}
