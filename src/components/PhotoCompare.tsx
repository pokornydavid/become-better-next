import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, RotateCcw, Save, X } from 'lucide-react';
import type { Album, PhotoTransform } from '../lib/photo-albums';
import { clampTransform, defaultTransform, imagePlacement, photoTransform } from '../lib/photo-albums';
import type { DataRecord } from '../lib/model';
import { dateKey, text } from '../lib/model';
import { repository } from '../lib/sync';
import { usePhotoSource } from './Photo';

function Frame({ photo, scope, transform, update }: { photo?: DataRecord; scope: string; transform: PhotoTransform; update: (value: PhotoTransform) => void }) {
  const { url, error } = usePhotoSource(photo, scope);
  const drag = useRef<{ x: number; y: number; start: PhotoTransform } | null>(null);
  return <div className="editor-frame" onPointerDown={e => { if (!url) return; e.currentTarget.setPointerCapture(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, start: transform }; }} onPointerMove={e => {
    if (!drag.current) return; const rect = e.currentTarget.getBoundingClientRect();
    update(clampTransform({ ...drag.current.start, x: drag.current.start.x + (e.clientX - drag.current.x) / rect.width * 100, y: drag.current.start.y + (e.clientY - drag.current.y) / rect.height * 100 }));
  }} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
    {url ? <img draggable={false} src={url} alt={text(photo?.payload.caption) || 'Porovnání progresu'} style={{ transform: `translate(${transform.x}%, ${transform.y}%) scale(${transform.zoom}) rotate(${transform.rotation}deg)`, filter: `brightness(${transform.brightness}%) contrast(${transform.contrast}%)` }}/> : <span>{photo ? error || 'Načítám…' : 'Tahle pozice v týdnu chybí'}</span>}
  </div>;
}
export function PhotoCompare({ albums, scope, initial, close, notify, readOnly = false }: { albums: Album[]; scope: string; initial: [string, string]; close: () => void; notify: (message: string) => void; readOnly?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [weeks, setWeeks] = useState(initial), [slot, setSlot] = useState(0), [active, setActive] = useState(0);
  const [edits, setEdits] = useState<Record<string, PhotoTransform>>({}), [busy, setBusy] = useState(false);
  const [mode, setMode] = useState('side'), [opacity, setOpacity] = useState(50);
  const selected = weeks.map(id => albums.find(a => a.id === id) || albums[0]);
  const maxSlots = Math.max(...selected.map(a => a.photos.length), 1), position = Math.min(slot, maxSlots - 1);
  const pair = selected.map(a => a.photos[position]);
  const transform = (photo?: DataRecord) => photo ? edits[photo.id] || photoTransform(photo) : defaultTransform;
  const update = (photo: DataRecord | undefined, value: PhotoTransform) => { if (photo) setEdits(prev => ({ ...prev, [photo.id]: value })); };
  const sources = [usePhotoSource(pair[0], scope), usePhotoSource(pair[1], scope)];
  useEffect(() => { ref.current?.showModal(); }, []);
  async function exportImage() {
    if (sources.some(s => !s.url)) return; setBusy(true);
    try {
      const images = await Promise.all(sources.map(source => new Promise<HTMLImageElement>((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => reject(new Error('Fotku nelze načíst pro export.')); img.src = source.url; })));
      const width = 720, height = 960, header = 88;
      const canvas = document.createElement('canvas'); canvas.width = width * 2; canvas.height = height + header;
      const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Export není dostupný.');
      ctx.fillStyle = '#111'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      images.forEach((image, i) => {
        const t = transform(pair[i]), p = imagePlacement(image.naturalWidth, image.naturalHeight, width, height, t);
        ctx.save(); ctx.beginPath(); ctx.rect(i * width, header, width, height); ctx.clip();
        ctx.translate(i * width + p.x, header + p.y); ctx.rotate(t.rotation * Math.PI / 180); ctx.filter = `brightness(${t.brightness}%) contrast(${t.contrast}%)`;
        ctx.drawImage(image, -p.width / 2, -p.height / 2, p.width, p.height); ctx.restore();
        ctx.fillStyle = '#fff'; ctx.font = 'bold 26px sans-serif'; ctx.fillText(selected[i].name.slice(0, 45), i * width + 24, 36, width - 48);
        ctx.font = '18px sans-serif'; ctx.fillText(`${selected[i].date} · Pozice ${position + 1}`, i * width + 24, 66);
      });
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('Export se nezdařil.')), 'image/png'));
      const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = `become-better-compare-${dateKey()}-${position + 1}.png`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      notify('Porovnání staženo jako PNG.');
    } catch (error) { notify(error instanceof Error ? error.message : 'Export se nezdařil.'); } finally { setBusy(false); }
  }
  const target = pair[active], current = transform(target);
  return <dialog ref={ref} className="dialog compare-dialog" onCancel={e => { e.preventDefault(); close(); }}>
    <div className="dialog-head"><div><h2>Porovnat formu</h2><p>Stejná pozice. Dva různé týdny.</p></div><button className="icon-button" aria-label="Zavřít porovnání" onClick={close}><X size={21}/></button></div>
    <div className="comparison-controls">{selected.map((album, i) => <label className="field" key={i}><span>{i ? 'Později' : 'Začátek'}</span><select value={album.id} onChange={e => { setWeeks(prev => i ? [prev[0], e.target.value] : [e.target.value, prev[1]]); setSlot(0); }}>{albums.map(a => <option key={a.id} value={a.id}>{a.name} · {a.date}</option>)}</select></label>)}</div>
    <div className="compare-toolbar"><div className="slot-switch"><button className="icon-button" aria-label="Předchozí pozice" onClick={() => setSlot((position + maxSlots - 1) % maxSlots)}><ChevronLeft size={18}/></button><strong>Pozice {position + 1} / {maxSlots}</strong><button className="icon-button" aria-label="Další pozice" onClick={() => setSlot((position + 1) % maxSlots)}><ChevronRight size={18}/></button></div><div className="segmented"><button className={mode === 'side' ? 'selected' : ''} onClick={() => setMode('side')}>Vedle sebe</button><button className={mode === 'overlay' ? 'selected' : ''} onClick={() => setMode('overlay')}>Překrýt</button></div></div>
    <div className={`compare-stage ${mode}`}>{pair.map((photo, i) => <div key={i} className={active === i ? 'editing' : ''} style={mode === 'overlay' && i === 1 ? { opacity: opacity / 100, pointerEvents:active === 0 ? 'none' : 'auto' } : undefined}><Frame photo={photo} scope={scope} transform={transform(photo)} update={value => update(photo, value)}/></div>)}</div>
    {mode === 'overlay' && <label className="range-field">Průhlednost druhé fotky <input type="range" aria-label="Průhlednost druhé fotky" min={0} max={100} value={opacity} onChange={e => setOpacity(Number(e.target.value))}/><span>{opacity}%</span></label>}
    <div className="editor-tools"><div className="segmented">{selected.map((a, i) => <button key={i} className={active === i ? 'selected' : ''} onClick={() => setActive(i)}>Upravit {a.name}</button>)}</div><p className="subtle">Fotku posuneš tažením. Originály zůstávají zachované.</p>
      {target && <><label className="range-field">Přiblížení <input aria-label="Přiblížení fotky" type="range" min={.75} max={3} step={.05} value={current.zoom} onChange={e => update(target, { ...current, zoom: Number(e.target.value) })}/><span>{Math.round(current.zoom * 100)}%</span></label>
      <details><summary>Další úpravy</summary>{[{ key: 'x', label: 'Vodorovný posun', min: -100, max: 100 }, { key: 'y', label: 'Svislý posun', min: -100, max: 100 }, { key: 'rotation', label: 'Otočení', min: -180, max: 180 }, { key: 'brightness', label: 'Jas', min: 50, max: 150 }, { key: 'contrast', label: 'Kontrast', min: 50, max: 150 }].map(f => <label className="range-field" key={f.key}>{f.label}<input type="range" aria-label={f.label} min={f.min} max={f.max} value={current[f.key as keyof PhotoTransform]} onChange={e => update(target, { ...current, [f.key]: Number(e.target.value) })}/><span>{current[f.key as keyof PhotoTransform]}</span></label>)}</details>
      <button className="text-button" onClick={() => update(target, { ...defaultTransform })}><RotateCcw size={15}/> Obnovit originální pohled</button></>}
    </div><div className="button-row compare-actions">{!readOnly && <button className="button" onClick={() => { try { for (const [id, t] of Object.entries(edits)) repository.patch(id, 'photo', { ...t }); notify('Úpravy fotek uloženy.'); } catch (error) { notify(error instanceof Error ? error.message : 'Uložení se nezdařilo.'); } }}><Save size={16}/> Uložit úpravy</button>}<button className="button secondary" disabled={busy || sources.some(s => !s.url)} onClick={() => { void exportImage(); }}><Download size={16}/>{busy ? 'Exportuji…' : 'Stáhnout porovnání'}</button></div><small className="subtle">{readOnly ? 'Úpravy slouží pro toto porovnání a export.' : 'Úpravy uložíš tlačítkem Uložit.'} Stažené porovnání je vždy vedle sebe.</small>
  </dialog>;
}
