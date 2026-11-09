import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ArrowUpRight, Scale } from 'lucide-react';
import { displayDate } from '../lib/model';
import type { DataRecord } from '../lib/model';
import { weightDifference, weightEntries, weightsInRange, weightSummary } from '../lib/weight-progress';
import type { WeightEntry } from '../lib/weight-progress';

const n=(value:number)=>new Intl.NumberFormat('cs-CZ',{maximumFractionDigits:2}).format(value);
const fullDate=(date:string)=>displayDate(date,{day:'numeric',month:'long',year:'numeric'});
const signed=(value:number|null)=>value===null?'—':`${value<0?'−':value>0?'+':''}${n(Math.abs(value))} kg`;
const direction=(value:number|null)=>value===null?'Po dalším vážení uvidíš změnu':value<0?'Úbytek váhy':value>0?'Nárůst váhy':'Váha je stejná';

function WeightChart({entries,compact}:{entries:WeightEntry[];compact:boolean}) {
  const [selected,setSelected]=useState(''),scroll=useRef<HTMLDivElement>(null),lastId=entries.at(-1)?.id||'';
  const [viewportWidth,setViewportWidth]=useState(320);
  useEffect(()=>{setSelected(lastId);scroll.current?.scrollTo({left:scroll.current.scrollWidth});},[lastId,entries.length,viewportWidth]);
  useEffect(()=>{if(!scroll.current)return;const observer=new ResizeObserver(([entry])=>setViewportWidth(Math.ceil(entry.contentRect.width)));observer.observe(scroll.current);return()=>observer.disconnect();},[Boolean(entries.length)]);
  if(!entries.length)return <p className="weight-empty">V tomto období nemáš žádné vážení.</p>;
  const width=Math.max(viewportWidth,320,entries.length*86+64),height=compact?220:270,left=48,right=32,top=40,bottom=57;
  const weights=entries.map(entry=>entry.weight),low=Math.floor((Math.min(...weights)-.5)*2)/2,high=Math.ceil((Math.max(...weights)+.5)*2)/2;
  const coords=entries.map((entry,i)=>({entry,x:entries.length===1?(width+left-right)/2:left+i/(entries.length-1)*(width-left-right),y:top+(high-entry.weight)/(high-low)*(height-top-bottom)}));
  const currentIndex=entries.findIndex(entry=>entry.id===selected),index=currentIndex<0?entries.length-1:currentIndex,current=entries[index],previous=entries[index-1];
  return <><div className="weight-chart-heading"><span>Každý bod = jedno vážení</span><div><button className="icon-button" aria-label="Starší vážení v grafu" onClick={()=>scroll.current?.scrollBy({left:-280,behavior:'smooth'})}><ArrowLeft size={16}/></button><button className="icon-button" aria-label="Novější vážení v grafu" onClick={()=>scroll.current?.scrollBy({left:280,behavior:'smooth'})}><ArrowRight size={16}/></button></div></div>
    <div className="weight-chart-scroll" ref={scroll} tabIndex={0} aria-label="Graf váhy, posuň do strany pro další vážení"><svg className="precise-weight-chart" style={{minWidth:width}} viewBox={`0 0 ${width} ${height}`} role="group" aria-label="Váha podle jednotlivých vážení">
      {[low,(low+high)/2,high].map(tick=>{const y=top+(high-tick)/(high-low)*(height-top-bottom);return <g key={tick}><line x1={left} x2={width-right} y1={y} y2={y} stroke="currentColor" opacity=".18"/><text className="weight-axis" x={left-9} y={y+4} textAnchor="end">{n(tick)}</text></g>;})}<text x="7" y="18" className="weight-axis">kg</text>
      <polyline points={coords.map(point=>`${point.x},${point.y}`).join(' ')} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round"/>
      {coords.map(point=><g key={point.entry.id} role="button" tabIndex={0} aria-pressed={point.entry.id===current.id} aria-label={`${fullDate(point.entry.date)}: ${n(point.entry.weight)} kg`} onClick={()=>setSelected(point.entry.id)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setSelected(point.entry.id);}}} className="weight-point"><circle cx={point.x} cy={point.y} r="22" fill="transparent"/><circle cx={point.x} cy={point.y} r={point.entry.id===current.id?6:4} fill="currentColor"/><text x={point.x} y={point.y-15} textAnchor="middle" className="weight-point-value">{n(point.entry.weight)}</text><text x={point.x} y={height-26} textAnchor="middle">{displayDate(point.entry.date,{day:'numeric',month:'numeric'})}</text><text x={point.x} y={height-9} textAnchor="middle" className="weight-axis">{point.entry.date.slice(0,4)}</text></g>)}
    </svg></div>
    <div className="weight-selected"><div><small>Vybrané vážení · {fullDate(current.date)}</small><strong>{n(current.weight)} kg</strong></div><div><small>Od předchozího bodu</small><strong>{previous?signed(weightDifference(current.weight,previous.weight)):'První bod v grafu'}</strong></div></div>
  </>;
}
export function WeightProgress({measurements,goal,compact=false,openDetail}:{measurements:DataRecord[];goal:number;compact?:boolean;openDetail?:()=>void}) {
  const [range,setRange]=useState('all'),entries=weightEntries(measurements),summary=weightSummary(entries),visible=compact?entries.slice(-7):weightsInRange(entries,range),period=weightSummary(visible);
  const goalValid=Number.isFinite(goal)&&goal>0,remaining=summary.last&&goalValid?weightDifference(summary.last.weight,goal):null;
  return <section className={`card body-weight-progress ${compact?'weight-card compact':'progress-chart'}`}><div className="section-head"><h3>{compact?'Vývoj váhy':'Tělesná váha'}</h3>{openDetail?<button className="text-button" onClick={openDetail}>Detail <ArrowUpRight size={16}/></button>:<Scale size={20}/>}</div>
    {entries.length?<><div className="weight-stats"><div className="weight-stat latest"><span>Poslední zapsaná váha</span><strong>{n(summary.last!.weight)} <small>kg</small></strong><small>{fullDate(summary.last!.date)}</small></div><div className="weight-stat"><span>Od prvního vážení</span><strong>{signed(summary.total)}</strong><small>{direction(summary.total)} · od {displayDate(summary.first.date,{day:'numeric',month:'numeric',year:'numeric'})}</small><small>{n(summary.first.weight)} → {n(summary.last!.weight)} kg</small></div><div className="weight-stat"><span>Od minulého vážení</span><strong>{signed(summary.change)}</strong><small>{summary.previous?`${n(summary.previous.weight)} kg · ${fullDate(summary.previous.date)}`:'Zatím máš jen jedno vážení'}</small></div>{!compact&&<div className="weight-stat"><span>Cílová váha</span><strong>{goalValid?`${n(goal)} kg`:'—'}</strong><small>{remaining===null?'Nastavíš v Nastavení':remaining===0?'Stejná jako poslední váha':`${n(Math.abs(remaining))} kg ${remaining>0?'nad cílem':'pod cílem'}`}</small></div>}</div>
      {!compact?<><label className="field weight-range"><span>Období grafu</span><select aria-label="Období grafu tělesné váhy" value={range} onChange={e=>setRange(e.target.value)}><option value="7">Posledních 7 dnů</option><option value="14">Posledních 14 dnů</option><option value="30">Posledních 30 dnů</option><option value="90">Posledních 90 dnů</option><option value="all">Všechna vážení</option></select></label><div className="weight-period"><strong>Změna v grafu: {signed(period.total)}</strong>{visible.length>1&&<span>{fullDate(period.first.date)} – {fullDate(period.last!.date)} · {n(period.first.weight)} → {n(period.last!.weight)} kg</span>}{visible.length===1&&<span>V období máš jedno vážení. Pro změnu jsou potřeba dvě.</span>}</div></>:<p className="weight-chart-note">Graf: posledních {visible.length} vážení · celková změna výše je od {fullDate(summary.first.date)}.</p>}
      <WeightChart entries={visible} compact={compact}/>
    </>:<p className="weight-empty">Zapiš první vážení. Pak tu uvidíš přesnou váhu, data i změnu v kilogramech.</p>}
  </section>;
}
