import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
export function CoachNote({ value, busy, save }: { value: string; busy: boolean; save: (body: string) => Promise<boolean | undefined> }) {
  const [draft,setDraft] = useState(value), [dirty,setDirty] = useState(false);
  useEffect(() => { if (!dirty) setDraft(value); },[value,dirty]);
  return <form className="card coach-form" onSubmit={e => { e.preventDefault(); void save(draft).then(saved => { if (saved) setDirty(false); }); }}>
    <label className="field"><span>Poznámka pro trenéry</span><textarea name="note" value={draft} onChange={e => { setDraft(e.target.value); setDirty(true); }} maxLength={10000} placeholder="Domluva, omezení, další kroky…"/></label>
    <small className="subtle">Vidí ji jen trenéři tohoto týmu.</small><button className="button secondary" disabled={busy} type="submit"><Check size={15}/> Uložit poznámku</button>
  </form>;
}
