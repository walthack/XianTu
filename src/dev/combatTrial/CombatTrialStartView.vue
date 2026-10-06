<template>
  <main class="trial-start">
    <section class="trial-card">
      <div class="eyebrow">内部试玩 · 真实游戏界面</div>
      <h1>山涧雾战</h1>
      <p v-if="newSceneModule" class="lead">使用游戏正式场面模块：输入打法，查看预览，确认掷骰；每拍保存结果，收束后接回剧情。</p>
      <p v-else class="lead">一拍剧情 → 遇敌 → 战斗 → 结束。进入后是正常的游戏界面：先读开场，点主线按钮「循着哨声迎向雾里」遇敌，战斗卡片出现在输入框上方；打完再点收尾按钮回到叙事，最后是本期结束卡片。</p>

      <div v-if="!newSceneModule" class="modes" role="radiogroup" aria-label="战斗模式">
        <label :class="{ on: mode === 'B' }">
          <input v-model="mode" type="radio" value="B" data-testid="mode-B" />
          <strong>B · 分阶段判定</strong>
          <span>两个阶段，每阶段选一个战术、掷一次骰；按档位落代价。三分钟左右。</span>
        </label>
        <label :class="{ on: mode === 'A' }">
          <input v-model="mode" type="radio" value="A" data-testid="mode-A" />
          <strong>A · 回合制</strong>
          <span>{{ copy.modeADesc }}</span>
        </label>
      </div>

      <p v-if="devNote" class="dev-note" data-testid="dev-note">{{ devNote }}</p>
      <p v-if="errorMessage" class="error-message">{{ errorMessage }}</p>

      <div class="actions">
        <button v-if="hasExisting" class="secondary" type="button" :disabled="busy" data-testid="continue-trial" @click="continueTrial">
          继续上次
        </button>
        <button class="primary" type="button" :disabled="busy" data-testid="start-combat-trial" @click="startFresh">
          {{ busy ? '正在建立隔离存档…' : hasExisting ? '重置并重新开始' : '开始' }}
        </button>
      </div>
      <p class="foot">存档只在这个浏览器里（隔离试玩档），不会写入服务器，也不影响正式存档。</p>
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useCharacterStore } from '@/stores/characterStore'
import { useGameStateStore } from '@/stores/gameStateStore'
import { BUILTIN_SCENARIO_MODS } from '@/modules/scenarioMods/builtins'
import { QINGYU_OPENING_PLAYTEST_EXTENSION_KEY, QINGYU_OPENING_PLAYTEST_KIND } from '@/modules/scenarioMods/qingyuOpeningPlaytest'
import { sceneModuleEnabled, writeExt, emptyExt, newActive } from '@/modules/sceneModule/host/ext'
import { sceneContractForEvent } from '@/modules/sceneModule/contracts/registry'
import { beginScene } from '@/modules/sceneModule'
import type { BattleMode } from './engine'
import { F03_UI } from './f03Scenario'
import { COMBAT_TRIAL_CHARACTER_ID, COMBAT_TRIAL_MOD_ID, COMBAT_TRIAL_SLOT, createCombatTrialSave, createSceneCombatTrialSave } from './overlay'

const router = useRouter()
const characterStore = useCharacterStore()
const gameStateStore = useGameStateStore()
const newSceneModule = sceneModuleEnabled()
const copy = F03_UI
const busy = ref(false)
const errorMessage = ref('')

// 开发参数：?mode=A|B  ?seed=123  ?rolls=20,20,9（指定前几骰，之后接种子或真随机）
const params = new URLSearchParams(window.location.search)
const mode = ref<BattleMode>(params.get('mode') === 'A' ? 'A' : 'B')
const seedParam = params.get('seed')
const seed = seedParam !== null && seedParam !== '' && Number.isFinite(Number(seedParam)) ? Number(seedParam) : null
const forced = (params.get('rolls') || '').split(',').map(item => Number(item.trim())).filter(n => Number.isInteger(n) && n >= 1 && n <= 20)
const devNote = computed(() => {
  const parts = [] as string[]
  if (forced.length) parts.push(`指定骰点 ${forced.join(', ')}`)
  if (seed !== null) parts.push(`种子 ${seed}`)
  return parts.length ? `开发参数：${parts.join('；')}` : ''
})

const hasExisting = computed(() => (
  characterStore.rootState.角色列表[COMBAT_TRIAL_CHARACTER_ID]?.隔离试玩信息?.kind === QINGYU_OPENING_PLAYTEST_KIND
))

async function startFresh() {
  if (busy.value) return
  busy.value = true
  errorMessage.value = ''
  try {
    const mod = BUILTIN_SCENARIO_MODS.find(item => item.manifest.id === COMBAT_TRIAL_MOD_ID)
    if (!mod) throw new Error(`缺少内置模组 ${COMBAT_TRIAL_MOD_ID}`)
    const newModule = sceneModuleEnabled();
    const save = newModule ? createSceneCombatTrialSave(mod, { mode: mode.value, seed, forced }) : createCombatTrialSave(mod, { mode: mode.value, seed, forced });
    if (newModule) {
      const contract = sceneContractForEvent('lcq.event.s04_02')!;
      const ext = emptyExt();
      ext.active = newActive({ contractId:contract.meta.id, eventId:contract.meta.hook.eventId!, actionId:contract.meta.hook.actionId!, playerLine:contract.objective.text, narrativeIndex:0, state:beginScene(contract,{seed:seed ?? undefined,forced:forced.length ? {action:forced} : undefined}).state });
      ext.active.trial = true;
      writeExt(save,ext);
    }
    await characterStore.installIsolatedPlaytestCharacter({
      characterId: COMBAT_TRIAL_CHARACTER_ID,
      slotName: COMBAT_TRIAL_SLOT,
      markerKind: QINGYU_OPENING_PLAYTEST_KIND,
      markerExtensionKey: QINGYU_OPENING_PLAYTEST_EXTENSION_KEY,
      saveData: save,
    })
    await router.replace('/game')
  } catch (error) {
    errorMessage.value = String((error as Error)?.message || error)
  } finally {
    busy.value = false
  }
}

async function continueTrial() {
  if (busy.value) return
  busy.value = true
  errorMessage.value = ''
  try {
    const loaded = await characterStore.loadGame(COMBAT_TRIAL_CHARACTER_ID, COMBAT_TRIAL_SLOT)
    if (!loaded || !gameStateStore.isGameLoaded) throw new Error('未能读取上次试玩档')
    await router.replace('/game')
  } catch (error) {
    errorMessage.value = String((error as Error)?.message || error)
  } finally {
    busy.value = false
  }
}
</script>

<style scoped>
.trial-start {
  min-height: 100%; width: 100%; box-sizing: border-box; overflow-y: auto;
  display: grid; place-items: start center; padding: 3.5rem 1.25rem;
  color: var(--color-text); background:
    radial-gradient(circle at 20% 10%, color-mix(in srgb, var(--color-primary) 18%, transparent), transparent 34%),
    var(--color-background);
}
.trial-card {
  width: min(760px, 100%); padding: 2.25rem; border: 1px solid var(--color-border); border-radius: 22px;
  background: color-mix(in srgb, var(--color-surface) 94%, transparent);
}
.eyebrow { color: var(--color-primary); letter-spacing: .14em; font-size: .75rem; }
h1 { margin: .45rem 0 .75rem; font-size: clamp(2rem, 6vw, 3.2rem); }
.lead { color: var(--color-text-secondary); line-height: 1.85; }
.modes { display: grid; gap: .75rem; margin: 1.5rem 0; }
.modes label { display: grid; gap: .3rem; padding: .9rem 1rem; border: 1px solid var(--color-border); border-radius: 12px; background: var(--color-background); cursor: pointer; }
.modes label.on { border-color: var(--color-primary); }
.modes input { position: absolute; opacity: 0; pointer-events: none; }
.modes span { color: var(--color-text-secondary); font-size: .85rem; line-height: 1.6; }
.dev-note { color: var(--color-text-secondary); font-size: .85rem; }
.actions { display: flex; gap: .8rem; margin-top: 1.4rem; flex-wrap: wrap; }
.actions button { border-radius: 10px; padding: .8rem 1.15rem; cursor: pointer; font-weight: 650; }
.primary { border: 1px solid var(--color-primary); background: var(--color-primary); color: var(--color-white-soft); }
.secondary { border: 1px solid var(--color-border); background: var(--color-background); color: var(--color-text); }
button:disabled { opacity: .55; cursor: wait; }
.error-message { padding: .8rem; border-radius: 9px; background: color-mix(in srgb, var(--color-danger) 12%, transparent); color: var(--color-danger); }
.foot { margin-top: 1.2rem; color: var(--color-text-secondary); font-size: .8rem; }
</style>
