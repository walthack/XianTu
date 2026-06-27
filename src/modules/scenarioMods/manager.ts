import type { ScenarioMod } from './schema';
import { analyzeScenarioMod, type ScenarioAnalysisSeverity } from './analyzer';
import { validateScenarioMod } from './validator';

export interface ScenarioModImportDiagnostic {
  severity: ScenarioAnalysisSeverity;
  path: string;
  code: string;
  message: string;
}

export interface ScenarioModImportReview {
  mod: ScenarioMod | null;
  diagnostics: ScenarioModImportDiagnostic[];
  existing: StoredScenarioMod | null;
  canImport: boolean;
}

export interface StoredScenarioMod {
  mod: ScenarioMod;
  enabled: boolean;
  importedAt: string;
  /** 内置剧情模板（随应用打包，启动时播种；不可删除，更新时自动刷新内容、保留启用状态）。 */
  builtin?: boolean;
  /** 播种时的内置版本，用于检测是否需要刷新。 */
  builtinVersion?: string;
}

export interface ScenarioModLibrary {
  mods: StoredScenarioMod[];
}

export interface ScenarioModStorageAdapter {
  load(): Promise<ScenarioModLibrary | null>;
  save(library: ScenarioModLibrary): Promise<void>;
}

export const SCENARIO_MOD_LIBRARY_KEY = 'scenario_mod_library_v1';

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

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
  private seededPromise?: Promise<void>;

  constructor(
    private readonly storage: ScenarioModStorageAdapter,
    private readonly now: () => string = () => new Date().toISOString(),
    private builtins: ScenarioMod[] = [],
    private builtinVersion = '',
  ) {}

  /** 由应用入口(Vite 环境)注入内置剧情模板，避免在 manager.ts 顶层引入 import.meta.glob（jiti 测试无法解析）。 */
  registerBuiltins(builtins: ScenarioMod[], version: string): void {
    this.builtins = builtins;
    this.builtinVersion = version;
    this.seededPromise = undefined;
  }

  /** 幂等播种内置剧情模板：库里没有则加入(enabled:false)；任何内置版本不是当前版本时，强制用打包内容重建该条(缺则补、旧/损坏则覆盖)，仅保留 enabled 开关。这样旧库加载新 JS 即自愈，无需手动清 IndexedDB。 */
  private async ensureSeeded(): Promise<void> {
    if (!this.builtins.length) return;
    if (!this.seededPromise) this.seededPromise = this.seedBuiltins();
    return this.seededPromise;
  }

  private async seedBuiltins(): Promise<void> {
    const stored = await this.storage.load();
    const mods = stored && Array.isArray(stored.mods) ? stored.mods : [];
    let changed = false;
    for (const mod of this.builtins) {
      const id = mod.manifest.id;
      const idx = mods.findIndex(entry => entry.mod.manifest.id === id);
      if (idx < 0) {
        mods.push({ mod: structuredClone(mod), enabled: false, importedAt: this.now(), builtin: true, builtinVersion: this.builtinVersion });
        changed = true;
      } else if (mods[idx].builtinVersion !== this.builtinVersion) {
        // 版本不一致(含旧版/损坏/曾被非内置占用)→ 强制以打包内容重建，保留启用状态。
        mods[idx] = { mod: structuredClone(mod), enabled: mods[idx].enabled ?? false, importedAt: mods[idx].importedAt || this.now(), builtin: true, builtinVersion: this.builtinVersion };
        changed = true;
      }
    }
    if (changed) await this.storage.save({ mods });
  }

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
    const review = await this.reviewText(jsonText);
    return this.importReviewed(review);
  }

  async reviewText(jsonText: string): Promise<ScenarioModImportReview> {
    let raw: unknown;
    try {
      raw = JSON.parse(jsonText);
    } catch (error) {
      return {
        mod: null,
        diagnostics: [{
          severity: 'error',
          path: '$',
          code: 'invalid_json',
          message: `Mod 文件不是有效 JSON：${error instanceof Error ? error.message : '解析失败'}`,
        }],
        existing: null,
        canImport: false,
      };
    }

    const validation = validateScenarioMod(raw);
    if (!validation.valid || !validation.value) {
      return {
        mod: null,
        diagnostics: validation.issues.map(issue => ({ ...issue, severity: 'error' as const })),
        existing: null,
        canImport: false,
      };
    }

    const mod = validation.value;
    const analysis = analyzeScenarioMod(mod);
    const library = await this.loadLibrary();
    const existingIndex = library.mods.findIndex(entry => entry.mod.manifest.id === mod.manifest.id);
    return {
      mod: structuredClone(mod),
      diagnostics: structuredClone(analysis.issues),
      existing: existingIndex >= 0 ? structuredClone(library.mods[existingIndex]) : null,
      canImport: analysis.valid,
    };
  }

  async importReviewed(review: ScenarioModImportReview): Promise<StoredScenarioMod> {
    if (!review.mod || !review.canImport || review.diagnostics.some(issue => issue.severity === 'error')) {
      const invalidJson = review.diagnostics.find(issue => issue.code === 'invalid_json');
      if (invalidJson) throw new Error(invalidJson.message);
      const detail = review.diagnostics.map(issue => `${issue.path}: ${issue.message}`).join('\n');
      throw new Error(`Invalid Scenario Mod:\n${detail || 'Import review did not contain a valid Mod.'}`);
    }

    // Reviews can come from Vue reactive state. Normalize the JSON contract first,
    // because structuredClone cannot clone reactive Proxy objects.
    const mod = cloneJson(review.mod);
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
    const target = library.mods.find(entry => entry.mod.manifest.id === modId);
    if (target?.builtin) throw new Error('内置剧情模板不可删除，可关闭其启用开关。');
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
    await this.ensureSeeded();
    const stored = await this.storage.load();
    if (!stored || !Array.isArray(stored.mods)) return { mods: [] };
    return { mods: stored.mods };
  }
}

export const scenarioModManager = new ScenarioModManager(createIndexedDbScenarioModStorage());
