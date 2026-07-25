<template>
  <div>
    <button
      @click="handleLoadPreset"
      class="cloud-sync-button"
      :class="{ 'synced': hasLoaded }"
      :disabled="isLoading"
      :title="getButtonTooltip()"
    >
      <LoaderCircle v-if="isLoading" class="sync-icon spinning" :size="14" />
      <Check v-else-if="hasLoaded" class="sync-icon" :size="14" />
      <FolderOpen v-else class="sync-icon" :size="14" />
      <span class="sync-text">{{ getButtonText() }}</span>
    </button>

    <!-- 预设加载对话框 -->
    <PresetLoadModal
      :visible="showLoadModal"
      @close="showLoadModal = false"
      @select="handlePresetSelect"
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { Check, FolderOpen, LoaderCircle } from 'lucide-vue-next';
import { toast } from '../../utils/toast';
import PresetLoadModal from './PresetLoadModal.vue';

// Props
defineProps<{
  size?: 'small' | 'medium' | 'large';
  variant?: 'default' | 'compact';
}>();

// Emits
const emit = defineEmits<{
  loadCompleted: [result: { success: boolean; message: string; presetData?: any }];
  loadStarted: [];
}>();

// State
const isLoading = ref(false);
const hasLoaded = ref(false);
const showLoadModal = ref(false);

// 获取按钮文本
function getButtonText() {
  if (isLoading.value) return '加载中';
  if (hasLoaded.value) return '已加载';
  return '加载预设';
}

// 获取按钮提示文本
function getButtonTooltip() {
  if (isLoading.value) return '正在加载预设...';
  if (hasLoaded.value) return '预设已加载';
  return '加载预设';
}

// 处理点击加载预设按钮
function handleLoadPreset() {
  if (isLoading.value || hasLoaded.value) {
    if (hasLoaded.value) {
      toast.info('预设已加载，无需重复操作');
    }
    return;
  }

  // 显示预设选择对话框
  showLoadModal.value = true;
  emit('loadStarted');
}

// 处理预设选择
async function handlePresetSelect(preset: any) {
  isLoading.value = true;
  showLoadModal.value = false;
  const toastId = 'load-preset-toast';
  toast.loading('正在加载预设...', { id: toastId });
  
  try {
    console.log('[加载预设组件] 选中的预设:', preset);
    
    // TODO: 实现预设加载逻辑
    await new Promise(resolve => setTimeout(resolve, 800));
    
    toast.success(`预设「${preset.name}」加载成功！`, { id: toastId });
    hasLoaded.value = true;

    emit('loadCompleted', {
      success: true,
      message: '加载成功',
      presetData: preset
    });

  } catch (error) {
    console.error('[加载预设组件] 加载失败:', error);
    const message = error instanceof Error ? error.message : '加载失败';
    toast.error(`加载失败: ${message}`, { id: toastId });
    emit('loadCompleted', {
      success: false,
      message: message
    });
  } finally {
    isLoading.value = false;
  }
}
</script>

<style scoped>
.cloud-sync-button {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 0.3rem;
  padding: 0.5rem 0.8rem;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease-in-out;
  border: 1px solid var(--color-border);
  background: var(--color-surface-light);
  color: var(--color-text);
  font-size: 0.85rem;
  min-width: 80px;
  white-space: nowrap;
}

.cloud-sync-button:hover {
  background: var(--color-surface-lighter);
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.sync-text {
  font-weight: 500;
}

.sync-icon {
  font-size: 1em;
  flex-shrink: 0;
}

.sync-icon.spinning {
  animation: spin-left 1s linear infinite;
}

/* 已同步状态样式 */
.cloud-sync-button.synced {
  background: linear-gradient(135deg, rgba(var(--color-primary-rgb), 0.1), rgba(var(--color-success-rgb), 0.1));
  border-color: var(--color-success);
  color: var(--color-success);
}

.cloud-sync-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.cloud-sync-button.synced:hover {
  background: linear-gradient(135deg, rgba(var(--color-primary-rgb), 0.2), rgba(var(--color-success-rgb), 0.2));
}

/* Size variants */
.cloud-sync-button.small {
  padding: 0.5rem 0.75rem;
  font-size: 0.9rem;
  min-width: 100px;
}

.cloud-sync-button.large {
  padding: 1rem 1.5rem;
  font-size: 1.1rem;
  min-width: 180px;
}

/* Compact variant */
.cloud-sync-button.compact {
  min-width: auto;
  padding: 0.5rem;
}

.cloud-sync-button.compact .sync-text {
  display: none;
}
</style>