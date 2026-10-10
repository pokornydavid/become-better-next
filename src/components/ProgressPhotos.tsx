import { useEffect, useRef, useState } from 'react';
import { Camera, Plus, Trash2, X } from 'lucide-react';
import type { DataRecord, Store } from '../lib/model';
import { dateKey, displayDate, recordsOf, text } from '../lib/model';
import { readPhoto, storePhoto } from '../lib/photos';
import { repository, supabase } from '../lib/sync';
function Photo({ record, scope, onClick }: { record: DataRecord; scope: string; onClick?: () => void }) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState(false);
  useEffect(() => {
    let cancelled = false, localUrl = '';
    setUrl(''); setError(false);
    void (async () => {
      const file = await readPhoto(scope, record.id);
      if (cancelled) return;
      if (file) { localUrl = URL.createObjectURL(file); setUrl(localUrl); return; }
      if (supabase && record.payload.storagePath) {
        const { data, error } = await supabase.storage.from('progress-photos').createSignedUrl(text(record.payload.storagePath), 3600);
        if (cancelled) return;
        if (error) throw error; setUrl(data.signedUrl); return;
      }
      setError(true);
    })().catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; if (localUrl) URL.revokeObjectURL(localUrl); };
  }, [scope, record.id, record.payload.storagePath]);
  return <button className="progress-photo" onClick={onClick} disabled={!onClick} aria-label={`Fotka progresu ${displayDate(text(record.payload.date))}`}>
    {url && !error ? <img src={url} alt={`Progres ${displayDate(text(record.payload.date))}`} onError={() => setError(true)}/> : <span><Camera size={27}/>{error ? 'Fotka není dostupná' : 'Načítám fotku…'}</span>}
    <small>{displayDate(text(record.payload.date))}</small>
  </button>;
}
export function ProgressPhotos({ store, userId, notify }: { store: Store; userId?: string; notify: (message: string) => void }) {
  const input = useRef<HTMLInputElement>(null), dialog = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false), [selected, setSelected] = useState<string | null>(null);
  const [compare, setCompare] = useState<[string, string]>(['', '']);
  const photos = recordsOf(store, 'photo').sort((a, b) => text(a.payload.date).localeCompare(text(b.payload.date)));
  const scope = userId || 'demo';
  const selectedPhoto = photos.find(p => p.id === selected);
  useEffect(() => { if (selectedPhoto) dialog.current?.showModal(); }, [selectedPhoto?.id]);
  useEffect(() => { setSelected(null); setCompare(['', '']); }, [scope]);
  async function upload(file?: File) {
    if (!file) return; setBusy(true);
    const id = crypto.randomUUID(), initialUser = repository.getSnapshot().user?.id;
    try {
      await storePhoto(scope, id, file);
      if (repository.getSnapshot().user?.id !== initialUser) return;
      repository.patch(id, 'photo', { date: dateKey(), storagePath: '', caption: file.name, mime: file.type });
      notify(userId ? 'Fotka je uložená. Po připojení se nahraje do tvého účtu.' : 'Fotka je uložená v tomto prohlížeči.');
    } catch (error) { notify(error instanceof Error ? error.message : 'Nahrání se nepodařilo.'); }
    finally { setBusy(false); if (input.current) input.current.value = ''; }
  }
  function remove(record: DataRecord) { try { repository.remove([record.id]); setSelected(null); notify('Fotka byla odebrána z galerie.'); } catch { notify('Změnu se nepodařilo uložit.'); } }
  return <section className="card photo-section"><div className="section-head"><div><h3>Progres ve fotkách</h3><p className="photo-intro">Stejné místo. Stejné světlo. Nová verze tebe.</p></div><button className="button secondary" disabled={busy} onClick={() => input.current?.click()}><Plus size={16}/>{busy ? 'Ukládám…' : 'Přidat fotku'}</button></div><input ref={input} type="file" className="sr-only" accept="image/jpeg,image/png,image/webp" onChange={e => { void upload(e.target.files?.[0]); }}/>
    {!photos.length ? <div className="photo-empty"><Camera size={32} strokeWidth={1.3}/><p>První fotka je tvůj výchozí bod.</p><small>JPG, PNG nebo WebP · nejvýš 10 MB</small></div> : <div className="photo-grid">{photos.map(photo => <div key={photo.id}><Photo record={photo} scope={scope} onClick={() => setSelected(photo.id)}/><button className="photo-remove" aria-label={`Odebrat fotku ${photo.id}`} onClick={() => remove(photo)}><Trash2 size={13}/> Odebrat</button></div>)}</div>}
    {photos.length >= 2 && <div className="photo-comparison"><div className="section-head"><h3>Vedle sebe. Rozdíl v čase.</h3></div><div className="comparison-controls">{[0, 1].map(i => <label className="field" key={i}><span>{i ? 'Později' : 'Začátek'}</span><select value={compare[i] || photos[i ? photos.length - 1 : 0].id} onChange={e => setCompare(previous => i === 0 ? [e.target.value, previous[1]] : [previous[0], e.target.value])}>{photos.map(p => <option key={p.id} value={p.id}>{displayDate(text(p.payload.date))} · {text(p.payload.caption)}</option>)}</select></label>)}</div><div className="comparison-grid">{[0, 1].map(i => { const photo = photos.find(p => p.id === compare[i]) || photos[i ? photos.length - 1 : 0]; return <Photo key={`${i}:${photo.id}`} record={photo} scope={scope}/>; })}</div></div>}
    {selectedPhoto && <dialog ref={dialog} className="dialog photo-dialog" onCancel={e => { e.preventDefault(); setSelected(null); }}><div className="dialog-head"><h2>{displayDate(text(selectedPhoto.payload.date))}</h2><button className="icon-button" aria-label="Zavřít fotku" onClick={() => setSelected(null)}><X size={20}/></button></div><Photo record={selectedPhoto} scope={scope}/></dialog>}
  </section>;
}
