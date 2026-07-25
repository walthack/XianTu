<template>
  <div>
    <button
      @click="handleStorePreset"
      class="cloud-sync-button"
      :class="{ 'synced': hasStored }"
      :disabled="isStoring || !isEnabled"
      :title="getButtonTooltip()"
    >
      <LoaderCircle v-if="isStoring" class="sync-icon spinning" :size="14" />
      <Check v-else-if="hasStored" class="sync-icon" :size="14" />
      <Save v-else class="sync-icon" :size="14" />
      <span class="sync-text">{{ getButtonText() }}</span>
    </button>

    <!-- 预设保存对话框 -->
    <PresetSaveModal
      :visible="showSaveModal"
      :character-data="props.characterData"
      @close="showSaveModal = false"
      @submit="handleSavePreset"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { Check, LoaderCircle, Save } from 'lucide-vue-next';
import { toast } from '../../utils/toast';
import PresetSaveModal from './PresetSaveModal.vue';
import { useI18n } from '../../i18n';

// Props
const props = defineProps<{
  size?: 'small' | 'medium' | 'large';
  variant?: 'default' | 'compact';
  currentStep?: number; // 当前步骤
  totalSteps?: number; // 总步骤数
  characterData?: any; // 角色创建数据
}>();

// Emits
const emit = defineEmits<{
  storeCompleted: [result: { success: boolean; message: string; presetData?: any }];
  storeStarted: [];
}>();

// State
const isStoring = ref(false);
const hasStored = ref(false);
const showSaveModal = ref(false);
const { t } = useI18n();

// 是否启用按钮（仅在最后一步启用）
const isEnabled = computed(() => {
  if (props.currentStep === undefined || props.totalSteps === undefined) {
    return true; // 如果没有传入步骤信息，默认启用
  }
  return props.currentStep === props.totalSteps;
});

// 获取按钮文本
function getButtonText() {
  if (isStoring.value) return t('存储中');
  if (hasStored.value) return t('已存储');
  return t('存储预设');
}

// 获取按钮提示文本
function getButtonTooltip() {
  if (!isEnabled.value) {
    return t('请完成所有步骤后再保存预设');
  }
  if (isStoring.value) return t('正在存储预设...');
  if (hasStored.value) return t('预设已存储');
  return t('保存当前选择为预设');
}

// 处理点击存储预设按钮
function handleStorePreset() {
  if (isStoring.value || hasStored.value || !isEnabled.value) {
    if (hasStored.value) {
      toast.info(t('预设已存储，无需重复操作'));
    } else if (!isEnabled.value) {
      toast.warning(t('请完成所有步骤后再保存预设'));
    }
    return;
  }

  // 显示保存对话框
  showSaveModal.value = true;
  emit('storeStarted');
}

// 处理保存预设
async function handleSavePreset(data: { presetName: string; presetDescription: string; characterData?: any }) {
  isStoring.value = true;
  showSaveModal.value = false;

  const presetData = {
    name: data.presetName,
    description: data.presetDescription,
    savedAt: new Date().toISOString()
  };

  hasStored.value = true;

  emit('storeCompleted', {
    success: true,
    message: t('预设保存成功'),
    presetData
  });

  isStoring.value = false;
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