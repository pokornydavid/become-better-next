import { useRef, useState } from 'react';
import { CalendarDays, Check, Flag, Plus, Settings2 } from 'lucide-react';
import type { Store } from '../lib/model';
import { dateKey, displayDate, num, text } from '../lib/model';
import { phaseChanges, phaseDrafts, phaseTiming, phaseTypes, progressPhases } from '../lib/progress-phases';
import { repository } from '../lib/sync';

export function ProgressPhases({ store, selected, select, notify }: { store: Store; selected: string; select: (id: string) => void; notify: (message: string) => void }) {
  const phases = progressPhases(store), phase = phases.find(p => p.id === selected), timing = phase && phaseTiming(phase);
  const editBaseline = useRef('');
  const [form, setForm] = useState<'new' | 'edit' | null>(null);
  const editing = form === 'edit' ? phase : undefined;
  return <section className="card phase-section">
    <div className="section-head"><div><span className="eyebrow">KAŽDÁ FÁZE MÁ SVŮJ CÍL</span><h3>Tvůj plán progresu</h3></div><button className="button" onClick={() => setForm(form === 'new' ? null : 'new')}><Plus size={16}/> Nová fáze</button></div>
    {phases.length > 0 && <label className="field phase-select"><span>Vybraná fáze</span><select value={selected} onChange={e => { select(e.target.value); setForm(null); }}><option value="">Samostatné týdny · bez fáze</option>{phases.map(p => <option key={p.id} value={p.id}>{text(p.payload.name)} · {num(p.payload.weeks)} týdnů</option>)}</select></label>}
    {phase && timing ? <div className="phase-summary"><div className="phase-summary-head"><span className="phase-type"><Flag size={14}/>{phaseTypes[text(phase.payload.type) as keyof typeof phaseTypes]}</span><span className="phase-status">{timing.status === 'planned' ? 'Naplánováno' : timing.status === 'completed' ? 'Dokončená fáze' : `Týden ${timing.currentWeek} z ${phase.payload.weeks}`}</span></div><h2>{text(phase.payload.name)}</h2><p>{text(phase.payload.goal) || 'Cíl si můžeš doplnit kdykoli.'}</p><div className="phase-facts"><span><CalendarDays size={15}/>{displayDate(text(phase.payload.start))} – {displayDate(timing.end)}</span>{phase.payload.targetWeight != null && <span>Cílová váha <b>{phase.payload.targetWeight} kg</b></span>}</div><div className="mini-track"><span style={{ width: `${timing.progress * 100}%` }}/></div><button className="text-button" onClick={() => { editBaseline.current = JSON.stringify({ payload: phase.payload, stamps: phase.stamps }); setForm(form === 'edit' ? null : 'edit'); }}><Settings2 size={15}/> Upravit fázi</button></div> : <p className="phase-intro">Naplánuj si dietu, objem nebo vlastní fázi. Zvolíš začátek, počet týdnů a svůj cíl. Složky na fotky se připraví automaticky.</p>}
    {form && <form key={`${form}:${editing?.id || ''}`} className="phase-form" onSubmit={e => {
      e.preventDefault(); const data = new FormData(e.currentTarget);
      try {
        if (editing && editBaseline.current !== JSON.stringify({ payload: editing.payload, stamps: editing.stamps })) throw new Error('Fáze se mezitím změnila. Zavři úpravu a otevři ji znovu pro aktuální hodnoty.');
        const name = String(data.get('name')).trim(), goal = String(data.get('goal') || '').trim(), targetWeight = data.get('weight') ? Number(data.get('weight')) : null;
        if (editing) { const changes = phaseChanges(store, editing.id, { name, goal, targetWeight, type: String(data.get('type')), start: String(data.get('start')), weeks: Number(data.get('weeks')) }); repository.updateBatch(changes.drafts, changes.removed); notify('Fáze a týdny upraveny. Fotky zůstaly zachované.'); }
        else { const drafts = phaseDrafts({ name, goal, targetWeight, type: String(data.get('type')), start: String(data.get('start')), weeks: Number(data.get('weeks')) }); repository.addBatch(drafts); select(drafts[0].id!); notify(`Fáze a ${data.get('weeks')} týdnů na fotky jsou připravené.`); }
        setForm(null);
      } catch (error) { notify(error instanceof Error ? error.message : 'Fázi se nepodařilo uložit.'); }
    }}>
      <div className="form-grid two"><label className="field"><span>Název fáze</span><input name="name" maxLength={80} placeholder="Např. Dieta · podzim" required defaultValue={editing ? text(editing.payload.name) : ''}/></label><label className="field"><span>Typ fáze</span><select name="type" defaultValue={text(editing?.payload.type) || 'diet'}>{Object.entries(phaseTypes).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="field"><span>Začátek fáze</span><input name="start" type="date" required defaultValue={text(editing?.payload.start) || dateKey()}/></label><label className="field"><span>Délka / týdny</span><input name="weeks" type="number" min={1} max={52} step={1} defaultValue={num(editing?.payload.weeks) || 5} required/></label><label className="field"><span>Cílová váha / kg · volitelné</span><input name="weight" type="number" min={20} max={500} step={.1} defaultValue={editing?.payload.targetWeight == null ? '' : num(editing.payload.targetWeight)}/></label><label className="field wide"><span>Čeho chceš dosáhnout?</span><textarea name="goal" maxLength={500} placeholder="Např. dostat se na 80 kg, udržet sílu a porovnat formu každý týden." defaultValue={text(editing?.payload.goal)}/></label></div>
      <p className="subtle">Cíl fáze sleduje tvůj progres. Kalorické limity upravíš ve Výživě nebo Nastavení.</p><div className="button-row"><button type="submit" className="button"><Check size={16}/>{editing ? 'Uložit fázi' : 'Vytvořit fázi a týdny'}</button><button type="button" className="button secondary" onClick={() => setForm(null)}>Zrušit</button></div>
    </form>}
  </section>;
}
