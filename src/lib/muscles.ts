import { isCardio, recordsOf, recordStamp, text } from './model.ts';
import type { Store } from './model.ts';
import type { Repository } from './repository.ts';

export const muscleGroups = [
  {id:'chest', value:'Hrudník', label:'Prsa', aliases:['prsa','chest','hrudnik']},
  {id:'back', value:'Záda', label:'Záda', aliases:['zada','back']},
  {id:'shoulders', value:'Ramena', label:'Ramena', aliases:['ramena','shoulders','delts']},
  {id:'biceps', value:'Biceps', label:'Biceps', aliases:['biceps','bicepsy']},
  {id:'triceps', value:'Triceps', label:'Triceps', aliases:['triceps','tricepsy']},
  {id:'quads', value:'Kvadricepsy', label:'Kvadricepsy', aliases:['kvadricepsy','kvadraky','quads','quadriceps']},
  {id:'hamstrings', value:'Hamstringy', label:'Hamstringy', aliases:['hamstringy','hamstrings']},
  {id:'glutes', value:'Hýždě', label:'Hýždě', aliases:['hyzde','glutes']},
  {id:'calves', value:'Lýtka', label:'Lýtka', aliases:['lytka','calves']},
  {id:'core', value:'Core', label:'Břicho / core', aliases:['core','bricho','abs']},
  {id:'legs', value:'Nohy', label:'Nohy bez upřesnění', aliases:['nohy','legs']},
] as const;
export const exerciseNameKey = (name: string) => name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('cs-CZ');
const aliasKey = (value: string) => exerciseNameKey(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
export function muscleGroup(value: string) {
  const key = aliasKey(value);
  return muscleGroups.find(group => aliasKey(group.value) === key || (group.aliases as readonly string[]).includes(key));
}
export function inferredMuscle(store: Store, name: string): string {
  const key = exerciseNameKey(name);
  const previous = recordsOf(store, 'exercise').filter(e => exerciseNameKey(text(e.payload.name)) === key && text(e.payload.muscle))
    .sort((a,b) => recordStamp(b).localeCompare(recordStamp(a)) || a.id.localeCompare(b.id));
  return previous.length ? isCardio(previous[0]) ? 'Kardio' : muscleGroup(text(previous[0].payload.muscle))?.value || '' : '';
}
export function assignExerciseMuscle(repo: Repository, name: string, muscle: string) {
  if (muscle !== '' && muscle !== 'Kardio' && !muscleGroups.some(g => g.value === muscle)) throw new Error('Vyber partii ze seznamu.');
  const key = exerciseNameKey(name), rows = recordsOf(repo.getSnapshot().store, 'exercise').filter(e => exerciseNameKey(text(e.payload.name)) === key);
  if (!rows.length) throw new Error('Cvik už není dostupný.');
  repo.updateBatch(rows.map(e => ({id:e.id, kind:'exercise' as const, payload:{muscle, type:muscle === 'Kardio' ? 'cardio' : 'strength'}})));
}
