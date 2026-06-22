<template>
  <main class="mod-page">
    <header class="mod-header">
      <button class="icon-button" title="返回" aria-label="返回" @click="router.push('/')">
        <ArrowLeft :size="20" />
      </button>
      <div class="heading">
        <h1>剧本模组</h1>
        <p>{{ mods.length }} 个本地 Mod</p>
      </div>
      <div class="header-actions">
        <button class="secondary-button" title="下载 Strict 模板" :disabled="busy" @click="downloadTemplate('strict')">
          <FileDown :size="17" />
          <span>Strict 模板</span>
        </button>
        <button class="secondary-button" title="下载 Expand 模板" :disabled="busy" @click="downloadTemplate('expand')">
          <FileDown :size="17" />
          <span>Expand 模板</span>
        </button>
        <button class="primary-button" :disabled="busy" @click="fileInput?.click()">
          <Upload :size="18" />
          <span>导入 JSON</span>
        </button>
      </div>
      <input ref="fileInput" class="file-input" type="file" accept="application/json,.json" @change="handleImport" />
    </header>

    <section v-if="errorMessage" class="error-band" role="alert">
      <AlertTriangle :size="18" />
      <pre>{{ errorMessage }}</pre>
      <button class="icon-button small" title="关闭错误" aria-label="关闭错误" @click="errorMessage = ''">
        <X :size="16" />
      </button>
    </section>

    <section v-if="lastImported" class="success-band" role="status">
      <CheckCircle2 :size="18" />
      <div>
        <strong>「{{ lastImported.mod.manifest.name }}」已导入</strong>
        <span>v{{ lastImported.mod.manifest.version }} · {{ lastImported.mod.rules.mode === 'strict' ? 'Strict' : 'Expand' }}</span>
      </div>
      <button class="secondary-button" @click="enterCreation">
        <UserPlus :size="17" />
        <span>进入创角</span>
      </button>
      <button class="icon-button small" title="关闭" aria-label="关闭导入结果" @click="lastImported = null">
        <X :size="16" />
      </button>
    </section>

    <section v-if="loading" class="empty-state">正在读取本地 Mod...</section>
    <section v-else-if="mods.length === 0" class="empty-state">
      <FileJson :size="36" />
      <h2>尚未导入剧本模组</h2>
      <p>导入符合 xiantu.scenario-mod/v1 规范的 JSON 文件。</p>
    </section>

    <section v-else class="mod-list" aria-label="已导入剧本模组">
      <article v-for="entry in mods" :key="entry.mod.manifest.id" class="mod-row">
        <div class="mod-main">
          <div class="title-line">
            <h2>{{ entry.mod.manifest.name }}</h2>
            <span class="mode-badge">{{ entry.mod.rules.mode === 'strict' ? 'Strict' : 'Expand' }}</span>
            <span v-if="!entry.enabled" class="disabled-badge">已停用</span>
          </div>
          <p class="description">{{ entry.mod.manifest.description || entry.mod.world.background }}</p>
          <div class="meta-line">
            <span>{{ entry.mod.manifest.id }}</span>
            <span>v{{ entry.mod.manifest.version }}</span>
            <span>{{ entry.mod.world.name }} · {{ entry.mod.world.era }}</span>
          </div>
          <div class="counts">
            <span>势力 {{ count(entry, 'factions') }}</span>
            <span>人物 {{ count(entry, 'characters') }}</span>
            <span>地点 {{ count(entry, 'locations') }}</span>
            <span>技能 {{ entry.mod.content?.skills?.length || 0 }}</span>
            <span>功法 {{ entry.mod.content?.techniques?.length || 0 }}</span>
            <span>物品 {{ entry.mod.content?.items?.length || 0 }}</span>
            <span>章节 {{ entry.mod.scenario.chapters?.length || 0 }}</span>
          </div>
        </div>

        <div class="mod-actions">
          <label class="enable-toggle">
            <input
              type="checkbox"
              :checked="entry.enabled"
              :disabled="busy"
              @change="toggleEnabled(entry, $event)"
            />
            <span>启用</span>
          </label>
          <button class="icon-button" title="导出" aria-label="导出" :disabled="busy" @click="exportMod(entry)">
            <Download :size="18" />
          </button>
          <button class="icon-button danger" title="删除" aria-label="删除" :disabled="busy" @click="removeMod(entry)">
            <Trash2 :size="18" />
          </button>
        </div>
      </article>
    </section>

    <ScenarioModImportReviewDialog
      v-if="pendingReview"
      :review="pendingReview"
      :file-name="pendingFileName"
      :busy="busy"
      @close="closeReview"
      @confirm="confirmImport"
      @export-report="exportReviewReport"
    />
  </main>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { AlertTriangle, ArrowLeft, CheckCircle2, Download, FileDown, FileJson, Trash2, Upload, UserPlus, X } from 'lucide-vue-next';
import { useRouter } from 'vue-router';

import ScenarioModImportReviewDialog from '@/components/scenario-mods/ScenarioModImportReviewDialog.vue';
import { scenarioModManager, type ScenarioModImportReview, type StoredScenarioMod } from '@/modules/scenarioMods/manager';
import { useCharacterCreationStore } from '@/stores/characterCreationStore';
import { toast } from '@/utils/toast';
import expandTemplate from '../../mod-kit/templates/expand.template.json';
import strictTemplate from '../../mod-kit/templates/strict.template.json';

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const router = useRouter();
const creationStore = useCharacterCreationStore();
const mods = ref<StoredScenarioMod[]>([]);
const loading = ref(true);
const busy = ref(false);
const errorMessage = ref('');
const fileInput = ref<HTMLInputElement | null>(null);
const pendingReview = ref<ScenarioModImportReview | null>(null);
const pendingFileName = ref('');
const lastImported = ref<StoredScenarioMod | null>(null);

onMounted(loadMods);

async function loadMods() {
  loading.value = true;
  try {
    mods.value = await scenarioModManager.list();
  } catch (error) {
    showError(error);
  } finally {
    loading.value = false;
  }
}

async function handleImport(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  if (file.size > MAX_FILE_BYTES) {
    errorMessage.value = 'Mod 文件超过 5 MB，无法导入。';
    return;
  }

  busy.value = true;
  errorMessage.value = '';
  try {
    pendingReview.value = await scenarioModManager.reviewText(await file.text());
    pendingFileName.value = file.name;
  } catch (error) {
    showError(error);
  } finally {
    busy.value = false;
  }
}

async function confirmImport() {
  if (!pendingReview.value) return;
  busy.value = true;
  try {
    const entry = await scenarioModManager.importReviewed(pendingReview.value);
    lastImported.value = entry;
    pendingReview.value = null;
    pendingFileName.value = '';
    await loadMods();
    toast.success(`已导入「${entry.mod.manifest.name}」`);
  } catch (error) {
    showError(error);
  } finally {
    busy.value = false;
  }
}

function closeReview() {
  if (busy.value) return;
  pendingReview.value = null;
  pendingFileName.value = '';
}

function exportReviewReport() {
  if (!pendingReview.value) return;
  const review = pendingReview.value;
  downloadJson({
    fileName: pendingFileName.value,
    generatedAt: new Date().toISOString(),
    canImport: review.canImport,
    mod: review.mod ? {
      id: review.mod.manifest.id,
      name: review.mod.manifest.name,
      version: review.mod.manifest.version,
      mode: review.mod.rules.mode,
    } : null,
    replacingVersion: review.existing?.mod.manifest.version || null,
    diagnostics: review.diagnostics,
  }, `${review.mod?.manifest.id || 'scenario-mod'}-diagnostics.json`);
}

function downloadTemplate(mode: 'strict' | 'expand') {
  const template = mode === 'strict' ? strictTemplate : expandTemplate;
  downloadJson(template, `xiantu-${mode}.template.json`);
}

function downloadJson(value: unknown, fileName: string) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

async function enterCreation() {
  await creationStore.startLocalCreation();
  await router.push('/creation');
}

async function toggleEnabled(entry: StoredScenarioMod, event: Event) {
  busy.value = true;
  try {
    await scenarioModManager.setEnabled(entry.mod.manifest.id, (event.target as HTMLInputElement).checked);
    await loadMods();
  } catch (error) {
    showError(error);
  } finally {
    busy.value = false;
  }
}

async function exportMod(entry: StoredScenarioMod) {
  busy.value = true;
  try {
    const text = await scenarioModManager.exportText(entry.mod.manifest.id);
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${entry.mod.manifest.id}-${entry.mod.manifest.version}.json`;
    link.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    showError(error);
  } finally {
    busy.value = false;
  }
}

async function removeMod(entry: StoredScenarioMod) {
  if (!window.confirm(`删除剧本模组「${entry.mod.manifest.name}」？`)) return;
  busy.value = true;
  try {
    await scenarioModManager.remove(entry.mod.manifest.id);
    await loadMods();
    toast.success('Mod 已删除');
  } catch (error) {
    showError(error);
  } finally {
    busy.value = false;
  }
}

function count(entry: StoredScenarioMod, key: 'factions' | 'characters' | 'locations'): number {
  return entry.mod.canon?.[key]?.length || 0;
}

function showError(error: unknown) {
  errorMessage.value = error instanceof Error ? error.message : String(error);
  toast.error('Mod 操作失败');
}
</script>

<style scoped>
.mod-page {
  min-height: 100vh;
  background: var(--color-background);
  color: var(--color-text);
  padding: 24px;
}

.mod-header {
  max-width: 1100px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) auto;
  gap: 14px;
  align-items: center;
  padding-bottom: 18px;
  border-bottom: 1px solid var(--color-border);
}

.heading h1,
.mod-main h2,
.empty-state h2 {
  margin: 0;
  letter-spacing: 0;
}

.heading h1 { font-size: 1.5rem; }
.heading p { margin: 4px 0 0; color: var(--color-text-secondary); font-size: 0.9rem; }

.primary-button,
.secondary-button,
.icon-button {
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.primary-button {
  min-height: 40px;
  gap: 8px;
  padding: 0 16px;
  border-radius: 6px;
  background: var(--color-primary);
  color: white;
}

.secondary-button {
  min-height: 40px;
  gap: 7px;
  padding: 0 12px;
  border-radius: 6px;
}

.header-actions { display: flex; align-items: center; gap: 8px; }

.icon-button { width: 40px; height: 40px; border-radius: 6px; }
.icon-button.small { width: 30px; height: 30px; }
.icon-button.danger { color: var(--color-error); }
button:disabled { opacity: 0.55; cursor: not-allowed; }
.file-input { display: none; }

.error-band,
.success-band,
.empty-state,
.mod-list {
  max-width: 1100px;
  margin-left: auto;
  margin-right: auto;
}

.error-band {
  margin-top: 16px;
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 12px;
  align-items: start;
  color: var(--color-error);
  border-bottom: 1px solid var(--color-error);
  padding: 12px 0;
}

.success-band {
  margin-top: 16px;
  min-height: 48px;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 12px;
  color: var(--color-success);
  border-bottom: 1px solid var(--color-success);
  padding: 8px 0 12px;
}

.success-band div { display: flex; align-items: baseline; gap: 9px; flex-wrap: wrap; }
.success-band span { color: var(--color-text-secondary); font-size: 0.82rem; }

.error-band pre { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; font-family: inherit; }

.empty-state {
  min-height: 50vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--color-text-secondary);
  text-align: center;
}

.empty-state h2 { color: var(--color-text); font-size: 1.1rem; }
.empty-state p { margin: 0; }

.mod-list { margin-top: 10px; }

.mod-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 20px;
  padding: 20px 0;
  border-bottom: 1px solid var(--color-border);
}

.title-line,
.meta-line,
.counts,
.mod-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}

.mod-main h2 { font-size: 1.05rem; }
.description { margin: 10px 0; color: var(--color-text-secondary); line-height: 1.55; }
.meta-line, .counts { color: var(--color-text-secondary); font-size: 0.82rem; }
.counts { margin-top: 8px; }

.mode-badge,
.disabled-badge {
  padding: 2px 7px;
  border-radius: 4px;
  font-size: 0.75rem;
  border: 1px solid var(--color-border);
}

.disabled-badge { color: var(--color-warning); }
.mod-actions { align-self: center; flex-wrap: nowrap; }
.enable-toggle { display: flex; align-items: center; gap: 7px; color: var(--color-text-secondary); }

@media (max-width: 700px) {
  .mod-page { padding: 16px; }
  .mod-header { grid-template-columns: 40px 1fr; }
  .header-actions { grid-column: 1 / -1; display: grid; grid-template-columns: 1fr 1fr; }
  .header-actions .primary-button { grid-column: 1 / -1; width: 100%; }
  .success-band { grid-template-columns: auto minmax(0, 1fr) auto; }
  .success-band .secondary-button { grid-column: 1 / -1; width: 100%; }
  .mod-row { grid-template-columns: 1fr; }
  .mod-actions { justify-content: flex-end; }
}
</style>
