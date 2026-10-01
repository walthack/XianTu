// src/utils/indexedDBManager.ts
import type { LocalStorageRoot, SaveData } from '@/types/game';
import { buildBackendUrl, isBackendConfigured } from '@/services/backendConfig';
import { toast } from '@/utils/toast';

/**
 * @fileoverview
 * 乾坤宝库 (V4 - IndexedDB版本)
 * 使用 IndexedDB 存储大容量存档数据，解决 localStorage 5-10MB 限制问题
 * @author 千夜 (qianye60) | CC BY-NC-SA 4.0
 */

// XianTu by qianye60 - https://github.com/qianye60
const DB_NAME = 'DAD_SAVES_DB';
const DB_VERSION = 1;
const STORE_NAME = 'saves';
const ROOT_KEY = 'root_data'; // 兼容旧数据，但未来会被逐步取代
const CHARACTERS_KEY = 'characters';
const ACTIVE_SAVE_KEY = 'active_save';
const SCENARIO_MOD_LIBRARY_KEY = 'scenario_mod_library_v1';

// 新增：存储激活存档的 SaveData 的 key 前缀
const SAVEDATA_KEY_PREFIX = 'savedata_'; // savedata_{characterId}_{slotId}
const REMOTE_STORE_PREFIX = '/api/v1/save-storage';

interface StorageWriteOptions {
  localOnly?: boolean;
  remoteValue?: unknown;
}

// IndexedDB 实例缓存
let dbInstance: IDBDatabase | null = null;
let remoteStorageDisabledForSession = false;
let lastRemoteRoot: LocalStorageRoot | null = null;

function shouldUseRemoteStorage(): boolean {
  const enabled =
    typeof REMOTE_SAVE_STORAGE_ENABLED === 'undefined'
      ? true
      : REMOTE_SAVE_STORAGE_ENABLED;
  return enabled && isBackendConfigured() && !remoteStorageDisabledForSession;
}

function isRemoteSaveStorageKey(key: string): boolean {
  return (
    key === CHARACTERS_KEY ||
    key === ACTIVE_SAVE_KEY ||
    key === SCENARIO_MOD_LIBRARY_KEY ||
    key.startsWith(SAVEDATA_KEY_PREFIX)
  );
}

function mergeScenarioModLibraries(localData: any | null, remoteData: any | null): any | null {
  if (!localData) return remoteData;
  if (!remoteData) return localData;
  if (!Array.isArray(localData.mods) || !Array.isArray(remoteData.mods)) return localData;

  const byId = new Map<string, any>();
  for (const entry of remoteData.mods) {
    const id = entry?.mod?.manifest?.id;
    if (id) byId.set(id, entry);
  }
  for (const entry of localData.mods) {
    const id = entry?.mod?.manifest?.id;
    if (id) byId.set(id, entry);
  }

  return {
    ...remoteData,
    ...localData,
    mods: Array.from(byId.values()),
  };
}

function remoteStorageUrl(key?: string): string {
  const suffix = key ? `/${encodeURIComponent(key)}` : '';
  return buildBackendUrl(`${REMOTE_STORE_PREFIX}${suffix}`);
}

async function remoteStorageRequest<T>(url: string, options: RequestInit = {}): Promise<T | null | undefined> {
  if (!shouldUseRemoteStorage()) return undefined;

  const headers = new Headers(options.headers || {});
  const token = localStorage.getItem('access_token');
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  try {
    const response = await fetch(url, { ...options, headers });
    if (response.status === 404) {
      return null;
    }
    if (response.status === 405 || response.status === 501) {
      remoteStorageDisabledForSession = true;
      console.warn('【乾坤宝库-远程】远程存档接口不可用，本次会话回退 IndexedDB');
      return undefined;
    }
    if (!response.ok) {
      console.warn(`【乾坤宝库-远程】请求失败(${response.status})，回退 IndexedDB`);
      return undefined;
    }
    if (response.status === 204) return null;
    const rawText = await response.text();
    return rawText ? (JSON.parse(rawText) as T) : null;
  } catch (error) {
    console.warn('【乾坤宝库-远程】请求异常，回退 IndexedDB:', error);
    return undefined;
  }
}

async function loadRemoteRecord<T = unknown>(key: string): Promise<T | null> {
  if (!isRemoteSaveStorageKey(key)) return null;

  const result = await remoteStorageRequest<{ data?: T } | T>(remoteStorageUrl(key), {
    method: 'GET',
  });
  if (result == null) return null;
  if (typeof result === 'object' && 'data' in (result as Record<string, unknown>)) {
    return (result as { data?: T }).data ?? null;
  }
  return result as T;
}

async function saveRemoteRecord(key: string, data: unknown): Promise<boolean> {
  if (!isRemoteSaveStorageKey(key)) return false;

  const result = await remoteStorageRequest<{ ok?: boolean }>(remoteStorageUrl(key), {
    method: 'PUT',
    body: JSON.stringify({
      id: key,
      data,
      timestamp: new Date().toISOString(),
    }),
  });
  return result !== undefined;
}

async function deleteRemoteRecord(key: string): Promise<boolean> {
  if (!isRemoteSaveStorageKey(key)) return false;
  if (!shouldUseRemoteStorage()) return false;
  await remoteStorageRequest(remoteStorageUrl(key), { method: 'DELETE' });
  return !remoteStorageDisabledForSession;
}

async function deleteRemoteRecordsByPrefix(prefix: string): Promise<boolean> {
  if (!shouldUseRemoteStorage()) return false;
  await remoteStorageRequest(`${remoteStorageUrl()}?prefix=${encodeURIComponent(prefix)}`, {
    method: 'DELETE',
  });
  return !remoteStorageDisabledForSession;
}

/**
 * 打开/创建 IndexedDB 数据库
 */
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    // 如果已经有缓存的实例，直接返回
    if (dbInstance) {
      resolve(dbInstance);
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('【乾坤宝库-IDB】数据库打开失败:', request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      console.log('【乾坤宝库-IDB】数据库已打开');
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // 创建对象存储（类似于表）
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const objectStore = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        console.log('【乾坤宝库-IDB】对象存储已创建:', STORE_NAME);
      }
    };
  });
}

/**
 * 获取空的根数据结构
 */
function getEmptyRoot(): LocalStorageRoot {
  return {
    当前激活存档: null,
    角色列表: {},
  };
}

async function loadLocalRootData(): Promise<LocalStorageRoot> {
  try {
    const db = await openDatabase();
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const objectStore = transaction.objectStore(STORE_NAME);

    const charactersReq = objectStore.get(CHARACTERS_KEY);
    const activeSaveReq = objectStore.get(ACTIVE_SAVE_KEY);

    return new Promise((resolve, reject) => {
      let characters: Record<string, any> | null = null;
      let activeSave: any = null;
      let completed = 0;

      const checkCompletion = () => {
        if (completed === 2) {
          console.log('【乾坤宝库-IDB】分片数据加载完成');
          resolve({
            角色列表: characters || {},
            当前激活存档: activeSave || null,
          });
        }
      };

      charactersReq.onsuccess = () => {
        characters = charactersReq.result?.data || {};
        completed++;
        checkCompletion();
      };
      charactersReq.onerror = () => reject(charactersReq.error);

      activeSaveReq.onsuccess = () => {
        activeSave = activeSaveReq.result?.data || null;
        completed++;
        checkCompletion();
      };
      activeSaveReq.onerror = () => reject(activeSaveReq.error);
    });
  } catch (error) {
    console.error('【乾坤宝库-IDB】加载根数据时出错:', error);
    return getEmptyRoot();
  }
}

/**
 * 加载根数据。远程元数据仍是普通角色的权威来源，但会把明确标记为
 * localOnly 的隔离试玩档从本机合并回来，避免刷新后试玩角色凭空消失。
 */
export async function loadRootData(): Promise<LocalStorageRoot> {
  try {
    const [[remoteCharacters, remoteActiveSave], localRoot] = await Promise.all([
      Promise.all([
        loadRemoteRecord<Record<string, any>>(CHARACTERS_KEY),
        loadRemoteRecord<any>(ACTIVE_SAVE_KEY),
      ]),
      loadLocalRootData(),
    ]);
    if (!remoteCharacters && !remoteActiveSave) return localRoot;

    lastRemoteRoot = {
      角色列表: remoteCharacters || {},
      当前激活存档: remoteActiveSave || null,
    };

    const isolatedLocalCharacters = Object.fromEntries(
      Object.entries(localRoot.角色列表 || {}).filter(([, profile]: [string, any]) =>
        profile?.隔离试玩信息?.localOnly === true,
      ),
    );
    const localActiveId = localRoot.当前激活存档?.角色ID;
    const activeSave = localActiveId
      && isolatedLocalCharacters[localActiveId]
      && !remoteCharacters?.[localActiveId]
      ? localRoot.当前激活存档
      : (remoteActiveSave || null);

    console.log('【乾坤宝库-远程】根数据已加载，并合并本机隔离试玩档');
    return {
      // 极端固定-ID 冲突时让普通远端角色胜出；安装器随后会拒绝覆盖它。
      角色列表: { ...isolatedLocalCharacters, ...(remoteCharacters || {}) },
      当前激活存档: activeSave,
    };
  } catch (error) {
    console.error('【乾坤宝库】合并根数据时出错，回退本机数据:', error);
    return loadLocalRootData();
  }
}

/**
 * 将根数据保存到 IndexedDB
 */
// 辅助函数：保存单个键值对
export async function saveData(key: string, data: any, options: StorageWriteOptions = {}): Promise<boolean> {
  const remoteSaved = options.localOnly
    ? false
    : await saveRemoteRecord(key, options.remoteValue === undefined ? data : options.remoteValue);
  if (remoteSaved) {
    console.log(`【乾坤宝库-远程】数据已保存 (${key})`);
  }

  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const objectStore = transaction.objectStore(STORE_NAME);
    const request = objectStore.put({
      id: key,
      data: JSON.parse(JSON.stringify(data)), // 清理数据
      timestamp: new Date().toISOString(),
    });
    request.onsuccess = () => resolve(remoteSaved);
    request.onerror = () => reject(request.error);
  });
}

export async function saveCharacters(
  characters: LocalStorageRoot['角色列表'],
  options: StorageWriteOptions = {},
): Promise<void> {
  try {
    console.log('[IndexedDB-保存角色] 准备保存角色列表, 角色数:', Object.keys(characters).length);
    await saveData(CHARACTERS_KEY, characters, options);
    console.log('[IndexedDB-保存角色] ✅ 角色列表已保存到 IndexedDB');
  } catch (error) {
    console.error('[IndexedDB-保存角色] ❌ 保存角色列表失败:', error);
    throw error;
  }
}

export async function saveActiveSave(
  activeSave: LocalStorageRoot['当前激活存档'],
  options: StorageWriteOptions = {},
): Promise<void> {
  try {
    await saveData(ACTIVE_SAVE_KEY, activeSave, options);
    console.log('【乾坤宝库-IDB】当前激活存档已保存');
  } catch (error) {
    console.error('【乾坤宝库-IDB】保存当前激活存档失败:', error);
    throw error;
  }
}

export async function saveRootData(root: LocalStorageRoot, options: { remoteRoot?: LocalStorageRoot; localOnly?: boolean } = {}): Promise<void> {
  try {
    console.log('[IndexedDB-保存] 开始保存根数据');
    console.log('[IndexedDB-保存] 角色列表键名:', Object.keys(root.角色列表));
    console.log('[IndexedDB-保存] 当前激活存档:', root.当前激活存档);

    if (options.localOnly) {
      await Promise.all([
        saveCharacters(root.角色列表, { localOnly: true }),
        saveActiveSave(root.当前激活存档, { localOnly: true }),
      ]);
      console.log('[IndexedDB-保存] ✅ 根数据（分片）已只写本机，未改远端');
      return;
    }

    const remoteRoot = options.remoteRoot || (() => {
      const sanitized = JSON.parse(JSON.stringify(root)) as LocalStorageRoot;
      Object.entries(sanitized.角色列表).forEach(([characterId, profile]: [string, any]) => {
        if (profile?.隔离试玩信息?.localOnly === true) delete sanitized.角色列表[characterId];
      });
      if (sanitized.当前激活存档 && !sanitized.角色列表[sanitized.当前激活存档.角色ID]) {
        // 当前若是本机隔离试玩，远端仍保留进入试玩前自己的活动指针。
        sanitized.当前激活存档 = lastRemoteRoot?.当前激活存档 || null;
      }
      return sanitized;
    })();

    await Promise.all([
      saveCharacters(root.角色列表, { remoteValue: remoteRoot.角色列表 }),
      saveActiveSave(root.当前激活存档, { remoteValue: remoteRoot.当前激活存档 }),
    ]);
    lastRemoteRoot = JSON.parse(JSON.stringify(remoteRoot));

    console.log('[IndexedDB-保存] ✅ 根数据（分片）保存成功');
  } catch (error) {
    console.error('[IndexedDB-保存] ❌ 保存根数据时出错:', error);
    throw error;
  }
}

/**
 * 清除所有数据
 */
export async function clearAllLocalData(): Promise<void> {
  try {
    if (shouldUseRemoteStorage()) {
      await Promise.all([
        deleteRemoteRecord(CHARACTERS_KEY),
        deleteRemoteRecord(ACTIVE_SAVE_KEY),
        deleteRemoteRecordsByPrefix(SAVEDATA_KEY_PREFIX),
      ]);
    }

    const db = await openDatabase();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const objectStore = transaction.objectStore(STORE_NAME);
      const request = objectStore.clear();

      request.onsuccess = () => {
        console.log('【乾坤宝库-IDB】已执行虚空破碎，所有数据已清除');
        resolve();
      };

      request.onerror = () => {
        console.error('【乾坤宝库-IDB】清除数据失败:', request.error);
        reject(request.error);
      };
    });
  } catch (error) {
    console.error('【乾坤宝库-IDB】清除数据时出错:', error);
    throw error;
  }
}

/**
 * 从 localStorage 迁移数据到 IndexedDB
 * 这个函数会在应用启动时自动调用一次
 */
export async function migrateData(): Promise<boolean> {
  try {
    // 1. 从 localStorage 迁移
    const OLD_LS_KEY = 'DAD_SAVES_V3';
    const oldLSData = localStorage.getItem(OLD_LS_KEY);
    if (oldLSData) {
      console.log('【乾坤宝库-IDB】检测到localStorage数据，开始迁移...');
      const parsedData = JSON.parse(oldLSData) as LocalStorageRoot;
      await saveRootData(parsedData);
      localStorage.setItem('DAD_SAVES_V3_BACKUP', oldLSData);
      localStorage.removeItem(OLD_LS_KEY);
      console.log('【乾坤宝库-IDB】✅ localStorage 数据迁移完成！');
      return true;
    }

    // 2. 从旧的单体 IndexedDB 记录迁移到分片记录
    const db = await openDatabase();
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const objectStore = transaction.objectStore(STORE_NAME);
    const oldRootReq = objectStore.get(ROOT_KEY);

    return new Promise((resolve, reject) => {
      oldRootReq.onsuccess = async () => {
        const oldRoot = oldRootReq.result;
        if (oldRoot && oldRoot.data && (oldRoot.data.角色列表 || oldRoot.data.当前激活存档)) {
          console.log('【乾坤宝库-IDB】检测到旧的单体DB记录，开始分片迁移...');
          try {
            const data = oldRoot.data as LocalStorageRoot;
            await saveCharacters(data.角色列表 || {});
            await saveActiveSave(data.当前激活存档 || null);
            
            // 删除旧的单体记录
            const deleteReq = objectStore.delete(ROOT_KEY);
            deleteReq.onsuccess = () => {
              console.log('【乾坤宝库-IDB】✅ 旧的单体DB记录已成功迁移并删除');
              resolve(true);
            };
            deleteReq.onerror = () => {
               console.error('【乾坤宝库-IDB】❌ 删除旧的单体DB记录失败:', deleteReq.error);
               reject(deleteReq.error);
            };
          } catch (error) {
            console.error('【乾坤宝库-IDB】❌ 分片迁移失败:', error);
            reject(error);
          }
        } else {
          console.log('【乾坤宝库-IDB】无需数据迁移');
          resolve(false);
        }
      };
      oldRootReq.onerror = () => {
        console.error('【乾坤宝库-IDB】❌ 检查旧数据失败:', oldRootReq.error);
        reject(oldRootReq.error);
      };
    });
  } catch (error) {
    console.error('【乾坤宝库-IDB】❌ 数据迁移过程出错:', error);
    return false;
  }
}

/**
 * 获取数据库统计信息（用于调试）
 */
export async function getStorageStats(): Promise<{ itemCount: number; estimatedSize: string }> {
  try {
    const db = await openDatabase();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const objectStore = transaction.objectStore(STORE_NAME);
      const countRequest = objectStore.count();

      countRequest.onsuccess = () => {
        const itemCount = countRequest.result;

        // 尝试估算大小（需要读取实际数据）
        const getAllRequest = objectStore.getAll();

        getAllRequest.onsuccess = () => {
          const allData = getAllRequest.result;
          const estimatedBytes = JSON.stringify(allData).length;
          const estimatedMB = (estimatedBytes / 1024 / 1024).toFixed(2);

          resolve({
            itemCount,
            estimatedSize: `~${estimatedMB} MB`
          });
        };

        getAllRequest.onerror = () => {
          resolve({
            itemCount,
            estimatedSize: '未知'
          });
        };
      };

      countRequest.onerror = () => {
        reject(countRequest.error);
      };
    });
  } catch (error) {
    console.error('【乾坤宝库-IDB】获取统计信息失败:', error);
    return { itemCount: 0, estimatedSize: '未知' };
  }
}

/**
 * 🔥 新增：保存激活存档的 SaveData 到 IndexedDB
 * 用于替代酒馆变量存储
 * @param characterId 角色ID
 * @param slotId 存档槽位ID
 * @param saveDataContent 完整的游戏存档数据
 */
export async function saveSaveData(
  characterId: string,
  slotId: string,
  saveDataContent: SaveData,
  options: { localOnly?: boolean } = {},
): Promise<void> {
  try {
    const key = `${SAVEDATA_KEY_PREFIX}${characterId}_${slotId}`;
    const remoteSaved = await saveData(key, saveDataContent, { localOnly: options.localOnly });
    if (remoteSaved && slotId !== '上次对话') {
      toast.success(`存档【${slotId}】已保存到远程仙途服务器`, {
        id: `remote-save-${characterId}-${slotId}`,
      });
    }
    console.log(`【乾坤宝库-IDB】SaveData 已保存 (${characterId}/${slotId})`);
  } catch (error) {
    console.error('【乾坤宝库-IDB】保存 SaveData 失败:', error);
    throw error;
  }
}

/**
 * 🔥 新增：从 IndexedDB 加载激活存档的 SaveData
 * 用于替代从酒馆变量读取
 * @param characterId 角色ID
 * @param slotId 存档槽位ID
 * @returns SaveData 或 null（如果不存在）
 */
async function loadLocalSaveDataRecord(
  characterId: string,
  slotId: string
): Promise<SaveData | null> {
  const key = `${SAVEDATA_KEY_PREFIX}${characterId}_${slotId}`;
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const objectStore = transaction.objectStore(STORE_NAME);
    const request = objectStore.get(key);

    request.onsuccess = () => {
      const result = request.result;
      if (result && result.data) {
        console.log(`【乾坤宝库-IDB】SaveData 已加载 (${characterId}/${slotId})`);
        resolve(result.data as SaveData);
      } else {
        // 兼容：联机存档槽位历史上使用过 “存档” / “云端修行” 两种 key。
        // 本地迁移只能读取 IndexedDB，绝不通过这里回源联机服务器。
        const alias =
          slotId === '云端修行' ? '存档' :
          slotId === '存档' ? '云端修行' :
          null;

        if (!alias) {
          console.warn(`【乾坤宝库-IDB】SaveData 不存在 (${characterId}/${slotId})`);
          resolve(null);
          return;
        }

        const aliasKey = `${SAVEDATA_KEY_PREFIX}${characterId}_${alias}`;
        const aliasReq = objectStore.get(aliasKey);
        aliasReq.onsuccess = () => {
          const aliasResult = aliasReq.result;
          if (aliasResult && aliasResult.data) {
            console.warn(`【乾坤宝库-IDB】SaveData 未命中(${slotId})，回退命中(${alias}) (${characterId}/${slotId})`);
            resolve(aliasResult.data as SaveData);
          } else {
            console.warn(`【乾坤宝库-IDB】SaveData 不存在 (${characterId}/${slotId})`);
            resolve(null);
          }
        };
        aliasReq.onerror = () => {
          console.error('【乾坤宝库-IDB】加载 SaveData 失败(别名):', aliasReq.error);
          reject(aliasReq.error);
        };
      }
    };

    request.onerror = () => {
      console.error('【乾坤宝库-IDB】加载 SaveData 失败:', request.error);
      reject(request.error);
    };
  });
}

/** 仅读取本机 IndexedDB；旧联机缓存迁移不得触发远端回源。 */
export async function loadLocalSaveData(
  characterId: string,
  slotId: string
): Promise<SaveData | null> {
  try {
    return await loadLocalSaveDataRecord(characterId, slotId);
  } catch (error) {
    console.error('【乾坤宝库-IDB】加载本地 SaveData 时出错:', error);
    return null;
  }
}

export async function loadSaveData(
  characterId: string,
  slotId: string
): Promise<SaveData | null> {
  try {
    const key = `${SAVEDATA_KEY_PREFIX}${characterId}_${slotId}`;
    const remoteData = await loadRemoteRecord<SaveData>(key);
    if (remoteData) {
      console.log(`【乾坤宝库-远程】SaveData 已加载 (${characterId}/${slotId})`);
      return remoteData;
    }
    return await loadLocalSaveDataRecord(characterId, slotId);
  } catch (error) {
    console.error('【乾坤宝库-IDB】加载 SaveData 时出错:', error);
    return null;
  }
}

/**
 * 🔥 新增：删除指定的 SaveData
 * @param characterId 角色ID
 * @param slotId 存档槽位ID
 */
export async function deleteSaveData(
  characterId: string,
  slotId: string,
  options: { localOnly?: boolean } = {},
): Promise<void> {
  try {
    const key = `${SAVEDATA_KEY_PREFIX}${characterId}_${slotId}`;
    if (!options.localOnly) await deleteRemoteRecord(key);

    const db = await openDatabase();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const objectStore = transaction.objectStore(STORE_NAME);
      const request = objectStore.delete(key);

      request.onsuccess = () => {
        console.log(`【乾坤宝库-IDB】SaveData 已删除 (${characterId}/${slotId})`);
        resolve();
      };

      request.onerror = () => {
        console.error('【乾坤宝库-IDB】删除 SaveData 失败:', request.error);
        reject(request.error);
      };
    });
  } catch (error) {
    console.error('【乾坤宝库-IDB】删除 SaveData 时出错:', error);
    throw error;
  }
}

/**
 * 🔥 新增：批量删除指定角色的所有存档数据
 * @param characterId 角色ID
 * @returns 删除的记录数量
 */
export async function deleteAllSaveDataForCharacter(
  characterId: string,
  options: { localOnly?: boolean } = {},
): Promise<number> {
  try {
    const db = await openDatabase();
    const prefix = `${SAVEDATA_KEY_PREFIX}${characterId}_`;
    if (!options.localOnly) await deleteRemoteRecordsByPrefix(prefix);
    
    console.log(`【乾坤宝库-IDB】开始清理角色 ${characterId} 的所有存档...`);
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const objectStore = transaction.objectStore(STORE_NAME);
      
      // 获取所有键
      const getAllKeysRequest = objectStore.getAllKeys();
      
      getAllKeysRequest.onsuccess = () => {
        const allKeys = getAllKeysRequest.result as string[];
        // 筛选出该角色的所有存档键
        const keysToDelete = allKeys.filter(key =>
          typeof key === 'string' && key.startsWith(prefix)
        );
        
        console.log(`【乾坤宝库-IDB】找到 ${keysToDelete.length} 个存档记录待删除:`, keysToDelete);
        
        if (keysToDelete.length === 0) {
          console.log(`【乾坤宝库-IDB】没有找到需要删除的存档`);
          resolve(0);
          return;
        }
        
        // 批量删除
        let deleteCount = 0;
        let errorCount = 0;
        
        keysToDelete.forEach(key => {
          const deleteRequest = objectStore.delete(key);
          
          deleteRequest.onsuccess = () => {
            deleteCount++;
            console.log(`【乾坤宝库-IDB】✅ 已删除: ${key}`);
            
            if (deleteCount + errorCount === keysToDelete.length) {
              console.log(`【乾坤宝库-IDB】批量删除完成，成功 ${deleteCount} 个，失败 ${errorCount} 个`);
              resolve(deleteCount);
            }
          };
          
          deleteRequest.onerror = () => {
            errorCount++;
            console.error(`【乾坤宝库-IDB】❌ 删除失败: ${key}`, deleteRequest.error);
            
            if (deleteCount + errorCount === keysToDelete.length) {
              console.log(`【乾坤宝库-IDB】批量删除完成，成功 ${deleteCount} 个，失败 ${errorCount} 个`);
              resolve(deleteCount);
            }
          };
        });
      };
      
      getAllKeysRequest.onerror = () => {
        console.error('【乾坤宝库-IDB】获取所有键失败:', getAllKeysRequest.error);
        reject(getAllKeysRequest.error);
      };
    });
  } catch (error) {
    console.error('【乾坤宝库-IDB】批量删除存档数据时出错:', error);
    throw error;
  }
}

/**
 * 从 IndexedDB 加载任意数据
 * @param key 要加载的数据的键
 * @returns 数据或 null
 */
export async function loadFromIndexedDB(key: string): Promise<any | null> {
  try {
    const remoteData = await loadRemoteRecord(key);

    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const objectStore = transaction.objectStore(STORE_NAME);
      const request = objectStore.get(key);

      request.onsuccess = () => {
        const result = request.result;
        const localData = result?.data ?? null;
        if (key === SCENARIO_MOD_LIBRARY_KEY) {
          resolve(mergeScenarioModLibraries(localData, remoteData));
          return;
        }
        if (remoteData !== null) {
          resolve(remoteData);
          return;
        }
        if (result && result.data) {
          resolve(result.data);
        } else {
          resolve(null);
        }
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  } catch (error) {
    console.error(`【乾坤宝库-IDB】从 IndexedDB 加载数据失败 (key: ${key}):`, error);
    return null;
  }
}
