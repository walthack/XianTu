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
import { applyTuning } from '@/modules/sceneModule/contracts/registry'
import { installCombatTrialPortal } from './portal'
import * as flow from './flow'
import * as trialState from './trialState'

// ?tuning=1：开打前读 dist/tuning.json 覆盖合同数值、game-numbers 数值和状态数值（白名单＋lint，不过就整份拒绝）；没有这个文件就跳过。
async function loadTuning() {
  if (new URLSearchParams(window.location.search).get('tuning') !== '1') return
  const response = await fetch('./tuning.json', { cache: 'no-store' }).catch(() => null)
  if (!response?.ok) return console.warn('【战斗试玩】?tuning=1 但没有 tuning.json，按原合同数值运行')
  const text = await response.text()
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193) >>> 0
  let parsed: unknown
  try { parsed = JSON.parse(text) } catch (e) { return console.error('【战斗试玩】tuning.json 不是合法 JSON，整份拒绝', e) }
  const result = applyTuning(parsed)
  if (result.ok) console.log(`【战斗试玩】已应用 tuning.json（hash ${hash.toString(16)}）：${result.contracts.join('、')}`)
  else console.error('【战斗试玩】tuning.json 整份拒绝：\n' + result.errors.join('\n'))
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

  // ?debug=1：暴露 router / pinia / flow 给无头浏览器自测（dev/combat-trial/e2e.mjs），并让战斗卡片打关键日志。
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
  console.log('【战斗试玩】已启动')
}

void initializeTrial()
