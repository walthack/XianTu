import { openDB, type IDBPDatabase } from 'idb';
import { GAME_NUMBERS } from '@/modules/sceneModule/numbers';
import { logError } from '@/modules/diagnostics/log';

/**
 * 叙事正文的本地全文副本（设计稿 2026-11-03「提示词历史与审核拒绝」第七节方案 B）。
 * 独立 IndexedDB 库，不碰存档库 DAD_SAVES_DB；只供本机回看。
 * 不进存档、不进提示词、不进叙事检索，也不注册到存档导出与云同步链路。
 * 按 存档标识 + 叙事条目 id 存取；配置 narrative.detailRetention 为 none 时不写。
 */

export interface NarrativeDetailRecord {
  saveKey: string;
  entryId: string;
  content: string;
  savedAt: number;
}

/** 存储后端；浏览器默认 IndexedDB，Node 测试无 IndexedDB 时用内存实现或注入。 */
export interface NarrativeDetailBackend {
  put(record: NarrativeDetailRecord): Promise<void>;
  get(saveKey: string, entryId: string): Promise<NarrativeDetailRecord | undefined>;
  deleteBySave(saveKey: string): Promise<void>;
}

const DB_NAME = 'lcq-narrative-detail';
const DB_VERSION = 1;
const STORE = 'details';
const SAVE_INDEX = 'saveKey';

export function createMemoryDetailBackend(): NarrativeDetailBackend {
  const rows = new Map<string, NarrativeDetailRecord>();
  const keyOf = (saveKey: string, entryId: string) => JSON.stringify([saveKey, entryId]);
  return {
    async put(record) { rows.set(keyOf(record.saveKey, record.entryId), { ...record }); },
    async get(saveKey, entryId) {
      const row = rows.get(keyOf(saveKey, entryId));
      return row ? { ...row } : undefined;
    },
    async deleteBySave(saveKey) {
      for (const [key, row] of rows) if (row.saveKey === saveKey) rows.delete(key);
    },
  };
}

function createIndexedDBDetailBackend(): NarrativeDetailBackend {
  let dbPromise: Promise<IDBPDatabase> | null = null;
  const db = () => {
    dbPromise ??= openDB(DB_NAME, DB_VERSION, {
      upgrade(database) {
        if (!database.objectStoreNames.contains(STORE)) {
          const store = database.createObjectStore(STORE, { keyPath: ['saveKey', 'entryId'] });
          store.createIndex(SAVE_INDEX, SAVE_INDEX);
        }
      },
    });
    return dbPromise;
  };
  return {
    async put(record) { await (await db()).put(STORE, record); },
    async get(saveKey, entryId) { return (await db()).get(STORE, [saveKey, entryId]); },
    async deleteBySave(saveKey) {
      const tx = (await db()).transaction(STORE, 'readwrite');
      let cursor = await tx.store.index(SAVE_INDEX).openCursor(IDBKeyRange.only(saveKey));
      while (cursor) {
        await cursor.delete();
        cursor = await cursor.continue();
      }
      await tx.done;
    },
  };
}

let backend: NarrativeDetailBackend | null = null;

function currentBackend(): NarrativeDetailBackend {
  backend ??= typeof indexedDB === 'undefined' ? createMemoryDetailBackend() : createIndexedDBDetailBackend();
  return backend;
}

/** 测试注入后端；传 null 恢复默认（下次调用按环境重新选）。 */
export function setNarrativeDetailBackend(next: NarrativeDetailBackend | null): void {
  backend = next;
}

/** 存一条正文全文；detailRetention 为 none 时不写，返回 false。 */
export async function saveDetail(saveKey: string, entryId: string, content: string): Promise<boolean> {
  if (GAME_NUMBERS.narrative.detailRetention === 'none') return false;
  await currentBackend().put({ saveKey, entryId, content, savedAt: Date.now() });
  return true;
}

export async function getDetail(saveKey: string, entryId: string): Promise<string | undefined> {
  return (await currentBackend().get(saveKey, entryId))?.content;
}

export async function hasDetail(saveKey: string, entryId: string): Promise<boolean> {
  return (await getDetail(saveKey, entryId)) !== undefined;
}

/** 叙事条目上的迁移标记：值为版本号，标了读档迁移就不再处理（新回合条目写入时即打上）。 */
export const NARRATIVE_DETAIL_MIGRATION_VERSION = 1;

function fnv1a32(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/** 副本 id：叙事数组下标＋正文哈希（读档迁移与新回合写入同口径）。 */
export function narrativeDetailId(index: number, content: string): string {
  return `nd_${index}_${fnv1a32(content)}`;
}

/**
 * 新回合写 系统.历史.叙事 的条目字段：content 与 summary 都只放概要，带 detailId 并打迁移标记（读档迁移跳过）；
 * 正文全文按 存档标识＋detailId 另存本地副本，不等待，写失败记 LCQ-SAV-061（回看退回概要）。
 */
export function narrativeEntryWithDetail(saveKey: string, index: number, summary: string, fullText: string) {
  const detailId = narrativeDetailId(index, fullText);
  if (saveKey && fullText) {
    saveDetail(saveKey, detailId, fullText).catch(error => logError('LCQ-SAV-061', error, { detail: { reason: 'detail_write_failed', index, detailId } }));
  }
  return { content: summary, summary, detailId, detailMigrated: NARRATIVE_DETAIL_MIGRATION_VERSION };
}

/** 删档时清掉该存档的全部全文副本。 */
export async function deleteForSave(saveKey: string): Promise<void> {
  await currentBackend().deleteBySave(saveKey);
}

/** 回看显示：批量取叙事条目（带 detailId）的本地全文副本，返回 detailId→全文；读取失败的条目略过（回看退回概要）。 */
export async function loadDetailsFor(saveKey: string, entries: readonly unknown[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  if (!saveKey) return out;
  const ids = new Set<string>();
  for (const entry of entries) {
    const id = (entry as { detailId?: unknown } | null)?.detailId;
    if (typeof id === 'string' && id) ids.add(id);
  }
  await Promise.all([...ids].map(async id => {
    try {
      const content = await getDetail(saveKey, id);
      if (typeof content === 'string') out[id] = content;
    } catch {
      // lcq-allow: 副本库不可用时回看退回概要，不影响游戏
    }
  }));
  return out;
}
