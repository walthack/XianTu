<template>
  <main class="playtest-start">
    <section class="playtest-card">
      <button class="back-button" type="button" @click="router.push('/')">← 返回主页</button>
      <div class="eyebrow">可玩纵切 · 正常游戏界面</div>
      <h1>六朝世界试玩</h1>
      <p class="lead">
        你将以程宗扬身份进入洛都，在正常阅读面用自己的话行动。世界与 NPC 会继续运转，
        原著只保留承重因果；郭解、董卓的命运可以被改变，但必须赶上窗口并通过真实本地判定。
      </p>

      <div class="facts">
        <article><strong>约 15–25 分钟</strong><span>覆盖定陶王继统至凉州权力交接</span></article>
        <article><strong>需要叙事 API</strong><span>使用你在“API 管理”中已有的配置</span></article>
        <article><strong>隔离本地档</strong><span>不会覆盖正式角色；可随时回主页继续原存档</span></article>
      </div>

      <ol class="steps">
        <li>自由输入观察、交涉、赶路或介入，不必照抄推荐选项。</li>
        <li>高风险行动会先显示本地判定；掷骰后才把结果交给叙事。</li>
        <li>成功触及人物命运时，右栏仍需由你确认是否进入正式 IF。</li>
        <li>三项局势结束后，填写三项评分并复制反馈摘要。</li>
      </ol>

      <div v-if="errorMessage" class="error-message">{{ errorMessage }}</div>
      <div class="actions">
        <button v-if="hasExistingPlaytest" class="secondary" type="button" :disabled="busy" @click="continuePlaytest">
          继续上次试玩
        </button>
        <button class="primary" data-testid="start-world-sim-playtest" type="button" :disabled="busy" @click="startFresh">
          {{ busy ? '正在建立隔离世界…' : hasExistingPlaytest ? '重置并重新开始' : '建立试玩角色并开始' }}
        </button>
      </div>
      <button class="technical-link" type="button" @click="router.push('/world-sim-demo')">
        查看零 LLM 引擎验收页
      </button>
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
  createWorldSimulationPlaytestSave,
  WORLD_SIMULATION_PLAYTEST_CHARACTER_ID,
  WORLD_SIMULATION_PLAYTEST_KIND,
  WORLD_SIMULATION_PLAYTEST_SLOT,
} from '@/modules/scenarioMods/worldSimulationPlaytest';
import { WORLD_SIMULATION_DEMO_MOD_ID } from '@/modules/scenarioMods/worldSimulationDemo';

const router = useRouter();
const characterStore = useCharacterStore();
const gameStateStore = useGameStateStore();
const busy = ref(false);
const errorMessage = ref('');
const playtestMod = BUILTIN_SCENARIO_MODS.find(mod => mod.manifest.id === WORLD_SIMULATION_DEMO_MOD_ID);
const hasExistingPlaytest = computed(() => (
  characterStore.rootState.角色列表[WORLD_SIMULATION_PLAYTEST_CHARACTER_ID]?.隔离试玩信息?.kind
    === WORLD_SIMULATION_PLAYTEST_KIND
));

async function startFresh() {
  if (busy.value) return;
  busy.value = true;
  errorMessage.value = '';
  try {
    if (!playtestMod) throw new Error('缺少六朝世界试玩内置模组');
    await characterStore.installIsolatedPlaytestCharacter({
      characterId: WORLD_SIMULATION_PLAYTEST_CHARACTER_ID,
      slotName: WORLD_SIMULATION_PLAYTEST_SLOT,
      markerKind: WORLD_SIMULATION_PLAYTEST_KIND,
      saveData: createWorldSimulationPlaytestSave(playtestMod),
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
      WORLD_SIMULATION_PLAYTEST_CHARACTER_ID,
      WORLD_SIMULATION_PLAYTEST_SLOT,
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
    radial-gradient(circle at 20% 10%, rgba(76, 135, 173, 0.18), transparent 34%),
    radial-gradient(circle at 80% 80%, rgba(124, 82, 150, 0.16), transparent 36%),
    var(--color-background);
}
.playtest-card { width: min(780px, 100%); padding: 2.25rem; border: 1px solid var(--color-border); border-radius: 22px; background: color-mix(in srgb, var(--color-surface) 94%, transparent); box-shadow: 0 24px 70px rgba(0,0,0,.22); }
.back-button,.technical-link { border: 0; background: none; color: var(--color-text-secondary); cursor: pointer; padding: .3rem 0; }
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
.primary { border: 1px solid var(--color-primary); background: var(--color-primary); color: white; }
.secondary { border: 1px solid var(--color-border); background: var(--color-background); color: var(--color-text); }
button:disabled { opacity: .55; cursor: wait; }
.technical-link { margin-top: 1rem; font-size: .78rem; text-decoration: underline; text-underline-offset: 3px; }
.error-message { padding: .8rem; border-radius: 9px; background: rgba(195,75,60,.12); color: var(--color-danger); }
@media (max-width: 680px) { .playtest-start { padding: 1rem; } .playtest-card { padding: 1.25rem; } .facts { grid-template-columns: 1fr; } .actions { flex-direction: column; } }
</style>
