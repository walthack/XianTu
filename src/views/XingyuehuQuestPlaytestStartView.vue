<template>
  <main class="playtest-start">
    <section class="playtest-card">
      <button class="back-button" type="button" @click="router.push('/')">← 返回主页</button>
      <div class="eyebrow">可玩任务链 · 正常游戏界面</div>
      <h1>星月湖任务线试玩</h1>
      <p class="lead">
        默认从飞机落地开始，按原游戏连续主路往前走，接到星月湖组织支持这一段为止。
        你仍扮演程宗扬。先弄清自己摔在了哪里，再决定下一步。全程使用现有游戏界面、任务栏、自由输入、建议动作、判定、五原地图、背包关系和存读档。
      </p>

      <label class="test-notes" style="display:block">
        <input v-model="modularEnabled" type="checkbox" data-testid="modular-turn-switch" @change="setModularEnabled" />
        模块拆分试玩（已编写合同的动作使用精简演出，后台处理记忆）
      </label>
      <div class="facts">
        <article><strong>眼前困境</strong><span>机舱没了。你趴在湿草里，段强还在几步外，远处有人在喊。</span></article>
        <article><strong>近期目标</strong><span>稳住自己，确认段强还在，弄清这片草原是哪里。</span></article>
        <article><strong>怎么玩</strong><span>像正常游戏一样输入行动；下方建议可直接采用。隔离本地档，不覆盖正式角色或旧三幕短版。</span></article>
      </div>

      <ol class="steps">
        <li>用自己的话行动；建议动作只是当前可直接采用的说法，不是遥控器。</li>
        <li>若出现正式判定，先确认再结算。未确认前不要把成败当成已经发生。</li>
        <li>一段说完后，用游戏里的「继续旅程」前往下一处。启程前下一处尚未抵达。</li>
        <li>可随时存读档。本入口只动「从落地开始」的隔离档，正式角色和旧三幕短版不会被改动。</li>
      </ol>

      <details class="test-notes">
        <summary>测试说明（默认收起）</summary>
        <p>以下仅供校准测试对照，默认不展示，避免把后续结果提前说破。</p>
        <ul>
          <li>主路：stage_01 → 02 → 03b → 04 → 04b → 05b → 07，止于星月湖组织支持这一拍。</li>
          <li>03 / 05 / 06 仍按既有隔离策略跳过，不恢复重复旧关。</li>
          <li>这是阶段结局，不是整个星月湖故事完结；不把后续宫变写成已经完成。</li>
        </ul>
      </details>

      <div v-if="errorMessage" class="error-message">{{ errorMessage }}</div>
      <div v-if="landingResetGuard" class="confirm" data-testid="confirm-reset-xingyuehu-landing-playtest">
        <p>将重置「从落地开始」连续进度；已有手动存档会保留，可从存档面板读取。正式角色与旧三幕短版不会被改动。</p>
        <div class="actions">
          <button class="secondary" type="button" :disabled="busy" @click="landingResetGuard = false">取消</button>
          <button class="primary" type="button" :disabled="busy" @click="startLandingFresh">
            {{ busy ? '正在建立隔离存档…' : '确认重置落地连续档' }}
          </button>
        </div>
      </div>
      <div v-else class="actions">
        <button v-if="hasExistingLanding" class="secondary" type="button" :disabled="busy" @click="continueLanding">
          继续落地连续档
        </button>
        <button class="primary" data-testid="start-xingyuehu-landing-playtest" type="button" :disabled="busy" @click="requestLandingStart">
          {{ busy ? '正在建立隔离存档…' : hasExistingLanding ? '重置落地连续档' : '从飞机落地开始' }}
        </button>
      </div>

      <details class="short-playtest">
        <summary>旧三幕短版（海神殿开始，可续玩旧档）</summary>
        <p>
          谢艺在海神殿把你叫到近前。这一版只保留三幕承重拍，使用另一份隔离档，不会覆盖上面的落地连续档。
        </p>
        <div v-if="shortResetGuard" class="confirm" data-testid="confirm-reset-xingyuehu-playtest">
          <p>将重置星月湖试玩进度；已有手动存档会保留，可从存档面板读取。正式角色存档不会被改动。</p>
          <div class="actions">
            <button class="secondary" type="button" :disabled="busy" @click="shortResetGuard = false">取消</button>
            <button class="primary" type="button" :disabled="busy" @click="startShortFresh">
              {{ busy ? '正在建立隔离存档…' : '确认重置试玩档' }}
            </button>
          </div>
        </div>
        <div v-else class="actions">
          <button v-if="hasExistingShort" class="secondary" type="button" :disabled="busy" @click="continueShort">
            继续上次试玩
          </button>
          <button class="primary" data-testid="start-xingyuehu-quest-playtest" type="button" :disabled="busy" @click="requestShortStart">
            {{ busy ? '正在建立隔离存档…' : hasExistingShort ? '重置并重新开始' : '建立试玩角色并开始' }}
          </button>
        </div>
      </details>
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';

import { BUILTIN_SCENARIO_MODS } from '@/modules/scenarioMods/builtins';
import {
  createXingyuehuLandingPlaytestSave,
  XINGYUEHU_LANDING_PLAYTEST_CHARACTER_ID,
  XINGYUEHU_LANDING_PLAYTEST_EXTENSION_KEY,
  XINGYUEHU_LANDING_PLAYTEST_KIND,
  XINGYUEHU_LANDING_PLAYTEST_SLOT,
} from '@/modules/scenarioMods/xingyuehuLandingPlaytest';
import {
  createXingyuehuQuestPlaytestSave,
  XINGYUEHU_QUEST_PLAYTEST_CHARACTER_ID,
  XINGYUEHU_QUEST_PLAYTEST_EXTENSION_KEY,
  XINGYUEHU_QUEST_PLAYTEST_KIND,
  XINGYUEHU_QUEST_PLAYTEST_SLOT,
} from '@/modules/scenarioMods/xingyuehuQuestPlaytest';
import { useCharacterStore } from '@/stores/characterStore';
import { useGameStateStore } from '@/stores/gameStateStore';

import { MODULE_TURN_SWITCH } from '@/modules/scenarioMods/modularTurn';
const modularEnabled = ref(localStorage.getItem(MODULE_TURN_SWITCH) === 'true');
function setModularEnabled() { localStorage.setItem(MODULE_TURN_SWITCH, String(modularEnabled.value)); }

const router = useRouter();
const characterStore = useCharacterStore();
const gameStateStore = useGameStateStore();
const busy = ref(false);
const errorMessage = ref('');
const landingResetGuard = ref(false);
const shortResetGuard = ref(false);
const hasExistingLanding = computed(() => (
  characterStore.rootState.角色列表[XINGYUEHU_LANDING_PLAYTEST_CHARACTER_ID]?.隔离试玩信息?.kind
    === XINGYUEHU_LANDING_PLAYTEST_KIND
));
const hasExistingShort = computed(() => (
  characterStore.rootState.角色列表[XINGYUEHU_QUEST_PLAYTEST_CHARACTER_ID]?.隔离试玩信息?.kind
    === XINGYUEHU_QUEST_PLAYTEST_KIND
));

function requestLandingStart() {
  if (busy.value) return;
  if (hasExistingLanding.value) {
    landingResetGuard.value = true;
    shortResetGuard.value = false;
    return;
  }
  void startLandingFresh();
}

function requestShortStart() {
  if (busy.value) return;
  if (hasExistingShort.value) {
    shortResetGuard.value = true;
    landingResetGuard.value = false;
    return;
  }
  void startShortFresh();
}

async function startLandingFresh() {
  if (busy.value) return;
  busy.value = true;
  errorMessage.value = '';
  try {
    await characterStore.installIsolatedPlaytestCharacter({
      characterId: XINGYUEHU_LANDING_PLAYTEST_CHARACTER_ID,
      slotName: XINGYUEHU_LANDING_PLAYTEST_SLOT,
      markerKind: XINGYUEHU_LANDING_PLAYTEST_KIND,
      markerExtensionKey: XINGYUEHU_LANDING_PLAYTEST_EXTENSION_KEY,
      saveData: createXingyuehuLandingPlaytestSave(BUILTIN_SCENARIO_MODS),
    });
    await router.replace('/game');
  } catch (error) {
    errorMessage.value = String((error as Error)?.message || error);
  } finally {
    busy.value = false;
  }
}

async function startShortFresh() {
  if (busy.value) return;
  busy.value = true;
  errorMessage.value = '';
  try {
    await characterStore.installIsolatedPlaytestCharacter({
      characterId: XINGYUEHU_QUEST_PLAYTEST_CHARACTER_ID,
      slotName: XINGYUEHU_QUEST_PLAYTEST_SLOT,
      markerKind: XINGYUEHU_QUEST_PLAYTEST_KIND,
      markerExtensionKey: XINGYUEHU_QUEST_PLAYTEST_EXTENSION_KEY,
      saveData: createXingyuehuQuestPlaytestSave(BUILTIN_SCENARIO_MODS),
    });
    await router.replace('/game');
  } catch (error) {
    errorMessage.value = String((error as Error)?.message || error);
  } finally {
    busy.value = false;
  }
}

async function continueLanding() {
  if (busy.value) return;
  busy.value = true;
  errorMessage.value = '';
  try {
    const loaded = await characterStore.loadGame(
      XINGYUEHU_LANDING_PLAYTEST_CHARACTER_ID,
      XINGYUEHU_LANDING_PLAYTEST_SLOT,
    );
    if (!loaded || !gameStateStore.isGameLoaded) throw new Error('未能读取落地连续档');
    await router.replace('/game');
  } catch (error) {
    errorMessage.value = String((error as Error)?.message || error);
  } finally {
    busy.value = false;
  }
}

async function continueShort() {
  if (busy.value) return;
  busy.value = true;
  errorMessage.value = '';
  try {
    const loaded = await characterStore.loadGame(
      XINGYUEHU_QUEST_PLAYTEST_CHARACTER_ID,
      XINGYUEHU_QUEST_PLAYTEST_SLOT,
    );
    if (!loaded || !gameStateStore.isGameLoaded) throw new Error('未能读取上次试玩档');
    await router.replace('/game');
  } catch (error) {
    errorMessage.value = String((error as Error)?.message || error);
  } finally {
    busy.value = false;
  }
}
</script>

<style scoped>
.playtest-start {
  min-height: 100%; width: 100%; box-sizing: border-box; overflow-y: auto;
  display: grid; place-items: start center; padding: 3.5rem 1.25rem;
  color: var(--color-text); background:
    radial-gradient(circle at 20% 10%, color-mix(in srgb, var(--color-primary) 18%, transparent), transparent 34%),
    radial-gradient(circle at 80% 80%, color-mix(in srgb, var(--color-accent) 16%, transparent), transparent 36%),
    var(--color-background);
}
.playtest-card {
  width: min(780px, 100%); padding: 2.25rem; border: 1px solid var(--color-border); border-radius: 22px;
  background: color-mix(in srgb, var(--color-surface) 94%, transparent);
  box-shadow: 0 24px 70px color-mix(in srgb, var(--color-background) 40%, transparent);
}
.back-button { border: 0; background: none; color: var(--color-text-secondary); cursor: pointer; padding: .3rem 0; }
.eyebrow { margin-top: 1.8rem; color: var(--color-primary); letter-spacing: .14em; font-size: .75rem; text-transform: uppercase; }
h1 { margin: .45rem 0 .75rem; font-size: clamp(2rem, 6vw, 3.5rem); }
.lead { color: var(--color-text-secondary); line-height: 1.85; font-size: 1rem; }
.facts { display: grid; grid-template-columns: repeat(3,1fr); gap: .75rem; margin: 1.5rem 0; }
.facts article { padding: 1rem; border: 1px solid var(--color-border); border-radius: 12px; background: var(--color-background); display: grid; gap: .45rem; }
.facts strong { color: var(--color-primary); }
.facts span,.steps,.test-notes { color: var(--color-text-secondary); font-size: .85rem; line-height: 1.65; }
.steps { padding-left: 1.3rem; }
.steps li + li { margin-top: .45rem; }
.test-notes,.short-playtest { margin-top: 1.2rem; padding: .85rem 1rem; border: 1px dashed var(--color-border); border-radius: 12px; }
.test-notes summary,.short-playtest summary { cursor: pointer; color: var(--color-text); font-weight: 650; }
.test-notes p,.test-notes ul,.short-playtest p { margin: .6rem 0 0; }
.confirm { margin-top: 1.2rem; padding: 1rem; border: 1px solid var(--color-border); border-radius: 12px; background: var(--color-background); }
.confirm p { margin: 0; color: var(--color-text); line-height: 1.7; }
.actions { display: flex; gap: .8rem; margin-top: 1.6rem; flex-wrap: wrap; }
.actions button { border-radius: 10px; padding: .8rem 1.15rem; cursor: pointer; font-weight: 650; }
.primary { border: 1px solid var(--color-primary); background: var(--color-primary); color: var(--color-white-soft); }
.secondary { border: 1px solid var(--color-border); background: var(--color-background); color: var(--color-text); }
button:disabled { opacity: .55; cursor: wait; }
.error-message { padding: .8rem; border-radius: 9px; background: color-mix(in srgb, var(--color-danger) 12%, transparent); color: var(--color-danger); }
@media (max-width: 680px) { .playtest-start { padding: 1rem; } .playtest-card { padding: 1.25rem; } .facts { grid-template-columns: 1fr; } .actions { flex-direction: column; } }
</style>
