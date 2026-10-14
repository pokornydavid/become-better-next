import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { ArrowDownRight, ArrowLeft, ArrowRight, ArrowUpRight, BookOpen, Check, ChevronDown, ChevronLeft, ChevronRight, CircleCheck, Cloud, CloudOff, Dumbbell, LoaderCircle, Flame, Footprints, LayoutGrid, Moon, MoreHorizontal, Pause, Play, Plus, RotateCcw, Search, Settings2, Timer, Trash2, TrendingUp, Upload, Utensils, X, Zap } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { catalog, templates } from './lib/catalog';
import { addDays, dateKey, displayDate, num, recordsOf, sleepHours, isCardio, text, volume, weekDates } from './lib/model';
import type { DataRecord, Value } from './lib/model';
import { repository, authSignal } from './lib/sync';
import { ProgressPhotos } from './components/ProgressPhotos';
import { ExercisePicker } from './components/ExercisePicker';
import { CoachWorkspace } from './components/CoachWorkspace';
import { personalBests } from './lib/exercises';
import { Users, ChevronUp } from 'lucide-react';
import { moveExercise, workoutExercises } from './lib/exercises';
import { defaultGoals, nutritionGoals } from './lib/nutrition';
import { WeeklyNutrition } from './components/WeeklyNutrition';
import { trackerPreferences } from './lib/preferences';
import type { AuthMode } from './lib/auth';
import { AuthDialog } from './components/AuthDialog';
import { AccountSettings } from './components/AccountSettings';
import { TrackingSettings } from './components/TrackingSettings';
import { DeviceSettings } from './components/DeviceSettings';
import { ImportBackupDialog } from './components/ImportBackupDialog';
import { HealthConnection } from './components/HealthConnection';

type View = 'overview' | 'training' | 'nutrition' | 'recovery' | 'progress' | 'library' | 'profile' | 'coaching';
type Modal = 'templates' | 'exercises' | 'measurement' | 'custom' | 'deleteWorkout' | 'clearDemo' | 'import' | null;
const navigation: { view: View; label: string; icon: LucideIcon }[] = [
  { view: 'overview', label: 'Přehled', icon: LayoutGrid },
  { view: 'training', label: 'Trénink', icon: Dumbbell },
  { view: 'nutrition', label: 'Výživa', icon: Utensils },
  { view: 'recovery', label: 'Regenerace', icon: Moon },
  { view: 'progress', label: 'Progres', icon: TrendingUp },
];
const number = (n: number, digits = 0) => new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: digits }).format(n);
function currentView(): View {
  const candidate = window.location.hash.slice(1);
  return ['overview', 'training', 'nutrition', 'recovery', 'progress', 'library', 'profile', 'coaching'].includes(candidate) ? candidate as View : 'overview';
}
function Button({ children, onClick, secondary = false, className = '', disabled = false, type = 'button' }: { children: ReactNode; onClick?: () => void; secondary?: boolean; className?: string; disabled?: boolean; type?: 'button' | 'submit' }) {
  return <button type={type} className={`button ${secondary ? 'secondary' : ''} ${className}`} onClick={onClick} disabled={disabled}>{children}</button>;
}
function IconButton({ icon: Icon, label, onClick, className = '', disabled = false }: { icon: LucideIcon; label: string; onClick: () => void; className?: string; disabled?: boolean }) {
  return <button className={`icon-button ${className}`} aria-label={label} title={label} onClick={onClick} disabled={disabled}><Icon size={18} /></button>;
}
function NumericInput({ value, onCommit, label, min = 0, max, step = 1, className = '' }: { value: Value | undefined; onCommit: (n: number | null) => void; label: string; min?: number; max?: number; step?: number; className?: string }) {
  const [draft, setDraft] = useState(value == null ? '' : String(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => { if (!focused) setDraft(value == null ? '' : String(value)); }, [value, focused]);
  return <input aria-label={label} className={className} type="number" inputMode="decimal" min={min} max={max} step={step} value={draft} onFocus={() => setFocused(true)} onChange={e => setDraft(e.target.value)} onBlur={() => { setFocused(false); const n = draft === '' ? null : Number(draft); if (n !== null && (!Number.isFinite(n) || n < min || (max !== undefined && n > max))) { setDraft(value == null ? '' : String(value)); return; } if (n !== value) onCommit(n); }} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} />;
}
function EditableName({value,label,save}:{value:string;label:string;save:(value:string)=>void}) {
  const [draft,setDraft]=useState(value),[focused,setFocused]=useState(false);
  useEffect(()=>{if(!focused)setDraft(value);},[value,focused]);
  return <input className="exercise-name" aria-label={label} value={draft} maxLength={120} onFocus={()=>setFocused(true)} onChange={e=>setDraft(e.target.value)} onBlur={()=>{setFocused(false);const name=draft.trim();if(name){if(name!==value)save(name);}else setDraft(value);}} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();}}/>;
}
function Dialog({ title, children, close }: { title: string; children: ReactNode; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); ref.current?.querySelector<HTMLInputElement>('input')?.focus(); }, []);
  return <dialog ref={ref} className="dialog" onCancel={e => { e.preventDefault(); close(); }} onClick={e => { if (e.target === ref.current) close(); }}><div className="dialog-head"><h2>{title}</h2><IconButton icon={X} label="Zavřít" onClick={close} /></div>{children}</dialog>;
}
function Sparkline({ values, height = 130, labels = false }: { values: number[]; height?: number; labels?: boolean }) {
  if (!values.length) return <div className="chart-empty">První záznam je začátek tvého progresu.</div>;
  const low = Math.min(...values) - .5, high = Math.max(...values) + .5, width = 560;
  const points = values.map((v, i) => [20 + i / Math.max(values.length - 1, 1) * (width - 40), 15 + (high - v) / (high - low) * (height - 40)]);
  const d = points.map(([x, y], i) => `${i ? 'L' : 'M'}${x},${y}`).join(' ');
  return <svg className="sparkline" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Vývoj váhy: ${values.map(v => `${v} kg`).join(', ')}`}>
    {[20, height / 2, height - 20].map(y => <line key={y} x1="20" x2={width - 20} y1={y} y2={y} stroke="currentColor" opacity=".09" strokeDasharray="3 5" />)}
    <path d={`${d} L${points.at(-1)![0]},${height - 15} L20,${height - 15} Z`} fill="currentColor" opacity=".04" />
    <path d={d} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    {points.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={i === values.length - 1 ? 5 : 3} fill="currentColor" />)}
    {labels && <><text x="20" y={height - 1} className="chart-label">ZAČÁTEK</text><text x={width - 20} y={height - 1} textAnchor="end" className="chart-label">TEĎ</text></>}
  </svg>;
}

export function App() {
  const snapshot = useSyncExternalStore(repository.subscribe, repository.getSnapshot);
  const { store, user, status, configured } = snapshot;
  const [view, setView] = useState<View>(currentView);
  const [selectedDate, setSelectedDate] = useState(dateKey());
  const [selectedWorkout, setSelectedWorkout] = useState('');
  const [modal, setModal] = useState<Modal>(null);
  const [toast, setToast] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('Vše');
  const [restDeadline, setRestDeadline] = useState(0);
  const [restPaused, setRestPaused] = useState<number | null>(null);
  const [clock, setClock] = useState(Date.now());
  const authState = useSyncExternalStore(authSignal.subscribe,authSignal.getSnapshot);
  const [authMode,setAuthMode] = useState<AuthMode|null>(null);
  const preferences = trackerPreferences(store);
  const visibleNavigation = navigation.filter(item => item.view === 'overview' || preferences[item.view as 'training'|'nutrition'|'recovery'|'progress']);
  const [showRpe, setShowRpe] = useState(false);
  const [progressTab,setProgressTab] = useState<'photos'|'numbers'>('photos');
  const goals = { ...defaultGoals, ...nutritionGoals(store,view === 'profile' ? undefined : selectedDate), name: store.records.goals && !store.records.goals.deleted && typeof store.records.goals.payload.name === 'string' ? text(store.records.goals.payload.name) : user?.displayName || '' };
  const daily = store.records[`daily-${selectedDate}`]?.payload || {};
  const workouts = recordsOf(store, 'workout').sort((a, b) => text(b.payload.date).localeCompare(text(a.payload.date)));
  const todaysWorkouts = workouts.filter(w => w.payload.date === selectedDate);
  const workout = todaysWorkouts.find(w => w.id === selectedWorkout) || todaysWorkouts[0];
  const exercises = workoutExercises(store, workout?.id);
  const allSets = recordsOf(store, 'set');
  const exerciseSets = (id: string) => allSets.filter(s => s.payload.exerciseId === id).sort((a, b) => num(a.payload.order) - num(b.payload.order));
  const workoutSets = exercises.flatMap(e => exerciseSets(e.id));
  const week = weekDates(selectedDate);
  const weeklyWorkouts = workouts.filter(w => week.includes(text(w.payload.date)) && w.payload.status === 'completed');
  const measurements = recordsOf(store, 'measurement').sort((a, b) => text(a.payload.date).localeCompare(text(b.payload.date)));
  const weights = measurements.map(m => num(m.payload.weight)).filter(Boolean);
  const library = [...catalog, ...recordsOf(store, 'library').map(r => ({ id: r.id, name: text(r.payload.name), muscle: text(r.payload.muscle), equipment: text(r.payload.equipment), cue: text(r.payload.cue) }))];
  const filteredLibrary = library.filter(e => (filter === 'Vše' || e.muscle === filter) && `${e.name} ${e.muscle}`.toLowerCase().includes(search.toLowerCase()));
  const hours = sleepHours(text(daily.bedTime), text(daily.wakeTime));
  const restSeconds = restPaused ?? Math.max(0, Math.ceil((restDeadline - clock) / 1000));

  useEffect(() => { document.documentElement.dataset.theme = preferences.theme; }, [preferences.theme]);
  useEffect(() => { if (authState.recovery) setAuthMode('update'); }, [authState.recovery]);
  useEffect(() => { if ((view === 'library' && !preferences.training) || (['training','nutrition','recovery','progress'].includes(view) && !preferences[view as 'training'|'nutrition'|'recovery'|'progress'])) navigate('overview'); }, [view,preferences.training,preferences.nutrition,preferences.recovery,preferences.progress]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 4500); return () => clearTimeout(t); }, [toast]);
  useEffect(() => { const t = setInterval(() => setClock(Date.now()), 1000); return () => clearInterval(t); }, []);
  useEffect(() => { setSelectedWorkout(''); setRestDeadline(0); setRestPaused(null); }, [user?.id]);
  useEffect(() => { const change = () => { setView(currentView()); window.scrollTo({ top: 0 }); }; window.addEventListener('hashchange', change); return () => window.removeEventListener('hashchange', change); }, []);
  function safely(action: () => void) { try { action(); } catch (e) { setToast(e instanceof Error ? e.message : 'Změnu se nepodařilo uložit.'); } }
  function navigate(next: View, progressSection?: 'photos'|'numbers') { if(next === 'progress' && progressSection) setProgressTab(progressSection); if (currentView() !== next) window.location.hash = next; setView(next); setSearch(''); setFilter('Vše'); window.scrollTo({ top: 0, behavior: 'instant' }); }
  const patchDaily = (key: string, value: Value) => safely(() => { repository.patch(`daily-${selectedDate}`, 'daily', { date: selectedDate, [key]: value }); });
  const patchGoal = (key: string, value: Value) => safely(() => { repository.patch('goals', 'goals', { [key]: value }); });
  function addExercise(item: typeof library[number], workoutId = workout?.id) {
    if (!workoutId) return;
    safely(() => {
      const order = recordsOf(repository.getSnapshot().store, 'exercise').filter(e => e.payload.workoutId === workoutId).length;
      const id = repository.add('exercise', { workoutId, name: item.name, muscle: item.muscle, catalogId: item.id, order });
      for (let i = 0; i < 3; i++) repository.add('set', { exerciseId: id, weight: null, reps: 10, done: false, order: i, rpe: null });
      setToast(`${item.name} přidán do tréninku.`);
    });
  }
  function createWorkout(template?: typeof templates[number]) {
    safely(() => {
      const id = repository.add('workout', { name: template?.name || 'Vlastní trénink', date: selectedDate, status: 'planned', duration: 0, notes: '', template: template?.id || '' });
      template?.exercises.forEach(key => { const item = catalog.find(e => e.id === key); if (item) addExercise(item, id); });
      setSelectedWorkout(id); setModal(null); navigate('training'); setToast('Trénink je připravený.');
    });
  }
  function startWorkout() {
    if (!workout) { setModal('templates'); return; }
    safely(() => {
      if (workout.payload.status !== 'active') repository.patch(workout.id, 'workout', { status: 'active', startedAt: Date.now() });
      navigate('training');
    });
  }
  function finishWorkout() {
    if (!workout) return;
    if (!workoutSets.some(set => set.payload.done)) { setToast('Nejdřív označ alespoň jednu odcvičenou sérii.'); return; }
    safely(() => {
      const duration = workout.payload.startedAt ? Math.max(1, Math.round((Date.now() - num(workout.payload.startedAt)) / 60000)) : num(workout.payload.duration);
      repository.patch(workout.id, 'workout', { status: 'completed', duration }); setRestDeadline(0); setRestPaused(null); setToast('Hotovo. Další krok směrem k lepší verzi sebe.');
    });
  }
  function removeWorkout() {
    if (!workout) return;
    safely(() => { repository.remove([workout.id, ...exercises.map(e => e.id), ...workoutSets.map(s => s.id)]); setModal(null); setSelectedWorkout(''); setToast('Trénink byl odstraněn.'); });
  }
  function copyWorkout() {
    if (!workout) return;
    safely(() => {
      const id = repository.add('workout', { ...workout.payload, date: addDays(selectedDate, 7), status: 'planned', duration: 0, startedAt: null });
      exercises.forEach(e => {
        const exerciseId = repository.add('exercise', { ...e.payload, workoutId: id });
        exerciseSets(e.id).forEach(s => repository.add('set', { ...s.payload, exerciseId, done: false }));
      });
      setToast(`Trénink zkopírován na ${displayDate(addDays(selectedDate, 7))}.`);
    });
  }
  function exportBackup() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(repository.exportBackup(), null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = `become-better-next-${dateKey()}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); setToast('Záloha je stažená.');
  }
  const syncLabel = !user ? (store.demo ? 'Místní ukázka' : 'Uloženo v zařízení') : status === 'synced' ? 'Synchronizováno' : status === 'syncing' ? `Synchronizuji${store.pending.length ? ` · ${store.pending.length}` : ''}` : status === 'offline' ? 'Offline · uloženo v zařízení' : 'Čeká na synchronizaci';
  const pageTitles: Record<View, [string, string]> = {
    overview: ['PŘEHLED DNE', `Jdeme na to${text(goals.name) ? `, ${text(goals.name)}` : ''}.`],
    training: ['TRÉNINK', 'Tvůj trénink'], nutrition: ['VÝŽIVA', 'Denní příjem'],
    recovery: ['REGENERACE', 'Spánek a návyky'], progress: ['PROGRES', progressTab === 'photos' ? 'Fotky a fáze' : 'Váha a měření'],
    coaching: ['SPOLUPRÁCE', 'Trenéři a klienti'], library: ['CVIKY', 'Knihovna cviků'], profile: ['TVŮJ ÚČET A CÍLE', 'Nastavení'],
  };

  const pageHelp: Record<View,string> = {
    overview: 'Vyber den a zapiš, co potřebuješ. Změny se ukládají průběžně.',
    training: 'Pojmenuj si cviky po svém, zapiš série a označ je jako hotové.',
    nutrition: 'Zapiš svůj příjem. Níže uvidíš uložené cíle a rozpočet na celý týden.',
    recovery: 'Zapiš spánek a návyky, které chceš sledovat.',
    progress: 'Vyber dietní nebo objemovou fázi a ukládej fotky do jednotlivých týdnů.',
    coaching: 'Vyber klienta nebo se připoj ke svému trenérovi.',
    library: 'Volitelná inspirace. V tréninku můžeš používat vlastní názvy cviků.',
    profile: 'Účet, propojení zařízení, denní cíle a oblasti, které chceš sledovat.',
  };
  if (!authState.ready) return <div className="app-loading" role="status"><div className="loading-brand">BECOME<br/>BETTER.</div><LoaderCircle size={28} className="loading-spin"/><p>Načítám tvůj účet…</p></div>;
  return <div className="app-shell">
    <aside className="sidebar">
      <button className="brand" onClick={() => navigate('overview')} aria-label="Become Better — přehled"><span className="brand-mark">b<span>b</span></span><span>BECOME<br/>BETTER<span className="brand-period">.</span></span></button>
      <div className="sidebar-caption">MAKE IT COUNT.</div>
      <nav aria-label="Hlavní navigace">{visibleNavigation.map(({ view: next, label, icon: Icon }) => <button key={next} className={`nav-item ${view === next ? 'active' : ''}`} aria-current={view === next ? 'page' : undefined} onClick={() => navigate(next)}><Icon size={19}/><span>{label}</span>{view === next && <span className="nav-dot"/>}</button>)}</nav>
      <div className="sidebar-divider"/>
      <button className={`nav-item ${view === 'coaching' ? 'active' : ''}`} onClick={() => navigate('coaching')}><Users size={19}/><span>Trenéři & klienti</span></button>
      {preferences.training && <button className={`nav-item ${view === 'library' ? 'active' : ''}`} onClick={() => navigate('library')}><BookOpen size={19}/><span>Knihovna cviků</span></button>}
      <button className={`nav-item ${view === 'profile' ? 'active' : ''}`} onClick={() => navigate('profile')}><Settings2 size={19}/><span>Nastavení</span></button>
      <div className="sidebar-bottom"><div className="sidebar-manifesto">BETTER<br/>THAN<br/><span>YESTERDAY.</span></div><button className="sidebar-user" onClick={() => navigate('profile')}><span className="avatar">{(text(goals.name) || user?.email || 'BB').slice(0, 2).toUpperCase()}</span><span><strong>{user?.email || 'Tvůj prostor'}</strong><small>{user ? 'Osobní účet' : 'Místní režim'}</small></span><MoreHorizontal size={18}/></button></div>
    </aside>
    <div className="main-shell">
      <header className="topbar"><span className="topbar-path">BECOME BETTER <span>/</span> {view === 'coaching' ? 'Spolupráce' : view === 'library' ? 'Knihovna' : view === 'profile' ? 'Profil' : navigation.find(n => n.view === view)?.label}</span><div className="topbar-right"><button className={`sync-pill ${status === 'error' ? 'has-error' : ''}`} onClick={() => navigate('profile')}>{user && status === 'syncing' ? <LoaderCircle size={14} className="loading-spin"/> : user && status === 'synced' ? <Cloud size={14}/> : <CloudOff size={14}/>}<span>{syncLabel}</span><span className="status-dot"/></button>{!user && <button className="header-signin" onClick={() => setAuthMode('signin')}>Přihlásit se</button>}<button className="avatar small" aria-label="Otevřít profil" onClick={() => navigate('profile')}>BB</button><button className="coach-topbar icon-button" aria-label="Otevřít trenéry a klienty" onClick={() => navigate('coaching')}><Users size={19}/></button></div></header>
      <main key={view} className="view-enter">
        <div className="page-heading"><div><div className="eyebrow">{pageTitles[view][0]}</div><h1>{pageTitles[view][1]}</h1><p className="page-help">{pageHelp[view]}</p></div><div className="heading-right">{!['profile', 'library', 'progress', 'coaching'].includes(view) ? <><span className="date-label">{displayDate(selectedDate, { weekday: 'long', day: 'numeric', month: 'long' })}</span><Button secondary onClick={() => setSelectedDate(dateKey())}>Dnes <ChevronDown size={15}/></Button></> : <span className="version-badge">BECOME BETTER / 01</span>}</div></div>
        {!user && view !== 'coaching' && <div className="demo-notice"><span className="demo-tag">{store.demo ? 'UKÁZKA' : 'MÍSTNÍ REŽIM'}</span><span>{store.demo ? 'Prohlížíš ukázková data nové aplikace. Všechno si můžeš vyzkoušet.' : 'Tvoje záznamy se ukládají v tomto prohlížeči.'}</span><button onClick={() => navigate('profile')}>{configured ? 'Připojit účet' : 'O nové verzi'} <ArrowUpRight size={14}/></button></div>}
        {!['profile', 'library', 'progress', 'coaching'].includes(view) && <div className="week-strip"><IconButton icon={ChevronLeft} label="Předchozí týden" onClick={() => setSelectedDate(addDays(selectedDate, -7))}/>{week.map(date => { const hasWorkout = workouts.some(w => w.payload.date === date); const done = workouts.some(w => w.payload.date === date && w.payload.status === 'completed'); return <button key={date} className={`day-tab ${date === selectedDate ? 'selected' : ''} ${date === dateKey() ? 'today' : ''}`} onClick={() => { setSelectedDate(date); setSelectedWorkout(''); }} aria-pressed={date === selectedDate}><span>{displayDate(date, { weekday: 'short' }).replace('.', '')}</span><strong>{new Date(`${date}T12:00:00`).getDate()}</strong><span className={`day-indicator ${hasWorkout ? 'has-workout' : ''}`}>{done ? <Check size={10}/> : null}</span></button>; })}<IconButton icon={ChevronRight} label="Další týden" onClick={() => setSelectedDate(addDays(selectedDate, 7))}/></div>}

        {view === 'overview' && <>
          {preferences.training && <div className="overview-top"><section className="workout-hero">
            <div className="hero-top"><span className="pill"><Dumbbell size={17}/> {selectedDate === dateKey() ? 'DNEŠNÍ TRÉNINK' : 'TRÉNINK VYBRANÉHO DNE'}</span></div>
            <div className="hero-body"><h2>{workout ? text(workout.payload.name) : 'Naplánuj si trénink'}</h2>
              <p className="hero-summary">{!workout ? 'Přidej vlastní cviky a připrav si série na dnešek.' : workout.payload.status === 'completed' ? 'Trénink je dokončený. Své série si můžeš kdykoli prohlédnout.' : workout.payload.status === 'active' ? 'Trénink běží. Pokračuj v zápisu odcvičených sérií.' : 'Tvůj plán je připravený. Otevři ho a začni zapisovat.'}</p>
              {workout && <div className="hero-meta"><span>{exercises.length} cviků</span><span>{workoutSets.filter(s => s.payload.done).length} / {workoutSets.length} sérií hotovo</span></div>}
              <button className="hero-cta" onClick={() => workout?.payload.status === 'completed' ? navigate('training') : startWorkout()}>{workout?.payload.status === 'completed' ? 'Prohlédnout trénink' : workout?.payload.status === 'active' ? 'Pokračovat v tréninku' : workout ? 'Začít trénink' : 'Vytvořit trénink'} <ArrowRight size={20}/></button>
            </div></section>
          <section className="weekly-card"><div className="card-topline"><span className="eyebrow">TENTO TÝDEN</span><Flame size={20}/></div><div className="weekly-number">{weeklyWorkouts.length}<span>/{num(goals.weeklyWorkouts)}</span></div><h3>Tréninky tento týden</h3><p>{weeklyWorkouts.length >= num(goals.weeklyWorkouts) ? 'Týdenní cíl splněn. Dobrá práce.' : `Ještě ${Math.max(0, num(goals.weeklyWorkouts) - weeklyWorkouts.length)} do tvého týdenního cíle.`}</p><div className="weekly-bars">{Array.from({ length: Math.max(1, num(goals.weeklyWorkouts)) }, (_, i) => <span key={i} className={i < weeklyWorkouts.length ? 'filled' : ''}/>)}</div><div className="weekly-bottom"><span>TVŮJ RYTMUS</span><button onClick={() => navigate('training')} aria-label="Otevřít týdenní tréninky"><ArrowUpRight size={22}/></button></div></section></div>}
          <div className="overview-actions" aria-label="Rychlé zápisy">{preferences.nutrition && <Button secondary onClick={() => navigate('nutrition')}><Utensils size={18}/> Zapsat příjem</Button>}{preferences.recovery && <Button secondary onClick={() => navigate('recovery')}><Moon size={18}/> Zapsat regeneraci</Button>}{preferences.progress && <Button secondary onClick={() => navigate('progress','photos')}><TrendingUp size={18}/> Fotky progresu</Button>}</div>
          <div className="metrics-grid">{preferences.nutrition && <><Metric label="Dnešní příjem" icon={Utensils} value={number(num(daily.calories))} unit="kcal" note={`cíl ${number(num(goals.calories))} kcal`} progress={num(daily.calories) / num(goals.calories)} onClick={() => navigate('nutrition')}/><Metric label="Bílkoviny" icon={Zap} value={number(num(daily.protein))} unit="g" note={`cíl ${num(goals.protein)} g`} progress={num(daily.protein) / num(goals.protein)} onClick={() => navigate('nutrition')}/></>}{preferences.recovery && <><Metric label="Spánek" icon={Moon} value={hours ? number(hours, 1) : '—'} unit="h" note={`cíl ${num(goals.sleep)} hodin`} progress={hours / num(goals.sleep)} onClick={() => navigate('recovery')}/><Metric label="Kroky" icon={Footprints} value={number(num(daily.steps))} unit="" note={`cíl ${number(num(goals.steps))}`} progress={num(daily.steps) / num(goals.steps)} onClick={() => navigate('recovery')}/></>}</div>
          <div className="overview-bottom"><>{preferences.progress && <section className="card weight-card"><div className="section-head"><h3>Vývoj váhy</h3><button className="text-button" onClick={() => navigate('progress','numbers')}>Detail <ArrowUpRight size={16}/></button></div><div className="weight-current"><strong>{weights.length ? number(weights.at(-1)!, 1) : '—'}</strong><span>kg</span>{weights.length > 1 && <span className="trend-tag"><ArrowDownRight size={15}/>{number(weights.at(-1)! - weights[0], 1)} kg od začátku</span>}</div><Sparkline values={weights} labels/><div className="chart-foot"><span>VÝVOJ TĚLESNÉ VÁHY</span><span>{weights.length} ZÁZNAMŮ</span></div></section>}{preferences.training && <section className="card recent-card"><div className="section-head"><h3>Poslední tréninky</h3><Dumbbell size={19}/></div>{workouts.filter(w => w.payload.status === 'completed').slice(0, 3).map(w => <button className="recent-row" key={w.id} onClick={() => { setSelectedDate(text(w.payload.date)); setSelectedWorkout(w.id); navigate('training'); }}><span className="recent-icon"><Dumbbell size={18}/></span><span><strong>{text(w.payload.name)}</strong><small>{displayDate(text(w.payload.date))} · {num(w.payload.duration)} min</small></span><ArrowUpRight size={17}/></button>)}{!workouts.some(w => w.payload.status === 'completed') && <p className="empty-copy">Tvůj první dokončený trénink se objeví tady.</p>}<div className="recent-footer"><span>MALÉ KROKY. KAŽDÝ DEN.</span><CircleCheck size={16}/></div></section>}</></div>{!preferences.training && !preferences.nutrition && !preferences.recovery && !preferences.progress && <Empty icon={Settings2} title="Tvůj prostor, tvoje pravidla." description="Zapni si v nastavení oblasti, které chceš sledovat." action={<Button onClick={() => navigate('profile')}>Vybrat oblasti</Button>}/>}
        </>}

        {view === 'training' && <>
          <div className="section-head training-toolbar"><div className="segmented">{todaysWorkouts.map(w => <button key={w.id} className={w.id === workout?.id ? 'selected' : ''} onClick={() => setSelectedWorkout(w.id)}>{text(w.payload.name)}</button>)}</div><Button onClick={() => setModal('templates')}><Plus size={17}/> Nový trénink</Button></div>
          {!workout ? <Empty icon={Dumbbell} title="Dnes máš čistý list." description="Sestav si vlastní trénink. Cviky pojmenuješ podle sebe." action={<Button onClick={() => setModal('templates')}>Sestavit trénink <ArrowRight size={17}/></Button>}/> : <>
            <section className="session-head"><div><span className="eyebrow">{workout.payload.status === 'completed' ? 'DOKONČENO' : workout.payload.status === 'active' ? 'PRÁVĚ TRÉNUJEŠ' : 'PŘIPRAVENO NA TVŮJ START'}</span><input className="session-title" aria-label="Název tréninku" value={text(workout.payload.name)} onChange={e => safely(() => { repository.patch(workout.id, 'workout', { name: e.target.value }); })}/><div className="session-meta"><span>{exercises.length} cviků</span><span>{workoutSets.filter(s => s.payload.done).length}/{workoutSets.length} sérií</span><span>{number(volume(store, workout.id))} kg objem</span>{workout.payload.status === 'active' && <span><Timer size={14}/> {number(Math.max(0, Math.floor((clock - num(workout.payload.startedAt)) / 60000)))} min</span>}</div></div><div className="session-actions">{workout.payload.status !== 'completed' && <Button onClick={workout.payload.status === 'active' ? finishWorkout : startWorkout}>{workout.payload.status === 'active' ? <><Check size={16}/> Dokončit trénink</> : <><Play size={16}/> Začít trénink</>}</Button>}<IconButton icon={RotateCcw} label="Zkopírovat trénink na příští týden" onClick={copyWorkout}/><IconButton icon={Trash2} label="Odstranit trénink" onClick={() => setModal('deleteWorkout')}/></div></section>
            <div className="training-hint"><span>Název cviku si upravíš kliknutím. Zapiš váhu, opakování a označ hotovo.</span><label className="checkbox-field"><input type="checkbox" checked={showRpe} onChange={e => setShowRpe(e.target.checked)}/> Ukázat náročnost (RPE)</label></div>
            <div className="exercise-list">{exercises.map((exercise, index) => { const cardio = isCardio(exercise), extra = showRpe || cardio; return <section className="exercise-card card" key={exercise.id}>
              <div className="exercise-header"><span className="exercise-number">{String(index + 1).padStart(2, '0')}</span><div className="exercise-name-wrap"><EditableName value={text(exercise.payload.name)} label={`Název cviku ${index + 1}`} save={name => safely(() => { repository.patch(exercise.id,'exercise',{name}); })}/>{text(exercise.payload.muscle) && <p>{text(exercise.payload.muscle)}</p>}{text(exercise.payload.cue) && <p className="exercise-cue">{text(exercise.payload.cue)}</p>}</div><div className="exercise-actions"><div className="exercise-reorder" role="group" aria-label={`Pořadí cviku ${text(exercise.payload.name)}`}><IconButton icon={ChevronUp} label={`Posunout ${text(exercise.payload.name)} nahoru`} disabled={index === 0} onClick={() => safely(() => { moveExercise(repository,workout.id,exercise.id,-1); })}/><IconButton icon={ChevronDown} label={`Posunout ${text(exercise.payload.name)} dolů`} disabled={index === exercises.length - 1} onClick={() => safely(() => { moveExercise(repository,workout.id,exercise.id,1); })}/></div><IconButton icon={Trash2} label={`Odebrat ${text(exercise.payload.name)}`} onClick={() => safely(() => { repository.remove([exercise.id, ...exerciseSets(exercise.id).map(s => s.id)]); })}/></div></div>
              <div className={`set-table simple-sets ${extra ? 'with-rpe' : ''}`}><div className="set-row set-heading"><span>SÉRIE</span><span>{cardio ? 'RYCHLOST' : 'VÁHA / KG'}</span><span>{cardio ? 'DOBA / MIN' : 'OPAKOVÁNÍ'}</span>{extra && <span>{cardio ? 'SKLON' : 'RPE'}</span>}<span>HOTOVO</span><span/></div>{exerciseSets(exercise.id).map((set, i) => <div className={`set-row ${set.payload.done ? 'done' : ''}`} key={set.id}><span className="set-index">{i + 1}</span><NumericInput value={set.payload.weight} label={`${text(exercise.payload.name)} série ${i + 1} ${cardio ? 'rychlost' : 'váha'}`} max={1000} step={cardio ? .1 : .5} onCommit={weight => safely(() => { repository.patch(set.id, 'set', { weight }); })}/><NumericInput value={set.payload.reps} label={`${text(exercise.payload.name)} série ${i + 1} ${cardio ? 'minuty' : 'opakování'}`} max={1000} onCommit={reps => safely(() => { repository.patch(set.id, 'set', { reps }); })}/>{extra && <NumericInput value={set.payload.rpe} label={`${text(exercise.payload.name)} série ${i + 1} ${cardio ? 'sklon' : 'RPE'}`} min={0} max={cardio ? 30 : 10} step={.5} onCommit={rpe => safely(() => { repository.patch(set.id, 'set', { rpe }); })}/>}<button className={`set-check ${set.payload.done ? 'checked' : ''}`} aria-label={`${set.payload.done ? 'Zrušit dokončení' : 'Dokončit'} série ${i + 1} ${text(exercise.payload.name)}`} aria-pressed={Boolean(set.payload.done)} onClick={() => safely(() => { repository.patch(set.id, 'set', { done: !set.payload.done }); if (!set.payload.done && workout.payload.status !== 'completed') { setRestDeadline(Date.now() + 90000); setRestPaused(null); } })}><Check size={18}/></button><IconButton icon={X} label={`Odebrat sérii ${i + 1} ${text(exercise.payload.name)}`} onClick={() => safely(() => { repository.remove([set.id]); })}/></div>)}</div>
              <button className="add-set" onClick={() => safely(() => { repository.add('set', { exerciseId: exercise.id, weight: null, reps: 10, rpe: null, done: false, order: Math.max(-1, ...exerciseSets(exercise.id).map(s => num(s.payload.order))) + 1 }); })}><Plus size={15}/> Přidat sérii</button>
            </section>;})}</div><button className="add-exercise" onClick={() => { setSearch(''); setFilter('Vše'); setModal('exercises'); }}><Plus size={21}/> Přidat cvik do tréninku</button><label className="notes-label">POZNÁMKA K TRÉNINKU<textarea value={text(workout.payload.notes)} placeholder="Jak se ti dnes cvičilo?" onChange={e => safely(() => { repository.patch(workout.id, 'workout', { notes: e.target.value }); })}/></label>
          </>}
        </>}

        {view === 'nutrition' && <>
          <div className="nutrition-top"><section className="calorie-card"><div className="eyebrow">PŘÍJEM VYBRANÉHO DNE</div><div className="calorie-numbers"><strong>{number(num(daily.calories))}</strong><span>/ {number(num(goals.calories))} kcal</span></div><div className="progress-track"><span style={{ width: `${Math.min(100, num(daily.calories) / Math.max(1, num(goals.calories)) * 100)}%` }}/></div><div className="calorie-foot"><span>{number(Math.max(0, num(goals.calories) - num(daily.calories)))} kcal do cíle</span><Utensils size={20}/></div></section><section className="card nutrition-context"><span className="eyebrow">TVŮJ AKTUÁLNÍ CÍL</span><h3>{goals.mode === 'diet' ? 'Redukce hmotnosti' : goals.mode === 'bulk' ? 'Nabírání svalů' : 'Udržování formy'}</h3><p>Tvůj denní příjem a makra. Cíle si nastavíš přesně podle sebe.</p><button className="text-button" onClick={() => navigate('profile')}>Upravit cíle <ArrowUpRight size={17}/></button></section></div>
          <details className="nutrition-macros"><summary>Makra pro vybraný den</summary><div className="macro-grid">{[{ key: 'protein', label: 'Bílkoviny', unit: 'g', icon: Zap }, { key: 'carbs', label: 'Sacharidy', unit: 'g', icon: Flame }, { key: 'fat', label: 'Tuky', unit: 'g', icon: Utensils }].map(m => <Metric key={m.key} icon={m.icon} label={m.label} value={number(num(daily[m.key]))} unit={m.unit} note={`cíl ${num(goals[m.key as keyof typeof goals])} g`} progress={num(daily[m.key]) / Math.max(1, num(goals[m.key as keyof typeof goals]))}/>)}</div></details>
          <section className="card form-card"><div className="section-head"><h3>Zapsat příjem · {displayDate(selectedDate)}</h3><span className="auto-save"><Check size={13}/> Automaticky ukládáno</span></div><div className="form-grid">{[{ key: 'calories', label: 'Kalorie', unit: 'kcal' }, { key: 'protein', label: 'Bílkoviny', unit: 'g' }, { key: 'carbs', label: 'Sacharidy', unit: 'g' }, { key: 'fat', label: 'Tuky', unit: 'g' }, { key: 'water', label: 'Voda', unit: 'l' }].map(field => <label className="field" key={field.key}><span>{field.label}</span><div className="input-unit"><NumericInput value={daily[field.key]} label={field.label} max={field.key === 'water' ? 20 : 20000} step={field.key === 'water' ? .1 : 1} onCommit={value => patchDaily(field.key, value)}/><span>{field.unit}</span></div></label>)}</div><label className="notes-label">POZNÁMKA<textarea value={text(daily.notes)} placeholder="Jídlo, hlad, energie… cokoli je pro tebe důležité." onChange={e => patchDaily('notes', e.target.value)}/></label></section><WeeklyNutrition store={store} date={selectedDate} select={setSelectedDate} settings={() => navigate('profile')}/><details className="card nutrition-history"><summary>Zapsaná makra a voda v tomto týdnu</summary><WeeklyLog dates={week} store={store} fields={[{ key: 'calories', title: 'Kalorie', unit: 'kcal' }, { key: 'protein', title: 'Bílkoviny', unit: 'g' }, { key: 'water', title: 'Voda', unit: 'l' }]} select={setSelectedDate} selected={selectedDate}/></details>
        </>}

        {view === 'recovery' && <>
          <div className="metrics-grid"><Metric label="Délka spánku" icon={Moon} value={hours ? number(hours, 1) : '—'} unit="h" note={`cíl ${num(goals.sleep)} hodin`} progress={hours / Math.max(1, num(goals.sleep))}/><Metric label="Skóre spánku" icon={Zap} value={daily.sleepQuality == null ? '—' : number(num(daily.sleepQuality))} unit="/100" note="podle tvých hodinek" progress={num(daily.sleepQuality) / 100}/><Metric label="Denní kroky" icon={Footprints} value={number(num(daily.steps))} unit="" note={`cíl ${number(num(goals.steps))}`} progress={num(daily.steps) / Math.max(1, num(goals.steps))}/><Metric label="Přečtené stránky" icon={BookOpen} value={number(num(daily.bookPages))} unit="" note="prostor pro tvoji hlavu" progress={num(daily.bookPages) / 20}/></div>
          <div className="two-columns"><section className="card form-card"><div className="section-head"><h3>Spánek & energie</h3><Moon size={21}/></div><div className="form-grid two"><label className="field"><span>Čas usnutí</span><input aria-label="Čas usnutí" type="time" value={text(daily.bedTime)} onChange={e => patchDaily('bedTime', e.target.value)}/></label><label className="field"><span>Čas probuzení</span><input aria-label="Čas probuzení" type="time" value={text(daily.wakeTime)} onChange={e => patchDaily('wakeTime', e.target.value)}/></label><label className="field"><span>Skóre spánku / 100</span><NumericInput value={daily.sleepQuality} label="Skóre spánku" max={100} onCommit={n => patchDaily('sleepQuality', n)}/></label><label className="field"><span>Stres / 100</span><NumericInput value={daily.stress} label="Stres" max={100} onCommit={n => patchDaily('stress', n)}/></label><label className="field"><span>Noční probuzení</span><NumericInput value={daily.nightWakeups} label="Noční probuzení" max={100} onCommit={n => patchDaily('nightWakeups', n)}/></label><label className="field"><span>Kofein / mg</span><NumericInput value={daily.caffeine} label="Kofein" max={2000} onCommit={n => patchDaily('caffeine', n)}/></label></div><label className="notes-label">JAK SE DNES CÍTÍŠ?<textarea value={text(daily.sleepNotes)} placeholder="Energie, nálada, regenerace…" onChange={e => patchDaily('sleepNotes', e.target.value)}/></label></section><section className="card form-card"><div className="section-head"><h3>Tvoje malé velké návyky</h3><Flame size={21}/></div><div className="habit-row"><span className="habit-icon"><Footprints size={22}/></span><div><strong>Ranní procházka</strong><small>Chvilka pohybu pro lepší start dne.</small></div><button className={`set-check ${daily.walk ? 'checked' : ''}`} aria-label="Ranní procházka splněna" aria-pressed={Boolean(daily.walk)} onClick={() => patchDaily('walk', !daily.walk)}><Check size={19}/></button></div><div className="habit-row"><span className="habit-icon"><Moon size={22}/></span><div><strong>Probuzení bez budíku</strong><small>Poslechni svůj vlastní rytmus.</small></div><button className={`set-check ${daily.wokeWithoutAlarm ? 'checked' : ''}`} aria-label="Probuzení bez budíku splněno" aria-pressed={Boolean(daily.wokeWithoutAlarm)} onClick={() => patchDaily('wokeWithoutAlarm', !daily.wokeWithoutAlarm)}><Check size={19}/></button></div><div className="form-grid two"><label className="field"><span>Kroky</span><NumericInput value={daily.steps} label="Kroky" max={200000} onCommit={n => patchDaily('steps', n)}/></label><label className="field"><span>Přečtené stránky</span><NumericInput value={daily.bookPages} label="Přečtené stránky" max={2000} onCommit={n => patchDaily('bookPages', n)}/></label><label className="field"><span>Ranní procházka / min</span><NumericInput value={daily.walkMinutes} label="Ranní procházka minuty" max={1440} onCommit={n => patchDaily('walkMinutes', n)}/></label></div><div className="recovery-quote">REST.<br/>RESET.<br/><span>REPEAT.</span><span className="quote-star">✳</span></div></section></div>
        </>}

        {view === 'progress' && <div className="progress-tabs segmented"><button className={progressTab === 'photos' ? 'selected' : ''} onClick={() => setProgressTab('photos')}>Fotky</button><button className={progressTab === 'numbers' ? 'selected' : ''} onClick={() => setProgressTab('numbers')}>Měření a výkony</button></div>}

        {view === 'progress' && progressTab === 'numbers' && <>
          <div className="section-head"><div className="section-intro"><span className="eyebrow">{text(goals.phase) || 'TVŮJ OSOBNÍ PROGRES'}</span><p>Sleduj změny v čase. Jeden záznam po druhém.</p></div><Button onClick={() => setModal('measurement')}><Plus size={17}/> Zapsat měření</Button></div><div className="progress-layout"><section className="card progress-chart"><div className="section-head"><h3>Tělesná váha</h3><span className="subtle">kg / všechny záznamy</span></div><div className="weight-current"><strong>{weights.length ? number(weights.at(-1)!, 1) : '—'}</strong><span>kg</span><span className="trend-tag">Cíl {number(num(goals.weight), 1)} kg</span></div><Sparkline values={weights} height={200} labels/></section><section className="progress-summary"><span className="eyebrow">PRÁCE, KTEROU JSI ODVEDL</span><div><strong>{workouts.filter(w => w.payload.status === 'completed').length}</strong><span>dokončených tréninků</span></div><div><strong>{number(volume(store))}<small> kg</small></strong><span>celkový odcvičený objem</span></div><div><strong>{allSets.filter(s => s.payload.done).length}</strong><span>odcvičených sérií</span></div></section></div><section className="card"><div className="section-head padded"><h3>Historie měření</h3><span className="subtle">{measurements.length} záznamů</span></div>{measurements.length ? <div className="table-scroll"><table><thead><tr><th>Datum</th><th>Váha</th><th>Pas</th><th>Poznámka</th><th><span className="sr-only">Akce</span></th></tr></thead><tbody>{[...measurements].reverse().map(m => <tr key={m.id}><td>{displayDate(text(m.payload.date))}</td><td><strong>{number(num(m.payload.weight), 1)} kg</strong></td><td>{m.payload.waist ? `${number(num(m.payload.waist), 1)} cm` : '—'}</td><td>{text(m.payload.notes) || '—'}</td><td><IconButton icon={Trash2} label={`Odstranit měření ${text(m.payload.date)}`} onClick={() => safely(() => { repository.remove([m.id]); })}/></td></tr>)}</tbody></table></div> : <p className="empty-copy padded">Zapiš první měření a začni sledovat svou cestu.</p>}</section><section className="card personal-bests"><div className="section-head"><h3>Tvoje osobní maxima</h3><TrendingUp size={20}/></div><div className="best-grid">{personalBests(store).slice(0,8).map(best => <div key={best.name}><span>{best.name}</span><strong>{number(best.weight,1)} <small>kg</small></strong><small>Nejvyšší odcvičená váha</small></div>)}{!personalBests(store).length && <p className="empty-copy">Po první odcvičené sérii uvidíš maxima svých cviků.</p>}</div></section>
        </>}

        {view === 'library' && <><div className="library-toolbar"><label className="search-field"><Search size={18}/><input aria-label="Hledat cvik" placeholder="Najdi svůj další cvik…" value={search} onChange={e => setSearch(e.target.value)}/></label><Button onClick={() => setModal('custom')}><Plus size={17}/> Vlastní cvik</Button></div><div className="filter-tabs">{['Vše', 'Hrudník', 'Záda', 'Nohy', 'Ramena', 'Biceps', 'Triceps', 'Core'].map(m => <button className={m === filter ? 'selected' : ''} key={m} onClick={() => setFilter(m)}>{m}</button>)}</div><div className="library-grid">{filteredLibrary.map((e, i) => <section className="library-card card" key={e.id}><div className="library-art"><span>{String(i + 1).padStart(2, '0')}</span><Dumbbell size={70} strokeWidth={1}/><small>{e.equipment}</small></div><div className="library-body"><span className="eyebrow">{e.muscle}</span><h3>{e.name}</h3><p>{e.cue}</p><button className="text-button" onClick={() => { if (!workout) { setToast('Nejdřív sestav trénink pro vybraný den.'); setModal('templates'); } else { addExercise(e); } }}>Přidat do tréninku <Plus size={17}/></button>{store.records[e.id]?.kind === 'library' && <IconButton icon={Trash2} label={`Odstranit vlastní cvik ${e.name}`} onClick={() => safely(() => { repository.remove([e.id]); })}/>}</div></section>)}</div>{!filteredLibrary.length && <Empty icon={Search} title="Tady jsme nic nenašli." description="Zkus jiný název nebo přidej svůj vlastní cvik."/>}</>}

        {view === 'progress' && progressTab === 'photos' && <ProgressPhotos key={user?.id || 'demo'} store={store} userId={user?.id} notify={setToast}/>}

        {view === 'coaching' && <CoachWorkspace key={user?.id || 'demo'} userId={user?.id} notify={setToast} signIn={() => setAuthMode('signin')}/>}

        {view === 'profile' && <>
          <AccountSettings snapshot={snapshot} auth={setAuthMode} notify={setToast}/>
          <HealthConnection key={user?.id || 'anonymous'} snapshot={snapshot} signIn={()=>setAuthMode('signin')} notify={setToast}/>
          <section className="card profile-coach-link"><div><h3>Trenérský účet a spolupráce</h3><p>Správa klientů, cílů a tréninků nebo spolupráce s tvým trenérem.</p></div><Button onClick={() => navigate('coaching')}><Users size={17}/> Otevřít spolupráci</Button></section>
          <TrackingSettings store={store} notify={setToast}/><div className="two-columns"><section className="card form-card"><div className="section-head"><h3>Tvoje nastavení</h3><Settings2 size={20}/></div><div className="form-grid two"><label className="field"><span>Jak tě máme oslovovat?</span><input value={text(goals.name)} placeholder="Tvoje jméno" onChange={e => patchGoal('name', e.target.value)}/></label><label className="field"><span>Aktuální cíl</span><select value={text(goals.mode)} onChange={e => patchGoal('mode', e.target.value)}><option value="maintain">Udržování formy</option><option value="bulk">Nabírání svalů</option><option value="diet">Redukce hmotnosti</option></select></label><label className="field"><span>Tréninků za týden</span><NumericInput value={goals.weeklyWorkouts} label="Tréninků za týden" min={1} max={14} onCommit={n => patchGoal('weeklyWorkouts', n || 4)}/></label><label className="field"><span>Cílová váha / kg</span><NumericInput value={goals.weight} label="Cílová váha" min={20} max={500} step={.1} onCommit={n => patchGoal('weight', n)}/></label><label className="field wide"><span>Název aktuální fáze</span><input value={text(goals.phase)} placeholder="Např. Budování síly / podzim" onChange={e => patchGoal('phase', e.target.value)}/></label></div></section></div>
          <section className="card form-card"><div className="section-head"><h3>Limity výživy a denní cíle</h3><span className="subtle">Nastav si vlastní rytmus.</span></div><div className="form-grid"><label className="field"><span>Týdenní limit / kcal</span><NumericInput value={nutritionGoals(store).weeklyCalories} label="Týdenní limit / kcal" min={1} max={140000} onCommit={n => { if (n) patchGoal('weeklyCalories', n); }}/></label>{[{ key: 'calories', label: 'Kalorie / kcal', max: 20000 }, { key: 'protein', label: 'Bílkoviny / g', max: 2000 }, { key: 'carbs', label: 'Sacharidy / g', max: 2000 }, { key: 'fat', label: 'Tuky / g', max: 2000 }, { key: 'steps', label: 'Kroky', max: 200000 }, { key: 'sleep', label: 'Spánek / h', max: 24 }].map(f => <label key={f.key} className="field"><span>{f.label}</span><NumericInput value={goals[f.key as keyof typeof goals]} label={f.label} min={1} max={f.max} step={f.key === 'sleep' ? .5 : 1} onCommit={n => { if (n) patchGoal(f.key, n); }}/></label>)}</div></section>
          <DeviceSettings/><section className="card form-card backup-card"><div className="section-head"><h3>Data & záloha</h3><Upload size={20}/></div><p>Přenes JSON zálohu z původní nebo nové aplikace. Před potvrzením uvidíš přehled záznamů. Původní soubory fotek si ponech.</p><div className="button-row"><Button secondary onClick={exportBackup}>Exportovat zálohu <ArrowDownRight size={16}/></Button><Button secondary onClick={() => setModal('import')}>Importovat zálohu <Upload size={16}/></Button>{!user && <Button secondary onClick={() => setModal('clearDemo')}>Začít s čistým plánem <ArrowUpRight size={16}/></Button>}{!user && !store.demo && <Button secondary onClick={() => safely(() => { repository.restoreDemo(); setToast('Ukázková data obnovena.'); })}>Obnovit ukázku</Button>}</div></section>
        </>}
        <footer className="page-footer"><span>BECOME BETTER<span className="footer-dot">.</span></span><span>MAKE IT COUNT. <span>/</span> BETA</span></footer>
      </main>
    </div>
    <nav className="mobile-nav" aria-label="Mobilní navigace">{visibleNavigation.map(({ view: next, label, icon: Icon }) => <button key={next} className={view === next ? 'active' : ''} aria-current={view === next ? 'page' : undefined} onClick={() => navigate(next)}><Icon size={20}/><span>{label}</span></button>)}</nav>
    {(restDeadline > 0 || restPaused !== null) && view === 'training' && <div className="rest-timer" role="status"><Timer size={20}/><div><small>{restSeconds ? 'PAUZA MEZI SÉRIEMI' : 'JDEME NA DALŠÍ SÉRII'}</small><strong>{Math.floor(restSeconds / 60)}:{String(restSeconds % 60).padStart(2, '0')}</strong></div><IconButton icon={restPaused === null ? Pause : Play} label={restPaused === null ? 'Pozastavit pauzu' : 'Pokračovat v pauze'} onClick={() => { if (restPaused === null) setRestPaused(restSeconds); else { setRestDeadline(Date.now() + restPaused * 1000); setRestPaused(null); } }}/><button className="timer-plus" onClick={() => { if (restPaused !== null) setRestPaused(restPaused + 30); else setRestDeadline(Math.max(Date.now(), restDeadline) + 30000); }}>+30 s</button><IconButton icon={X} label="Zavřít časovač" onClick={() => { setRestDeadline(0); setRestPaused(null); }}/></div>}
    {toast && <div className="toast" role="status"><Check size={17}/><span>{toast}</span><IconButton icon={X} label="Zavřít oznámení" onClick={() => setToast('')}/></div>}
    {authMode && <AuthDialog key={authMode} initial={authMode} close={() => setAuthMode(null)}/>}
    {modal === 'import' && <ImportBackupDialog key={user?.id || 'demo'} close={() => setModal(null)} notify={setToast}/>}
    {modal && modal !== 'import' && <Dialog title={modal === 'templates' ? 'Nový trénink' : modal === 'exercises' ? 'Přidat cvik.' : modal === 'measurement' ? 'Přidat měření' : modal === 'custom' ? 'Tvůj vlastní cvik.' : modal === 'deleteWorkout' ? 'Odstranit trénink?' : 'Začít s čistým plánem?'} close={() => setModal(null)}>
      {modal === 'templates' && <><p className="dialog-description">Trénink na {displayDate(selectedDate)}. Cviky si napíšeš vlastními slovy.</p><Button className="full-width" onClick={() => createWorkout()}><Plus size={17}/> Vytvořit vlastní trénink</Button><details className="template-alternative"><summary>Nebo začít ze šablony</summary><div className="template-list">{templates.map((t, i) => <button key={t.id} onClick={() => createWorkout(t)}><span className="template-index">0{i + 1}</span><span><strong>{t.name}</strong><small>{t.label} · {t.exercises.length} cviků</small></span><ArrowUpRight size={22}/></button>)}</div></details></>}
      {modal === 'exercises' && <ExercisePicker workoutId={workout?.id} library={library} choose={addExercise} close={() => setModal(null)} notify={setToast}/>}
      {modal === 'measurement' && <form className="modal-form" onSubmit={e => { e.preventDefault(); const form = new FormData(e.currentTarget); safely(() => { repository.add('measurement', { date: String(form.get('date')), weight: Number(form.get('weight')), waist: form.get('waist') ? Number(form.get('waist')) : null, notes: String(form.get('notes')) }); setModal(null); setToast('Měření uloženo.'); }); }}><label className="field"><span>Datum</span><input type="date" name="date" defaultValue={dateKey()} required/></label><div className="form-grid two"><label className="field"><span>Váha / kg</span><input type="number" name="weight" min="20" max="500" step=".1" defaultValue={weights.at(-1)} required/></label><label className="field"><span>Pas / cm</span><input type="number" name="waist" min="20" max="300" step=".1"/></label></div><label className="field"><span>Poznámka</span><input name="notes" placeholder="Jak se cítíš?" maxLength={500}/></label><Button type="submit">Uložit měření <Check size={17}/></Button></form>}
      {modal === 'custom' && <form className="modal-form" onSubmit={e => { e.preventDefault(); const form = new FormData(e.currentTarget); safely(() => { repository.add('library', { name: String(form.get('name')).trim(), muscle: String(form.get('muscle')), equipment: String(form.get('equipment')), cue: String(form.get('cue')) }); setModal(null); setToast('Vlastní cvik přidán do knihovny.'); }); }}><label className="field"><span>Název cviku</span><input name="name" required maxLength={120}/></label><div className="form-grid two"><label className="field"><span>Svalová partie</span><select name="muscle">{['Hrudník', 'Záda', 'Nohy', 'Ramena', 'Biceps', 'Triceps', 'Core', 'Kardio'].map(m => <option key={m}>{m}</option>)}</select></label><label className="field"><span>Vybavení</span><select name="equipment">{['Jednoručky', 'Velká osa', 'Stroj', 'Kladka', 'Vlastní váha', 'Jiné'].map(m => <option key={m}>{m}</option>)}</select></label></div><label className="field"><span>Tvoje poznámka k provedení</span><input name="cue" maxLength={500}/></label><Button type="submit">Přidat vlastní cvik <Plus size={17}/></Button></form>}
      {modal === 'deleteWorkout' && <><p className="dialog-description">Odstraníš {text(workout?.payload.name)} včetně všech jeho sérií. Změna se po připojení přenese i na ostatní zařízení.</p><div className="button-row"><Button secondary onClick={() => setModal(null)}>Ponechat trénink</Button><Button onClick={removeWorkout}>Odstranit <Trash2 size={16}/></Button></div></>}
      {modal === 'clearDemo' && <><p className="dialog-description">Místní ukázková data a tvoje úpravy v této nové verzi se vymažou. Pro jistotu si můžeš nejdřív stáhnout zálohu.</p><div className="button-row"><Button secondary onClick={exportBackup}>Stáhnout zálohu</Button><Button onClick={() => safely(() => { repository.startEmpty(); setModal(null); setToast('Čistý plán je připravený.'); })}>Začít od nuly <ArrowRight size={16}/></Button></div></>}
    </Dialog>}
  </div>;
}
function Metric({ icon: Icon, label, value, unit, note, progress, onClick }: { icon: LucideIcon; label: string; value: string; unit: string; note: string; progress: number; onClick?: () => void }) {
  const content = <><div className="metric-heading"><span>{label}</span><Icon size={18}/></div><div className="metric-value"><strong>{value}</strong><span>{unit}</span></div><div className="metric-bottom"><span>{note}</span><span>{Number.isFinite(progress) ? Math.round(progress * 100) : 0}%</span></div><div className="mini-track"><span style={{ width: `${Number.isFinite(progress) ? Math.min(100, Math.max(0, progress * 100)) : 0}%` }}/></div></>;
  return onClick ? <button className="metric-card" onClick={onClick}>{content}</button> : <section className="metric-card">{content}</section>;
}
function Empty({ icon: Icon, title, description, action }: { icon: LucideIcon; title: string; description: string; action?: ReactNode }) {
  return <section className="empty-state"><span><Icon size={36} strokeWidth={1.3}/></span><h2>{title}</h2><p>{description}</p>{action}</section>;
}
function WeeklyLog({ dates, store, fields, select, selected }: { dates: string[]; store: ReturnType<typeof repository.getSnapshot>['store']; fields: { key: string; title: string; unit: string }[]; select: (d: string) => void; selected: string }) {
  return <section className="card weekly-log"><div className="section-head padded"><h3>Tvůj týden v kostce</h3><span className="subtle">{displayDate(dates[0])} — {displayDate(dates[6])}</span></div><div className="table-scroll"><table><thead><tr><th>Den</th>{fields.map(f => <th key={f.key}>{f.title}</th>)}</tr></thead><tbody>{dates.map(d => { const row = store.records[`daily-${d}`]?.payload || {}; return <tr key={d} className={d === selected ? 'current' : ''}><td><button onClick={() => select(d)}>{displayDate(d, { weekday: 'short', day: 'numeric', month: 'numeric' })}</button></td>{fields.map(f => <td key={f.key}>{row[f.key] == null ? '—' : `${number(num(row[f.key]), 1)} ${f.unit}`}</td>)}</tr>; })}</tbody></table></div></section>;
}

