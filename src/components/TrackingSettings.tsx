import { MoonStar, SlidersHorizontal } from 'lucide-react';
import type { Store } from '../lib/model';
import { trackerOptions, trackerPreferences } from '../lib/preferences';
import { repository } from '../lib/sync';
export function TrackingSettings({ store, notify }: { store: Store; notify: (message: string) => void }) {
  const preferences = trackerPreferences(store);
  function patch(field: string, value: boolean | string) { try { repository.patch('goals','goals',{[field]:value}); } catch (e) { notify(e instanceof Error ? e.message : 'Nastavení se nepodařilo uložit.'); } }
  return <section className="card form-card tracking-settings"><div className="section-head"><div><h3>Co chceš sledovat?</h3><p>Zapni si jen oblasti, které používáš. Vypnuté oblasti se schovají z přehledu a navigace. Záznamy zůstanou uložené.</p></div><SlidersHorizontal size={20}/></div>
    <div className="tracking-options">{trackerOptions.map(option => <label className="tracking-option" key={option.key}><span><strong>{option.label}</strong><small>{option.description}</small></span><input type="checkbox" role="switch" aria-label={`Sledovat ${option.key === 'recovery' ? 'regeneraci' : option.key === 'nutrition' ? 'výživu' : option.label.toLowerCase()}`} checked={preferences[option.key]} onChange={e => patch(option.field,e.target.checked)}/></label>)}</div>
    <label className="tracking-option theme-option"><span><strong><MoonStar size={17}/> Tmavý vzhled</strong><small>Příjemnější prostředí pro večerní zápisy.</small></span><input type="checkbox" role="switch" aria-label="Tmavý vzhled" checked={preferences.theme === 'dark'} onChange={e => patch('theme',e.target.checked ? 'dark' : 'light')}/></label>
  </section>;
}
