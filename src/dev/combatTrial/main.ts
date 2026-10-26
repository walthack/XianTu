/**
 * 战斗试玩入口（内部）。启动流程与 src/main.ts 一致，另外：
 *  - 追加一条 /combat-trial 路由（入口页），启动后直接跳过去；
 *  - 安装战斗卡片门户（portal.ts），把战斗卡片挂进真实游戏界面的输入区。
 * 只被 webpack.combat-trial.config.js 引用；主应用的打包不会带上本目录。
 */
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from '@/App.vue'
import router from '@/router'
import '@/style.css'
import '@/styles/panel-theme.css'
import '@/styles/theme-overrides.css'
import '@/styles/design-system.css'
import '@/utils/consolePatch'
import '@/modules/scenarioMods/builtins/register'
import { migrateData } from '@/utils/indexedDBManager'
import { useI18n } from '@/i18n'
import { useAPIManagementStore } from '@/stores/apiManagementStore'
import CombatTrialStartView from './CombatTrialStartView.vue'
import { sceneModuleEnabled } from '@/modules/sceneModule/host/ext'
import { GAME_NUMBERS } from '@/modules/sceneModule/numbers'
import { diagnosticsConfig } from '@/modules/diagnostics/config'
import { logError, logEvent } from '@/modules/diagnostics/log'
import { debugLog } from '@/modules/diagnostics/debugLog'
import { SCENE_CONTRACTS } from '@/modules/sceneModule/contracts/registry'
import { applyTuning } from '@/modules/sceneModule/contracts/registry'
import { installCombatTrialPortal } from './portal'
import * as flow from './flow'
import * as trialState from './trialState'

// ?tuning=1：开打前读 dist/tuning.json 覆盖合同数值、game-numbers 数值和状态数值（白名单＋lint，不过就整份拒绝）；没有这个文件就跳过。
async function loadTuning() {
  const builtin=JSON.stringify({numbers:GAME_NUMBERS,contracts:SCENE_CONTRACTS});
  let builtinHash=0x811c9dc5;for(let i=0;i<builtin.length;i++)builtinHash=Math.imul(builtinHash^builtin.charCodeAt(i),0x01000193)>>>0;
  const noTuning=()=>debugLog('combat', `【战斗试玩】未加载 tuning，使用内置数值（hash ${builtinHash.toString(16)}）`);
  if (new URLSearchParams(window.location.search).get('tuning') !== '1') return noTuning()
  let fetchError: unknown
  const response = await fetch('./tuning.json', { cache: 'no-store' }).catch(error => { fetchError = error; return null })
  if (!response?.ok) {
    // 与主入口 runtimeTuning 同码：404 info（常态），网络错 / 超时 warn，其它 HTTP 状态 warn。
    if (!response) logError((fetchError as { name?: string } | null)?.name === 'TimeoutError' ? 'LCQ-CFG-003' : 'LCQ-CFG-002', fetchError)
    else if (response.status === 404) logEvent({ code: 'LCQ-CFG-001', level: diagnosticsConfig().tuning404Level, detail: { status: response.status } })
    else logEvent({ code: 'LCQ-CFG-006', detail: { status: response.status } })
    return noTuning()
  }
  const text = await response.text()
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193) >>> 0
  let parsed: unknown
  try { parsed = JSON.parse(text) } catch (e) { logError('LCQ-CFG-004', e); return }
  const result = applyTuning(parsed)
  if (result.ok) debugLog('combat', `【战斗试玩】已应用 tuning.json（hash ${hash.toString(16)}）：${result.contracts.join('、')}`)
  else logEvent({ code: 'LCQ-CFG-005', detail: { errors: result.errors } })
}

async function initializeTrial() {
  await migrateData()
  await loadTuning()

  const app = createApp(App)
  const pinia = createPinia()
  const { t } = useI18n()
  app.config.globalProperties.$t = t
  app.mixin({
    methods: {
      t(key: string): string {
        return t(key)
      },
    },
  })

  // ?debug=1：暴露 router / pinia / flow 给无头浏览器自测（dev/combat-trial/e2e.mjs）；只是测试钩子，不是日志开关（卡片日志走 combat 调试大类）。
  if (new URLSearchParams(window.location.search).has('debug')) {
    (window as any).__combatTrial = { router, pinia, flow, trialState }
  }

  router.addRoute({ path: '/combat-trial', name: 'CombatTrialStart', component: CombatTrialStartView })
  app.use(pinia)
  app.use(router)
  await router.replace('/combat-trial')
  app.mount('#app')

  void useAPIManagementStore().loadFromStorage()
  // ?noportal=1：不挂战斗卡片，用来区分「卡片」与「游戏界面本身」的问题。
  if (!sceneModuleEnabled() && !new URLSearchParams(window.location.search).has('noportal')) installCombatTrialPortal(pinia)
  debugLog('combat', '【战斗试玩】已启动')
}

void initializeTrial()
