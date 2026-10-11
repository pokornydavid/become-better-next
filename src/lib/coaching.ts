import { createDemo } from './demo.ts';
import type { Store } from './model.ts';
import { supabase } from './sync';
export type Team = { id: string; name: string; owner_id: string };
export type Member = { team_id: string; user_id: string; display_name: string };
export type Client = { team_id: string; client_id: string; display_name: string; goal: string; share_photos: boolean; allow_management: boolean; accepted_at: string };
export type Invite = { code: string; team_id: string; email: string; invite_role: string; expires_at: string; accepted_at: string | null };
export type Message = { id: string; team_id: string; client_id: string; sender_id: string; sender_name: string; body: string; created_at: string };
export type Plan = { id: string; team_id: string; client_id: string; title: string; body: string; assigned_by: string; created_at: string };
export type Note = { team_id: string; client_id: string; body: string };
export type CoachingData = { teams: Team[]; members: Member[]; clients: Client[]; invites: Invite[]; messages: Message[]; plans: Plan[]; notes: Note[]; records: Record<string, Store> };
export const COACH_DEMO_KEY = 'become-better-next:coaching-demo:v1';
export const emptyCoaching = (): CoachingData => ({ teams: [], members: [], clients: [], invites: [], messages: [], plans: [], notes: [], records: {} });
export function createCoachDemo(): CoachingData {
  const now = new Date().toISOString();
  const data: CoachingData = {
    teams: [{ id: 'demo-team', name: 'Můj trenérský tým', owner_id: 'demo-coach' }],
    members: [{ team_id: 'demo-team', user_id: 'demo-coach', display_name: 'Ty · trenér' }, { team_id: 'demo-team', user_id: 'demo-colleague', display_name: 'Martin · trenér' }],
    clients: [{ team_id: 'demo-team', client_id: 'demo-klara', display_name: 'Klára Novotná', goal: 'Budovat sílu a pravidelný režim', share_photos: false, allow_management: true, accepted_at: now }, { team_id: 'demo-team', client_id: 'demo-adam', display_name: 'Adam Dvořák', goal: 'Nabrat svaly, trénink 4× týdně', share_photos: false, allow_management: true, accepted_at: now }],
    invites: [], notes: [], plans: [], records: {},
    messages: [{ id: 'demo-msg-1', team_id: 'demo-team', client_id: 'demo-klara', sender_id: 'demo-klara', sender_name: 'Klára', body: 'Dnes jsem přidala opakování u tlaků. Příští týden zkusíme větší váhu?', created_at: now }, { id: 'demo-msg-2', team_id: 'demo-team', client_id: 'demo-klara', sender_id: 'demo-colleague', sender_name: 'Martin · trenér', body: 'Mrkneme společně na záznamy a upravíme další trénink.', created_at: now }],
  };
  for (const client of data.clients) data.records[client.client_id] = createDemo();
  return data;
}
export function readCoachDemo(storage: Pick<Storage, 'getItem'>): CoachingData {
  const raw = storage.getItem(COACH_DEMO_KEY); if (!raw) return createCoachDemo();
  const data = JSON.parse(raw) as CoachingData;
  if (!data || !['teams','members','clients','invites','messages','plans','notes'].every(k => Array.isArray(data[k as keyof CoachingData])) || !data.records || typeof data.records !== 'object') throw new Error('Místní trenérskou ukázku se nepodařilo načíst.');
  return data;
}
export async function coachRpc(name: string, args: Record<string, unknown>) {
  if (!supabase) throw new Error('Nejdřív připoj nový účet.');
  const { data, error } = await supabase.rpc(name, args); if (error) throw new Error(error.message); return data;
}
async function rows<T>(table: string): Promise<T[]> {
  if (!supabase) return [];
  const result: T[] = [];
  for (let offset = 0;; offset += 500) {
    let query = supabase.from(table).select('*').order(table === 'coach_teams' ? 'id' : table === 'coach_invites' ? 'code' : 'team_id');
    if (table === 'coach_members') query = query.order('user_id');
    if (table === 'coach_clients') query = query.order('client_id');
    const { data, error } = await query.range(offset, offset + 499);
    if (error) throw new Error(error.message);
    result.push(...data as T[]); if (data.length < 500) return result;
  }
}
export async function loadCoaching(): Promise<CoachingData> {
  const [teams, members, clients, invites] = await Promise.all([rows<Team>('coach_teams'), rows<Member>('coach_members'), rows<Client>('coach_clients'), rows<Invite>('coach_invites')]);
  return { ...emptyCoaching(), teams, members, clients, invites };
}
export async function loadClient(team: string, client: string) {
  if (!supabase) throw new Error('Připoj účet.');
  const fetch = async <T>(table: string, ordering: string): Promise<T[]> => {
    const result: T[] = [];
    for (let offset = 0;; offset += 500) {
      let query = supabase!.from(table).select('*').eq('team_id',team).eq('client_id',client).order(ordering);
      if (ordering === 'created_at') query = query.order('id');
      const { data, error } = await query.range(offset,offset+499);
      if (error) throw new Error(error.message); result.push(...data as T[]); if (data.length < 500) return result;
    }
  };
  const records: Store = { version: 1, records: {}, pending: [], demo: false };
  for (let offset = 0;; offset += 500) {
    const { data, error } = await supabase.from('user_records').select('*').eq('user_id',client).order('id').range(offset,offset+499);
    if (error) throw new Error(error.message);
    for (const row of data) records.records[row.id] = { id: row.id, kind: row.kind, payload: row.payload, stamps: row.field_stamps, deleted: row.deleted, revision: row.revision };
    if (data.length < 500) break;
  }
  const [messages, plans, notes] = await Promise.all([fetch<Message>('coach_messages','created_at'), fetch<Plan>('coach_plans','created_at'), fetch<Note>('coach_notes','team_id')]);
  return { records, messages, plans, notes };
}
