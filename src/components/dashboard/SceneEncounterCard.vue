<template>
  <section class="scene-encounter" aria-label="场面行动">
    <h3>交锋 · 第 {{ scene.state.beat }} 拍</h3>
    <pre>{{ brief }}</pre>
    <p v-if="scene.notice">{{ scene.notice }}</p>
    <div v-if="scene.pending">
      <p>{{ scene.pending.text }}</p>
      <p>目标：{{ scene.pending.preview.goal.label || '本拍行动' }}</p>
      <p v-for="line in [...new Set(scene.pending.preview.targets.map(target => target.previewText || target.clampText || '').filter(Boolean))]" :key="line">{{ line }}</p>
      <p>难度 {{ scene.pending.preview.difficulty }} · 加值 {{ scene.pending.preview.modifier }}</p>
      <p v-for="(chance, tier) in scene.pending.preview.odds" :key="tier">{{ tierName(String(tier)) }}：{{ Math.round(chance) }}%</p>
      <p v-if="scene.pending.preview.warnText">{{ scene.pending.preview.warnText }}</p>
      <button :disabled="busy" @click="$emit('confirm')">确认并掷骰</button>
      <button :disabled="busy" @click="$emit('edit')">换一种打法</button>
    </div>
    <div v-if="scene.choice">
      <p>{{ scene.choice.confirmText }}</p>
      <button :disabled="busy" @click="$emit('choice')">确认选择</button>
      <button :disabled="busy" @click="$emit('edit')">撤回</button>
    </div>
    <button v-if="scene.state.status === 'decided'" :disabled="busy" @click="$emit('finish')">继续收束（不再掷骰）</button>
    <div v-if="crystal"><button :disabled="busy" @click="$emit('crystal','wound')">碎水晶：下一次外伤降一档</button><button :disabled="busy" @click="$emit('crystal','defense')">碎水晶：下一次防御 +2</button></div>
    <p v-if="!scene.pending && !scene.choice && scene.state.status === 'engaged'">在下方输入本拍目标和打法，预览后再确认。</p>
  </section>
</template>
<script setup lang="ts">
import type { ActiveScene } from '@/modules/sceneModule/host/ext';
defineProps<{scene:ActiveScene;brief:string;busy:boolean;crystal?:boolean}>();
defineEmits(['confirm', 'edit', 'choice', 'finish', 'crystal']);
const tierName = (tier:string) => ({great_success:'大成功',success:'成功',failure:'失败',critical_failure:'大失败'}[tier] || tier);
</script>
<style scoped>
.scene-encounter { margin:12px 0; padding:16px; border:1px solid var(--color-border); border-radius:10px; background:var(--color-background); }
pre { white-space:pre-wrap; font:inherit; line-height:1.6; }
button { padding:8px 12px; margin:6px; border:1px solid var(--color-border); border-radius:6px; }
button:disabled { opacity:.5; }
</style>
