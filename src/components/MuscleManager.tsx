import { useEffect, useState } from 'react';
import { Plus, Settings2 } from 'lucide-react';
import type { Store } from '../lib/model';
import { musclesForStore, saveMuscle, setMuscleVisible } from '../lib/muscles';
import type { MuscleGroup } from '../lib/muscles';
import { repository } from '../lib/sync';

type Run=(action:()=>void)=>boolean;
function MuscleRow({group,visible,run}:{group:MuscleGroup;visible:boolean;run:Run}) {
  const [name,setName]=useState(group.label),[focused,setFocused]=useState(false);
  useEffect(()=>{if(!focused)setName(group.label);},[group.label,focused]);
  return <div className="muscle-manager-row"><label className="checkbox-field"><input type="checkbox" checked={visible} aria-label={`Zobrazovat partii ${group.label}`} onChange={e=>run(()=>setMuscleVisible(repository,group.id,e.target.checked))}/><span className="sr-only">Zobrazovat</span></label><label className="field"><span className="sr-only">Název partie</span><input aria-label={`Název partie ${group.label}`} maxLength={40} value={name} onFocus={()=>setFocused(true)} onChange={e=>setName(e.target.value)} onBlur={()=>{setFocused(false);if(name.trim()!==group.label&&!run(()=>{saveMuscle(repository,name,group.id);}))setName(group.label);}} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();}}/></label><span className="muscle-visibility">{visible?'Zobrazená':'Skrytá'}</span></div>;
}
export function MuscleManager({store,run}:{store:Store;run:Run}) {
  const [name,setName]=useState('');const all=musclesForStore(store,true),visible=new Set(musclesForStore(store).map(g=>g.id));
  return <details className="muscle-manager"><summary><Settings2 size={16}/> Upravit partie / přidat vlastní</summary><p className="planner-help">Názvy si uprav podle sebe. Zaškrtnuté partie uvidíš v cílech a při přidávání cviků. Skrytím se nemažou tréninky ani jejich historie.</p><div className="muscle-manager-list">{all.map(group=><MuscleRow key={group.id} group={group} visible={visible.has(group.id)} run={run}/>)}</div><form className="custom-muscle-form" onSubmit={e=>{e.preventDefault();if(run(()=>{saveMuscle(repository,name);}))setName('');}}><label className="field"><span>Nová vlastní partie</span><input aria-label="Název nové partie" placeholder="Např. předloktí" required maxLength={40} value={name} onChange={e=>setName(e.target.value)}/></label><button type="submit" className="button"><Plus size={16}/> Přidat partii</button></form></details>;
}
