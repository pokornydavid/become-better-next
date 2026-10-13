import { useEffect, useRef, useState } from 'react';
import { Check, FileJson, LoaderCircle, Upload, X } from 'lucide-react';
import { backupForDestination, backupSummary, prepareBackup } from '../lib/legacy-import';
import type { PreparedBackup } from '../lib/legacy-import';
import { readPhoto, replacePhotos } from '../lib/photos';
import { repository } from '../lib/sync';
export function ImportBackupDialog({close,notify}:{close:()=>void;notify:(message:string)=>void}) {
  const dialog=useRef<HTMLDialogElement>(null),mounted=useRef(true),input=useRef<HTMLInputElement>(null);
  const [prepared,setPrepared]=useState<PreparedBackup|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[name,setName]=useState('');
  useEffect(()=>{mounted.current=true;dialog.current?.showModal();return()=>{mounted.current=false;};},[]);
  const summary=prepared && backupSummary(prepared),snapshot=repository.getSnapshot(),overlap=prepared ? Object.keys(prepared.store.records).filter(id=>snapshot.store.records[id]&&!snapshot.store.records[id].deleted).length : 0;
  async function confirm() {
    if(!prepared||busy)return;setBusy(true);setError('');const owner=repository.getSnapshot().user?.id,scope=owner||'demo';let previous:{id:string;file?:Blob}[]=[];
    try {
      if(prepared.embedded.length){previous=await Promise.all(prepared.embedded.map(async photo=>({id:photo.id,file:await readPhoto(scope,photo.id)})));await replacePhotos(scope,prepared.embedded);}
      if(repository.getSnapshot().user?.id!==owner)throw new Error('Účet se změnil. Otevři import znovu ve správném účtu.');
      repository.importBackup(backupForDestination(prepared,repository.getSnapshot().store));if(mounted.current){notify('Záloha převedena a záznamy uloženy.');close();}
    } catch(e) {
      if(previous.length)try{await replacePhotos(scope,previous);}catch{if(mounted.current)setError('Obnovení souborů se nepodařilo. Původní JSON zálohu si ponech.');return;}
      if(mounted.current)setError(e instanceof Error?e.message:'Import se nepodařil.');
    } finally {if(mounted.current)setBusy(false);}
  }
  return <dialog ref={dialog} className="dialog import-dialog" aria-labelledby="import-title" onCancel={e=>{e.preventDefault();if(!busy)close();}}><div className="dialog-head"><h2 id="import-title">Přenést záznamy.</h2><button className="icon-button" aria-label="Zavřít import" disabled={busy} onClick={close}><X size={20}/></button></div><p className="dialog-description">Vyber JSON zálohu nové nebo původní Become Better. Nejdřív uvidíš, co se přenese.</p><button className="button secondary" disabled={busy} onClick={()=>input.current?.click()}><FileJson size={17}/> Vybrat zálohu</button><input ref={input} className="sr-only" type="file" accept="application/json,.json" onChange={e=>{const file=e.target.files?.[0];if(!file)return;setBusy(true);setPrepared(null);setError('');void (async()=>{try{if(file.size>50*1024*1024)throw new Error('Záloha může mít nejvýš 50 MB.');const next=prepareBackup(JSON.parse(await file.text()));if(mounted.current){setPrepared(next);setName(file.name);}}catch(e){if(mounted.current)setError(e instanceof Error?e.message:'Zálohu se nepodařilo načíst.');}finally{if(mounted.current)setBusy(false);if(input.current)input.current.value='';}})();}}/>
    {busy && <p className="import-loading" role="status"><LoaderCircle size={18} className="loading-spin"/> Připravuji přenos…</p>}
    {prepared&&summary&&<div className="import-preview"><strong>{name}</strong><small>{prepared.legacy?'Záloha původní aplikace':'Záloha nové aplikace'}</small><dl>{[['Tréninky',summary.workouts],['Denní záznamy',summary.days],['Měření',summary.measurements],['Složky na fotky',summary.albums],['Fotky obsažené v záloze',summary.photos]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>{summary.missingPhotos>0&&<p>U {summary.missingPhotos} fotek obsahuje stará záloha jen odkaz na původní úložiště. Příslušné složky se přenesou; fotky do nich přidej z původních souborů.</p>}{!prepared.legacy&&<p>JSON záloha obsahuje záznamy fotek. Samotné soubory jsou v původním zařízení nebo účtu.</p>}{overlap>0&&<p>{overlap} záznamů se shoduje se současnými ID. Jejich obsah se nahradí obsahem zálohy.</p>}<p className="import-destination">Uložit do: <b>{snapshot.user?.email||'místního režimu tohoto prohlížeče'}</b></p><button className="button" disabled={busy} onClick={()=>{void confirm();}}><Check size={17}/> Potvrdit přenos</button></div>}{error&&<p className="error-message" role="alert">{error}</p>}{!prepared&&<p className="subtle">Ve staré aplikaci použij Export zálohy. Tady se přidají tvoje vlastní cviky, série, příjmy, měření a týdny progresu.</p>}</dialog>;
}
