import { addDays, dateKey, recordStamp } from './model.ts';
import type { DataRecord } from './model.ts';

export type WeightEntry = {id:string;date:string;weight:number};
function validDate(date:unknown):date is string {
  return typeof date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(date)&&Number.isFinite(Date.parse(`${date}T12:00:00Z`))&&new Date(`${date}T12:00:00Z`).toISOString().slice(0,10)===date;
}
export function weightEntries(records:DataRecord[],today=dateKey()):WeightEntry[] {
  return records.filter(record=>record.kind==='measurement'&&!record.deleted&&validDate(record.payload.date)&&record.payload.date<=today&&typeof record.payload.weight==='number'&&Number.isFinite(record.payload.weight)&&record.payload.weight>0)
    .sort((a,b)=>String(a.payload.date).localeCompare(String(b.payload.date))||recordStamp(a).localeCompare(recordStamp(b))||a.id.localeCompare(b.id))
    .map(record=>({id:record.id,date:record.payload.date as string,weight:record.payload.weight as number}));
}
export function weightDifference(current:number,previous:number) {return Math.round((current-previous)*100)/100||0;}
export function weightSummary(entries:WeightEntry[]) {
  const first=entries[0],last=entries.at(-1),previous=entries.at(-2);
  return {first,last,previous,total:first&&last&&entries.length>1?weightDifference(last.weight,first.weight):null,change:previous&&last?weightDifference(last.weight,previous.weight):null};
}
export function weightsInRange(entries:WeightEntry[],range:string,today=dateKey()) {
  if(range==='all')return entries;
  const length=Number(range);if(![7,14,30,90].includes(length))return entries;
  const from=addDays(today,1-length);return entries.filter(entry=>entry.date>=from&&entry.date<=today);
}
