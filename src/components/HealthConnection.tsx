import { useEffect, useRef, useState } from 'react';
import { Check, Copy, Footprints, LoaderCircle, Smartphone, Unplug } from 'lucide-react';
import type { Snapshot } from '../lib/repository';
import { supabase } from '../lib/sync';

type Connection = { id:string; created_at:string; expires_at:string; last_received_at:string|null; last_date:string|null; last_steps:number|null };
export function HealthConnection({snapshot,signIn,notify}:{snapshot:Snapshot;signIn:()=>void;notify:(message:string)=>void}) {
  const [connections,setConnections]=useState<Connection[]>([]),[key,setKey]=useState(''),[consent,setConsent]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const alive=useRef(true),userId=snapshot.user?.id;
  async function load() {
    if(!supabase||!userId)return;
    const {data,error}=await supabase.from('health_connections').select('id,created_at,expires_at,last_received_at,last_date,last_steps').eq('user_id',userId).is('revoked_at',null).order('created_at',{ascending:false});
    if(!alive.current)return;
    if(error){setError('Propojení kroků teď není dostupné. Zkus to za chvíli znovu.');return;}
    setConnections((data as Connection[]).filter(c=>Date.parse(c.expires_at)>Date.now()));setError('');
  }
  useEffect(()=>{alive.current=true;void load();const timer=window.setInterval(()=>{if(document.visibilityState==='visible')void load();},20000);return()=>{alive.current=false;clearInterval(timer);};},[userId]);
  async function create() {
    if(!supabase||!consent||busy)return;setBusy(true);setError('');
    try {const {data,error}=await supabase.rpc('create_step_connection');if(error)throw error;if(alive.current){setKey(data.connection_key);setConsent(false);await load();}}
    catch {if(alive.current)setError('Spojení se nepodařilo vytvořit. Zkontroluj připojení; nejvýš můžeš mít tři aktivní propojení.');}
    finally{if(alive.current)setBusy(false);}
  }
  async function revoke(id:string) {
    if(!supabase||busy)return;setBusy(true);
    try {const {error}=await supabase.rpc('revoke_step_connection',{connection_id:id});if(error)throw error;if(alive.current){setKey('');await load();notify('Propojení bylo odpojeno. Zkratka už nemůže zapisovat kroky.');}}
    catch{if(alive.current)setError('Odpojení se nepodařilo. Zkus to znovu.');}
    finally{if(alive.current)setBusy(false);}
  }
  const endpoint=`${import.meta.env.VITE_SUPABASE_URL || ''}/rest/v1/rpc/submit_health_steps`;
  const apiKey=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';
  const copy=(value:string)=>{void navigator.clipboard.writeText(value).then(()=>notify('Zkopírováno.')).catch(()=>notify('Kopírování není dostupné. Označ text a zkopíruj ho ručně.'));};
  return <section className="card form-card health-settings"><div className="section-head"><h3>Kroky z iPhonu</h3><Footprints size={20}/></div><p className="health-intro">Huawei Zdraví → Apple Zdraví → Zkratka → Become Better. Propojení jednou nastavíš na iPhonu; kroky se pak ukládají do stejného účtu jako na PC.</p>
    {!userId ? <button className="button secondary" onClick={signIn}><Smartphone size={17}/> Přihlásit se a propojit kroky</button> : <>
      {connections.map(connection=><div className="health-status" key={connection.id}><Smartphone size={20}/><div><strong>{connection.last_received_at ? `${(connection.last_steps || 0).toLocaleString('cs-CZ')} kroků · ${connection.last_date}` : 'Čeká na první přenos z iPhonu'}</strong><small>{connection.last_received_at ? `Poslední přenos ${new Date(connection.last_received_at).toLocaleString('cs-CZ')}` : 'Klíč je vytvořený. Dokonči Zkratku podle návodu níže.'}</small></div><button className="text-button" disabled={busy} onClick={()=>void revoke(connection.id)}><Unplug size={16}/> Odpojit</button></div>)}
      {!key && <><label className="checkbox-field health-consent"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/> Chci do svého účtu posílat datum a počet kroků z iPhonu.</label><button className="button secondary" disabled={!consent||busy||connections.length>=3||!supabase} onClick={()=>void create()}>{busy?<LoaderCircle size={17} className="loading-spin"/>:<Smartphone size={17}/>} Připravit propojení</button></>}
      {key && <div className="health-setup"><h4><Check size={17}/> Přístup pro Zkratku je připravený</h4><p>Klíč umožňuje jen zapisovat kroky. Neukazuje záznamy, fotky ani přihlašovací heslo. Ukáže se pouze teď; zkopíruj ho do své Zkratky.</p>{[{label:'URL pro Zkratku',value:endpoint},{label:'Hlavička apikey',value:apiKey},{label:'connection_key',value:key}].map(field=><label className="field health-copy" key={field.label}><span>{field.label}</span><div><input aria-label={field.label} value={field.value} readOnly/><button className="icon-button" aria-label={`Kopírovat ${field.label}`} onClick={()=>copy(field.value)}><Copy size={18}/></button></div></label>)}</div>}
    </>}
    {error && <p className="error-message" role="alert">{error}</p>}
    <details className="health-guide"><summary>Jak propojení jednou nastavit</summary><ol>
      <li>V Apple Zdraví otevři <strong>Sdílení → Aplikace a služby → Huawei Zdraví</strong> a povol kroky. V <strong>Procházet → Aktivita → Kroky → Zdroje dat a přístup</strong> ověř, že jsou data z Huawei dostupná. Názvy se mohou podle verze lišit.</li>
      <li>V aplikaci <strong>Zkratky</strong> vytvoř Zkratku „Kroky do Become Better“. Přidej <strong>Najít vzorky zdravotních dat / Find Health Samples</strong>: typ Kroky, datum dnes, jeden zdroj — Huawei Zdraví, případně iPhone. Nepřičítej telefon a hodinky dohromady; překrývající se vzorky by se započítaly dvakrát.</li>
      <li>Získej hodnoty vzorků a spočítej jejich <strong>součet</strong>. Je to celkový počet za den, nikoli přírůstek. Datum naformátuj jako <strong>yyyy-MM-dd</strong>.</li>
      <li>Přidej <strong>Získat obsah URL / Get Contents of URL</strong>. Použij URL výše, metodu <strong>POST</strong>, hlavičku <strong>apikey</strong> s hodnotou výše a <strong>Content-Type: application/json</strong>.</li>
      <li>Tělo JSON má čtyři položky: <strong>connection_key</strong> = tvůj klíč, <strong>day</strong> = naformátované datum, <strong>step_count</strong> = součet jako číslo, <strong>source</strong> = Apple Zdraví. Pokud nejsou vzorky dostupné, požadavek neposílej.</li>
      <li>Spusť Zkratku ručně a povol čtení kroků a přístup na Supabase. V této kartě se po skutečném přenosu ukáže počet kroků. Porovnej ho s vybraným zdrojem v Apple Zdraví.</li>
      <li>Ve Zkratkách přidej automatizaci <strong>Denní čas</strong>, například 23:55, a zvol <strong>Spustit okamžitě / bez dotazu</strong>. Odesílá se počet k okamžiku spuštění; potřebuješ internet a dostupná zdravotní data.</li>
    </ol><p>Web si z Apple Zdraví data sám číst neumí. Přenos spouští tvůj iPhone. Propojení kdykoli odpojíš tlačítkem výše; ručně uložené kalorie, spánek a poznámky zůstávají zachované.</p></details>
  </section>;
}
