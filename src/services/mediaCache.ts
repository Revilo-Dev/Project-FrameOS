/** Disposable private-app storage. No writes to USB and no localStorage payloads. */
interface RecordValue { key: string; value: unknown; used: number; bytes: number }
export interface CacheBackend { read(): Promise<RecordValue[]>; write(records: RecordValue[]): Promise<void> }
export function indexedBackend(namespace: string, factory?: IDBFactory): CacheBackend | undefined {
  if (!factory) { try { factory = typeof indexedDB === 'undefined' ? undefined : indexedDB; } catch { return undefined; } }
  if (!factory) return undefined;
  let database: Promise<IDBDatabase | null> | undefined;
  const open = () => database ||= new Promise(resolve => {
    let settled = false;
    const finish = (db: IDBDatabase | null) => { if (settled) { db?.close(); return; } settled = true; clearTimeout(timer); resolve(db); };
    const timer = setTimeout(() => finish(null), 1200);
    try {
      const request = factory!.open(`frameos.media.v4.${namespace}`, 1);
      request.onupgradeneeded = () => { request.result.createObjectStore('records', { keyPath: 'key' }); };
      request.onsuccess = () => { request.result.onversionchange = () => request.result.close(); finish(request.result); };
      request.onerror = () => finish(null); request.onblocked = () => finish(null);
    } catch { finish(null); }
  });
  const transaction = async <T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore, result: (value: T) => void) => void, fallback: T): Promise<T> => {
    const db = await open(); if (!db) return fallback;
    return new Promise(resolve => {
      let value = fallback;
      const timer = setTimeout(() => { try { tx.abort(); } catch { /* Already complete. */ } resolve(fallback); }, 1500);
      let tx: IDBTransaction;
      try {
        tx = db.transaction('records', mode);
        tx.oncomplete = () => { clearTimeout(timer); resolve(value); };
        tx.onerror = tx.onabort = () => { clearTimeout(timer); resolve(fallback); };
        operation(tx.objectStore('records'), next => { value = next; });
      } catch { clearTimeout(timer); resolve(fallback); }
    });
  };
  return {
    read: () => transaction('readonly', (store, result) => { const request = store.getAll(); request.onsuccess = () => result(request.result); }, [] as RecordValue[]),
    write: records => transaction('readwrite', store => { store.clear(); for (const record of records) store.put(record); }, undefined),
  };
}

/** Serialized writes, LRU count + byte bounds, corruption/quota/unavailable fallback. */
export class BoundedMediaCache<T> {
  private records = new Map<string, RecordValue>();
  private ready: Promise<void>;
  private writes = Promise.resolve();
  private generation = 0;
  constructor(private backend: CacheBackend | undefined, private maximum: number, private byteLimit: number, private valid: (value: unknown) => value is T) {
    this.ready = Promise.resolve().then(() => backend?.read()).then(records => {
      if (Array.isArray(records)) for (const record of records) {
        if (record && typeof record.key === 'string' && record.key.length < 16384 && Number.isFinite(record.used) && valid(record.value)) {
          const bytes = JSON.stringify(record.value).length * 2;
          if (bytes <= byteLimit) this.records.set(record.key, { ...record, bytes });
        }
      }
      this.trim();
    }).catch(() => {});
  }
  private trim() {
    const ordered = [...this.records.values()].sort((a, b) => a.used - b.used);
    let bytes = ordered.reduce((total, record) => total + record.bytes, 0);
    for (const record of ordered) {
      if (this.records.size <= this.maximum && bytes <= this.byteLimit) break;
      this.records.delete(record.key); bytes -= record.bytes;
    }
  }
  private persist() {
    this.writes = this.writes.then(() => this.backend?.write([...this.records.values()])).catch(() => {});
    return this.writes;
  }
  async get(key: string): Promise<T | undefined> {
    await this.ready;
    const record = this.records.get(key);
    if (record) { record.used = Date.now(); return record.value as T; }
    return undefined;
  }
  async put(key: string, value: T) {
    const generation = this.generation; await this.ready;
    if (generation !== this.generation || !this.valid(value)) return;
    const bytes = JSON.stringify(value).length * 2;
    if (bytes > this.byteLimit) return;
    this.records.delete(key); this.records.set(key, { key, value, bytes, used: Date.now() }); this.trim();
    await this.persist();
  }
  async clear() { ++this.generation; await this.ready; this.records.clear(); await this.persist(); }
  async delete(key: string) { await this.ready; this.records.delete(key); await this.persist(); }
  async deleteMatching(matches: (value: T) => boolean) {
    await this.ready;
    for (const [key, record] of this.records) if (matches(record.value as T)) this.records.delete(key);
    await this.persist();
  }
}
