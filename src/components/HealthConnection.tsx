import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Copy, Footprints, LoaderCircle, Smartphone, Unplug } from 'lucide-react';
import type { Snapshot } from '../lib/repository';
import { supabase } from '../lib/sync';

type Connection = {id:string;expires_at:string;last_received_at:string|null;last_date:string|null;last_steps:number|null;sleep_allowed:boolean;last_sleep_date:string|null;last_sleep_minutes:number|null};
export function HealthConnection({snapshot,signIn,notify}:{snapshot:Snapshot;signIn:()=>void;notify:(message:string)=>void}) {
  const [connections,setConnections]=useState<Connection[]>([]),[key,setKey]=useState('');
  const [consent,setConsent]=useState(false),[includeSleep,setIncludeSleep]=useState(false),[keySleep,setKeySleep]=useState(false);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[guideStep,setGuideStep]=useState(0);
  const alive=useRef(true),userId=snapshot.user?.id;
  async function load() {
    if(!supabase||!userId)return;
    const {data,error}=await supabase.from('health_connections').select('id,expires_at,last_received_at,last_date,last_steps,sleep_allowed,last_sleep_date,last_sleep_minutes').eq('user_id',userId).is('revoked_at',null).order('created_at',{ascending:false});
    if(!alive.current)return;
    if(error){setError('Propojení hodinek teď není dostupné. Zkus to za chvíli znovu.');return;}
    setConnections((data as Connection[]).filter(c=>Date.parse(c.expires_at)>Date.now()));setError('');
  }
  useEffect(()=>{alive.current=true;void load();const timer=window.setInterval(()=>{if(document.visibilityState==='visible')void load();},20000);return()=>{alive.current=false;clearInterval(timer);};},[userId]);
  async function create() {
    if(!supabase||!consent||busy)return;setBusy(true);setError('');
    try {const {data,error}=await supabase.rpc('create_health_connection',{include_sleep:includeSleep});if(error)throw error;if(alive.current){setKey(data.connection_key);setKeySleep(data.sleep_allowed);setConsent(false);setIncludeSleep(false);await load();}}
    catch {if(alive.current)setError('Spojení se nepodařilo vytvořit. Zkontroluj připojení; nejvýš můžeš mít tři aktivní propojení.');}
    finally{if(alive.current)setBusy(false);}
  }
  async function revoke(id:string) {
    if(!supabase||busy)return;setBusy(true);
    try {const {error}=await supabase.rpc('revoke_step_connection',{connection_id:id});if(error)throw error;if(alive.current){setKey('');setKeySleep(false);await load();notify('Propojení bylo odpojeno. Zkratka už nemůže zapisovat data.');}}
    catch{if(alive.current)setError('Odpojení se nepodařilo. Zkus to znovu.');}
    finally{if(alive.current)setBusy(false);}
  }
  const base=import.meta.env.VITE_SUPABASE_URL || '';
  const endpoint=`${base}/rest/v1/rpc/submit_health_steps`,sleepEndpoint=`${base}/rest/v1/rpc/submit_health_sleep`;
  const apiKey=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';
  const copy=(value:string)=>{void navigator.clipboard.writeText(value).then(()=>notify('Zkopírováno.')).catch(()=>notify('Kopírování není dostupné. Označ text a zkopíruj ho ručně.'));};
  return <section className="card form-card health-settings">
    <div className="section-head"><h3>Hodinky: kroky a spánek</h3><Footprints size={20}/></div>
    <p className="health-intro">Hodinky Huawei předají data do Apple Zdraví. Přenos do Become Better pak spouští Zkratka na tvém iPhonu. Začni prvním krokem níže.</p>
    {connections.map(connection=><div className="health-status" key={connection.id}><Smartphone size={20}/><div>
      <strong>{connection.last_date ? `${(connection.last_steps || 0).toLocaleString('cs-CZ')} kroků · ${connection.last_date}` : 'Čeká na první přenos kroků'}</strong>
      {connection.sleep_allowed && <small>{connection.last_sleep_date ? `Spánek ${Math.floor((connection.last_sleep_minutes || 0)/60)} h ${(connection.last_sleep_minutes || 0)%60} min · ${connection.last_sleep_date}` : 'Spánek: čeká na první přenos'}</small>}
      <small>{connection.last_received_at ? `Poslední přenos ${new Date(connection.last_received_at).toLocaleString('cs-CZ')}` : 'Samotné vytvoření klíče ještě data nepřenáší.'}</small>
      {!connection.sleep_allowed && <small>Toto propojení zapisuje pouze kroky. Pro spánek vytvoř nové s povolením níže.</small>}
    </div><button className="text-button" disabled={busy} onClick={()=>void revoke(connection.id)}><Unplug size={16}/> Odpojit</button></div>)}
    {error && <p className="error-message" role="alert">{error}</p>}
    <div className="health-walkthrough"><small className="eyebrow">KROK {guideStep+1} ZE 3 · NASTAVENÍ NA IPHONU</small>
      {guideStep===0 && <><h4>Povol přenos z Huawei do Apple Zdraví</h4><ol>
        <li>Otevři <strong>Apple Zdraví</strong> — bílá ikona s červeným srdcem.</li>
        <li>Klepni nahoře na svou <strong>fotku nebo kolečko</strong>. V části Soukromí otevři <strong>Aplikace / Aplikace a služby → Huawei Zdraví</strong> (někdy Huawei Health: Europe).</li>
        <li>U <strong>povolení zápisu</strong> zapni <strong>Kroky</strong> a <strong>Spánek</strong>, pokud jsou dostupné. Další povolení, která používáš, můžeš nechat zapnutá.</li>
      </ol><p>Názvy položek se mohou podle verze iOS lišit. Pokud Huawei nebo Spánek chybí, tento krok zatím nepotvrzuj.</p></>}
      {guideStep===1 && <><h4>Ověř, že se data z hodinek skutečně přenesla</h4><ol>
        <li>Otevři <strong>Huawei Zdraví</strong> a nech hodinky dosynchronizovat.</li>
        <li>V Apple Zdraví otevři <strong>Procházet → Aktivita → Kroky</strong> a potom <strong>Procházet → Spánek</strong>.</li>
        <li>Zkontroluj dnešní kroky a poslední noc. Dole v <strong>Zdroje dat a přístup</strong> ověř, že mezi zdroji je Huawei.</li>
      </ol><p>Zapnuté přepínače znamenají povolení. Až skutečné záznamy potvrzují přenos. Pokud něco nesedí, pokračování počká.</p></>}
      {guideStep===2 && <><h4>Připrav přenos do svého účtu</h4>
        <p>Ve Zkratkách potřebuješ vlastní povolení ke <strong>čtení</strong>. V Apple Zdraví otevři profil → Aplikace / Aplikace a služby → <strong>Zkratky</strong> a povol čtení Kroků a Spánku. Tato povolení jsou samostatná od Huawei.</p>
        <p>Pokud hláška říká „přístup ke krokům je vypnutý“, zkontroluj právě povolení pro Zkratky. Jestli se Zkratky ještě nezobrazují, přidej a spusť akci „Najít zdravotní vzorky“, potom znovu zkontroluj povolení ve Zdraví.</p>
        <p>Pro načtení údajů z hodinek používej akci <strong>Najít vzorky zdravotních dat</strong>. Akce „Zaznamenat vzorek“ vytváří nový záznam ve Zdraví.</p>
        {!userId ? <button className="button secondary" onClick={signIn}><Smartphone size={17}/> Přihlásit se a pokračovat</button> : <>
          {!key && <><label className="checkbox-field health-consent"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/> Chci do svého účtu posílat datum a počet kroků.</label>
            <label className="checkbox-field health-consent"><input type="checkbox" checked={includeSleep} onChange={e=>setIncludeSleep(e.target.checked)}/> Chci také posílat délku spánku.</label>
            <button className="button secondary" disabled={!consent||busy||connections.length>=3||!supabase} onClick={()=>void create()}>{busy?<LoaderCircle size={17} className="loading-spin"/>:<Smartphone size={17}/>} Připravit propojení</button></>}
          {key && <div className="health-setup"><h4><Check size={17}/> Přístup pro Zkratku je připravený</h4>
            <p>Klíč dovoluje zapisovat {keySleep?'kroky a délku spánku':'kroky'}. Ukáže se pouze teď. Patří do tvé Zkratky; neposílej ho do chatu.</p>
            {[{label:'Adresa pro kroky',value:endpoint},...(keySleep?[{label:'Adresa pro spánek',value:sleepEndpoint}]:[]),{label:'Hlavička apikey',value:apiKey},{label:'connection_key',value:key}].map(field=><label className="field health-copy" key={field.label}><span>{field.label}</span><div><input aria-label={field.label} value={field.value} readOnly/><button className="icon-button" aria-label={`Kopírovat ${field.label}`} onClick={()=>copy(field.value)}><Copy size={18}/></button></div></label>)}
          </div>}
        </>}
        <p>Zkratka se musí nejdřív jednou nastavit a otestovat. Dokud karta nahoře neukáže přijatá data, přenos do Become Better ještě není ověřený.</p>
        <details className="health-guide"><summary>Technické údaje pro nastavení Zkratky</summary>
          <p>Požadavky jsou POST s hlavičkami apikey a Content-Type: application/json. Pro kroky obsahuje JSON connection_key, day (yyyy-MM-dd), step_count (dnešní celkový počet jako číslo) a source (Apple Zdraví). Vyber jeden zdroj, aby se nepřičítaly překrývající se kroky z telefonu a hodinek.</p>
          <p>Pro spánek použij druhou adresu, JSON connection_key, day (datum probuzení), sleep_minutes (celkový skutečně prospalý čas v minutách jako číslo) a source (Apple Zdraví). Nezapočítej bdění ani pouhý čas v posteli. Překrývající se intervaly a souhrn vedle fází se nesmí sečíst dvakrát. Výsledek nejdřív porovnej s Apple Zdraví.</p>
          <p>Pokud data nejsou dostupná nebo oprávnění chybí, přenos vynech. Neposílej místo nich nulu. Automatizaci nastav po opuštění Huawei Zdraví při odemčeném telefonu; v pevný noční čas mohou být zdravotní data uzamčená.</p>
        </details>
      </>}
      <div className="health-guide-actions">{guideStep>0 && <button className="button secondary" onClick={()=>setGuideStep(guideStep-1)}><ArrowLeft size={16}/> Zpět</button>}
        {guideStep<2 && <button className="button secondary" onClick={()=>setGuideStep(guideStep+1)}>{guideStep===0?'Povolení jsou nastavená':'Data v Apple Zdraví sedí'}<ArrowRight size={16}/></button>}
      </div>
    </div>
  </section>;
}
