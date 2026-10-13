import { useEffect, useState } from 'react';
import { Download, LoaderCircle, MonitorSmartphone, RefreshCw } from 'lucide-react';
type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
export function DeviceSettings() {
  const [install, setInstall] = useState<InstallEvent | null>(null), [ready, setReady] = useState(false), [update, setUpdate] = useState<ServiceWorkerRegistration | null>(null), [busy, setBusy] = useState(false);
  useEffect(() => {
    const offer = (event: Event) => { event.preventDefault(); setInstall(event as InstallEvent); };
    window.addEventListener('beforeinstallprompt', offer);
    const offline = () => setReady(true);
    const available = (event: Event) => setUpdate((event as CustomEvent<ServiceWorkerRegistration>).detail);
    window.addEventListener('bb-offline-ready', offline); window.addEventListener('bb-update-ready', available);
    if (!import.meta.env.DEV && 'serviceWorker' in navigator) void navigator.serviceWorker.ready.then(registration => { setReady(true); if (registration.waiting) setUpdate(registration); });
    return () => { window.removeEventListener('beforeinstallprompt', offer); window.removeEventListener('bb-offline-ready', offline); window.removeEventListener('bb-update-ready', available); };
  },[]);
  return <section className="card form-card device-settings"><div className="section-head"><h3>Aplikace v zařízení</h3><MonitorSmartphone size={22}/></div><p>{ready ? 'Aplikaci lze otevřít bez internetu. Změny se ukládají v zařízení; přihlášení a synchronizace potřebují internet.' : import.meta.env.DEV ? 'Používáš místní vývojový náhled. Instalace a otevření bez internetu se zapnou v nasazené verzi.' : 'Připravujeme aplikaci pro další otevření bez internetu.'}</p>{install && <button className="button" disabled={busy} onClick={() => { setBusy(true); void install.prompt().then(() => install.userChoice).then(() => setInstall(null)).finally(() => setBusy(false)); }}>{busy ? <LoaderCircle size={16} className="loading-spin"/> : <Download size={16}/>} Přidat aplikaci na plochu</button>}{!install && <small>Možnost přidání na plochu najdeš také v nabídce prohlížeče.</small>}{update && <div className="update-available"><p>Je připravená nová verze aplikace.</p><button className="button secondary" onClick={() => { update.waiting?.postMessage({type:'SKIP_WAITING'}); navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), {once:true}); }}><RefreshCw size={16}/> Načíst novou verzi</button></div>}</section>;
}
