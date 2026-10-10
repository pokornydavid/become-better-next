let database: Promise<IDBDatabase> | undefined;
function db() {
  database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open('become-better-next-photos', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('files');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('Fotky se nepodařilo uložit do zařízení.'));
  });
  return database;
}
export async function storePhoto(scope: string, id: string, file: Blob) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Vyber JPG, PNG nebo WebP.');
  if (file.size > 10 * 1024 * 1024) throw new Error('Fotka může mít nejvýš 10 MB.');
  const database = await db();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction('files', 'readwrite');
    transaction.objectStore('files').put(file, `${scope}:${id}`);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(new Error('V zařízení není dost místa pro fotku.'));
    transaction.onabort = () => reject(new Error('Fotku se nepodařilo uložit.'));
  });
}
export async function readPhoto(scope: string, id: string) {
  const database = await db();
  return new Promise<Blob | undefined>((resolve, reject) => {
    const request = database.transaction('files').objectStore('files').get(`${scope}:${id}`);
    request.onsuccess = () => resolve(request.result as Blob | undefined);
    request.onerror = () => reject(new Error('Fotku se nepodařilo načíst.'));
  });
}
