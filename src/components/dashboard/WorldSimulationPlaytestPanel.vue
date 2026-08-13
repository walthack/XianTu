<template>
  <section v-if="marker" class="playtest-panel" :class="{ finished }" data-testid="world-sim-playtest-panel">
    <div class="status-line">
      <span class="badge">六朝世界试玩</span>
      <strong>{{ finished ? '纵切已结束' : situation?.title || '世界正在结算' }}</strong>
      <span>世界回合 {{ worldTurn }}</span>
      <span>{{ settledCount }}/3 项局势已结算</span>
    </div>
    <p v-if="!finished" class="hint">
      用自己的话行动；世界不会等你接任务。改写人物命运需要具体介入、本地判定成功，并在右栏确认正式 IF。
    </p>

    <div v-else class="ending" data-testid="world-sim-playtest-ending">
      <h2>这段世界线已经落定</h2>
      <div class="outcomes">
        <span>定陶王：政治继统成立</span>
        <span>郭解：{{ guoOutcome }}</span>
        <span>董卓：{{ dongOutcome }}</span>
      </div>
      <p>后续关卡尚未完成世界合同，本次试玩到这里结束。请评价“自由”有没有变成“乱跑”。</p>

      <div class="ratings">
        <label v-for="field in ratingFields" :key="field.key">
          <span>{{ field.label }}</span>
          <select v-model.number="feedback[field.key]">
            <option :value="0">请选择</option>
            <option v-for="score in 5" :key="score" :value="score">{{ score }}</option>
          </select>
        </label>
      </div>
      <textarea v-model="feedback.notes" rows="3" placeholder="哪一刻太死板、太放飞，或最像一个活着的六朝世界？"></textarea>
      <div class="ending-actions">
        <button type="button" @click="saveFeedback">保存到试玩档</button>
        <button type="button" @click="copyFeedback">复制反馈摘要</button>
        <button type="button" @click="router.push('/')">返回主页</button>
      </div>
      <small v-if="statusMessage">{{ statusMessage }}</small>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';

import { useCharacterStore } from '@/stores/characterStore';
import { useGameStateStore } from '@/stores/gameStateStore';
import { getCurrentWorldSituation } from '@/modules/scenarioMods/worldSimulation';
import {
  formatWorldSimulationPlaytestFeedback,
  WORLD_SIMULATION_PLAYTEST_KIND,
  type WorldSimulationPlaytestFeedback,
  type WorldSimulationPlaytestMarker,
} from '@/modules/scenarioMods/worldSimulationPlaytest';

const router = useRouter();
const gameStateStore = useGameStateStore();
const characterStore = useCharacterStore();
const statusMessage = ref('');
const feedback = reactive<Required<Pick<WorldSimulationPlaytestFeedback, 'freedom' | 'canonFeel' | 'coherence' | 'notes'>>>({
  freedom: 0,
  canonFeel: 0,
  coherence: 0,
  notes: '',
});
const ratingFields = [
  { key: 'freedom' as const, label: '行动自由感' },
  { key: 'canonFeel' as const, label: '六朝／原著感' },
  { key: 'coherence' as const, label: '因果连贯度' },
];
const runtime = computed<any>(() => (gameStateStore.worldState as any)?.剧本模组 || null);
const marker = computed<WorldSimulationPlaytestMarker | null>(() => {
  const candidate = (gameStateStore.systemExtensions as any)?.六朝世界试玩;
  return candidate?.kind === WORLD_SIMULATION_PLAYTEST_KIND ? candidate : null;
});
const situation = computed(() => runtime.value ? getCurrentWorldSituation(runtime.value) : undefined);
const finished = computed(() => Boolean(marker.value && runtime.value && !situation.value));
const worldTurn = computed(() => Number(runtime.value?.worldTurn) || 0);
const settledCount = computed(() => marker.value?.situationIds.filter(id => {
  const contract = runtime.value?.worldSimulation?.situations?.find((item: any) => item.id === id);
  return contract?.settledWhenAny?.some((group: any[]) => group.every(condition => {
    const path = String(condition.path || '').replace(/^flags\./, '');
    return runtime.value?.flags?.[path] === condition.value;
  }));
}).length || 0);
const guoOutcome = computed(() => runtime.value?.flags?.['branch.lyg.if_guojie_longrest.active'] === true ? '生还，转入长期休养 IF' : '沿默认未来退场');
const dongOutcome = computed(() => runtime.value?.flags?.['branch.lyg.if_dongzhuo_longrest.active'] === true ? '生还，转入长期休养 IF' : '沿默认未来退场');

watch(marker, value => {
  const saved = value?.feedback;
  if (!saved) return;
  feedback.freedom = Number(saved.freedom) || 0;
  feedback.canonFeel = Number(saved.canonFeel) || 0;
  feedback.coherence = Number(saved.coherence) || 0;
  feedback.notes = String(saved.notes || '');
}, { immediate: true });

async function persistFeedback() {
  const save = gameStateStore.toSaveData();
  if (!save?.系统?.扩展?.六朝世界试玩) throw new Error('当前不是隔离试玩档');
  save.系统.扩展.六朝世界试玩.feedback = {
    ...feedback,
    savedAt: new Date().toISOString(),
  };
  gameStateStore.loadFromSaveData(save);
  await characterStore.saveCurrentGame();
  return save;
}

async function saveFeedback() {
  try {
    await persistFeedback();
    statusMessage.value = '反馈已保存在隔离试玩档。';
  } catch (error) {
    statusMessage.value = String((error as Error)?.message || error);
  }
}

async function copyFeedback() {
  try {
    const save = await persistFeedback();
    await navigator.clipboard.writeText(formatWorldSimulationPlaytestFeedback(save));
    statusMessage.value = '反馈摘要已复制，可以直接发给开发者。';
  } catch (error) {
    statusMessage.value = `复制失败：${String((error as Error)?.message || error)}`;
  }
}
</script>

<style scoped>
.playtest-panel { flex: 0 0 auto; padding: .65rem .9rem; border-bottom: 1px solid rgba(76,135,173,.28); background: linear-gradient(90deg,rgba(76,135,173,.12),rgba(124,82,150,.08)); color: var(--color-text); }
.status-line { display: flex; align-items: center; flex-wrap: wrap; gap: .55rem 1rem; font-size: .78rem; }
.status-line .badge { padding: .2rem .45rem; border: 1px solid rgba(76,135,173,.42); border-radius: 999px; color: var(--color-primary); }
.status-line span:not(.badge),.hint,.ending p,.ending small { color: var(--color-text-secondary); }
.hint { margin: .35rem 0 0; font-size: .75rem; }
.finished { padding: 1rem; border-bottom-color: rgba(198,148,49,.35); }
.ending { display: grid; gap: .75rem; }
.ending h2,.ending p { margin: 0; }
.ending h2 { font-size: 1.1rem; }
.outcomes { display: flex; gap: .5rem; flex-wrap: wrap; }
.outcomes span { border: 1px solid var(--color-border); background: var(--color-background); border-radius: 8px; padding: .4rem .55rem; font-size: .78rem; }
.ratings { display: flex; gap: .75rem; flex-wrap: wrap; }
.ratings label { display: flex; align-items: center; gap: .35rem; font-size: .78rem; }
select,textarea { border: 1px solid var(--color-border); border-radius: 7px; background: var(--color-background); color: var(--color-text); padding: .45rem; }
textarea { width: 100%; box-sizing: border-box; resize: vertical; }
.ending-actions { display: flex; flex-wrap: wrap; gap: .5rem; }
.ending-actions button { border: 1px solid var(--color-border); border-radius: 7px; background: var(--color-background); color: var(--color-text); padding: .45rem .7rem; cursor: pointer; }
</style>
