import { addDays, dateKey, emptyStore, patchRecord, recordsOf, validateStore, weekDates } from './model.ts';
import type { Kind, Store, Value } from './model.ts';
import { validDate } from './progress-phases.ts';
import { staticBuildId } from './service-worker-source.ts';
export type PreparedBackup = { store: Store; embedded: { id: string; file: Blob }[]; missingPhotos: number; legacy: boolean };
type ObjectData = Record<string, unknown>;
const object = (value: unknown): ObjectData => value && typeof value === 'object' && !Array.isArray(value) ? value as ObjectData : {};
const string = (value: unknown) => typeof value === 'string' ? value : '';
function optional(value: unknown) { if (value == null || (typeof value === 'string' && !value.trim())) return null; if (!['string','number'].includes(typeof value)) throw new Error('Záloha obsahuje neplatné číslo.'); const n = Number(value); if (!Number.isFinite(n) || n < 0) throw new Error('Záloha obsahuje neplatné číslo.'); return n; }
export function prepareBackup(input: unknown, today = dateKey()): PreparedBackup {
  const raw = object(input);
  if (raw.version === 1 && raw.records) return { store: validateStore(input), embedded: [], missingPhotos: 0, legacy: false };
  if (!raw.weeks || typeof raw.weeks !== 'object' || Array.isArray(raw.weeks) || !raw.nutrition || typeof raw.nutrition !== 'object' || Array.isArray(raw.nutrition)) throw new Error('Vyber JSON zálohu Become Better nebo původní fit-plan aplikace.');
  const store = emptyStore(), embedded: PreparedBackup['embedded'] = [], stamp = new Date().toISOString(); let missingPhotos = 0, recordCount = 0;
  const put = (id: string, kind: Kind, payload: Record<string, Value>) => {
    if (!store.records[id] && ++recordCount > 50000) throw new Error('Záloha má příliš mnoho záznamů.');
    if (store.records[id] && store.records[id].kind !== kind) throw new Error('Záloha obsahuje kolizi záznamů.');
    store.records[id] = patchRecord(store.records[id], id, kind, payload, stamp);
  };
  for (const [start, week] of Object.entries(object(raw.weeks))) {
    if (!validDate(start)) throw new Error('Záloha obsahuje neplatné datum týdne.');
    for (let day = 0; day < 7; day++) {
      const value = object(object(week)[String(day)]), exercises = Array.isArray(value.exercises) ? value.exercises : [];
      if (!exercises.length && !value.title && !value.notes && !value.focus) continue;
      const date = addDays(start, day), id = `legacy-workout-${date}`, sets = exercises.flatMap(e => Array.isArray(object(e).sets) ? object(e).sets as unknown[] : []);
      put(id, 'workout', { name: string(value.title) || string(value.focus) || 'Původní trénink', date, notes: string(value.notes), focus: string(value.focus), duration: 0, status: sets.length && sets.every(s => object(s).done === true) ? 'completed' : 'planned', source: 'legacy' });
      exercises.forEach((item, order) => {
        const exercise = object(item), exerciseId = `legacy-exercise-${date}-${order}`;
        put(exerciseId, 'exercise', { workoutId: id, name: string(exercise.name) || 'Vlastní cvik', muscle: string(exercise.muscle), cue: string(exercise.notes), order, source: 'legacy' });
        (Array.isArray(exercise.sets) ? exercise.sets : []).forEach((item, index) => { const set = object(item); put(`legacy-set-${date}-${order}-${index}`, 'set', { exerciseId, weight: optional(set.weight), reps: optional(set.reps), rpe: optional(set.rpe), done: set.done === true, order: index }); });
      });
    }
  }
  const nutrition = object(raw.nutrition), starts = Object.keys(nutrition).sort();
  if (starts.some(start => !validDate(start))) throw new Error('Záloha výživy obsahuje neplatné datum.');
  const activeStart = [...starts].reverse().find(start => start <= today) || starts[0], currentMonday = weekDates(today)[0];
  for (const start of starts) {
    const week = object(nutrition[start]), oldGoals = object(week.goals), goals: Record<string, Value> = {};
    for (const [old, key] of [['dailyCalories','calories'],['weeklyCalories','weeklyCalories'],['protein','protein'],['carbs','carbs'],['fat','fat'],['bookPages','weeklyBookPages'],['morningWalkMinutes','weeklyWalkMinutes']]) { const value = optional(oldGoals[old]); if (value !== null) goals[key] = value; }
    if (optional(oldGoals.weeklySteps) !== null) goals.steps = Number(oldGoals.weeklySteps) / 7;
    if (start === activeStart) put('goals','goals',goals);
    // Historical weekly targets remain historical; trainer updates and current
    // account settings continue to control the active week.
    if (start < currentMonday) put(`goals-week-${start}`,'goals',{ ...goals, date: start });
    const days = Array.isArray(week.days) ? week.days : [];
    days.slice(0,7).forEach((item,index) => {
      const old = object(item), date = addDays(start,index), daily: Record<string, Value> = {};
      for (const key of ['calories','protein','carbs','fat','steps','sleepQuality','nightWakeups','caffeine','bookPages','stress']) { const value = optional(old[key]); if (value !== null) daily[key] = value; }
      const minutes = optional(old.morningWalkMinutes); if (minutes !== null) { daily.walkMinutes = minutes; daily.walk = minutes > 0; }
      for (const key of ['bedTime','wakeTime','notes','sleepNotes']) if (string(old[key])) daily[key] = string(old[key]);
      if (!daily.bedTime && /^\d{2}:\d{2}$/.test(string(old.sleepTime))) daily.bedTime = string(old.sleepTime);
      if (old.wokeWithoutAlarm === 'yes' || old.wokeWithoutAlarm === true) daily.wokeWithoutAlarm = true;
      if (Object.keys(daily).length) put(`daily-${date}`,'daily',{ date, ...daily });
      const weight = optional(old.weight); if (weight !== null) put(`legacy-weight-${date}`,'measurement',{date,weight,notes:string(old.notes)});
    });
  }
  (Array.isArray(raw.library) ? raw.library : []).forEach((item,index) => { const entry = object(item); if (string(entry.name)) put(`legacy-library-${index}`,'library',{name:string(entry.name),muscle:string(entry.muscle),equipment:'',cue:''}); });
  const phase = object(raw.nutritionPhase || Object.values(nutrition).map(week => object(week).phase).find(Boolean)), deleted = new Set(Array.isArray(phase.deletedRowIds) ? phase.deletedRowIds : []);
  const rows = (Array.isArray(phase.rows) ? phase.rows : []).filter(row => !deleted.has(object(row).id));
  const populated = rows.some(item => { const row = object(item); return row.date || row.weight || row.note || (Array.isArray(row.photos) && row.photos.length); });
  if (rows.length && (populated || phase.title || phase.goalWeight)) {
    if (rows.length > 52) throw new Error('Původní fáze má více než 52 týdnů. Rozděl ji před převodem do kratších fází.');
    const phaseId = 'legacy-progress-phase', start = rows.map(row => string(object(row).date)).find(validDate) || activeStart || (validDate(string(raw.weekStart)) ? string(raw.weekStart) : today);
    put(phaseId,'progressPhase',{ name:string(phase.title) || 'Původní fáze', type:['diet','bulk','maintain'].includes(string(phase.mode)) ? string(phase.mode) : 'custom', start, weeks:rows.length, goal:'Převedeno z původní aplikace.', targetWeight:optional(phase.goalWeight) });
    rows.forEach((item,index) => {
      const row = object(item), date = validDate(string(row.date)) ? string(row.date) : addDays(start,index*7), id = `legacy-album-${index}`;
      const photos = Array.isArray(row.photos) ? row.photos.map(object) : [], unavailable: string[] = [];
      const order = Array.isArray(row.photoOrder) ? row.photoOrder.map(String) : [];
      photos.sort((a,b) => { const position=(p:ObjectData) => { const keys=[p.cloudId,p.storagePath,p.id].filter(Boolean).map(String); const i=order.findIndex(value=>keys.some(key=>value===key || value.endsWith(':'+key)));return i<0 ? order.length : i; }; return position(a)-position(b); });
      photos.forEach((photo,i) => {
        const dataUrl = string(photo.dataUrl), match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/.exec(dataUrl);
        if (!match) { unavailable.push(string(photo.name) || `Fotka ${i+1}`); missingPhotos++; return; }
        let binary; try { binary=atob(match[2]); } catch { throw new Error('Záloha obsahuje poškozenou fotku.'); }
        if (binary.length>10*1024*1024) throw new Error('Fotka v záloze je větší než 10 MB.');
        const photoId=`legacy-photo-${staticBuildId([string(photo.id)||string(photo.cloudId)||`${index}:${i}`,dataUrl])}`, file=new Blob([Uint8Array.from(binary,c=>c.charCodeAt(0))],{type:match[1]}); embedded.push({id:photoId,file});
        put(photoId,'photo',{date,albumId:id,order:i,storagePath:'',caption:string(photo.name)||`Fotka ${i+1}`,mime:match[1]});
      });
      put(id,'photoAlbum',{name:string(row.weekLabel)||`Týden ${index+1}`,date,phaseId,week:index+1,notes:string(row.note),legacyPhotoNames:JSON.stringify(unavailable),legacyMissingPhotos:unavailable.length});
      const weight=optional(row.weight);if(weight!==null)put(`legacy-phase-weight-${index}`,'measurement',{date,weight,notes:string(row.note)});
    });
  }
  const targetWeight=optional(phase.goalWeight);
  if (store.records.goals || phase.title || targetWeight!==null) put('goals','goals',{mode:['diet','bulk','maintain'].includes(string(phase.mode)) ? string(phase.mode) : 'maintain',phase:string(phase.title),...(targetWeight!==null ? {weight:targetWeight} : {})});
  return {store:validateStore(store),embedded,missingPhotos,legacy:true};
}
export function backupSummary(backup: PreparedBackup) {
  return { workouts:recordsOf(backup.store,'workout').length,days:recordsOf(backup.store,'daily').length,measurements:recordsOf(backup.store,'measurement').length,albums:recordsOf(backup.store,'photoAlbum').length,photos:backup.embedded.length,missingPhotos:backup.missingPhotos };
}
export function backupForDestination(backup: PreparedBackup, current: Store): Store {
  const records={...backup.store.records};
  for(const [id,row] of Object.entries(records)) {
    const previous=current.records[id];
    if(previous && previous.kind!==row.kind)throw new Error('Záloha obsahuje ID jiného typu záznamu. Přenos byl zastaven.');
    if(backup.legacy && previous && !previous.deleted)records[id]={...row,payload:{...previous.payload,...row.payload}};
  }
  return {...backup.store,records};
}
