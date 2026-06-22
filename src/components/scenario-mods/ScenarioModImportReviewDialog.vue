<template>
  <div class="review-overlay" role="presentation" @click.self="$emit('close')">
    <section class="review-dialog" role="dialog" aria-modal="true" aria-labelledby="review-title">
      <header class="review-header">
        <div>
          <p class="eyebrow">{{ fileName }}</p>
          <h2 id="review-title">{{ review.mod?.manifest.name || 'Mod 导入诊断' }}</h2>
        </div>
        <button class="icon-button" title="关闭" aria-label="关闭" :disabled="busy" @click="$emit('close')">
          <X :size="18" />
        </button>
      </header>

      <div class="review-scroll">
        <div class="status-band" :class="statusClass">
          <component :is="statusIcon" :size="20" />
          <div>
            <strong>{{ statusTitle }}</strong>
            <span>{{ errorCount }} 个错误 · {{ warningCount }} 个警告</span>
          </div>
        </div>

        <template v-if="review.mod">
          <section class="review-section summary-section">
            <div class="summary-main">
              <div class="title-line">
                <span class="mode-badge">{{ review.mod.rules.mode === 'strict' ? 'Strict' : 'Expand' }}</span>
                <span>{{ review.mod.manifest.id }}</span>
                <span>v{{ review.mod.manifest.version }}</span>
              </div>
              <p>{{ review.mod.manifest.description || review.mod.world.background }}</p>
              <div class="meta-line">
                <span>{{ review.mod.world.name }}</span>
                <span>{{ review.mod.world.era }}</span>
                <span>{{ review.mod.manifest.author || '未署名' }}</span>
              </div>
            </div>
            <div v-if="review.existing" class="replace-notice">
              <RefreshCw :size="17" />
              <span>将替换本地 v{{ review.existing.mod.manifest.version }}</span>
            </div>
          </section>

          <section class="review-section">
            <h3>内容统计</h3>
            <div class="metric-grid">
              <div v-for="metric in metrics" :key="metric.label" class="metric">
                <strong>{{ metric.value }}</strong>
                <span>{{ metric.label }}</span>
              </div>
            </div>
          </section>

          <section class="review-section identity-grid">
            <div>
              <h3><UserRound :size="17" />玩家身份</h3>
              <p>{{ playerIdentity }}</p>
            </div>
            <div>
              <h3><ShieldCheck :size="17" />正典约束</h3>
              <p>{{ accessRules.length }} 条内容归属 · {{ affiliations.length }} 条人物归属</p>
            </div>
          </section>

          <section v-if="accessRules.length" class="review-section">
            <h3>专属与限定内容</h3>
            <div class="rule-list">
              <div v-for="rule in accessRules" :key="rule.contentId" class="rule-row">
                <span class="policy-badge">{{ rule.policy }}</span>
                <strong>{{ rule.contentName }}</strong>
                <span>{{ rule.holders }}</span>
              </div>
            </div>
          </section>

          <section v-if="affiliations.length" class="review-section">
            <h3>人物势力归属</h3>
            <div class="rule-list">
              <div v-for="entry in affiliations" :key="entry.key" class="rule-row">
                <span class="policy-badge">{{ entry.category }}</span>
                <strong>{{ entry.characterName }}</strong>
                <span>{{ entry.factionName }}{{ entry.role ? ` · ${entry.role}` : '' }}</span>
              </div>
            </div>
          </section>
        </template>

        <section class="review-section diagnostics-section">
          <h3>诊断</h3>
          <p v-if="review.diagnostics.length === 0" class="clean-line">
            <CheckCircle2 :size="17" />未发现问题
          </p>
          <div v-else class="diagnostic-list">
            <div v-for="(issue, index) in review.diagnostics" :key="`${issue.code}-${index}`" class="diagnostic-row" :class="issue.severity">
              <AlertCircle v-if="issue.severity === 'error'" :size="17" />
              <AlertTriangle v-else :size="17" />
              <div>
                <strong>{{ issue.code }}</strong>
                <code>{{ issue.path }}</code>
                <p>{{ issue.message }}</p>
                <p class="suggestion">建议：{{ suggestionFor(issue.code) }}</p>
              </div>
            </div>
          </div>
        </section>
      </div>

      <footer class="review-actions">
        <button class="secondary-button" :disabled="busy" @click="$emit('export-report')">
          <Download :size="17" />
          <span>导出诊断</span>
        </button>
        <div class="action-spacer"></div>
        <button class="secondary-button" :disabled="busy" @click="$emit('close')">取消</button>
        <button class="primary-button" :disabled="busy || !review.canImport" @click="$emit('confirm')">
          <Upload :size="17" />
          <span>{{ review.existing ? '替换并导入' : '确认导入' }}</span>
        </button>
      </footer>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Download,
  RefreshCw,
  ShieldCheck,
  Upload,
  UserRound,
  X,
} from 'lucide-vue-next';

import type { ScenarioModImportReview } from '@/modules/scenarioMods/manager';

const props = defineProps<{
  review: ScenarioModImportReview;
  fileName: string;
  busy: boolean;
}>();

defineEmits<{
  close: [];
  confirm: [];
  'export-report': [];
}>();

const errorCount = computed(() => props.review.diagnostics.filter(issue => issue.severity === 'error').length);
const warningCount = computed(() => props.review.diagnostics.filter(issue => issue.severity === 'warning').length);
const statusClass = computed(() => errorCount.value ? 'error' : warningCount.value ? 'warning' : 'success');
const statusIcon = computed(() => errorCount.value ? AlertCircle : warningCount.value ? AlertTriangle : CheckCircle2);
const statusTitle = computed(() => errorCount.value ? '导入已阻止' : warningCount.value ? '可以导入，请复核警告' : '校验通过');

const metrics = computed(() => {
  const mod = props.review.mod;
  if (!mod) return [];
  return [
    { label: '章节', value: mod.scenario.chapters?.length || 0 },
    { label: '事件', value: mod.scenario.events?.length || 0 },
    { label: '人物', value: mod.canon?.characters?.length || 0 },
    { label: '势力', value: mod.canon?.factions?.length || 0 },
    { label: '地点', value: mod.canon?.locations?.length || 0 },
    { label: '技能', value: mod.content?.skills?.length || 0 },
    { label: '功法', value: mod.content?.techniques?.length || 0 },
    { label: '物品', value: mod.content?.items?.length || 0 },
  ];
});

const playerIdentity = computed(() => {
  const mod = props.review.mod;
  if (!mod?.scenario.opening.playerCharacterId) return `独立玩家 · ${mod?.scenario.opening.playerRole || '开放身份'}`;
  return mod.canon?.characters?.find(character => character.id === mod.scenario.opening.playerCharacterId)?.name || mod.scenario.opening.playerCharacterId;
});

const accessRules = computed(() => {
  const mod = props.review.mod;
  if (!mod) return [];
  const content = [...(mod.content?.skills || []), ...(mod.content?.techniques || []), ...(mod.content?.items || [])];
  return (mod.rules.contentAccess || []).map(rule => ({
    ...rule,
    contentName: content.find(item => item.id === rule.contentId)?.name || rule.contentId,
    holders: [
      ...(rule.allowedCharacterIds || []).map(id => mod.canon?.characters?.find(character => character.id === id)?.name || id),
      ...(rule.playerAllowed && !mod.scenario.opening.playerCharacterId ? ['独立玩家'] : []),
    ].join('、'),
  }));
});

const affiliations = computed(() => {
  const mod = props.review.mod;
  if (!mod) return [];
  return (mod.canon?.characters || []).flatMap(character => {
    const declared = [...(character.affiliations || [])];
    if (character.factionId && !declared.some(affiliation => affiliation.factionId === character.factionId)) {
      declared.push({ factionId: character.factionId, category: 'organization' });
    }
    return declared.map((affiliation, index) => ({
      key: `${character.id}-${affiliation.factionId}-${index}`,
      characterName: character.name,
      category: affiliation.category,
      factionName: mod.canon?.factions?.find(faction => faction.id === affiliation.factionId)?.name || affiliation.factionId,
      role: affiliation.role,
    }));
  });
});

function suggestionFor(code: string): string {
  const suggestions: Record<string, string> = {
    invalid_json: '检查 JSON 引号、逗号和括号是否完整。',
    missing_reference: '在同一 Mod 中定义目标 ID，或改为已有实体 ID。',
    duplicate_id: '为重复实体分配新的全局唯一 ID。',
    duplicate_global_id: '检查所有实体集合，确保 ID 在整个 Mod 内唯一。',
    uninitialized_flag: '在 scenario.initialFlags 中加入该 flag 的初始值。',
    no_initial_chapter: '移除第一章 activation，或让其条件在 initialFlags 下成立。',
    blocking_chapter_without_completion: '为非终章添加可达的 completion 条件。',
    chapter_cycle: '让章节按单向完成 flag 串联，移除循环依赖。',
    unreachable_chapter: '让前章 completion 与本章 activation 使用一致条件。',
    orphan_event: '把事件 ID 加入目标章节的 eventIds，或删除该事件。',
    reused_event: '为每章创建独立事件 ID，避免共享完成状态。',
  };
  return suggestions[code] || '根据字段路径核对 Mod Kit Schema 与 Agent 制作规范。';
}
</script>

<style scoped>
.review-overlay {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(0, 0, 0, 0.58);
}

.review-dialog {
  width: min(940px, 100%);
  max-height: min(860px, calc(100vh - 48px));
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-surface);
  color: var(--color-text);
  box-shadow: 0 24px 70px rgba(0, 0, 0, 0.34);
}

.review-header,
.review-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 20px;
}

.review-header { justify-content: space-between; border-bottom: 1px solid var(--color-border); }
.review-header h2 { margin: 2px 0 0; font-size: 1.25rem; letter-spacing: 0; overflow-wrap: anywhere; }
.eyebrow { margin: 0; color: var(--color-text-secondary); font-size: 0.78rem; overflow-wrap: anywhere; }
.review-scroll { overflow-y: auto; }

.status-band {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 13px 20px;
  border-bottom: 1px solid var(--color-border);
}
.status-band div { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
.status-band span { color: var(--color-text-secondary); font-size: 0.82rem; }
.status-band.success { color: var(--color-success); background: rgba(var(--color-success-rgb), 0.08); }
.status-band.warning { color: var(--color-warning); background: rgba(var(--color-warning-rgb), 0.08); }
.status-band.error { color: var(--color-error); background: rgba(var(--color-error-rgb), 0.08); }

.review-section { padding: 18px 20px; border-bottom: 1px solid var(--color-border); }
.review-section h3 { margin: 0 0 12px; display: flex; align-items: center; gap: 7px; font-size: 0.92rem; letter-spacing: 0; }
.summary-section { display: flex; justify-content: space-between; gap: 20px; }
.summary-main { min-width: 0; }
.summary-main p { margin: 10px 0; color: var(--color-text-secondary); line-height: 1.5; }
.title-line, .meta-line { display: flex; flex-wrap: wrap; align-items: center; gap: 9px; font-size: 0.82rem; color: var(--color-text-secondary); }
.mode-badge, .policy-badge { border: 1px solid var(--color-border); border-radius: 4px; padding: 2px 7px; color: var(--color-text); font-size: 0.74rem; }
.replace-notice { display: flex; align-items: center; align-self: start; gap: 7px; color: var(--color-warning); font-size: 0.82rem; white-space: nowrap; }

.metric-grid { display: grid; grid-template-columns: repeat(8, minmax(64px, 1fr)); border: 1px solid var(--color-border); border-radius: 6px; overflow: hidden; }
.metric { min-width: 0; padding: 11px 8px; text-align: center; border-right: 1px solid var(--color-border); }
.metric:last-child { border-right: 0; }
.metric strong { display: block; font-size: 1.05rem; }
.metric span { color: var(--color-text-secondary); font-size: 0.74rem; }

.identity-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
.identity-grid p { margin: 0; color: var(--color-text-secondary); }
.rule-list { display: grid; }
.rule-row { display: grid; grid-template-columns: 92px minmax(120px, 0.7fr) minmax(0, 1fr); align-items: center; gap: 12px; padding: 9px 0; border-top: 1px solid var(--color-border); }
.rule-row:first-child { border-top: 0; }
.rule-row span:last-child { color: var(--color-text-secondary); overflow-wrap: anywhere; }

.clean-line { display: flex; align-items: center; gap: 8px; color: var(--color-success); margin: 0; }
.diagnostic-list { display: grid; gap: 8px; }
.diagnostic-row { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 10px; padding: 10px 0; border-top: 1px solid var(--color-border); }
.diagnostic-row:first-child { border-top: 0; }
.diagnostic-row.error { color: var(--color-error); }
.diagnostic-row.warning { color: var(--color-warning); }
.diagnostic-row strong, .diagnostic-row code { margin-right: 8px; }
.diagnostic-row code { color: var(--color-text-secondary); overflow-wrap: anywhere; }
.diagnostic-row p { margin: 5px 0 0; color: var(--color-text); line-height: 1.45; }
.diagnostic-row .suggestion { color: var(--color-text-secondary); font-size: 0.82rem; }

.review-actions { border-top: 1px solid var(--color-border); }
.action-spacer { flex: 1; }
.primary-button, .secondary-button, .icon-button {
  min-height: 38px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 0 14px;
  cursor: pointer;
  color: var(--color-text);
  background: var(--color-surface);
}
.primary-button { border-color: var(--color-primary); background: var(--color-primary); color: white; }
.icon-button { width: 38px; padding: 0; }
button:disabled { opacity: 0.5; cursor: not-allowed; }

@media (max-width: 760px) {
  .review-overlay { padding: 0; }
  .review-dialog { width: 100%; max-height: 100vh; height: 100vh; border: 0; border-radius: 0; }
  .summary-section { display: block; }
  .replace-notice { margin-top: 12px; }
  .metric-grid { grid-template-columns: repeat(4, 1fr); }
  .metric:nth-child(4) { border-right: 0; }
  .metric:nth-child(-n + 4) { border-bottom: 1px solid var(--color-border); }
  .identity-grid { grid-template-columns: 1fr; gap: 18px; }
  .rule-row { grid-template-columns: 84px 1fr; }
  .rule-row span:last-child { grid-column: 2; }
  .review-actions { flex-wrap: wrap; }
  .action-spacer { display: none; }
  .review-actions .primary-button { flex: 1; }
}
</style>
