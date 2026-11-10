import { isCardio, recordsOf, recordStamp, text } from './model.ts';
import type { Store } from './model.ts';
import type { Repository } from './repository.ts';

export const muscleGroups = [
  {id:'chest', value:'Hrudník', label:'Prsa', aliases:['prsa','chest','hrudnik']},
  {id:'lats', value:'Křídla', label:'Křídla / laty', aliases:['kridla','laty','lats','sirka zad']},
  {id:'upperBack', value:'Vršek zad', label:'Vršek zad', aliases:['vrsek zad','vrsky zad','upper back','hloubka zad']},
  {id:'shoulders', value:'Ramena', label:'Ramena', aliases:['ramena','shoulders','delts']},
  {id:'biceps', value:'Biceps', label:'Biceps', aliases:['biceps','bicepsy']},
  {id:'triceps', value:'Triceps', label:'Triceps', aliases:['triceps','tricepsy']},
  {id:'quads', value:'Kvadricepsy', label:'Kvadricepsy', aliases:['kvadricepsy','kvadraky','quads','quadriceps']},
  {id:'hamstrings', value:'Hamstringy', label:'Hamstringy', aliases:['hamstringy','hamstrings']},
  {id:'calves', value:'Lýtka', label:'Lýtka', aliases:['lytka','calves']},
  {id:'core', value:'Core', label:'Břicho / core', aliases:['core','bricho','abs']},
] as const;
export type MuscleGroup = {id:string;value:string;label:string;aliases:readonly string[]};
export const exerciseNameKey = (name: string) => name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('cs-CZ');
const aliasKey = (value: string) => exerciseNameKey(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
function goalsFor(store?:Store) {const row=store?.records.goals;return row&&!row.deleted?row.payload:{};}
export function musclesForStore(store?:Store, includeHidden=false):MuscleGroup[] {
  const goals=goalsFor(store);
  const groups:MuscleGroup[]=muscleGroups.map(group=>({...group,label:typeof goals[`muscleLabel_${group.id}`]==='string'&&String(goals[`muscleLabel_${group.id}`]).trim()?String(goals[`muscleLabel_${group.id}`]).trim():group.label}));
  for(const [field,value] of Object.entries(goals)) if(/^customMuscle_[a-zA-Z0-9-]+$/.test(field)&&typeof value==='string'&&value.trim()&&value.length<=40) {
    const id=field.slice('customMuscle_'.length);groups.push({id,value:`custom:${id}`,label:value.trim(),aliases:[]});
  }
  let order:string[]=[];
  try {const saved=JSON.parse(text(goals.muscleOrder));if(Array.isArray(saved)&&saved.every(id=>typeof id==='string'))order=saved;} catch { /* Keep the existing order for older or invalid settings. */ }
  const positions=new Map(order.map((id,index)=>[id,index]));
  return groups.sort((a,b)=>(positions.get(a.id)??Infinity)-(positions.get(b.id)??Infinity)).filter(group=>includeHidden||goals[`muscleVisible_${group.id}`]!==false);
}
export function moveMuscle(repo:Repository,id:string,delta:-1|1) {
  const store=repo.getSnapshot().store,all=musclesForStore(store,true),visible=musclesForStore(store),index=visible.findIndex(group=>group.id===id),target=visible[index+delta];
  if(index<0)throw new Error('Partie už není dostupná.');
  if(!target)return;
  const order=all.map(group=>group.id),from=order.indexOf(id),to=order.indexOf(target.id);
  [order[from],order[to]]=[order[to],order[from]];
  repo.patch('goals','goals',{muscleOrder:JSON.stringify(order)});
}
export function muscleGroup(value: string, store?:Store, includeHidden=true) {
  const key = aliasKey(value);
  return musclesForStore(store,includeHidden).find(group => aliasKey(group.value) === key || group.aliases.includes(key));
}
export function muscleLabel(value:string,store:Store) {return muscleGroup(value,store)?.label||(value.startsWith('custom:')?'Vlastní partie':value);}
export function saveMuscle(repo:Repository,label:string,id?:string) {
  label=label.trim().replace(/\s+/g,' ');
  const groups=musclesForStore(repo.getSnapshot().store,true);
  if(!label||label.length>40)throw new Error('Napiš název partie, nejvýš 40 znaků.');
  if(id&&!groups.some(g=>g.id===id))throw new Error('Partie už není dostupná.');
  if(groups.some(g=>g.id!==id&&(aliasKey(g.label)===aliasKey(label)||aliasKey(g.value)===aliasKey(label)||g.aliases.includes(aliasKey(label)))))throw new Error('Tuto partii už v seznamu máš.');
  const existing=groups.find(g=>g.id===id),key=id||crypto.randomUUID();
  repo.patch('goals','goals',{[existing&&muscleGroups.some(g=>g.id===id)?`muscleLabel_${key}`:`customMuscle_${key}`]:label,...(!id?{[`muscleVisible_${key}`]:true}:{})});
  return key;
}
export function setMuscleVisible(repo:Repository,id:string,visible:boolean) {
  if(!musclesForStore(repo.getSnapshot().store,true).some(g=>g.id===id))throw new Error('Partie už není dostupná.');
  repo.patch('goals','goals',{[`muscleVisible_${id}`]:visible});
}
export function inferredMuscle(store: Store, name: string): string {
  const key = exerciseNameKey(name);
  const previous = recordsOf(store, 'exercise').filter(e => exerciseNameKey(text(e.payload.name)) === key && text(e.payload.muscle))
    .sort((a,b) => recordStamp(b).localeCompare(recordStamp(a)) || a.id.localeCompare(b.id));
  return previous.length ? isCardio(previous[0]) ? 'Kardio' : muscleGroup(text(previous[0].payload.muscle),store)?.value || '' : '';
}
export function assignExerciseMuscle(repo: Repository, name: string, muscle: string) {
  if (muscle !== '' && muscle !== 'Kardio' && !musclesForStore(repo.getSnapshot().store,true).some(g => g.value === muscle)) throw new Error('Vyber partii ze seznamu.');
  const key = exerciseNameKey(name), rows = recordsOf(repo.getSnapshot().store, 'exercise').filter(e => exerciseNameKey(text(e.payload.name)) === key);
  if (!rows.length) throw new Error('Cvik už není dostupný.');
  repo.updateBatch(rows.map(e => ({id:e.id, kind:'exercise' as const, payload:{muscle, type:muscle === 'Kardio' ? 'cardio' : 'strength'}})));
}
