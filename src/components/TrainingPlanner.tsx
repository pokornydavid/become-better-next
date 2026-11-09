import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, CalendarDays, Check, Dumbbell, Moon, Plus, TrendingUp, X } from 'lucide-react';
import { dateKey, displayDate, recordsOf, text, weekDates } from '../lib/model';
import type { Store } from '../lib/model';
import { repository } from '../lib/sync';
import { assignExerciseMuscle } from '../lib/muscles';
import { applySplitWeek, readSplit, saveSplit, splitDayForDate, unassignedExercises, weeklySetTotals } from '../lib/training-plan';
import type { SplitDay } from '../lib/training-plan';
import { MuscleSelect } from './MuscleSelect';
import { MuscleManager } from './MuscleManager';
import { ExerciseProgress } from './ExerciseProgress';

function TargetInput({value,label,save}:{value:number;label:string;save:(n:number)=>boolean}) {
  const [draft,setDraft]=useState(value ? String(value):''),[focused,setFocused]=useState(false);
  useEffect(()=>{if(!focused)setDraft(value ? String(value):'');},[value,focused]);
  return <input type="number" inputMode="numeric" min={0} max={200} step={1} placeholder="—" aria-label={label} value={draft} onFocus={()=>setFocused(true)} onChange={e=>setDraft(e.target.value)} onBlur={()=>{
    setFocused(false); const parsed=draft===''?0:Number(draft);
    if (!Number.isInteger(parsed)||parsed<0||parsed>200||(!Object.is(parsed,value)&&!save(parsed))) setDraft(value?String(value):'');
  }} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();}}/>;
}
export function TrainingPlanner({store,date,selectDate,openWorkout,selectedExercise,onSelectExercise,notify}:{store:Store;date:string;selectDate:(date:string)=>void;openWorkout:(id:string,date:string)=>void;selectedExercise:string;onSelectExercise:(key:string)=>void;notify:(message:string)=>void}) {
  const [tab,setTab]=useState<'plan'|'history'>(selectedExercise?'history':'plan');
  const split=readSplit(store),splitSignature=JSON.stringify(split),dates=weekDates(date),totals=weeklySetTotals(store,date);
  const [editing,setEditing]=useState(!split.days.length);
  const [start,setStart]=useState(split.start||dateKey());
  const [days,setDays]=useState<SplitDay[]>(split.days.length?split.days:[{name:'Upper',rest:false},{name:'Lower',rest:false},{name:'Rest',rest:true}]);
  useEffect(()=>{if(!editing){setStart(split.start||dateKey());setDays(split.days);}},[splitSignature,editing]);
  const missing=unassignedExercises(store,date);
  const attempt=(action:()=>void)=>{try{action();return true;}catch(error){notify(error instanceof Error?error.message:'Změnu se nepodařilo uložit.');return false;}};
  function preset(names:string[]) {setDays(names.map(name=>({name,rest:name==='Rest'})));}
  function moveDay(index:number,delta:number) {const next=[...days],target=index+delta;if(target<0||target>=next.length)return;[next[index],next[target]]=[next[target],next[index]];setDays(next);}
  return <div className="training-planner">
    <div className="segmented planner-tabs" aria-label="Část plánování"><button className={tab==='plan'?'selected':''} aria-pressed={tab==='plan'} onClick={()=>setTab('plan')}><CalendarDays size={16}/> Plán a série</button><button className={tab==='history'?'selected':''} aria-pressed={tab==='history'} onClick={()=>setTab('history')}><TrendingUp size={16}/> Progres cviků</button></div>
    {tab==='plan'?<>
      <section className="card form-card"><div className="section-head"><div><h3>Série za týden</h3><p className="planner-help">{displayDate(dates[0])} – {displayDate(dates[6])} · pondělí až neděle</p></div><Dumbbell size={20}/></div>
        <p className="planner-help">Nastav si vlastní cíle. Každá odškrtnutá série se počítá jednou k hlavní partii cviku, včetně právě běžícího tréninku. Kardio se nepočítá. Prázdný cíl znamená bez limitu; cíle platí každý týden.</p>
        <MuscleManager store={store} run={attempt}/>
        <div className="volume-table" role="table" aria-label="Týdenní série podle partie"><div className="volume-row volume-heading" role="row"><span role="columnheader">Partie</span><span role="columnheader">Odcvičeno</span><span role="columnheader">Cíl / týden</span></div>
          {totals.groups.map(group=><div className="volume-row" role="row" key={group.id}><div role="cell"><strong>{group.label}</strong><div className="volume-track" aria-hidden="true"><span style={{width:`${group.target?Math.min(100,group.done/group.target*100):0}%`}}/></div></div><div role="cell" className="volume-count">{group.done}{group.target>0&&group.done>=group.target&&<Check size={15} aria-label="Cíl splněn"/>}</div><div role="cell"><TargetInput value={group.target} label={`Týdenní cíl sérií: ${group.label}`} save={value=>attempt(()=>repository.patch('goals','goals',{[`weeklySets_${group.id}`]:value}))}/></div></div>)}
        </div>
        {totals.unassigned>0&&<p className="planner-notice">{totals.unassigned} odcvičených sérií zatím nemá partii z tvého seznamu. Doplň ji níže nebo přímo u cviku v tréninku.</p>}
        {missing.length>0&&<details className="planner-assign"><summary>Přiřadit partie cvikům bez zařazení ({missing.length})</summary><p className="planner-help">Výběr se uloží ke všem stejně pojmenovaným cvikům, také v historii.</p>{missing.map(e=><label key={e.id} className="planner-assign-row"><strong>{text(e.payload.name)}</strong><MuscleSelect store={store} value={text(e.payload.muscle)} label={`Přiřadit partii: ${text(e.payload.name)}`} onChange={value=>attempt(()=>assignExerciseMuscle(repository,text(e.payload.name),value))}/></label>)}</details>}
      </section>
      <section className="card form-card"><div className="section-head"><div><h3>Tvůj split</h3><p className="planner-help">Vlastní názvy a pořadí dnů. Cyklus se opakuje od zvoleného data, nemusí mít sedm dnů.</p></div>{!editing&&<button className="button secondary" onClick={()=>{setStart(split.start);setDays(split.days);setEditing(true);}}>Upravit split</button>}</div>
        {editing?<form className="split-editor" onSubmit={e=>{e.preventDefault();const data=new FormData(e.currentTarget);if(attempt(()=>saveSplit(repository,String(data.get('start')),days))){setEditing(false);notify('Split uložený.');}}}>
          <div className="button-row split-presets"><button type="button" className="button secondary" onClick={()=>preset(['Push','Pull','Legs','Rest'])}>Push / pull / legs / rest</button><button type="button" className="button secondary" onClick={()=>preset(['Upper','Lower','Rest'])}>Upper / lower / rest</button><button type="button" className="button secondary" onClick={()=>preset(['Push','Pull','Legs','Rest','Upper','Lower','Rest'])}>PPL / rest / upper / lower / rest</button></div>
          <label className="field split-start"><span>Datum prvního dne cyklu</span><input type="date" name="start" required value={start} onChange={e=>setStart(e.target.value)}/></label>
          <div className="split-days">{days.map((day,i)=><div className="split-day" key={i}><span className="split-index">{i+1}</span><label className="field"><span>Název dne {i+1}</span><input aria-label={`Název dne splitu ${i+1}`} value={day.name} maxLength={60} required onChange={e=>setDays(days.map((d,index)=>index===i?{...d,name:e.target.value}:d))}/></label><label className="checkbox-field"><input type="checkbox" checked={day.rest} onChange={e=>setDays(days.map((d,index)=>index===i?{...d,rest:e.target.checked}:d))}/>Rest</label><div className="split-row-actions"><button type="button" className="icon-button" disabled={!i} aria-label={`Posunout den ${i+1} nahoru`} onClick={()=>moveDay(i,-1)}><ArrowUp size={16}/></button><button type="button" className="icon-button" disabled={i===days.length-1} aria-label={`Posunout den ${i+1} dolů`} onClick={()=>moveDay(i,1)}><ArrowDown size={16}/></button><button type="button" className="icon-button" disabled={days.length===1} aria-label={`Odebrat den ${i+1}`} onClick={()=>setDays(days.filter((_,index)=>index!==i))}><X size={16}/></button></div></div>)}</div>
          <div className="button-row"><button type="button" className="button secondary" disabled={days.length>=28} onClick={()=>setDays([...days,{name:'',rest:false}])}><Plus size={16}/> Přidat den</button>{split.days.length>0&&<button type="button" className="button secondary" onClick={()=>setEditing(false)}>Zrušit úpravy</button>}<button type="submit" className="button"><Check size={16}/> Uložit split</button></div>
        </form>:<><div className="split-cycle">{split.days.map((day,i)=><span key={i}>{day.rest?<Moon size={15}/>:<Dumbbell size={15}/>} {day.name}</span>)}</div><p className="planner-help">První den: {displayDate(split.start)} · cyklus {split.days.length} dnů</p></>}
      </section>
      {split.days.length>0&&<section className="card form-card"><div className="section-head"><h3>Split pro vybraný týden</h3></div><div className="split-week">{dates.map(day=>{const step=splitDayForDate(split,day),workouts=recordsOf(store,'workout').filter(w=>w.payload.date===day);return <button key={day} className={day===date?'selected':''} onClick={()=>selectDate(day)}><small>{displayDate(day,{weekday:'short',day:'numeric',month:'numeric'})}</small>{step?.rest?<Moon size={18}/>:<Dumbbell size={18}/>}<strong>{step?.name||'Před začátkem'}</strong><small>{workouts.length?`${workouts.length} uložených tréninků`:step?.rest?'Odpočinek':'Bez tréninku'}</small></button>;})}</div><p className="planner-help">Split je rozvrh. Použitím vytvoříš prázdné tréninky a označíš rest dny pro tento týden. Dny s uloženým tréninkem zůstanou beze změny. Cviky doplníš nebo zkopíruješ z historie.</p><button className="button" onClick={()=>attempt(()=>{const result=applySplitWeek(repository,date);notify(`Připraveno: ${result.created} tréninků, ${result.rested} rest dnů. Ponecháno ${result.skipped} dnů s existujícími záznamy.`);})}><CalendarDays size={16}/> Použít split na tento týden</button></section>}
    </>:<ExerciseProgress store={store} selectedExercise={selectedExercise} onSelectExercise={onSelectExercise} openWorkout={openWorkout} notify={notify}/>}
  </div>;
}
