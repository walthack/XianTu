<template>
  <p v-if="error && !view" class="ct-error standalone" data-testid="combat-error">战斗卡片出错：{{ error }}</p>
  <section v-if="view" class="combat-trial-card" :class="{ done: view.status === 'resolved', compact: completed }" data-testid="combat-trial-card" :data-mode="view.mode" :data-status="view.status">
    <header class="ct-head">
      <strong class="ct-title">山涧雾战 · {{ view.mode === 'B' ? 'B 分阶段' : 'A 回合制' }}</strong>
      <span v-if="view.status === 'engaged'" class="ct-progress" data-testid="combat-progress">
        {{ view.mode === 'B' ? `第 ${view.progress.index}/${view.progress.total} 阶段` : `第 ${view.progress.index}/${view.progress.total} 回合` }}
      </span>
      <span v-else class="ct-progress tier" :class="tierClass" data-testid="combat-tier">{{ view.tier }}</span>
    </header>

    <template v-if="!completed">
      <div v-if="view.status === 'engaged'" class="ct-scene">
        <p class="ct-prompt">{{ view.title }}　{{ view.prompt }}</p>
        <div v-if="view.hp" class="ct-hp" data-testid="combat-hp">
          <label>你 <meter :value="view.hp.player" :max="view.hp.playerMax" low="9" high="19" optimum="28"></meter> {{ view.hp.player }}/{{ view.hp.playerMax }}</label>
          <label>武士 <meter :value="view.hp.enemy" :max="view.hp.enemyMax" optimum="0"></meter> {{ view.hp.enemy }}/{{ view.hp.enemyMax }}</label>
          <span class="ct-chip" :class="{ on: view.hp.protectedNingyu }">{{ view.hp.chip }}</span>
        </div>
        <p class="ct-env">{{ view.card.environment }}</p>
      </div>

      <div v-if="view.status === 'engaged'" class="ct-choices" role="group" aria-label="本步选择">
        <article v-for="choice in view.choices" :key="choice.id" class="ct-choice">
          <button type="button" class="ct-roll" :disabled="busy" :data-testid="`combat-choice-${choice.id}`" @click="roll(choice.id)">
            <span class="ct-choice-label">{{ choice.label }}</span>
            <span class="ct-choice-meta">〔{{ choice.kindLabel }}〕难度 {{ choice.difficulty }} · 加值 {{ signed(choice.modifier) }} · 掷 ≥{{ clampNeeded(choice.needed) }} 算胜</span>
            <span class="ct-choice-odds">
              <i class="win">胜 {{ pct(choice.chance.胜) }}</i><i class="lose">败 {{ pct(choice.chance.败) }}</i><i class="rout">大败 {{ pct(choice.chance.大败) }}</i>
            </span>
            <span class="ct-choice-hint">{{ choice.hint }}</span>
          </button>
          <details class="ct-factors">
            <summary>因子明细</summary>
            <ul>
              <li v-for="factor in choice.factors" :key="factor.label"><span>{{ factor.label }}</span><b>{{ signed(factor.value) }}</b></li>
            </ul>
          </details>
        </article>
      </div>

      <div v-if="last" class="ct-result" :class="tierClassOf(last.tier)" data-testid="combat-last-result">
        <div class="ct-result-head">
          <strong>{{ last.label }}</strong>
          <span>d20 = <b>{{ last.roll }}</b>（{{ last.rollSource }}）</span>
        </div>
        <p class="ct-calc">
          {{ last.roll }} {{ signed(last.modifier) }} = <b>{{ last.total }}</b> {{ last.total >= last.difficulty ? '≥' : '<' }} 难度 {{ last.difficulty }}
          → {{ last.outcomeLabel }} → <b>{{ last.tier }}</b>
          <template v-if="last.dealt !== undefined">　你造成 {{ last.dealt }}、承受 {{ last.taken }}</template>
        </p>
        <ul v-if="last.effects && last.effects.length"><li v-for="line in last.effects" :key="line">{{ line }}</li></ul>
      </div>

      <div v-if="view.status === 'resolved'" class="ct-summary" data-testid="combat-summary">
        <p class="ct-lead">
          战斗结束：<b :class="tierClass">{{ view.tier }}</b>
          <template v-if="view.wound && view.wound !== '无'">　你的外伤：{{ view.wound }}</template>
          。点上方主线按钮收拾残局，回到剧情。
        </p>
        <ul class="ct-ledger">
          <li v-for="(line, index) in view.ledger" :key="index">{{ line.text }}</li>
        </ul>
      </div>
    </template>
    <p v-else class="ct-lead" data-testid="combat-done-note">本场战斗：{{ view.mode }} 模式 · {{ view.tier }}。</p>

    <footer class="ct-foot">
      <span v-if="view.rematches" class="ct-note">已重打 {{ view.rematches }} 次</span>
      <template v-if="canRestart">
        <button type="button" class="ct-restart" :disabled="busy" data-testid="combat-restart-other" @click="restart(otherMode)">
          回到战前，换成 {{ otherMode === 'A' ? 'A 回合制' : 'B 分阶段' }} 再打
        </button>
        <button type="button" class="ct-restart ghost" :disabled="busy" data-testid="combat-restart-same" @click="restart(view.mode)">
          回到战前，同一种再打一次
        </button>
      </template>
      <span v-if="error" class="ct-error" data-testid="combat-error">{{ error }}</span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useCharacterStore } from '@/stores/characterStore'
import { useGameStateStore } from '@/stores/gameStateStore'
import { useUIStore } from '@/stores/uiStore'
import type { SaveData } from '@/types/game'
import type { BattleMode, Resolution, Tier } from './engine'
import { F03_EVENT_ID } from './f03Scenario'
import { battleView, beginBattle, encounterLogged, restartFromSnapshot, rollChoice } from './flow'
import { COMBAT_TRIAL_FIGHTING_CLASS, isCombatEngaged, readTrialState, trialRuntime } from './trialState'

const gameState = useGameStateStore()
const characterStore = useCharacterStore()
const ui = useUIStore()
// ?debug=1 时把卡片的关键动作打到控制台（consolePatch 会吞 console.log，所以用 error）。
const DEBUG = new URLSearchParams(window.location.search).has('debug')
const dlog = (...parts: unknown[]) => { if (DEBUG) console.error('[战斗卡片]', ...parts) }
const busy = ref(false)
const error = ref('')

const currentSave = (): SaveData | null => (gameState.isGameLoaded ? gameState.toSaveData() : null)
const save = computed(currentSave)
const ext = computed(() => readTrialState(save.value))
const view = computed(() => battleView(save.value))
const completed = computed(() => Boolean(trialRuntime(save.value)?.completedEventIds?.includes(F03_EVENT_ID)))
// 开战要等主面板这一回合处理完（isAIProcessing 为 false）：管线在回合中途会多次整档写回 store，
// 中途提交的战斗状态会被它用旧存档盖回去。
const needBegin = computed(() => Boolean(
  ext.value && ext.value.status === 'idle' && !ui.isAIProcessing
  && isCombatEngaged(save.value, F03_EVENT_ID) && encounterLogged(save.value),
))
const last = computed<Resolution | null>(() => view.value?.resolutions.at(-1) || null)
const otherMode = computed<BattleMode>(() => (view.value?.mode === 'A' ? 'B' : 'A'))
const canRestart = computed(() => Boolean(ext.value?.snapshot) && !busy.value)
const tierClass = computed(() => tierClassOf(view.value?.tier || null))

function tierClassOf(tier: Tier | null): string {
  return tier === '胜' ? 'win' : tier === '败' ? 'lose' : tier === '大败' ? 'rout' : ''
}
const signed = (value: number): string => (value >= 0 ? `+${value}` : `−${Math.abs(value)}`)
const pct = (value: number): string => `${Math.round(value * 100)}%`
const clampNeeded = (needed: number): string => (needed <= 1 ? '1（必胜）' : needed > 20 ? '20+（掷不到）' : String(needed))

/** 叙事区只显示最新一条且会滚动；卡片占了一块高度，追加的战斗实录和收尾按钮要主动滚到可见处。 */
async function scrollNarrativeToEnd(): Promise<void> {
  await nextTick()
  requestAnimationFrame(() => {
    const area = document.querySelector<HTMLElement>('.current-narrative')
    area?.scrollTo({ top: area.scrollHeight })
  })
}

async function commit(next: SaveData): Promise<void> {
  gameState.loadFromSaveData(next)
  void scrollNarrativeToEnd()
  await characterStore.saveCurrentGame()
}

async function run(step: (current: SaveData) => SaveData | null): Promise<void> {
  dlog('run', { busy: busy.value })
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    const current = currentSave()
    if (!current) return
    const next = step(current)
    dlog('step 结果', next ? '有新存档' : 'null')
    if (next) await commit(next)
    dlog('commit 完成')
  } catch (cause) {
    error.value = String((cause as Error)?.message || cause)
  } finally {
    busy.value = false
    // 这一步（如回到战前）提交期间 needBegin 可能已经翻成 true 而被 busy 挡掉，提交完补开一次。
    if (step !== beginStep) beginIfNeeded()
  }
}

const roll = (choiceId: string) => run(current => rollChoice(current, choiceId).save)
const restart = (mode: BattleMode) => run(current => restartFromSnapshot(current, mode))

// 遇敌后（玩家点过「迎向雾里」，且遇敌文字已写进叙事）自动开战。状态和叙事条目是管线分两步写的，所以两个条件都要等。
const beginStep = (current: SaveData): SaveData | null => beginBattle(current)
function beginIfNeeded(): void {
  if (needBegin.value && !busy.value) void run(beginStep)
}
watch(needBegin, need => {
  dlog('needBegin →', need)
  if (need) beginIfNeeded()
}, { immediate: true })

// 战斗进行中：隐藏主线按钮和输入框（它们在叙事区 / 输入区，样式在下面的全局块里）。
const fighting = computed(() => ext.value?.status === 'engaged')
watch(fighting, value => document.body.classList.toggle(COMBAT_TRIAL_FIGHTING_CLASS, value), { immediate: true })
onBeforeUnmount(() => document.body.classList.remove(COMBAT_TRIAL_FIGHTING_CLASS))
</script>

<style>
/* 战斗进行中：主线按钮（含兜底的「留意四周」）和输入框都不该被点，战斗结束后恢复。 */
body.combat-trial-fighting .engine-action-options,
body.combat-trial-fighting .input-section .input-wrapper {
  display: none !important;
}
</style>

<style scoped>
.combat-trial-card { margin: 8px 12px; padding: 10px 12px 12px; border-left: 4px solid #a77b35; border-radius: 6px; background: #30281d; color: #eadcc2; display: grid; gap: 10px; }
[data-theme="light"] .combat-trial-card { background: #fbf3e2; color: #4a3a1c; }
.combat-trial-card.done { border-left-color: #5d8a5d; background: #1f3120; color: #d8ead6; }
[data-theme="light"] .combat-trial-card.done { background: #f2f8f0; color: #274227; }
.combat-trial-card.compact { padding: 6px 12px; gap: 4px; }
.ct-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.ct-title { font-size: 1rem; }
.ct-progress { font-size: .85rem; opacity: .85; }
.ct-progress.tier { font-weight: 700; opacity: 1; }
.win { color: #7caf76; } .lose { color: #d9a441; } .rout { color: #d96a5b; }
.ct-prompt { margin: 0; line-height: 1.6; }
.ct-env { margin: 4px 0 0; font-size: .8rem; opacity: .75; }
.ct-hp { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 16px; margin-top: 6px; font-size: .85rem; }
.ct-hp meter { width: 120px; height: 12px; vertical-align: middle; }
.ct-chip { padding: 1px 8px; border-radius: 10px; border: 1px solid currentColor; font-size: .75rem; opacity: .7; }
.ct-chip.on { opacity: 1; color: #7caf76; }
.ct-choices { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 8px; }
.ct-choice { display: grid; gap: 4px; }
.ct-roll { display: grid; gap: 4px; text-align: left; padding: 9px 11px; border: 1px solid #a77b35; border-radius: 8px; background: rgba(167, 123, 53, .14); color: inherit; cursor: pointer; font: inherit; }
.ct-roll:hover:not(:disabled) { background: rgba(167, 123, 53, .3); }
.ct-roll:disabled { opacity: .55; cursor: wait; }
.ct-choice-label { font-weight: 700; }
.ct-choice-meta, .ct-choice-hint { font-size: .78rem; opacity: .8; line-height: 1.45; }
.ct-choice-odds { display: flex; gap: 10px; font-size: .8rem; }
.ct-choice-odds i { font-style: normal; font-weight: 600; }
.ct-factors { font-size: .76rem; opacity: .85; }
.ct-factors summary { cursor: pointer; }
.ct-factors ul { margin: 4px 0 0; padding: 0; list-style: none; display: grid; gap: 2px; }
.ct-factors li { display: flex; justify-content: space-between; gap: 8px; }
.ct-result { padding: 8px 10px; border-radius: 6px; background: rgba(255, 255, 255, .06); border-left: 3px solid #a77b35; }
.ct-result.win { border-left-color: #7caf76; color: inherit; } .ct-result.lose { border-left-color: #d9a441; } .ct-result.rout { border-left-color: #d96a5b; }
.ct-result-head { display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.ct-calc { margin: 4px 0 0; font-size: .88rem; }
.ct-result ul, .ct-ledger { margin: 6px 0 0; padding-left: 1.2em; font-size: .85rem; line-height: 1.55; }
.ct-lead { margin: 0; line-height: 1.6; }
.ct-foot { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.ct-note { font-size: .78rem; opacity: .7; }
.ct-restart { padding: 5px 12px; border-radius: 6px; border: 1px solid currentColor; background: transparent; color: inherit; cursor: pointer; font: inherit; font-size: .85rem; }
.ct-restart.ghost { opacity: .75; }
.ct-restart:disabled { opacity: .5; cursor: wait; }
.ct-error { color: #d96a5b; font-size: .85rem; }
.ct-error.standalone { margin: 8px 12px; }
</style>
