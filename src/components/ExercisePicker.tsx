import { useState } from 'react';
import { BookOpen, Plus, Search } from 'lucide-react';
import { repository } from '../lib/sync';
import { addPersonalExercise, exerciseNameKey } from '../lib/exercises';
import { recordsOf, text } from '../lib/model';
type Item = { id: string; name: string; muscle: string; equipment: string; cue: string };
export function ExercisePicker({ workoutId, library, choose, close, notify }: { workoutId?: string; library: Item[]; choose: (item: Item) => void; close: () => void; notify: (message: string) => void }) {
  const [name, setName] = useState(''), [browse, setBrowse] = useState(false), [query, setQuery] = useState('');
  const previous = [...new Set(recordsOf(repository.getSnapshot().store, 'exercise').map(e => text(e.payload.name)))].filter(n => n && exerciseNameKey(n).includes(exerciseNameKey(name))).slice(0, 5);
  return <div className="simple-picker"><p className="dialog-description">Pojmenuj si cvik tak, jak ho znáš ty.</p>
    <form className="modal-form" onSubmit={e => {
      e.preventDefault(); if (!workoutId) return;
      try { const data = new FormData(e.currentTarget); addPersonalExercise(repository, workoutId, name, Number(data.get('sets')), Number(data.get('reps'))); close(); notify(`${name.trim()} přidán do tréninku.`); }
      catch (error) { notify(error instanceof Error ? error.message : 'Cvik se nepodařilo uložit.'); }
    }}>
      <label className="field"><span>Můj název cviku</span><input autoFocus name="name" required maxLength={120} placeholder="Např. tlaky na šikmé lavici" value={name} onChange={e => setName(e.target.value)}/></label>
      {name.trim() && previous.length > 0 && <div className="name-suggestions"><small>Už používáš</small>{previous.map(n => <button key={n} type="button" onClick={() => setName(n)}>{n}</button>)}</div>}
      <div className="form-grid two"><label className="field"><span>Série</span><input type="number" name="sets" defaultValue={3} min={1} max={20} required/></label><label className="field"><span>Opakování</span><input type="number" name="reps" defaultValue={10} min={1} max={1000} required/></label></div>
      <button className="button full-width" type="submit"><Plus size={17}/> Přidat můj cvik</button>
    </form>
    <button className="text-button picker-alternative" onClick={() => setBrowse(!browse)} aria-expanded={browse}><BookOpen size={16}/>{browse ? 'Skrýt knihovnu' : 'Nebo vybrat z knihovny'}</button>
    {browse && <><label className="search-field"><Search size={17}/><input aria-label="Vyhledat cvik v knihovně" placeholder="Hledat v knihovně" value={query} onChange={e => setQuery(e.target.value)}/></label><div className="exercise-picker">{library.filter(item => exerciseNameKey(item.name + ' ' + item.muscle).includes(exerciseNameKey(query))).map(item => <button key={item.id} onClick={() => { choose(item); close(); }}><span><strong>{item.name}</strong><small>{[item.muscle, item.equipment].filter(Boolean).join(' · ')}</small></span><Plus size={18}/></button>)}</div></>}
  </div>;
}
