/**
 * 日志存储：内存环形缓冲（面板与导出读它）+ 异步落盘（独立 IndexedDB 库 lcq-log，不碰存档库 DAD_SAVES_DB 及其 DB_VERSION）。
 * IndexedDB 不可用 / 打开失败 → 降级到 localStorage 小缓存（只留最近 localFallbackMax 条）；再不行就只留内存。
 * 条数与体积上限（ringMax / maxBytes）内存与磁盘各自生效，超了删最老的。所有落盘错误吞掉，不影响游戏。
 */
import { diagnosticsConfig } from './config';
import type { LogLevel } from './config';

export interface LogEntry {
  ts: string;
  level: LogLevel;
  code: string;
  module: string;
  sessionId: string;
  turnId: string | null;
  requestId?: string;
  msg: string;
  detail?: unknown;
  stack?: string;
}
export interface StoredEntry extends LogEntry { seq: number }

export interface LogBackend {
  kind: 'indexedDB' | 'localStorage' | 'memory';
  load(): Promise<StoredEntry[]>;
  put(entries: StoredEntry[]): Promise<void>;
  remove(seqs: number[]): Promise<void>;
  clear(): Promise<void>;
}

export const LOG_DB_NAME = 'lcq-log';
export const LOG_STORE_NAME = 'logs';
export const LOG_DB_VERSION = 1;
export const LOG_FALLBACK_KEY = 'lcq-log-fallback';

const sizeOf = (entry: StoredEntry): number => { try { return JSON.stringify(entry).length; } catch { return 0; } }; // lcq-allow: 估算体积，序列化失败按 0 计

const request = <T>(req: IDBRequest<T>): Promise<T> => new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
const done = (tx: IDBTransaction): Promise<void> => new Promise((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error); });

export async function indexedDbBackend(factory: IDBFactory): Promise<LogBackend> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const open = factory.open(LOG_DB_NAME, LOG_DB_VERSION);
    open.onupgradeneeded = () => { if (!open.result.objectStoreNames.contains(LOG_STORE_NAME)) open.result.createObjectStore(LOG_STORE_NAME, { keyPath: 'seq' }); };
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
    open.onblocked = () => reject(new Error('lcq-log 打开被阻塞'));
  });
  const write = async (fn: (store: IDBObjectStore) => void): Promise<void> => {
    const tx = db.transaction(LOG_STORE_NAME, 'readwrite');
    fn(tx.objectStore(LOG_STORE_NAME));
    await done(tx);
  };
  return {
    kind: 'indexedDB',
    load: async () => ((await request(db.transaction(LOG_STORE_NAME, 'readonly').objectStore(LOG_STORE_NAME).getAll())) as StoredEntry[]).sort((a, b) => a.seq - b.seq),
    put: entries => write(store => { for (const entry of entries) store.put(entry); }),
    remove: seqs => write(store => { for (const seq of seqs) store.delete(seq); }),
    clear: () => write(store => { store.clear(); }),
  };
}

export function localStorageBackend(storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>, max: () => number = () => diagnosticsConfig().localFallbackMax): LogBackend {
  const read = (): StoredEntry[] => {
    try { const parsed = JSON.parse(storage.getItem(LOG_FALLBACK_KEY) || '[]'); return Array.isArray(parsed) ? parsed : []; } catch { return []; } // lcq-allow: 兜底缓存损坏就当空
  };
  const save = (entries: StoredEntry[]): void => {
    try { storage.setItem(LOG_FALLBACK_KEY, JSON.stringify(entries.slice(-max()))); } catch { /* lcq-allow: 配额满等写失败，兜底缓存丢弃，不得影响游戏 */ }
  };
  return {
    kind: 'localStorage',
    load: async () => read(),
    put: async entries => save([...read(), ...entries]),
    remove: async seqs => { const drop = new Set(seqs); save(read().filter(entry => !drop.has(entry.seq))); },
    clear: async () => { try { storage.removeItem(LOG_FALLBACK_KEY); } catch { /* lcq-allow: 同上 */ } },
  };
}

const memoryBackend = (): LogBackend => ({ kind: 'memory', load: async () => [], put: async () => {}, remove: async () => {}, clear: async () => {} });

export interface LogStoreOptions {
  openBackend?: () => Promise<LogBackend>;
  /** 落盘从 IndexedDB 降级时回调一次（log.ts 用它记 LCQ-SYS-001）。 */
  onDegrade?: (reason: unknown, to: LogBackend['kind']) => void;
}

export function createLogStore(options: LogStoreOptions = {}) {
  let ring: StoredEntry[] = [];
  let ringBytes = 0;
  const sizes = new Map<number, number>();
  let pending: StoredEntry[] = [];
  const persisted = new Map<number, number>();
  let counter = 0;
  let backend: Promise<LogBackend> | null = null;
  let loaded: Promise<void> | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let flushing: Promise<void> = Promise.resolve();
  const listeners = new Set<() => void>();

  const openDefault = async (): Promise<LogBackend> => {
    const ls = (): LogBackend => typeof localStorage !== 'undefined' ? localStorageBackend(localStorage) : memoryBackend();
    if (typeof indexedDB === 'undefined') { const fallback = ls(); options.onDegrade?.('indexedDB 不存在', fallback.kind); return fallback; }
    try { return await indexedDbBackend(indexedDB); } catch (error) { const fallback = ls(); options.onDegrade?.(error, fallback.kind); return fallback; } // lcq-allow: 降级本身经 onDegrade 回报给 log.ts 记 LCQ-SYS-001
  };
  const getBackend = (): Promise<LogBackend> => (backend ||= (options.openBackend ?? openDefault)());

  const sortedPush = (entries: StoredEntry[]): void => {
    const known = new Set(ring.map(entry => entry.seq));
    for (const entry of entries) if (!known.has(entry.seq)) { ring.push(entry); sizes.set(entry.seq, sizeOf(entry)); ringBytes += sizes.get(entry.seq)!; }
    ring.sort((a, b) => a.seq - b.seq);
    trimRing();
  };
  const trimRing = (): void => {
    const cfg = diagnosticsConfig();
    while (ring.length > 1 && (ring.length > cfg.ringMax || ringBytes > cfg.maxBytes)) { const old = ring.shift()!; ringBytes -= sizes.get(old.seq) ?? 0; sizes.delete(old.seq); }
  };
  const notify = (): void => { for (const fn of [...listeners]) { try { fn(); } catch { /* lcq-allow: 订阅者出错不得影响日志写入 */ } } };

  /** 读一次磁盘里的旧记录并入内存（面板 / 导出 / 首次落盘前调用）。 */
  const ensureLoaded = (): Promise<void> => (loaded ||= (async () => {
    const stored = await (await getBackend()).load();
    for (const entry of stored) persisted.set(entry.seq, sizeOf(entry));
    sortedPush(stored);
    notify();
  })().catch(() => { /* lcq-allow: 读盘失败只影响历史记录，当前会话的内存记录照常 */ }));

  const trimPersisted = async (b: LogBackend): Promise<void> => {
    const cfg = diagnosticsConfig();
    let bytes = 0;
    for (const size of persisted.values()) bytes += size;
    const drop: number[] = [];
    for (const seq of [...persisted.keys()].sort((a, c) => a - c)) {
      if (persisted.size - drop.length <= cfg.ringMax && bytes <= cfg.maxBytes) break;
      bytes -= persisted.get(seq) ?? 0; drop.push(seq);
    }
    if (!drop.length) return;
    await b.remove(drop);
    for (const seq of drop) persisted.delete(seq);
  };

  const flushNow = (): Promise<void> => (flushing = flushing.then(async () => {
    if (timer) { clearTimeout(timer); timer = null; }
    if (!pending.length) return;
    const batch = pending; pending = [];
    try {
      await ensureLoaded();
      const b = await getBackend();
      await b.put(batch);
      for (const entry of batch) persisted.set(entry.seq, sizeOf(entry));
      await trimPersisted(b);
    } catch { /* lcq-allow: 落盘失败不重试不报错（日志不得制造新的错误），内存环形缓冲仍有这批记录 */ }
  }));
  const scheduleFlush = (): void => {
    if (timer) return;
    timer = setTimeout(() => { void flushNow(); }, diagnosticsConfig().flushMs);
    (timer as { unref?: () => void }).unref?.();
  };

  return {
    /** 记一条：进内存环形缓冲；persist 为真时排队落盘。 */
    add(entry: LogEntry, persist: boolean): StoredEntry {
      const stored: StoredEntry = { ...entry, seq: Date.now() * 1000 + (counter++ % 1000) };
      sortedPush([stored]);
      if (persist) { pending.push(stored); scheduleFlush(); }
      notify();
      return stored;
    },
    recent(limit: number, minLevel?: LogLevel): StoredEntry[] {
      const rank = (level: string) => ['debug', 'info', 'warn', 'error'].indexOf(level);
      const rows = minLevel ? ring.filter(entry => rank(entry.level) >= rank(minLevel)) : ring;
      return rows.slice(-limit).reverse();
    },
    /** 含磁盘里旧会话的全部记录（最旧在前）。 */
    async all(): Promise<StoredEntry[]> { await ensureLoaded(); return [...ring]; },
    flush: flushNow,
    async clear(): Promise<void> {
      ring = []; ringBytes = 0; sizes.clear(); pending = []; persisted.clear();
      try { await (await getBackend()).clear(); } catch { /* lcq-allow: 清空磁盘失败不影响内存已清 */ }
      notify();
    },
    subscribe(fn: () => void): () => void { listeners.add(fn); return () => { listeners.delete(fn); }; },
    backendKind: async (): Promise<LogBackend['kind']> => (await getBackend()).kind,
  };
}

let degradeHandler: LogStoreOptions['onDegrade'];
/** log.ts 登记：默认存储从 IndexedDB 降级时记一条 LCQ-SYS-001。 */
export const onStoreDegrade = (fn: LogStoreOptions['onDegrade']): void => { degradeHandler = fn; };
export const logStore = createLogStore({ onDegrade: (reason, to) => degradeHandler?.(reason, to) });
