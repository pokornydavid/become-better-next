import { muscleGroup, muscleLabel, musclesForStore } from '../lib/muscles';
import type { Store } from '../lib/model';

export function MuscleSelect({value, onChange, label, store}: {value:string;onChange:(value:string)=>void;label:string;store:Store}) {
  const groups=musclesForStore(store),current=muscleGroup(value,store),selected=current?.value||value;
  return <select aria-label={label} value={selected} onChange={e=>onChange(e.target.value)}>
    <option value="">Vyber partii</option>
    {selected && selected!=='Kardio' && !groups.some(g=>g.value===selected) && <option value={selected}>{current?`${current.label} (skrytá)`:`${muscleLabel(selected,store)} — vyber novou partii`}</option>}
    {groups.map(group=><option key={group.id} value={group.value}>{group.label}</option>)}
    <option value="Kardio">Kardio</option>
  </select>;
}
