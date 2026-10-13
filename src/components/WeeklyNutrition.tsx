import { ArrowUpRight, CalendarDays } from 'lucide-react';
import type { Store } from '../lib/model';
import { displayDate } from '../lib/model';
import { nutritionGoals, weeklyNutrition } from '../lib/nutrition';
const format = (n: number) => n.toLocaleString('cs-CZ', { maximumFractionDigits: 0 });
export function WeeklyNutrition({ store, date, select, settings }: { store: Store; date: string; select?: (date: string) => void; settings?: () => void }) {
  const week = weeklyNutrition(store, date), goals = nutritionGoals(store, date);
  return <section className="card weekly-budget">
    <div className="section-head"><div><span className="eyebrow">TVŮJ PLÁN VÝŽIVY</span><h3>Týdenní rozpočet</h3></div>{settings && <button className="text-button" onClick={settings}>Upravit limity <ArrowUpRight size={16}/></button>}</div>
    <p className="budget-range"><CalendarDays size={15}/>{displayDate(week.days[0].date)} – {displayDate(week.days[6].date)}</p>
    <div className="budget-stats"><div><small>Limit na celý týden</small><strong>{format(week.limit)} <span>kcal</span></strong></div><div><small>Zapsaný příjem</small><strong>{format(week.consumed)} <span>kcal</span></strong></div><div><small>{week.over ? 'Nad týdenním limitem' : 'Zbývá v rozpočtu'}</small><strong>{format(week.over || week.remaining)} <span>kcal</span></strong></div></div>
    <div className="mini-track"><span style={{ width: `${Math.min(100, week.consumed / Math.max(1, week.limit) * 100)}%` }}/></div>
    <div className="budget-settings"><span>Denní cíl <b>{format(Number(goals.calories))} kcal</b></span><span>Bílkoviny <b>{goals.protein} g</b></span><span>Sacharidy <b>{goals.carbs} g</b></span><span>Tuky <b>{goals.fat} g</b></span></div>
    <div className="budget-days">{week.days.map(d => <button key={d.date} type="button" disabled={!select} className={`${d.date === date ? 'selected' : ''} ${d.logged ? 'logged' : ''}`} onClick={() => select?.(d.date)}><span>{displayDate(d.date, { weekday: 'short' })}</span><small>{displayDate(d.date, { day: 'numeric', month: 'numeric' })}</small><strong>{format(d.logged ? d.calories : d.allowance!)}</strong><small>{d.logged ? 'zapsáno' : 'v rozpočtu'}</small></button>)}</div>
    <p className="budget-explanation">{week.unlogged ? `Zbývající rozpočet je rovnoměrně rozdělený mezi ${week.unlogged} ${week.unlogged === 1 ? 'nezapsaný den' : week.unlogged < 5 ? 'nezapsané dny' : 'nezapsaných dní'}. Po zápisu se přepočítá. Nezapsané minulé dny se počítají také.` : 'Všech sedm dní je zapsaných.'} Denní cíl a týdenní limit si nastavuješ samostatně.</p>
  </section>;
}
