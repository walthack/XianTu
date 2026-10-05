// 门户：把战斗卡片作为第二个 Vue 应用挂进真实游戏界面的 `.input-section` 最前面（与判定卡、分支卡同一位置）。
// 用 MutationObserver 找挂载点，不依赖 MainGamePanel 的组件内部名或实现；
// `.input-section` 被 Vue 重建时重新挂，被移除时卸载。
import { createApp, type App } from 'vue'
import type { Pinia } from 'pinia'
import CombatEncounterCard from './CombatEncounterCard.vue'
import { COMBAT_TRIAL_FIGHTING_CLASS } from './trialState'

const HOST_ATTR = 'data-combat-trial-host'

export function installCombatTrialPortal(pinia: Pinia): () => void {
  let host: HTMLElement | null = null
  let card: App | null = null

  const unmount = () => {
    card?.unmount()
    card = null
    host = null
  }

  const sync = () => {
    const section = document.querySelector<HTMLElement>('.input-section')
    if (host && !host.isConnected) unmount()
    if (!section) return
    if (host && host.parentElement === section) return
    unmount()
    host = document.createElement('div')
    host.setAttribute(HOST_ATTR, '')
    section.insertBefore(host, section.firstChild)
    card = createApp(CombatEncounterCard)
    card.use(pinia)
    card.mount(host)
  }

  const observer = new MutationObserver(sync)
  observer.observe(document.body, { childList: true, subtree: true })
  sync()

  return () => {
    observer.disconnect()
    unmount()
    document.body.classList.remove(COMBAT_TRIAL_FIGHTING_CLASS)
  }
}
