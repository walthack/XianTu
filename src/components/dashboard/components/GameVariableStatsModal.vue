<template>
  <div class="modal-overlay" @click="$emit('close')">
    <div class="modal-content stats-modal" @click.stop>
      <div class="modal-header">
        <h3>数据统计</h3>
        <button @click="$emit('close')" class="close-btn">
          <X :size="16" />
        </button>
      </div>
      <div class="modal-body">
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-icon core">
              <Database :size="24" />
            </div>
            <div class="stat-info">
              <div class="stat-value">{{ Object.keys(coreDataViews).length }}</div>
              <div class="stat-label">核心数据</div>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-icon global">
              <Settings :size="24" />
            </div>
            <div class="stat-info">
              <div class="stat-value">{{ Object.keys(customOptions).length }}</div>
              <div class="stat-label">自定义选项</div>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-icon memory">
              <Brain :size="24" />
            </div>
            <div class="stat-info">
              <div class="stat-value">{{ getMemoryCount() }}</div>
              <div class="stat-label">记忆条目</div>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-icon world">
              <Book :size="24" />
            </div>
            <div class="stat-info">
              <div class="stat-value">{{ getWorldItemCount() }}</div>
              <div class="stat-label">世界元素</div>
            </div>
          </div>
        </div>

        <div class="data-size-info">
          <h4>数据大小统计</h4>
          <div class="size-list">
            <div class="size-item">
              <span>核心数据大小:</span>
              <span>{{ formatBytes(getDataSize(coreDataViews)) }}</span>
            </div>
            <div class="size-item">
              <span>自定义选项大小:</span>
              <span>{{ formatBytes(getDataSize(customOptions)) }}</span>
            </div>
            <div class="size-item">
              <span>总数据大小:</span>
              <span>{{ formatBytes(getDataSize(allGameData)) }}</span>
            </div>
          </div>
        </div>

        <div class="data-size-info" style="margin-top: 1rem;">
          <h4>核心数据详细大小（前10个最大的）</h4>
          <div class="size-list">
            <div v-for="item in getTopLargestVariables()" :key="item.key" class="size-item">
              <span style="font-family: monospace; font-size: 0.8rem;">{{ item.key }}</span>
              <span :style="{ color: item.size > 50000 ? '#c34b3c' : item.size > 10000 ? '#c69431' : 'inherit' }">
                {{ formatBytes(item.size) }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { X, Database, Settings, Brain, Book } from 'lucide-vue-next'

interface Props {
  coreDataViews: Record<string, any>
  customOptions: Record<string, any>
  allGameData: any
  getMemoryCount: () => number
  getWorldItemCount: () => number
}

const props = defineProps<Props>()

defineEmits<{
  close: []
}>()

const getDataSize = (data: any): number => {
  return new Blob([JSON.stringify(data)]).size
}

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

const getTopLargestVariables = () => {
  const variables = Object.entries(props.coreDataViews).map(([key, value]) => ({
    key,
    size: getDataSize(value)
  }))
  return variables.sort((a, b) => b.size - a.size).slice(0, 10)
}
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: var(--color-background);
  border-radius: 12px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
  max-width: 500px;
  width: 90%;
  max-height: 80vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.modal-content.stats-modal {
  max-width: 600px;
}

.modal-header {
  padding: 1.5rem 1.5rem 1rem 1.5rem;
  border-bottom: 1px solid var(--color-border);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.modal-header h3 {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--color-text);
}

.close-btn {
  background: none;
  border: none;
  color: var(--color-text-secondary);
  cursor: pointer;
  padding: 0.5rem;
  border-radius: 6px;
  transition: all 0.2s;
}

.close-btn:hover {
  background: var(--color-hover);
  color: var(--color-text);
}

.modal-body {
  padding: 1.5rem;
  overflow-y: auto;
  flex: 1;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
  margin-bottom: 2rem;
}

.stat-card {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  transition: all 0.2s;
}

.stat-card:hover {
  background: var(--color-hover);
  border-color: var(--color-primary);
}

.stat-icon {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.stat-icon.core {
  background: rgba(76, 135, 173, 0.1);
  color: #4c87ad;
}

.stat-icon.global {
  background: rgba(95, 155, 106, 0.1);
  color: #5f9b6a;
}

.stat-icon.memory {
  background: rgba(150, 104, 176, 0.1);
  color: #9668b0;
}

.stat-icon.world {
  background: rgba(198, 148, 49, 0.1);
  color: #c69431;
}

.stat-info {
  flex: 1;
}

.stat-value {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--color-text);
  margin-bottom: 0.25rem;
}

.stat-label {
  font-size: 0.875rem;
  color: var(--color-text-secondary);
}

.data-size-info {
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 1rem;
}

.data-size-info h4 {
  margin: 0 0 0.75rem 0;
  font-size: 0.95rem;
  color: var(--color-text);
}

.size-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.size-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem 0;
  border-bottom: 1px solid var(--color-border);
}

.size-item:last-child {
  border-bottom: none;
}

.size-item span:first-child {
  color: var(--color-text-secondary);
  font-size: 0.875rem;
}

.size-item span:last-child {
  color: var(--color-text);
  font-weight: 500;
  font-size: 0.875rem;
}
</style>