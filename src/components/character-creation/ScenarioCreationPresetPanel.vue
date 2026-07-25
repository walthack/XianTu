<template>
  <section class="scenario-preset">
    <div class="preset-heading">
      <div>
        <div class="preset-source">{{ eyebrow }}</div>
        <h2>{{ title }}</h2>
      </div>
      <LockKeyhole :size="20" aria-hidden="true" />
    </div>
    <p class="preset-description">{{ description }}</p>
    <div v-if="entries.length" class="preset-entries">
      <div v-for="entry in entries" :key="entry.name" class="preset-entry">
        <strong>{{ entry.name }}</strong>
        <span>{{ entry.description }}</span>
      </div>
    </div>
    <div class="preset-status">剧本正典预制</div>
  </section>
</template>

<script setup lang="ts">
import { LockKeyhole } from 'lucide-vue-next'

withDefaults(defineProps<{
  eyebrow: string
  title: string
  description: string
  entries?: Array<{ name: string; description: string }>
}>(), {
  entries: () => [],
})
</script>

<style scoped>
.scenario-preset {
  /* 内容少的锁定步（如仙缘初定）不再被拉满整屏留下大片空白，条目多时仍受限于容器并内部滚动 */
  max-height: 100%;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 2rem;
  color: var(--color-text);
  background: rgba(22, 25, 29, 0.72);
  border: 1px solid rgba(216, 180, 115, 0.28);
  border-radius: 8px;
}

.preset-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  color: #d8b473;
}

.preset-source {
  margin-bottom: 0.5rem;
  color: rgba(255, 255, 255, 0.58);
  font-size: 0.82rem;
}

h2 {
  margin: 0;
  font-size: 1.5rem;
  letter-spacing: 0;
}

.preset-description {
  max-width: 780px;
  margin: 0;
  color: rgba(255, 255, 255, 0.78);
  line-height: 1.8;
}

.preset-entries {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 0.75rem;
  overflow-y: auto;
}

.preset-entry {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  padding: 0.9rem 1rem;
  background: rgba(255, 255, 255, 0.035);
  border-left: 2px solid rgba(216, 180, 115, 0.6);
}

.preset-entry span {
  color: rgba(255, 255, 255, 0.65);
  font-size: 0.9rem;
  line-height: 1.55;
}

.preset-status {
  margin-top: auto;
  color: rgba(216, 180, 115, 0.76);
  font-size: 0.82rem;
}
</style>
