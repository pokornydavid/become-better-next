import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Camera, ChevronLeft, ChevronRight, Columns2, Folder, Plus, Trash2, X } from 'lucide-react';
import type { Store } from '../lib/model';
import { addDays, dateKey, displayDate, num, text } from '../lib/model';
import { photoAlbums, photoCount } from '../lib/photo-albums';
import { storePhoto } from '../lib/photos';
import { repository } from '../lib/sync';
import { Photo } from './Photo';
import { PhotoCompare } from './PhotoCompare';
import { ProgressPhases } from './ProgressPhases';
import { progressPhases, phaseTiming } from '../lib/progress-phases';

export function ProgressPhotos({ store, userId, notify }: { store: Store; userId?: string; notify: (message: string) => void }) {
  const input = useRef<HTMLInputElement>(null), dialog = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false), [openId, setOpenId] = useState(''), [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<string | null>(null), [comparing, setComparing] = useState(false);
  const phases = progressPhases(store);
  const [phaseId, setPhaseId] = useState(() => phases.find(p => phaseTiming(p).status === 'active')?.id || phases[0]?.id || '');
  const phaseLoaded = useRef(phases.length > 0);
  const allAlbums = photoAlbums(store).map(a => a.phaseId && !phases.some(p => p.id === a.phaseId) ? { ...a, phaseId: '' } : a), albums = allAlbums.filter(a => (a.phaseId || '') === phaseId), open = albums.find(a => a.id === openId), scope = userId || 'demo';
  const allPhotos = albums.flatMap(a => a.photos), selectedPhoto = allPhotos.find(p => p.id === selected);
  useEffect(() => { if (selectedPhoto) dialog.current?.showModal(); }, [selectedPhoto?.id]);
  useEffect(() => { setSelected(null); setOpenId(''); setComparing(false); setPhaseId(phases.find(p => phaseTiming(p).status === 'active')?.id || phases[0]?.id || ''); }, [scope]);
  useEffect(() => {
    if (!phaseLoaded.current && phases.length) { phaseLoaded.current = true; setPhaseId(phases.find(p => phaseTiming(p).status === 'active')?.id || phases[0].id); }
    else if (phaseId && !phases.some(p => p.id === phaseId)) { setPhaseId(''); setOpenId(''); setComparing(false); }
  }, [phases.map(p => p.id).join(','), phaseId]);
  function safely(fn: () => void) { try { fn(); } catch (error) { notify(error instanceof Error ? error.message : 'Změnu se nepodařilo uložit.'); } }
  function materialize(id: string) {
    const album = allAlbums.find(a => a.id === id); if (!album) throw new Error('Vyber složku.');
    if (!album.virtual) return id;
    const newId = repository.add('photoAlbum', { name: `Týden ${allAlbums.indexOf(album) + 1}`, date: album.date });
    for (const photo of album.photos) repository.patch(photo.id, 'photo', { albumId: newId });
    setOpenId(newId); return newId;
  }
  async function upload(files: File[]) {
    if (!files.length || !open) return;
    const owner = repository.getSnapshot().user?.id; setBusy(true); let saved = 0;
    try {
      if (files.length > 30) throw new Error('Přidej najednou nejvýš 30 fotek.');
      const albumId = materialize(open.id); let order = Math.max(-1, ...open.photos.map(p => num(p.payload.order))) + 1;
      for (const file of files) {
        const id = crypto.randomUUID(); await storePhoto(scope, id, file);
        if (repository.getSnapshot().user?.id !== owner) return;
        repository.patch(id, 'photo', { date: open.date, albumId, order: order++, storagePath: '', caption: file.name, mime: file.type }); saved++;
      }
      notify(`${saved} ${saved === 1 ? 'fotka uložena' : 'fotek uloženo'} do ${open.name}.`);
    } catch (error) { notify(`${saved ? `Uloženo ${saved} fotek. ` : ''}${error instanceof Error ? error.message : 'Nahrání se nepodařilo.'}`); }
    finally { setBusy(false); if (input.current) input.current.value = ''; }
  }
  function reorder(index: number, direction: number) {
    if (!open) return; const list = [...open.photos], next = index + direction; if (next < 0 || next >= list.length) return;
    [list[index], list[next]] = [list[next], list[index]];
    safely(() => { list.forEach((p, i) => repository.patch(p.id, 'photo', { order: i })); });
  }
  return <div className="progress-photos"><ProgressPhases store={store} selected={phaseId} select={id => { setPhaseId(id); setOpenId(''); setComparing(false); setCreating(false); }} notify={notify}/><section className="card photo-section">
    <div className="section-head"><div><h3>{phaseId ? 'Fotky této fáze' : 'Fotky podle týdnů'}</h3><p className="photo-intro">Jeden týden, jedna složka. Stejné pořadí fotek usnadní porovnání.</p></div><div className="button-row"><button className="button secondary" disabled={albums.filter(a => a.photos.length).length < 2} title="Porovnání fotek ze dvou týdnů" onClick={() => setComparing(true)}><Columns2 size={16}/> Porovnat</button>{!phaseId && <button className="button" onClick={() => setCreating(!creating)}><Plus size={16}/> Přidat týden</button>}</div></div>
    {creating && <form className="album-form" onSubmit={e => { e.preventDefault(); const data = new FormData(e.currentTarget); safely(() => { const name = String(data.get('name')).trim(); if (!name) throw new Error('Napiš název složky.'); const id = repository.add('photoAlbum', { name, date: String(data.get('date')) }); setOpenId(id); setCreating(false); notify('Složka je připravená. Přidej všechny fotky najednou.'); }); }}><label className="field"><span>Název složky</span><input autoFocus name="name" maxLength={80} required defaultValue={`Týden ${albums.length + 1}`}/></label><label className="field"><span>Datum týdne</span><input name="date" type="date" required defaultValue={albums.length ? addDays(albums.at(-1)!.date, 7) : dateKey()}/></label><button type="submit" className="button">Vytvořit složku</button></form>}
    {!open ? <>{!albums.length ? <div className="photo-empty"><Folder size={35} strokeWidth={1.2}/><p>Začni složkou Týden 1.</p><small>Potom do ní vybereš třeba všech 10 fotek najednou.</small></div> : <div className="album-grid">{albums.map((album, i) => <button className="album-card" key={album.id} onClick={() => setOpenId(album.id)}><div className="album-cover">{album.photos[0] ? <Photo record={album.photos[0]} scope={scope}/> : <Folder size={36} strokeWidth={1.2}/>}<span>{String(album.week || i + 1).padStart(2, '0')}</span></div><div><strong>{album.name}</strong><small>{displayDate(album.date)} · {photoCount(album.photos.length)}</small></div><ArrowRight size={18}/></button>)}</div>}</> : <div className="open-album"><div className="section-head"><button className="text-button" onClick={() => setOpenId('')}><ArrowLeft size={16}/> Všechny týdny</button><button className="button secondary" disabled={busy} onClick={() => input.current?.click()}><Plus size={16}/>{busy ? 'Ukládám…' : 'Přidat fotky'}</button></div>
      <div className="album-meta"><label className="field"><span>Název složky</span><input key={open.id} defaultValue={open.name} maxLength={80} onBlur={e => safely(() => { const name = e.target.value.trim(); if (name && name !== open.name) repository.patch(materialize(open.id), 'photoAlbum', { name }); else e.target.value = open.name; })}/></label><span className="subtle">{displayDate(open.date)} · {photoCount(open.photos.length)}</span>{!open.photos.length && !phaseId && <button className="text-button" onClick={() => safely(() => { repository.remove([open.id]); setOpenId(''); })}><Trash2 size={14}/> Odebrat prázdnou složku</button>}</div>
      {!open.photos.length && <div className="photo-empty"><Camera size={30}/><p>Vyber všechny fotky tohoto týdne.</p><small>JPG, PNG, WebP · každá nejvýš 10 MB</small></div>}
      <div className="photo-grid album-photos">{open.photos.map((photo, index) => <div className="album-photo" key={photo.id}><Photo record={photo} scope={scope} label={`Otevřít fotku ${index + 1} v ${open.name}`} onClick={() => setSelected(photo.id)}/><div className="photo-caption"><span>{index + 1}</span><input aria-label={`Název pozice ${index + 1}`} defaultValue={text(photo.payload.caption)} maxLength={120} placeholder="Např. zepředu" onBlur={e => safely(() => { repository.patch(photo.id, 'photo', { caption: e.target.value }); })}/></div><div className="photo-actions"><button className="icon-button" aria-label={`Posunout fotku ${index + 1} doleva`} disabled={!index} onClick={() => reorder(index, -1)}><ChevronLeft size={16}/></button><button className="icon-button" aria-label={`Posunout fotku ${index + 1} doprava`} disabled={index === open.photos.length - 1} onClick={() => reorder(index, 1)}><ChevronRight size={16}/></button><button className="icon-button" aria-label={`Odebrat fotku ${index + 1}`} onClick={() => safely(() => { repository.remove([photo.id]); notify('Fotka odebrána z galerie.'); })}><Trash2 size={15}/></button></div></div>)}</div>
      <p className="subtle">Pozice 1 v tomto týdnu se porovnává s pozicí 1 v jiném týdnu. Pořadí upravíš šipkami.</p>
    </div>}
    <input ref={input} type="file" multiple className="sr-only" accept="image/jpeg,image/png,image/webp" onChange={e => { void upload(Array.from(e.target.files || [])); }}/>
    {selectedPhoto && <dialog ref={dialog} className="dialog photo-dialog" onCancel={e => { e.preventDefault(); setSelected(null); }}><div className="dialog-head"><h2>{text(selectedPhoto.payload.caption)}</h2><button className="icon-button" aria-label="Zavřít fotku" onClick={() => setSelected(null)}><X size={20}/></button></div><Photo record={selectedPhoto} scope={scope}/><label className="field"><span>Přesunout do složky</span><select value={allAlbums.find(a => a.photos.some(p => p.id === selectedPhoto.id))?.id} onChange={e => safely(() => { const albumId = materialize(e.target.value); const target = allAlbums.find(a => a.id === e.target.value)!; repository.patch(selectedPhoto.id, 'photo', { albumId, date: target.date, order: Math.max(-1, ...target.photos.map(p => num(p.payload.order))) + 1 }); setSelected(null); notify('Fotka přesunuta.'); })}>{allAlbums.map(a => <option key={a.id} value={a.id}>{phases.find(p => p.id === a.phaseId)?.payload.name || 'Samostatné týdny'} · {a.name} · {a.date}</option>)}</select></label></dialog>}
    {comparing && albums.some(a => a.photos.length) && <PhotoCompare albums={albums.filter(a => a.photos.length)} scope={scope} initial={[albums.find(a => a.photos.length)!.id, [...albums].reverse().find(a => a.photos.length)!.id]} close={() => setComparing(false)} notify={notify}/>}
  </section></div>;
}
