import type { DataRecord } from './model.ts';
import type { Repository } from './repository.ts';

export type RecordTransport = {
  fetchPage: (userId: string, offset: number, limit: number) => Promise<DataRecord[]>;
  commit: (record: DataRecord) => Promise<DataRecord>;
  prepare?: (record: DataRecord, userId: string) => Promise<void>;
};

// Shared by the real cloud connection and two-device regression tests.
// Never replace an account store with a downloaded snapshot.
export async function syncRecords(repo: Repository, transport: RecordTransport, online: boolean): Promise<boolean> {
  const userId = repo.getSnapshot().user?.id;
  if (!userId) return false;
  const currentAccount = () => repo.getSnapshot().user?.id === userId;
  if (!online) { repo.setStatus('offline'); return false; }
  repo.setStatus('syncing');
  try {
    for (let offset = 0; ; offset += 500) {
      const rows = await transport.fetchPage(userId, offset, 500);
      if (!currentAccount()) return false;
      repo.receive(rows, userId);
      if (rows.length < 500) break;
    }
    const ids = [...repo.getSnapshot().store.pending];
    let failures = 0;
    for (const id of ids) {
      try {
        for (let attempt = 0; attempt < 4; attempt++) {
          if (!currentAccount()) return false;
          if (!repo.getSnapshot().store.pending.includes(id)) break;
          let record = repo.getSnapshot().store.records[id];
          if (!record) break;
          await transport.prepare?.(record, userId);
          if (!currentAccount()) return false;
          record = repo.getSnapshot().store.records[id];
          const remote = await transport.commit(record);
          if (!currentAccount()) return false;
          repo.receive([remote], userId);
          if (!repo.getSnapshot().store.pending.includes(id)) break;
        }
      } catch {
        // One failed upload (including a missing photo) must not prevent the
        // remaining workout sets from reaching the other device.
        failures++;
      }
    }
    if (!currentAccount()) return false;
    if (failures) throw new Error('Některé změny se nepodařilo odeslat. Zůstávají uložené v zařízení.');
    const pending = repo.getSnapshot().store.pending.length > 0;
    repo.setStatus(pending ? 'syncing' : 'synced', '', pending ? undefined : new Date().toISOString());
    return pending;
  } catch (error) {
    if (currentAccount()) repo.setStatus('error', error instanceof Error ? error.message : 'Přenos se nezdařil. Změny zůstávají uložené v zařízení.');
    return false;
  }
}
