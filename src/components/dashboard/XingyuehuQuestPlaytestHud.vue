<template>
  <section
    v-if="experience.visible"
    class="playtest-hud"
    :class="{ finished: experience.finished }"
    data-testid="xingyuehu-playtest-hud"
  >
    <div class="status-line">
      <span class="badge">{{ experience.routeMode === 'from-landing' ? '从落地开始' : '星月湖试玩' }}</span>
      <strong>{{ experience.finished ? '这一段已经结束' : experience.stageLabel || '当前' }}</strong>
    </div>

    <details v-if="moduleReceipt" class="hint" data-testid="module-turn-status">
      <summary>本轮{{ RECEIPT_PATH_LABELS[moduleReceipt.path] || '原链路' }}<span v-if="moduleReceipt.path === 'modular'"> · {{ (moduleReceipt.foregroundMs / 1000).toFixed(1) }}秒 · 输入{{ moduleReceipt.promptChars }}字</span></summary>
      <p v-if="moduleReceipt.route">演出模型：{{ moduleReceipt.route.model }}（{{ moduleReceipt.route.provider }}{{ moduleReceipt.route.inherited ? '，继承' : '' }}）；记忆模型：{{ moduleReceipt.memory?.route?.model || '未记录' }}。</p>
      <p v-if="moduleReceipt.fallback" data-testid="module-turn-fallback">模块演出 {{ moduleReceipt.fallback.attempts }} 次未通过，本轮回落原链路：{{ moduleReceipt.fallback.reason }}</p>
      <p v-if="moduleReceipt.path === 'modular'">回合记忆：{{ moduleReceipt.memory?.status || '未运行' }}{{ moduleReceipt.memory?.appliedToShortTerm ? '（已替换为短期记忆摘录）' : '' }}。后台结果不改写已展示正文。</p>
      <button type="button" @click="exportModuleReport">导出模块回合记录</button>
      <button v-if="moduleReceipt.path === 'modular' && ['failed', 'rejected'].includes(moduleReceipt.memory?.status || '')" type="button" @click="startModuleBackground">重试本轮记忆整理</button>
    </details>
    <p v-if="experience.currentGoal" class="goal" data-testid="xingyuehu-playtest-goal">{{ experience.currentGoal }}</p>
    <p v-if="experience.whyNow" class="hint">{{ experience.whyNow }}</p>
    <p v-if="experience.continueJourneyHint" class="hint" data-testid="xingyuehu-playtest-continue">
      {{ experience.continueJourneyHint }}
    </p>

    <div v-if="experience.choice" class="choice" data-testid="xingyuehu-playtest-choice">
      <article>
        <strong>{{ experience.choice.listen.title }}</strong>
        <span>{{ experience.choice.listen.knownCost }}</span>
      </article>
      <article>
        <strong>{{ experience.choice.rescue.title }}</strong>
        <span>{{ experience.choice.rescue.knownCost }}</span>
      </article>
      <p v-if="experience.choice.pendingJudgement" class="hint">还没确认这次救治，成败还没发生。</p>
    </div>

    <div v-if="experience.recap" class="recap" data-testid="xingyuehu-playtest-recap">
      <h2>这一段已经发生的事</h2>
      <ul>
        <li v-for="line in experience.recap.lines" :key="line">{{ line }}</li>
      </ul>
    </div>

    <details class="feedback" data-testid="xingyuehu-playtest-feedback">
      <summary>体验反馈（可收起，仅本机）</summary>
      <p class="hint">只记录你主动写下的感受。导出留在本机，不会发送到外部，也不含完整存档、API、token、角色档案或叙事全文。</p>
      <div class="tags">
        <label v-for="tag in feedbackTags" :key="tag">
          <input v-model="selectedTags" type="checkbox" :value="tag">
          <span>{{ tag }}</span>
        </label>
      </div>
      <textarea v-model="note" rows="3" placeholder="还可以写：哪一刻不知道做什么，或选择看起来没差别。"></textarea>
      <div class="feedback-actions">
        <button type="button" @click="exportFeedback">导出本机 JSON</button>
        <button type="button" @click="startNewFeedback">清除／新建本条反馈</button>
      </div>
      <small v-if="statusMessage">{{ statusMessage }}</small>
    </details>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';

import { getModuleReceipts } from '@/modules/scenarioMods/modularTurn';
import { startModuleBackground } from '@/services/modularTurnBackground';
import { useGameStateStore } from '@/stores/gameStateStore';
import {
  buildXingyuehuQuestPlaytestFeedbackExport,
  captureXingyuehuQuestPlaytestFeedbackContext,
  deriveXingyuehuQuestPlaytestExperience,
  XINGYUEHU_QUEST_PLAYTEST_FEEDBACK_TAGS,
  type XingyuehuQuestPlaytestFeedbackContext,
} from '@/modules/scenarioMods/xingyuehuQuestPlaytestExperience';

const gameStateStore = useGameStateStore();
const moduleReceipt = computed(() => getModuleReceipts(gameStateStore.toSaveData()).at(-1));
// 回执标记 → 玩家可读的正文来源；未列出的（legacy）即原链路。
const RECEIPT_PATH_LABELS: Record<string, string> = { modular: '模块演出', fast: '快演出', local: '本地结算（未请求模型）', card: '卡片结算（未请求模型）' };
function exportModuleReport() {
  const data = { version: 1, exportedAt: new Date().toISOString(), receipts: getModuleReceipts(gameStateStore.toSaveData()) };
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `module-turns-${Date.now()}.json`;
  link.click();
  URL.revokeObjectURL(url);
}
const selectedTags = ref<string[]>([]);
const note = ref('');
const statusMessage = ref('');
const feedbackContext = ref<XingyuehuQuestPlaytestFeedbackContext | null>(null);
const feedbackTags = XINGYUEHU_QUEST_PLAYTEST_FEEDBACK_TAGS;
const experience = computed(() => deriveXingyuehuQuestPlaytestExperience(gameStateStore.toSaveData()));

function lockFeedbackContext() {
  if (feedbackContext.value) return;
  if (!note.value.trim() && selectedTags.value.length === 0) return;
  feedbackContext.value = captureXingyuehuQuestPlaytestFeedbackContext({
    save: gameStateStore.toSaveData(),
  });
}

watch([note, selectedTags], lockFeedbackContext, { deep: true });

function exportFeedback() {
  const payload = buildXingyuehuQuestPlaytestFeedbackExport({
    save: gameStateStore.toSaveData(),
    tags: selectedTags.value,
    note: note.value,
    context: feedbackContext.value,
  });
  if (!payload) {
    statusMessage.value = '当前不是星月湖隔离试玩档，未导出。';
    return;
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `xingyuehu-playtest-feedback-${payload.exportedAt.slice(0, 19).replace(/[:T]/g, '-')}.json`;
  link.click();
  URL.revokeObjectURL(url);
  statusMessage.value = '已导出到本机。文件不会自动发送到外部。';
}

function startNewFeedback() {
  selectedTags.value = [];
  note.value = '';
  feedbackContext.value = null;
  statusMessage.value = '已清除本条反馈。再写会按此刻局面重新记下。';
}
</script>

<style scoped>
.playtest-hud {
  flex: 0 1 auto;
  min-height: 0;
  max-height: min(42vh, 22rem);
  overflow-y: auto;
  box-sizing: border-box;
  padding: .7rem .9rem;
  border-bottom: 1px solid rgba(76, 135, 173, .28);
  background: linear-gradient(90deg, rgba(76, 135, 173, .12), rgba(124, 82, 150, .08));
  color: var(--color-text);
  display: grid;
  gap: .45rem;
}
.status-line { display: flex; align-items: center; flex-wrap: wrap; gap: .55rem 1rem; font-size: .78rem; }
.status-line .badge { padding: .2rem .45rem; border: 1px solid rgba(76, 135, 173, .42); border-radius: 999px; color: var(--color-primary); }
.goal { margin: 0; font-size: .9rem; line-height: 1.55; }
.hint, .feedback small, .choice span { color: var(--color-text-secondary); font-size: .75rem; line-height: 1.55; }
.hint { margin: 0; }
.choice, .recap { display: grid; gap: .45rem; }
.choice article, .recap li {
  border: 1px solid var(--color-border);
  background: var(--color-background);
  border-radius: 8px;
  padding: .45rem .55rem;
  display: grid;
  gap: .2rem;
  font-size: .78rem;
}
.recap h2 { margin: 0; font-size: 1rem; }
.recap ul { list-style: none; margin: 0; padding: 0; display: grid; gap: .35rem; }
.finished { border-bottom-color: rgba(198, 148, 49, .35); }
.feedback { margin-top: .15rem; }
.feedback summary { cursor: pointer; font-size: .78rem; font-weight: 650; }
.tags { display: flex; flex-wrap: wrap; gap: .4rem; margin: .5rem 0; }
.tags label { display: flex; align-items: center; gap: .3rem; font-size: .75rem; }
textarea {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--color-border);
  border-radius: 7px;
  background: var(--color-background);
  color: var(--color-text);
  padding: .45rem;
  resize: vertical;
}
.feedback-actions { margin-top: .45rem; display: flex; flex-wrap: wrap; gap: .45rem; }
.feedback-actions button {
  border: 1px solid var(--color-border);
  border-radius: 7px;
  background: var(--color-background);
  color: var(--color-text);
  padding: .45rem .7rem;
  cursor: pointer;
}
</style>
