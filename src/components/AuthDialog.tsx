import { useEffect, useRef, useState } from 'react';
import { ArrowRight, CheckCircle2, Eye, EyeOff, LoaderCircle, LockKeyhole, X } from 'lucide-react';
import type { AuthMode } from '../lib/auth';
import { authError, executeAuth, validateAuth } from '../lib/auth';
import { authSignal, supabase } from '../lib/sync';

export function AuthDialog({ initial, close }: { initial: AuthMode; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null), mounted = useRef(true);
  const [mode, setMode] = useState(initial), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState(''), [email, setEmail] = useState(''), [visible, setVisible] = useState(false);
  useEffect(() => { mounted.current = true; dialog.current?.showModal(); return () => { mounted.current = false; }; }, []);
  const change = (next: AuthMode) => { setMode(next); setError(''); setNotice(''); setVisible(false); };
  const titles = { signin: 'Vítej zpátky.', signup: 'Začni svou cestu.', reset: 'Nový začátek.', update: 'Nastav nové heslo.' };
  return <dialog ref={dialog} className="dialog auth-dialog" onCancel={e => { e.preventDefault(); if (!busy) close(); }} aria-labelledby="auth-title">
    <div className="auth-brand"><span className="eyebrow">BECOME BETTER</span><h2>BETTER<br/>THAN<br/>YESTERDAY<span>.</span></h2><p>Tvůj trénink. Tvůj rytmus.<br/>Tvůj progres, kamkoli jdeš.</p><div className="auth-brand-line"/><small>ONE STEP. EVERY DAY.</small></div>
    <div className="auth-form"><button className="icon-button auth-close" aria-label="Zavřít přihlášení" disabled={busy} onClick={close}><X size={21}/></button><span className="auth-lock"><LockKeyhole size={23}/></span><h2 id="auth-title">{titles[mode]}</h2><p>{mode === 'signup' ? 'Jeden účet pro tvoje záznamy na PC i mobilu.' : mode === 'signin' ? 'Pokračuj tam, kde jsi skončil.' : 'Heslo k tvému účtu Become Better.'}</p>
      {(mode === 'signin' || mode === 'signup') && <div className="segmented auth-tabs"><button type="button" className={mode === 'signin' ? 'selected' : ''} disabled={busy} onClick={() => change('signin')}>Přihlášení</button><button type="button" className={mode === 'signup' ? 'selected' : ''} disabled={busy} onClick={() => change('signup')}>Registrace</button></div>}
      {!supabase && <div className="auth-status"><strong>Přihlášení ještě není aktivované.</strong><p>Zatím můžeš používat místní režim. Propojení účtů připravujeme.</p></div>}
      {notice ? <div className="auth-success" role="status"><CheckCircle2 size={25}/><h3>Zkontroluj svůj e-mail.</h3><p>{notice}</p><button className="button secondary" onClick={() => change('signin')}>Zpět na přihlášení</button></div> : <form key={mode} onSubmit={e => {
        e.preventDefault(); if (!supabase || busy) return;
        const form = new FormData(e.currentTarget); let input;
        try { input = validateAuth(mode, { email, password: String(form.get('password') || ''), confirmation: String(form.get('confirmation') || ''), name: String(form.get('name') || '') }); }
        catch (e) { setError(e instanceof Error ? e.message : 'Zkontroluj zadané údaje.'); return; }
        setBusy(true); setError('');
        const redirectTo = window.location.origin + window.location.pathname;
        void (async () => {
          try {
            const result = await executeAuth(supabase.auth,mode,input,redirectTo);
            if (mode === 'update') authSignal.set({ recovery: false });
            if (mounted.current) {
              if (result.signedIn) close();
              else setNotice(mode === 'signup' ? 'Pokud je adresa pro registraci dostupná, pošleme ti potvrzení. Po potvrzení se přihlas ke stejnému účtu i na druhém zařízení.' : 'Pokud k adrese patří účet, najdeš v poště odkaz pro nastavení nového hesla.');
            }
          } catch (e) { if (mounted.current) setError(authError(e as { message?: string; code?: string; status?: number })); }
          finally { if (mounted.current) setBusy(false); }
        })();
      }}>
        {mode === 'signup' && <label className="field"><span>Jak tě máme oslovovat?</span><input name="name" autoComplete="given-name" maxLength={80} required disabled={busy}/></label>}
        {mode !== 'update' && <label className="field"><span>E-mail</span><input type="email" name="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} maxLength={254} required disabled={busy} placeholder="tvuj@email.cz"/></label>}
        {mode !== 'reset' && <label className="field"><span>Heslo</span><div className="password-field"><input type={visible ? 'text' : 'password'} name="password" aria-label="Heslo" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} minLength={mode === 'signin' ? undefined : 8} required disabled={busy}/><button type="button" className="icon-button" aria-label={visible ? 'Skrýt heslo' : 'Ukázat heslo'} disabled={busy} onClick={() => setVisible(!visible)}>{visible ? <EyeOff size={18}/> : <Eye size={18}/>}</button></div></label>}
        {(mode === 'signup' || mode === 'update') && <><label className="field"><span>Heslo ještě jednou</span><input type={visible ? 'text' : 'password'} name="confirmation" autoComplete="new-password" minLength={8} required disabled={busy}/></label><small className="subtle">Alespoň 8 znaků.</small></>}
        {error && <p className="error-message" role="alert">{error}</p>}
        <button type="submit" className="button full-width" disabled={busy || !supabase}>{busy ? <><LoaderCircle size={17} className="loading-spin"/> Chvilku strpení…</> : <>{mode === 'signin' ? 'Přihlásit se' : mode === 'signup' ? 'Vytvořit účet' : mode === 'reset' ? 'Poslat odkaz pro obnovu' : 'Uložit nové heslo'} <ArrowRight size={17}/></>}</button>
        {mode === 'signin' && <button type="button" className="text-button auth-reset" disabled={busy} onClick={() => change('reset')}>Zapomněl jsem heslo</button>}
        {mode === 'reset' && <button type="button" className="text-button" disabled={busy} onClick={() => change('signin')}>Zpět na přihlášení</button>}
      </form>}
    </div>
  </dialog>;
}
