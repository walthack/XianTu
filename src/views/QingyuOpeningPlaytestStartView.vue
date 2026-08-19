<template>
  <main class="playtest-start">
    <section class="playtest-card">
      <button class="back-button" type="button" @click="router.push('/')">← 返回主页</button>
      <div class="eyebrow">可玩纵切 · 正常游戏界面</div>
      <h1>清羽记开局</h1>
      <p class="lead">
        你将以程宗扬身份从现代航班坠入异世界草原，在正常阅读面用自己的话行动。
        这一段是固定顺序：Canon Rail 覆盖全关十八拍，你可以决定怎么做，但不能改下一拍是什么。
        任务栏会给出当前合同，右栏有完成合同按钮。
      </p>

      <div class="facts">
        <article><strong>十八拍</strong><span>穿越到白湖脱身：段强之死、遇月霜、太乙救援、王哲三托付、左武覆灭、五原为奴、商馆赌局</span></article>
        <article><strong>需要叙事 API</strong><span>使用你在“API 管理”中已有的配置</span></article>
        <article><strong>隔离本地档</strong><span>不会覆盖正式角色；可随时回主页继续原存档</span></article>
      </div>

      <ol class="steps">
        <li>自由输入观察、交涉或行动，不必照抄推荐选项；顺序仍按原著拍点推进。</li>
        <li>任务栏显示当前 objective；右栏点「完成合同」才会把这一拍标完成。</li>
        <li>战场上不走，会被王哲九阳自爆的焰浪吞没；在苏妲己面前拒绝三个月期限，会当场受炮烙。两处都直接结束本局。</li>
        <li>玩到白湖脱身（或走进绝路）即本 demo 结束，靠引擎的本局结束界面收场。</li>
      </ol>

      <div v-if="errorMessage" class="error-message">{{ errorMessage }}</div>
      <div class="actions">
        <button v-if="hasExistingPlaytest" class="secondary" type="button" :disabled="busy" @click="continuePlaytest">
          继续上次试玩
        </button>
        <button class="primary" data-testid="start-qingyu-opening-playtest" type="button" :disabled="busy" @click="startFresh">
          {{ busy ? '正在建立隔离存档…' : hasExistingPlaytest ? '重置并重新开始' : '建立试玩角色并开始' }}
        </button>
      </div>
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';

import { useCharacterStore } from '@/stores/characterStore';
import { useGameStateStore } from '@/stores/gameStateStore';
import { BUILTIN_SCENARIO_MODS } from '@/modules/scenarioMods/builtins';
import {
  createQingyuOpeningPlaytestSave,
  QINGYU_OPENING_PLAYTEST_CHARACTER_ID,
  QINGYU_OPENING_PLAYTEST_EXTENSION_KEY,
  QINGYU_OPENING_PLAYTEST_KIND,
  QINGYU_OPENING_PLAYTEST_MOD_ID,
  QINGYU_OPENING_PLAYTEST_SLOT,
} from '@/modules/scenarioMods/qingyuOpeningPlaytest';

const router = useRouter();
const characterStore = useCharacterStore();
const gameStateStore = useGameStateStore();
const busy = ref(false);
const errorMessage = ref('');
const playtestMod = BUILTIN_SCENARIO_MODS.find(mod => mod.manifest.id === QINGYU_OPENING_PLAYTEST_MOD_ID);
const hasExistingPlaytest = computed(() => (
  characterStore.rootState.角色列表[QINGYU_OPENING_PLAYTEST_CHARACTER_ID]?.隔离试玩信息?.kind
    === QINGYU_OPENING_PLAYTEST_KIND
));

async function startFresh() {
  if (busy.value) return;
  busy.value = true;
  errorMessage.value = '';
  try {
    if (!playtestMod) throw new Error('缺少清羽记开局内置模组');
    await characterStore.installIsolatedPlaytestCharacter({
      characterId: QINGYU_OPENING_PLAYTEST_CHARACTER_ID,
      slotName: QINGYU_OPENING_PLAYTEST_SLOT,
      markerKind: QINGYU_OPENING_PLAYTEST_KIND,
      markerExtensionKey: QINGYU_OPENING_PLAYTEST_EXTENSION_KEY,
      saveData: createQingyuOpeningPlaytestSave(playtestMod),
    });
    await router.replace('/game');
  } catch (error) {
    errorMessage.value = String((error as Error)?.message || error);
  } finally {
    busy.value = false;
  }
}

async function continuePlaytest() {
  if (busy.value) return;
  busy.value = true;
  errorMessage.value = '';
  try {
    const loaded = await characterStore.loadGame(
      QINGYU_OPENING_PLAYTEST_CHARACTER_ID,
      QINGYU_OPENING_PLAYTEST_SLOT,
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
.facts span,.steps { color: var(--color-text-secondary); font-size: .85rem; line-height: 1.65; }
.steps { padding-left: 1.3rem; }
.steps li + li { margin-top: .45rem; }
.actions { display: flex; gap: .8rem; margin-top: 1.6rem; flex-wrap: wrap; }
.actions button { border-radius: 10px; padding: .8rem 1.15rem; cursor: pointer; font-weight: 650; }
.primary { border: 1px solid var(--color-primary); background: var(--color-primary); color: var(--color-white-soft); }
.secondary { border: 1px solid var(--color-border); background: var(--color-background); color: var(--color-text); }
button:disabled { opacity: .55; cursor: wait; }
.error-message { padding: .8rem; border-radius: 9px; background: color-mix(in srgb, var(--color-danger) 12%, transparent); color: var(--color-danger); }
@media (max-width: 680px) { .playtest-start { padding: 1rem; } .playtest-card { padding: 1.25rem; } .facts { grid-template-columns: 1fr; } .actions { flex-direction: column; } }
</style>
