// Dünner Promise-Wrapper um IndexedDB. Alle Daten bleiben auf dem Gerät.
const NAME = 'chat-archiv';
const VERSION = 1;
const STORES = { chats: 'id', list: 'id', index: 'tok', kv: 'key', decisions: 'id', learn: 'tok' };
export const STORE_NAMES = Object.keys(STORES);

let opening = null;
export function open() {
  if (!opening) {
    opening = new Promise((resolve, reject) => {
      const r = indexedDB.open(NAME, VERSION);
      r.onupgradeneeded = () => {
        for (const [name, keyPath] of Object.entries(STORES)) {
          if (!r.result.objectStoreNames.contains(name)) r.result.createObjectStore(name, { keyPath });
        }
      };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      r.onblocked = () => reject(new Error('Datenbank blockiert (andere Instanz offen?)'));
    });
  }
  return opening;
}

/** Führt fn(store1, store2, …) in einer Transaktion aus und wartet auf deren Abschluss. */
export async function withTx(names, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(names, mode);
    let out;
    try { out = fn(...names.map(n => t.objectStore(n))); } catch (e) { try { t.abort(); } catch { /* schon beendet */ } reject(e); return; }
    t.oncomplete = () => resolve(out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('Transaktion abgebrochen'));
  });
}

const wrap = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
export const get = async (store, key) => withTx([store], 'readonly', s => wrap(s.get(key))).then(p => p);
export const getAll = store => withTx([store], 'readonly', s => wrap(s.getAll())).then(p => p);
export const put = (store, value) => withTx([store], 'readwrite', s => { s.put(value); });
export const putMany = (store, values) => withTx([store], 'readwrite', s => { for (const v of values) s.put(v); });
export const del = (store, key) => withTx([store], 'readwrite', s => { s.delete(key); });
export const delMany = (store, keys) => withTx([store], 'readwrite', s => { for (const k of keys) s.delete(k); });
export const clear = names => withTx(names, 'readwrite', (...ss) => { for (const s of ss) s.clear(); });

/** Alle Schlüssel mit diesem Präfix (Wortanfang-Suche im Index). */
export const prefixScan = (store, prefix, limit = 20000) =>
  withTx([store], 'readonly', s => wrap(s.getAll(IDBKeyRange.bound(prefix, prefix + '￿'), limit))).then(p => p);

/** Index-Einträge ändern: Token -> Menge von Chat-ids hinzufügen bzw. entfernen. */
export function updatePostings(add, remove) {
  const all = new Set([...add.keys(), ...remove.keys()]);
  return withTx(['index'], 'readwrite', s => {
    for (const tok of all) {
      s.get(tok).onsuccess = e => {
        const cur = e.target.result;
        const ids = new Set(cur ? cur.ids : []);
        for (const id of remove.get(tok) || []) ids.delete(id);
        for (const id of add.get(tok) || []) ids.add(id);
        if (ids.size) s.put({ tok, ids: [...ids] });
        else if (cur) s.delete(tok);
      };
    }
  });
}

export async function deleteDatabase() {
  if (opening) { (await opening).close(); opening = null; }
  await new Promise((res, rej) => {
    const r = indexedDB.deleteDatabase(NAME);
    r.onsuccess = () => res();
    r.onerror = () => rej(r.error);
    r.onblocked = () => res();
  });
}
