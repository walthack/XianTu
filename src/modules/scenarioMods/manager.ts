import type { ScenarioMod } from './schema';
import { parseScenarioMod } from './validator';

export interface StoredScenarioMod {
  mod: ScenarioMod;
  enabled: boolean;
  importedAt: string;
}

export interface ScenarioModLibrary {
  mods: StoredScenarioMod[];
}

export interface ScenarioModStorageAdapter {
  load(): Promise<ScenarioModLibrary | null>;
  save(library: ScenarioModLibrary): Promise<void>;
}

export const SCENARIO_MOD_LIBRARY_KEY = 'scenario_mod_library_v1';

export function createIndexedDbScenarioModStorage(): ScenarioModStorageAdapter {
  return {
    async load() {
      const { loadFromIndexedDB } = await import('../../utils/indexedDBManager');
      return loadFromIndexedDB(SCENARIO_MOD_LIBRARY_KEY) as Promise<ScenarioModLibrary | null>;
    },
    async save(library) {
      const { saveData } = await import('../../utils/indexedDBManager');
      await saveData(SCENARIO_MOD_LIBRARY_KEY, library);
    },
  };
}

export class ScenarioModManager {
  constructor(
    private readonly storage: ScenarioModStorageAdapter,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  async list(): Promise<StoredScenarioMod[]> {
    const library = await this.loadLibrary();
    return library.mods.map(entry => structuredClone(entry));
  }

  async get(modId: string): Promise<StoredScenarioMod | null> {
    const library = await this.loadLibrary();
    const entry = library.mods.find(item => item.mod.manifest.id === modId);
    return entry ? structuredClone(entry) : null;
  }

  async importText(jsonText: string): Promise<StoredScenarioMod> {
    let raw: unknown;
    try {
      raw = JSON.parse(jsonText);
    } catch (error) {
      throw new Error(`Mod 文件不是有效 JSON：${error instanceof Error ? error.message : '解析失败'}`);
    }

    const mod = parseScenarioMod(raw);
    const library = await this.loadLibrary();
    const existingIndex = library.mods.findIndex(entry => entry.mod.manifest.id === mod.manifest.id);
    const entry: StoredScenarioMod = {
      mod: structuredClone(mod),
      enabled: existingIndex >= 0 ? library.mods[existingIndex].enabled : true,
      importedAt: this.now(),
    };

    if (existingIndex >= 0) library.mods.splice(existingIndex, 1, entry);
    else library.mods.unshift(entry);

    await this.storage.save(library);
    return structuredClone(entry);
  }

  async remove(modId: string): Promise<boolean> {
    const library = await this.loadLibrary();
    const next = library.mods.filter(entry => entry.mod.manifest.id !== modId);
    if (next.length === library.mods.length) return false;
    await this.storage.save({ mods: next });
    return true;
  }

  async setEnabled(modId: string, enabled: boolean): Promise<StoredScenarioMod> {
    const library = await this.loadLibrary();
    const entry = library.mods.find(item => item.mod.manifest.id === modId);
    if (!entry) throw new Error(`未找到 Mod：${modId}`);
    entry.enabled = enabled;
    await this.storage.save(library);
    return structuredClone(entry);
  }

  async exportText(modId: string): Promise<string> {
    const entry = await this.get(modId);
    if (!entry) throw new Error(`未找到 Mod：${modId}`);
    return JSON.stringify(entry.mod, null, 2);
  }

  private async loadLibrary(): Promise<ScenarioModLibrary> {
    const stored = await this.storage.load();
    if (!stored || !Array.isArray(stored.mods)) return { mods: [] };
    return { mods: stored.mods };
  }
}

export const scenarioModManager = new ScenarioModManager(createIndexedDbScenarioModStorage());
