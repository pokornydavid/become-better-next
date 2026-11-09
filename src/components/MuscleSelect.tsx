import { muscleGroup, muscleGroups } from '../lib/muscles';

export function MuscleSelect({value, onChange, label}: {value:string;onChange:(value:string)=>void;label:string}) {
  const selected = muscleGroup(value)?.value || value;
  return <select aria-label={label} value={selected} onChange={e=>onChange(e.target.value)}>
    <option value="">Vyber partii</option>
    {selected && selected!=='Kardio' && !muscleGroups.some(g=>g.value===selected) && <option value={selected}>{selected}</option>}
    {muscleGroups.map(group=><option key={group.id} value={group.value}>{group.label}</option>)}
    <option value="Kardio">Kardio</option>
  </select>;
}
