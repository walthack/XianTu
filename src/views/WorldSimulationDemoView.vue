<template>
  <main class="demo-shell">
    <header class="demo-header">
      <button class="back-button" type="button" @click="router.push('/')">← 返回</button>
      <div>
        <p class="eyebrow">G1 可验证纵切</p>
        <h1>六朝世界 · 定陶王入京</h1>
        <p class="subtitle">同一套生产运行时，零 LLM、零存档写入，验证世界自运转与正式 IF 门闩。</p>
      </div>
      <span class="isolation-badge" data-testid="demo-isolation-badge">内存隔离 · 不写存档</span>
    </header>

    <section class="control-panel" aria-label="演示控制">
      <button type="button" data-testid="demo-reset" @click="resetDemo">重置纵切</button>
      <button type="button" data-testid="demo-advance-one" @click="advanceOne">世界推进 1 轮</button>
      <button class="primary" type="button" data-testid="demo-run-default" @click="runDefaultLine">
        跑完默认线（0 LLM）
      </button>
      <button class="if-action" type="button" data-testid="demo-prepare-guo" @click="prepareCandidate('guo')">
        郭解：固定成功候选
      </button>
      <button class="if-action" type="button" data-testid="demo-prepare-dong" @click="prepareCandidate('dong')">
        董卓：固定成功候选
      </button>
      <button
        class="confirm"
        type="button"
        data-testid="demo-confirm-if"
        :disabled="!pending"
        @click="confirmCandidate"
      >
        确认正式 IF
      </button>
    </section>

    <p v-if="error" class="error" role="alert">{{ error }}</p>

    <section class="summary-grid">
      <article class="summary-card current-card">
        <span>当前局势</span>
        <strong data-testid="demo-current-situation">{{ situation?.title || '三项局势均已结算' }}</strong>
        <p>{{ situation?.summary || '世界已走完本纵切；玩家参与事件仍未被伪造为完成。' }}</p>
      </article>
      <article class="summary-card">
        <span>世界时钟</span>
        <strong data-testid="demo-world-turn">{{ runtime.worldTurn || 0 }}</strong>
        <p>只由本地运行时推进，不接受正文或命令改写。</p>
      </article>
      <article class="summary-card">
        <span>正式分歧</span>
        <strong data-testid="demo-divergence-count">{{ confirmedIfDivergences.length }}</strong>
        <p>成功判定只是候选；点击“确认正式 IF”后才落账。</p>
      </article>
    </section>

    <section v-if="pending" class="pending-card" data-testid="demo-pending-if">
      <div>
        <p class="eyebrow">待玩家确认 · 尚未发生</p>
        <strong>{{ pending.worldDelta }}</strong>
      </div>
      <span>{{ pending.branchId }}</span>
    </section>

    <section class="timeline-card">
      <div class="section-title">
        <div>
          <p class="eyebrow">可核查世界账本</p>
          <h2>三项承重局势</h2>
        </div>
        <span>事件 done 保持 false，世界结算另行记账</span>
      </div>
      <div class="timeline-list">
        <article
          v-for="row in situationRows"
          :key="row.id"
          class="timeline-row"
          :class="row.tone"
          :data-testid="`demo-state-${row.sourceEventId}`"
        >
          <div class="timeline-index">{{ row.index }}</div>
          <div class="timeline-copy">
            <strong>{{ row.title }}</strong>
            <small>{{ row.sourceEventId }}</small>
          </div>
          <div class="timeline-status">{{ row.status }}</div>
          <code>done={{ String(row.playerDone) }}</code>
        </article>
      </div>
    </section>

    <section class="evidence-grid">
      <article class="evidence-card">
        <div class="section-title compact">
          <div>
            <p class="eyebrow">给 LLM 的最小投影</p>
            <h2>不是原著逐拍指令</h2>
          </div>
        </div>
        <pre data-testid="demo-prompt-preview">{{ promptPreview || '当前纵切已结算，无需继续投影未来。' }}</pre>
      </article>
      <article class="evidence-card">
        <div class="section-title compact">
          <div>
            <p class="eyebrow">本地状态摘要</p>
            <h2>可复查机器真值</h2>
          </div>
        </div>
        <pre data-testid="demo-audit-json">{{ auditJson }}</pre>
      </article>
    </section>

    <section class="log-card">
      <div class="section-title compact">
        <div>
          <p class="eyebrow">操作回执</p>
          <h2>本次演示日志</h2>
        </div>
      </div>
      <ol data-testid="demo-log">
        <li v-for="(item, index) in activityLog" :key="`${index}-${item}`">{{ item }}</li>
      </ol>
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';

import { BUILTIN_SCENARIO_MODS } from '@/modules/scenarioMods/builtins';
import {
  WORLD_SIMULATION_DEMO_MOD_ID,
  WORLD_SIMULATION_DEMO_SITUATIONS,
  advanceWorldSimulationDemo,
  confirmWorldSimulationDemoCandidate,
  createWorldSimulationDemoSave,
  prepareWorldSimulationDemoCandidate,
  runDefaultWorldSimulationDemo,
} from '@/modules/scenarioMods/worldSimulationDemo';
import {
  formatWorldSimulationPrompt,
  getCurrentWorldSituation,
  type WorldSimulationRuntime,
} from '@/modules/scenarioMods/worldSimulation';

const router = useRouter();
const mod = BUILTIN_SCENARIO_MODS.find(item => item.manifest.id === WORLD_SIMULATION_DEMO_MOD_ID);
if (!mod) throw new Error(`缺少内置演示模组 ${WORLD_SIMULATION_DEMO_MOD_ID}`);

const save = ref(createWorldSimulationDemoSave(mod));
const activityLog = ref<string[]>(['已创建内存隔离存档；Demo 未调用持久化接口，也未调用 LLM。']);
const error = ref('');

const runtime = computed(() => (
  save.value.世界.状态 as unknown as { 剧本模组: WorldSimulationRuntime }
).剧本模组);
const situation = computed(() => getCurrentWorldSituation(runtime.value));
const pending = computed(() => runtime.value.worldSimulationState?.pendingDivergence);
const promptPreview = computed(() => formatWorldSimulationPrompt(runtime.value));
const confirmedIfDivergences = computed(() => (runtime.value.divergences || []).filter(entry => Boolean(entry.branchId)));

const situationRows = computed(() => (runtime.value.worldSimulation?.situations || []).map((item, index) => {
  const divergence = confirmedIfDivergences.value.find(entry => entry.eventId === item.sourceEventId);
  const offscreen = runtime.value.offscreenResolvedEventIds?.includes(item.sourceEventId);
  const isCurrent = situation.value?.id === item.id;
  return {
    id: item.id,
    index: String(index + 1).padStart(2, '0'),
    title: item.title,
    sourceEventId: item.sourceEventId,
    playerDone: runtime.value.flags[`event.${item.sourceEventId.split('.').at(-1)}.done`] === true,
    status: divergence ? `IF · ${divergence.branchId}` : offscreen ? '世界默认结算' : isCurrent ? '当前窗口' : '等待世界推进',
    tone: divergence ? 'if-settled' : offscreen ? 'default-settled' : isCurrent ? 'current' : 'waiting',
  };
}));

const auditJson = computed(() => {
  const selectedFlags = Object.fromEntries(Object.entries(runtime.value.flags || {}).filter(([key]) =>
    key.startsWith('world.') || key.startsWith('branch.') || key.startsWith('character.') || key.endsWith('.done'),
  ));
  return JSON.stringify({
    storyMode: runtime.value.storyMode,
    worldTurn: runtime.value.worldTurn || 0,
    currentSituation: situation.value?.id || null,
    offscreenResolvedEventIds: runtime.value.offscreenResolvedEventIds || [],
    flags: selectedFlags,
    divergences: runtime.value.divergences || [],
    pendingDivergence: pending.value || null,
    actionReceipts: runtime.value.worldSimulationState?.actionReceipts || [],
  }, null, 2);
});

function withDemoAction(action: () => void) {
  error.value = '';
  try {
    action();
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause);
  }
}

function resetDemo() {
  withDemoAction(() => {
    save.value = createWorldSimulationDemoSave(mod);
    activityLog.value = ['已重置为新建内存存档；所有世界结算与 IF 均已清空。'];
  });
}

function advanceOne() {
  withDemoAction(() => {
    const result = advanceWorldSimulationDemo(save.value, 1);
    save.value = result.saveData;
    activityLog.value.unshift(`世界推进 1 轮；转移=${result.transitions.join('、') || '无显式转移'}。`);
  });
}

function runDefaultLine() {
  withDemoAction(() => {
    const result = runDefaultWorldSimulationDemo(mod);
    save.value = result.saveData;
    activityLog.value = [
      `默认线在 ${result.steps} 个本地轮次内完成，LLM 调用=0。`,
      '定陶王继统、郭解默认死亡、董卓默认死亡均写入世界结算账本。',
      '三个玩家事件 done 仍为 false：引擎没有伪造玩家亲历。',
    ];
  });
}

function prepareCandidate(kind: 'guo' | 'dong') {
  withDemoAction(() => {
    const fresh = createWorldSimulationDemoSave(mod);
    const isGuo = kind === 'guo';
    const result = prepareWorldSimulationDemoCandidate(
      fresh,
      isGuo ? WORLD_SIMULATION_DEMO_SITUATIONS.guoJie : WORLD_SIMULATION_DEMO_SITUATIONS.dongZhuo,
      isGuo
        ? '我立即牵制剑玉姬并救下郭解'
        : '我用疗伤手段稳住董卓并救治董卓',
      'great_success',
    );
    save.value = result.saveData;
    activityLog.value = [
      `已用真实本地判定管线生成“${isGuo ? '郭解' : '董卓'}生还”候选（Demo 固定结果=great_success）。`,
      `为到达介入窗口，世界先自行推进 ${result.steps} 轮。`,
      '候选尚未改变正式 flags；必须点击“确认正式 IF”。',
    ];
  });
}

function confirmCandidate() {
  withDemoAction(() => {
    const branchId = pending.value?.branchId || '未知分支';
    save.value = confirmWorldSimulationDemoCandidate(save.value);
    activityLog.value.unshift(`已确认 ${branchId}：分歧、人物状态与源事件 settlement 原子落账。`);
  });
}
</script>

<style scoped>
.demo-shell {
  align-self: flex-start;
  width: 100%;
  min-height: 100vh;
  box-sizing: border-box;
  padding: 2.2rem clamp(1rem, 4vw, 4rem) 4rem;
  color: #e8e5dc;
  background:
    radial-gradient(circle at 15% 5%, rgba(62, 116, 111, 0.24), transparent 34rem),
    radial-gradient(circle at 90% 15%, rgba(127, 92, 65, 0.18), transparent 30rem),
    #101418;
  overflow-y: auto;
}

.demo-header {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: start;
  gap: 1.25rem;
  max-width: 1240px;
  margin: 0 auto 1.5rem;
}

.demo-header h1,
.section-title h2 {
  margin: 0;
  font-family: var(--font-family-serif);
  font-weight: 500;
}

.demo-header h1 { font-size: clamp(1.8rem, 4vw, 3rem); }
.subtitle { margin: 0.45rem 0 0; color: #9ca9a5; line-height: 1.6; }
.eyebrow { margin: 0 0 0.25rem; color: #79bcb2; font-size: 0.72rem; letter-spacing: 0.16em; text-transform: uppercase; }

.back-button,
.control-panel button {
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 9px;
  background: rgba(24, 31, 35, 0.8);
  color: #cbc9c1;
  cursor: pointer;
}

.back-button { padding: 0.6rem 0.8rem; }
.isolation-badge { padding: 0.45rem 0.7rem; border: 1px solid rgba(121, 188, 178, 0.4); border-radius: 999px; color: #91cec5; font-size: 0.72rem; white-space: nowrap; }

.control-panel,
.summary-grid,
.timeline-card,
.evidence-grid,
.log-card,
.pending-card,
.error {
  max-width: 1240px;
  margin-left: auto;
  margin-right: auto;
}

.control-panel { display: flex; flex-wrap: wrap; gap: 0.6rem; margin-bottom: 1rem; padding: 0.8rem; border: 1px solid rgba(255,255,255,.08); border-radius: 13px; background: rgba(20, 25, 29, .78); }
.control-panel button { padding: 0.68rem 0.85rem; }
.control-panel button:hover:not(:disabled) { border-color: rgba(121, 188, 178, .62); color: #fff; }
.control-panel button.primary { background: rgba(63, 104, 101, .62); border-color: rgba(121, 188, 178, .5); }
.control-panel button.if-action { border-color: rgba(181, 142, 95, .38); }
.control-panel button.confirm { margin-left: auto; background: rgba(129, 89, 49, .48); border-color: rgba(216, 165, 98, .52); }
.control-panel button:disabled { opacity: .38; cursor: not-allowed; }
.error { margin-bottom: 1rem; padding: .75rem 1rem; border: 1px solid rgba(211, 102, 91, .5); border-radius: 9px; color: #f1a69c; background: rgba(98, 39, 34, .3); }

.summary-grid { display: grid; grid-template-columns: 2fr repeat(2, 1fr); gap: .8rem; margin-bottom: .8rem; }
.summary-card,
.timeline-card,
.evidence-card,
.log-card { border: 1px solid rgba(255,255,255,.09); border-radius: 14px; background: rgba(18, 23, 27, .84); box-shadow: 0 16px 40px rgba(0,0,0,.16); }
.summary-card { padding: 1rem; }
.summary-card > span { color: #8a9693; font-size: .72rem; letter-spacing: .1em; }
.summary-card strong { display: block; margin: .55rem 0; color: #ece8dd; font-size: 1.15rem; }
.summary-card p { margin: 0; color: #87938f; font-size: .78rem; line-height: 1.5; }
.current-card { border-color: rgba(121, 188, 178, .26); }

.pending-card { display: flex; justify-content: space-between; gap: 1rem; margin-bottom: .8rem; padding: 1rem; border: 1px solid rgba(216, 165, 98, .5); border-radius: 14px; background: rgba(100, 69, 35, .28); }
.pending-card strong { line-height: 1.55; }
.pending-card > span { color: #dba867; font-family: monospace; font-size: .75rem; white-space: nowrap; }

.timeline-card,
.log-card { margin-bottom: .8rem; padding: 1rem; }
.section-title { display: flex; align-items: end; justify-content: space-between; gap: 1rem; margin-bottom: .85rem; }
.section-title > span { color: #7f8c89; font-size: .72rem; }
.section-title.compact { margin-bottom: .65rem; }
.section-title h2 { font-size: 1.05rem; }
.timeline-list { display: grid; gap: .45rem; }
.timeline-row { display: grid; grid-template-columns: 2.5rem minmax(0, 1fr) minmax(9rem, auto) 7rem; align-items: center; gap: .7rem; padding: .7rem; border: 1px solid rgba(255,255,255,.07); border-radius: 9px; background: rgba(9,12,15,.35); }
.timeline-index { color: #59635f; font-family: monospace; }
.timeline-copy { display: flex; flex-direction: column; gap: .2rem; }
.timeline-copy small { color: #697572; font-family: monospace; }
.timeline-status { color: #9da8a4; font-size: .8rem; }
.timeline-row code { color: #73817d; font-size: .72rem; text-align: right; }
.timeline-row.current { border-color: rgba(121, 188, 178, .42); }
.timeline-row.default-settled .timeline-status { color: #8eb8b1; }
.timeline-row.if-settled { border-color: rgba(216, 165, 98, .45); }
.timeline-row.if-settled .timeline-status { color: #dba867; }

.evidence-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .8rem; margin-bottom: .8rem; }
.evidence-card { min-width: 0; padding: 1rem; }
pre { min-height: 14rem; max-height: 25rem; margin: 0; padding: .8rem; overflow: auto; border-radius: 9px; color: #aebbb7; background: #0c1013; font: .72rem/1.6 ui-monospace, SFMono-Regular, Menlo, monospace; white-space: pre-wrap; overflow-wrap: anywhere; }
.log-card ol { margin: 0; padding-left: 1.4rem; color: #a9b2af; font-size: .82rem; line-height: 1.7; }

@media (max-width: 820px) {
  .demo-header { grid-template-columns: 1fr; }
  .isolation-badge { justify-self: start; }
  .summary-grid,
  .evidence-grid { grid-template-columns: 1fr; }
  .timeline-row { grid-template-columns: 2rem minmax(0, 1fr); }
  .timeline-status,
  .timeline-row code { grid-column: 2; text-align: left; }
  .control-panel button.confirm { margin-left: 0; }
  .pending-card { flex-direction: column; }
}

@media (min-width: 821px) {
  .demo-header { padding-right: 3.5rem; }
}
</style>
