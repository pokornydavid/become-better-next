import { useEffect, useState } from 'react';
import { Check, Dumbbell, Plus, Trash2 } from 'lucide-react';
import type { Store, Value } from '../lib/model';
import { dateKey, recordsOf, text, displayDate } from '../lib/model';
import { coachGoalFields, validateCoachGoals, validateWorkoutPlan } from '../lib/coach-planning';
import type { WorkoutPlan } from '../lib/coach-planning';
import { nutritionGoals } from '../lib/nutrition';
import { WeeklyNutrition } from './WeeklyNutrition';

type SaveResult = Promise<boolean | undefined>;
export function CoachPlanning({ store, canEdit, isCoach, busy, saveGoals, saveWorkout }: { store: Store; canEdit: boolean; isCoach: boolean; busy: boolean; saveGoals: (patch: Record<string, Value>, revision: number) => SaveResult; saveWorkout: (plan: WorkoutPlan) => SaveResult }) {
  const goals = nutritionGoals(store), marker = JSON.stringify(store.records.goals || null);
  const initial = () => Object.fromEntries([...coachGoalFields.map(f => [f.key, String(goals[f.key])]), ['mode', text(goals.mode)]]);
  const [values, setValues] = useState<Record<string, string>>(initial), [baseline, setBaseline] = useState(marker), [revision, setRevision] = useState(store.records.goals?.revision || 0);
  const [dirty, setDirty] = useState(false), [error, setError] = useState(''), [building, setBuilding] = useState(false);
  const [rows, setRows] = useState([crypto.randomUUID()]);
  const reset = () => { setValues(initial()); setBaseline(marker); setRevision(store.records.goals?.revision || 0); setDirty(false); setError(''); };
  useEffect(() => { if (!dirty && marker !== baseline) reset(); }, [marker, dirty]);
  const planned = recordsOf(store, 'workout').filter(w => w.payload.status !== 'completed').sort((a,b) => text(a.payload.date).localeCompare(text(b.payload.date)));
  return <div className="coach-planning">
    <section className="card coach-form"><div className="section-head"><h3>Výživa a cíle klienta</h3><span className="consent-badge">{canEdit ? 'Správa povolena' : 'Pouze náhled'}</span></div>
      {isCoach && !canEdit && <p className="budget-explanation">Klient nejdřív povolí správu cílů a přidávání tréninků ve své spolupráci s týmem.</p>}
      <form onSubmit={e => { e.preventDefault(); try { if (baseline !== marker) throw new Error('Cíle se mezitím změnily. Načti aktuální hodnoty a uprav je znovu.'); const patch: Record<string, Value> = {}; for (const [key, value] of Object.entries(values)) { const converted = key === 'mode' ? value : Number(value); if (converted !== goals[key]) patch[key] = converted; } validateCoachGoals(patch); void saveGoals(patch, revision).then(saved => { if (saved) { setDirty(false); setError(''); } }); } catch (e) { setError(e instanceof Error ? e.message : 'Zkontroluj cíle.'); } }}>
        <div className="form-grid two"><label className="field"><span>Zaměření</span><select value={values.mode} disabled={!canEdit || busy} onChange={e => { setDirty(true); setValues({ ...values, mode: e.target.value }); }}><option value="diet">Dieta</option><option value="bulk">Objem</option><option value="maintain">Udržování</option></select></label>{coachGoalFields.map(f => <label className="field" key={f.key}><span>{f.label}</span><input type="number" min={f.min} max={f.max} step={f.key === 'weight' ? .1 : 1} required value={values[f.key]} disabled={!canEdit || busy} onChange={e => { setDirty(true); setValues({ ...values, [f.key]: e.target.value }); }}/></label>)}</div>
        {error && <p className="error-message" role="alert">{error}</p>}{dirty && baseline !== marker && <p className="error-message">Cíle změnil klient nebo jiný trenér. Tvoje rozepsané hodnoty zůstaly zachované. <button type="button" className="text-button" onClick={reset}>Načíst aktuální cíle</button></p>}
        {canEdit && <div className="button-row planning-save"><button className="button" type="submit" disabled={busy || !dirty || baseline !== marker}><Check size={16}/> Uložit cíle klientovi</button><button className="text-button" type="button" disabled={busy || !dirty} onClick={reset}>Zrušit úpravy</button></div>}
      </form>
    </section>
    <WeeklyNutrition store={store} date={dateKey()}/>
    <section className="card coach-form"><div className="section-head"><div><h3>Tréninky klienta</h3><p className="photo-intro">Naplánované tréninky se objeví také v klientově deníku.</p></div>{canEdit && <button className="button" disabled={busy} onClick={() => setBuilding(!building)}><Plus size={16}/> Sestavit trénink</button>}</div>
      {building && canEdit && <form className="workout-builder" onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); try { const plan = validateWorkoutPlan({ name: String(f.get('name')), date: String(f.get('date')), notes: String(f.get('notes') || ''), exercises: rows.map(id => ({ name: String(f.get(`${id}-name`)), sets: Number(f.get(`${id}-sets`)), reps: Number(f.get(`${id}-reps`)), weight: f.get(`${id}-weight`) ? Number(f.get(`${id}-weight`)) : null })) }); void saveWorkout(plan).then(saved => { if (saved) { setBuilding(false); setRows([crypto.randomUUID()]); setError(''); } }); } catch (e) { setError(e instanceof Error ? e.message : 'Zkontroluj trénink.'); } }}>
        <div className="form-grid two"><label className="field"><span>Název tréninku</span><input name="name" required maxLength={120} placeholder="Např. Vrchní část A"/></label><label className="field"><span>Datum tréninku</span><input name="date" type="date" defaultValue={dateKey()} required/></label></div>
        {rows.map((id, i) => <fieldset className="planned-exercise" key={id}><legend>Cvik {i + 1}</legend><label className="field wide"><span>Název cviku vlastními slovy</span><input name={`${id}-name`} maxLength={120} placeholder="Např. moje tlaky na stroji" required/></label><div className="planned-set-fields"><label className="field"><span>Série</span><input name={`${id}-sets`} type="number" min={1} max={20} step={1} defaultValue={3} required/></label><label className="field"><span>Opakování</span><input name={`${id}-reps`} type="number" min={1} max={1000} step={1} defaultValue={10} required/></label><label className="field"><span>Váha / kg</span><input name={`${id}-weight`} type="number" min={0} max={1000} step={.5} placeholder="Volitelné"/></label><button type="button" className="icon-button" disabled={rows.length === 1} aria-label={`Odebrat cvik ${i + 1}`} onClick={() => setRows(rows.filter(r => r !== id))}><Trash2 size={16}/></button></div></fieldset>)}
        <button type="button" className="text-button" disabled={rows.length >= 20 || busy} onClick={() => setRows([...rows, crypto.randomUUID()])}><Plus size={15}/> Další cvik</button><label className="field"><span>Poznámka k tréninku</span><textarea name="notes" maxLength={1000} placeholder="Tempo, pauzy nebo pokyny pro klienta…"/></label>
        <div className="button-row"><button type="submit" className="button" disabled={busy}><Dumbbell size={16}/> Přidat klientovi trénink</button><button type="button" className="button secondary" disabled={busy} onClick={() => setBuilding(false)}>Zrušit</button></div>{error && <p className="error-message">{error}</p>}
      </form>}
      <div className="planned-workouts">{planned.slice(0,12).map(w => <div key={w.id}><Dumbbell size={17}/><span><strong>{text(w.payload.name)}</strong><small>{displayDate(text(w.payload.date))} · {recordsOf(store, 'exercise').filter(e => e.payload.workoutId === w.id).length} cviků{text(w.payload.trainer) ? ` · ${text(w.payload.trainer)}` : ''}</small></span></div>)}{!planned.length && <p className="empty-copy">Zatím žádné naplánované tréninky.</p>}</div>
    </section>
  </div>;
}
