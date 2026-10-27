/**
 * 日志存储：内存环形缓冲（面板与导出读它）+ 异步落盘（独立 IndexedDB 库 lcq-log，不碰存档库 DAD_SAVES_DB 及其 DB_VERSION）。
 * IndexedDB 不可用 / 打开失败 → 降级到 localStorage 小缓存（只留最近 localFallbackMax 条）；再不行就只留内存。
 * 条数与体积上限（ringMax / maxBytes）内存与磁盘各自生效，超了删最老的。所有落盘错误吞掉，不影响游戏。
 * 轮转（diagnostics.rotation）：磁盘上早于 retentionDays 天的记录每次落盘时删掉（内存里也不再留）；磁盘超上限时一次删到
 * trimToRatio 倍以下（不是每写一条删一条），每次轮转经 onRotate 回报一次（log.ts 记 LCQ-SYS-002）。记录时间取 seq（= 写入时刻 ms × 1000）。
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

/** 轮转回报（LCQ-SYS-002 的 detail）。时间是本机时区的 ISO 串。 */
export interface RotationInfo {
  rotatedAt: string;
  dropped: number;
  /** 因超过保留天数删掉的条数。 */
  byAge: number;
  /** 因超过条数 / 总大小上限删掉的条数。 */
  byLimit: number;
  retentionDays: number; maxEntries: number; maxBytes: number; trimToRatio: number;
  kept: number; keptBytes: number;
  oldestDroppedAt: string; newestDroppedAt: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** 记录写入时刻（ms）：seq = Date.now() × 1000 + 计数。 */
export const seqTime = (seq: number): number => Math.floor(seq / 1000);

/** 带本机时区偏移的 ISO 时间串，如 2026-10-27T23:07:44.123+08:00（日志条目自身的 ts 仍是 UTC 的 toISOString）。 */
export function localIsoTimestamp(ms: number = Date.now()): string {
  const d = new Date(ms), offset = -d.getTimezoneOffset(), abs = Math.abs(offset);
  const pad = (n: number, width = 2): string => String(n).padStart(width, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}${offset >= 0 ? '+' : '-'}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

/** 保留期截止时刻：早于它的记录该删；配置不合法（体检会拦）时返回 null＝不按天数删。 */
function retentionCutoff(now: number): number | null {
  const days = diagnosticsConfig().rotation?.retentionDays;
  return typeof days === 'number' && Number.isFinite(days) && days > 0 ? now - days * DAY_MS : null;
}

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
  /** 磁盘上轮转删掉了记录时回调（log.ts 用它记 LCQ-SYS-002）。 */
  onRotate?: (info: RotationInfo) => void;
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
    const cfg = diagnosticsConfig(), cutoff = retentionCutoff(Date.now());
    const drop = (): void => { const old = ring.shift()!; ringBytes -= sizes.get(old.seq) ?? 0; sizes.delete(old.seq); };
    while (cutoff !== null && ring.length && seqTime(ring[0].seq) < cutoff) drop();
    while (ring.length > 1 && (ring.length > cfg.ringMax || ringBytes > cfg.maxBytes)) drop();
  };
  const notify = (): void => { for (const fn of [...listeners]) { try { fn(); } catch { /* lcq-allow: 订阅者出错不得影响日志写入 */ } } };

  /** 读一次磁盘里的旧记录并入内存（面板 / 导出 / 首次落盘前调用）。 */
  const ensureLoaded = (): Promise<void> => (loaded ||= (async () => {
    const stored = await (await getBackend()).load();
    for (const entry of stored) persisted.set(entry.seq, sizeOf(entry));
    sortedPush(stored);
    notify();
  })().catch(() => { /* lcq-allow: 读盘失败只影响历史记录，当前会话的内存记录照常 */ }));

  /** 磁盘轮转：先删过了保留期的，再看条数 / 总大小，超了就从最老的删到 trimToRatio 倍以下（至少留最新一条）。 */
  const trimPersisted = async (b: LogBackend): Promise<void> => {
    const cfg = diagnosticsConfig(), now = Date.now(), cutoff = retentionCutoff(now);
    const ratio = cfg.rotation?.trimToRatio;
    const scale = (limit: number): number => typeof ratio === 'number' && ratio > 0 && ratio < 1 ? Math.floor(limit * ratio) : limit;
    const seqs = [...persisted.keys()].sort((a, c) => a - c);
    let bytes = 0;
    for (const size of persisted.values()) bytes += size;
    const drop: number[] = [];
    for (const seq of seqs) {
      if (cutoff === null || seqTime(seq) >= cutoff) break;
      bytes -= persisted.get(seq) ?? 0; drop.push(seq);
    }
    const byAge = drop.length;
    if (seqs.length - drop.length > cfg.ringMax || bytes > cfg.maxBytes) {
      const countGoal = scale(cfg.ringMax), bytesGoal = scale(cfg.maxBytes);
      for (const seq of seqs.slice(byAge)) {
        const left = seqs.length - drop.length;
        if (left <= 1 || (left <= countGoal && bytes <= bytesGoal)) break;
        bytes -= persisted.get(seq) ?? 0; drop.push(seq);
      }
    }
    if (!drop.length) return;
    await b.remove(drop);
    for (const seq of drop) persisted.delete(seq);
    options.onRotate?.({
      rotatedAt: localIsoTimestamp(now), dropped: drop.length, byAge, byLimit: drop.length - byAge,
      retentionDays: cfg.rotation?.retentionDays, maxEntries: cfg.ringMax, maxBytes: cfg.maxBytes, trimToRatio: cfg.rotation?.trimToRatio,
      kept: persisted.size, keptBytes: bytes,
      oldestDroppedAt: localIsoTimestamp(seqTime(drop[0])), newestDroppedAt: localIsoTimestamp(seqTime(drop[drop.length - 1])),
    });
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
let rotateHandler: LogStoreOptions['onRotate'];
/** log.ts 登记：默认存储从 IndexedDB 降级时记一条 LCQ-SYS-001。 */
export const onStoreDegrade = (fn: LogStoreOptions['onDegrade']): void => { degradeHandler = fn; };
/** log.ts 登记：默认存储轮转删掉旧记录时记一条 LCQ-SYS-002。 */
export const onStoreRotate = (fn: LogStoreOptions['onRotate']): void => { rotateHandler = fn; };
export const logStore = createLogStore({ onDegrade: (reason, to) => degradeHandler?.(reason, to), onRotate: info => rotateHandler?.(info) });
