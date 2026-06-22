<template>
  <div class="talent-tier-selection">
    <ScenarioCreationPresetPanel
      v-if="store.scenarioCreationPreset"
      eyebrow="仙缘初定 · 剧本预制"
      :title="store.scenarioCreationPreset.talentTier.name"
      :description="store.scenarioCreationPreset.talentTier.description"
    />
    <template v-else>
    <div v-if="store.isLoading" class="loading-state">{{ $t('感应天道，测算天资...') }}</div>
    <div v-else-if="store.error" class="error-state">{{ $t('天机混沌') }}：{{ store.error }}</div>

    <div v-else class="tier-layout">
      <!-- 左侧面板：列表和操作按钮 -->
      <div class="tier-left-panel">
        <!-- 顶部功能按钮 -->
        <div class="top-actions-container">
          <button
            v-if="store.isLocalCreation"
            @click="isCustomModalVisible = true"
            class="action-item shimmer-on-hover"
          >
            <span class="action-name">{{ $t('自定义天资') }}</span>
          </button>
          <button @click="handleAIGenerate" class="action-item shimmer-on-hover">
            <span class="action-name">{{ $t('AI推演') }}</span>
          </button>
        </div>

        <div class="tiers-list-container">
          <div
            v-for="tier in filteredTalentTiers"
            :key="tier.id"
            class="tier-item"
            :class="{ selected: store.characterPayload.talent_tier_id === tier.id }"
            :style="{ '--tier-glow-color': tier.color, '--tier-glow-color-rgb': hexToRgb(tier.color) }"
            @click="handleSelectTalentTier(tier)"
            @mouseover="activeTier = tier"
          >
            <div class="item-content">
              <span class="tier-name">{{ tier.name }}</span>
              <span class="tier-points">{{ tier.total_points }} {{ $t('点') }}</span>
            </div>
            <div v-if="tier.source === 'cloud' && store.isLocalCreation" class="action-buttons">
              <button @click.stop="openEditModal(tier)" class="edit-btn" :title="$t('编辑此项')">
                <Edit :size="14" />
              </button>
              <button @click.stop="handleDeleteTalentTier(tier.id)" class="delete-btn" :title="$t('删除此项')">
                <Trash2 :size="14" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- 右侧详情 -->
      <div class="tier-details-container">
        <div v-if="activeTier" class="tier-details">
          <h2 :style="{ color: activeTier.color }">
            {{ activeTier.name }}
          </h2>
          <div class="description-scroll">
            <p>{{ activeTier.description }}</p>
          </div>
          <div class="points-display">{{ $t('天道点') }}: {{ activeTier.total_points }}</div>
        </div>
        <div v-else class="placeholder">{{ $t('请选择你的天资等级，这将决定你的起点。') }}</div>
      </div>
    </div>

    <CustomCreationModal
      :visible="isCustomModalVisible"
      :title="$t('自定义天资')"
      :fields="customTierFields"
      :validationFn="validateCustomTier"
      @close="isCustomModalVisible = false"
      @submit="handleCustomSubmit"
    />

    <!-- 编辑模态框 -->
    <CustomCreationModal
      :visible="isEditModalVisible"
      :title="$t('编辑天资')"
      :fields="customTierFields"
      :validationFn="validateCustomTier"
      :initialData="editInitialData"
      @close="isEditModalVisible = false; editingTier = null"
      @submit="handleEditSubmit"
    />

    <!-- AI推演输入弹窗 -->
    <AIPromptModal
      :visible="isAIPromptModalVisible"
      @close="isAIPromptModalVisible = false"
      @submit="handleAIPromptSubmit"
    />
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { Trash2, Edit } from 'lucide-vue-next'
import { useCharacterCreationStore } from '../../stores/characterCreationStore'
import type { TalentTier } from '../../types'
import CustomCreationModal from './CustomCreationModal.vue'
import AIPromptModal from './AIPromptModal.vue'
import { toast } from '../../utils/toast'
import { generateWithRawPrompt } from '../../utils/tavernCore'
import { TALENT_TIER_ITEM_GENERATION_PROMPT } from '../../utils/prompts/tasks/gameElementPrompts'
import { parseJsonFromText } from '@/utils/jsonExtract'
import ScenarioCreationPresetPanel from './ScenarioCreationPresetPanel.vue'

interface CustomTierData {
  name: string
  description: string
  total_points: string
  rarity: string
  color: string
}

const emit = defineEmits(['ai-generate'])
const store = useCharacterCreationStore()
const activeTier = ref<TalentTier | null>(null) // For hover details view - 仿照天赋选择
const isCustomModalVisible = ref(false)
const isEditModalVisible = ref(false)
const isAIPromptModalVisible = ref(false)
const editingTier = ref<TalentTier | null>(null)

const filteredTalentTiers = computed(() => {
  const allTiers = store.creationData.talentTiers;
  console.log("【天资选择】所有天资数据:", allTiers);
  console.log("【天资选择】当前模式:", store.isLocalCreation ? '本地' : '联机');
  console.log("【天资选择】数据明细:", allTiers.map(t => ({ name: t.name, source: t.source, id: t.id })));
  
  if (store.isLocalCreation) {
    // 单机模式显示本地数据和云端同步的数据
    const availableTiers = allTiers.filter(tier =>
      tier.source === 'local' || tier.source === 'cloud'
    );
    console.log("【天资选择】单机模式可用天资列表:", availableTiers);
    return availableTiers.sort((a, b) => a.total_points - b.total_points);
  } else {
    // 联机模式显示所有数据，包括本地数据作为后备
    const availableTiers = allTiers.length > 0 ? allTiers : [];
    console.log("【天资选择】联机模式天资列表:", availableTiers);
    console.log("【天资选择】联机模式天资数量:", availableTiers.length);
    
    if (availableTiers.length === 0) {
      console.warn("【天资选择】警告：联机模式下没有找到任何天资数据！");
    }
    
    return availableTiers.sort((a, b) => a.total_points - b.total_points);
  }
});

// 根据 types/index.ts 中的 TalentTier 接口定义字段
const customTierFields = [
  { key: 'name', label: '天资名称', type: 'text', placeholder: '例如：凡人' },
  { key: 'description', label: '天资描述', type: 'textarea', placeholder: '描述此天资的特点...' },
  { key: 'total_points', label: '天道点', type: 'number', placeholder: '例如：20' },
  { key: 'rarity', label: '稀有度', type: 'number', placeholder: '1-10，数值越高越稀有' },
  { key: 'color', label: '辉光颜色', type: 'color', placeholder: '例如：#808080' },
] as const

function validateCustomTier(data: Partial<CustomTierData>) {
    const errors: Record<string, string> = {};
    if (!data.name?.trim()) errors.name = '天资名称不可为空';
    const points = Number(data.total_points);
    if (isNaN(points) || points < 0) errors.total_points = '天道点必须是非负数';
    const rarity = Number(data.rarity);
    if (isNaN(rarity) || rarity < 1 || rarity > 10) errors.rarity = '稀有度必须在1-10之间';
    return {
        valid: Object.keys(errors).length === 0,
        errors: Object.values(errors),
    };
}

async function handleCustomSubmit(data: CustomTierData) {
  const newTier: TalentTier = {
    id: Date.now(),
    name: data.name,
    description: data.description,
    total_points: parseInt(data.total_points, 10) || 10,
    rarity: parseInt(data.rarity, 10) || 1,
    color: data.color || '#808080',
  }
  
  try {
    store.addTalentTier(newTier);
    // await saveGameData(store.creationData); // NOTE: 持久化由Pinia插件自动处理
    handleSelectTalentTier(newTier);
    isCustomModalVisible.value = false;
    toast.success(`自定义天资 "${newTier.name}" 已保存！`);
  } catch (e) {
    console.error('保存自定义天资失败:', e);
    toast.error('保存自定义天资失败！');
  }
}

function handleAIGenerate() {
  if (store.isLocalCreation) {
    isAIPromptModalVisible.value = true;
  } else {
    emit('ai-generate')
  }
}

async function handleAIPromptSubmit(userPrompt: string) {
  const toastId = 'ai-generate-talent-tier';
  toast.loading('天机推演中，请稍候...', { id: toastId });

  try {
    const aiResponse = await generateWithRawPrompt(userPrompt, TALENT_TIER_ITEM_GENERATION_PROMPT, false);

    if (!aiResponse) {
      toast.error('AI推演失败', { id: toastId });
      return;
    }

    console.log('【AI推演-天资】完整响应:', aiResponse);

    // 解析AI返回的JSON
    let parsedTier: any;
    try {
      parsedTier = parseJsonFromText(aiResponse);
    } catch (parseError) {
      console.error('【AI推演-天资】JSON解析失败:', parseError);
      toast.error('AI推演结果格式错误，无法解析', { id: toastId });
      return;
    }

    // 验证必需字段
    if (!parsedTier.name && !parsedTier.名称) {
      toast.error('AI推演结果缺少天资名称', { id: toastId });
      return;
    }

    // 创建天资对象
    const newTier: TalentTier = {
      id: Date.now(),
      name: parsedTier.name || parsedTier.名称 || '未命名天资',
      description: parsedTier.description || parsedTier.描述 || parsedTier.说明 || '',
      total_points: parsedTier.total_points || parsedTier.总点数 || parsedTier.点数 || 10,
      color: parsedTier.color || parsedTier.颜色 || '#808080',
      rarity: parsedTier.rarity || parsedTier.稀有度 || 1,
      source: 'local'
    };

    // 保存并选择天资
    store.addTalentTier(newTier);
    handleSelectTalentTier(newTier);
    isAIPromptModalVisible.value = false;

    toast.success(`AI推演完成！天资 "${newTier.name}" 已生成`, { id: toastId });

  } catch (e: any) {
    console.error('【AI推演-天资】失败:', e);
    toast.error(`AI推演失败: ${e.message}`, { id: toastId });
  }
}

function handleSelectTalentTier(tier: TalentTier) {
  store.selectTalentTier(tier.id)
}

function hexToRgb(hex: string): string {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` : '229, 192, 123';
}

// 编辑功能
function openEditModal(tier: TalentTier) {
  editingTier.value = tier;
  isEditModalVisible.value = true;
}

// 删除功能
async function handleDeleteTalentTier(id: number) {
  console.log(`🔥 点击删除按钮，准备删除天资 ID: ${id}`);
  try {
    await store.removeTalentTier(id);
    console.log(`【天资选择】成功删除天资 ID: ${id}`);
  } catch (error) {
    console.error(`【天资选择】删除天资失败 ID: ${id}`, error);
  }
}

async function handleEditSubmit(data: CustomTierData) {
  if (!editingTier.value) return;
  
  // 创建更新数据对象
  const updateData: Partial<TalentTier> = {
    name: data.name,
    description: data.description,
    total_points: parseInt(data.total_points, 10) || 10,
    rarity: parseInt(data.rarity, 10) || 1,
    color: data.color || '#808080'
  };

  try {
    const success = store.updateTalentTier(editingTier.value.id, updateData);
    if (success) {
      isEditModalVisible.value = false;
      editingTier.value = null;
      toast.success(`天资 "${updateData.name}" 已更新！`);
    } else {
      toast.error('更新天资失败！');
    }
  } catch (e) {
    console.error('更新天资失败:', e);
    toast.error('更新天资失败！');
  }
}

// 编辑模态框的初始数据
const editInitialData = computed(() => {
  if (!editingTier.value) return {};

  return {
    name: editingTier.value.name,
    description: editingTier.value.description,
    total_points: editingTier.value.total_points.toString(),
    rarity: editingTier.value.rarity?.toString() || '1',
    color: editingTier.value.color
  };
});

// fetchData 和 defineExpose 不再需要，因为父组件会处理初始化
</script>

<style scoped>
/* ========== 深色玻璃拟态风格 ========== */
.talent-tier-selection {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.loading-state, .error-state, .placeholder {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100%;
  font-size: 1.1rem;
  color: #94a3b8;
  font-style: italic;
}

.tier-layout {
  display: grid;
  grid-template-columns: 1fr 2fr;
  gap: 1.5rem;
  height: 100%;
  overflow: hidden;
}

/* ========== 左侧面板 ========== */
.tier-left-panel {
  display: flex;
  flex-direction: column;
  background: rgba(30, 41, 59, 0.5);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 12px;
  overflow: hidden;
}

/* 顶部功能按钮 */
.top-actions-container {
  display: flex;
  gap: 0.5rem;
  padding: 0.75rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(30, 41, 59, 0.3);
  justify-content: center;
}

.top-actions-container .action-item {
  padding: 0.5rem 1rem;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  background: rgba(30, 41, 59, 0.6);
  color: #cbd5e1;
  cursor: pointer;
  transition: all 0.25s ease;
  font-size: 0.85rem;
  font-weight: 500;
  white-space: nowrap;
  letter-spacing: 0.05em;
}

.top-actions-container .action-item:hover {
  background: rgba(51, 65, 85, 0.8);
  border-color: rgba(147, 197, 253, 0.3);
  color: #f1f5f9;
}

.tiers-list-container {
  flex: 1;
  overflow-y: auto;
  padding: 0.5rem;
  scrollbar-width: thin;
  scrollbar-color: rgba(147, 197, 253, 0.3) transparent;
}

.tiers-list-container::-webkit-scrollbar { width: 6px; }
.tiers-list-container::-webkit-scrollbar-track { background: transparent; }
.tiers-list-container::-webkit-scrollbar-thumb { background: rgba(147, 197, 253, 0.3); border-radius: 3px; }
.tiers-list-container::-webkit-scrollbar-thumb:hover { background: rgba(147, 197, 253, 0.5); }

/* ========== 选项卡样式（带天资辉光） ========== */
.tier-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.1rem 1.2rem;
  margin-bottom: 0.6rem;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.25s ease;
  border: 1px solid transparent;
  background: rgba(30, 41, 59, 0.4);
}

.tier-item:hover {
  background: rgba(var(--tier-glow-color-rgb, 147, 197, 253), 0.15);
  border-color: rgba(var(--tier-glow-color-rgb, 147, 197, 253), 0.25);
}

.tier-item.selected {
  background: rgba(var(--tier-glow-color-rgb, 147, 197, 253), 0.2);
  border-color: rgba(var(--tier-glow-color-rgb, 147, 197, 253), 0.4);
  box-shadow: 0 2px 8px rgba(var(--tier-glow-color-rgb, 147, 197, 253), 0.2);
}

.item-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-grow: 1;
}

.tier-name {
  font-weight: 600;
  color: var(--tier-glow-color, #f1f5f9);
  text-shadow: 0 0 10px rgba(var(--tier-glow-color-rgb, 147, 197, 253), 0.3);
}

.tier-points {
  color: #fbbf24;
  font-weight: 500;
  font-size: 0.9rem;
}

/* 按钮组容器 */
.action-buttons {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  opacity: 0;
  transition: opacity 0.2s;
  margin-left: 0.5rem;
}

.tier-item:hover .action-buttons {
  opacity: 1;
}

.edit-btn, .delete-btn {
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: #94a3b8;
  cursor: pointer;
  padding: 0.35rem;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.edit-btn:hover {
  color: #93c5fd;
  background: rgba(147, 197, 253, 0.15);
  border-color: rgba(147, 197, 253, 0.3);
}

.delete-btn:hover {
  color: #f87171;
  background: rgba(248, 113, 113, 0.15);
  border-color: rgba(248, 113, 113, 0.3);
}

.action-name {
  font-weight: 500;
}

/* ========== 右侧详情面板 ========== */
.tier-details-container {
  background: rgba(30, 41, 59, 0.5);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 12px;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.tier-details {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.tier-details h2 {
  margin: 0 0 1rem 0;
  font-size: 1.8rem;
  text-align: center;
  flex-shrink: 0;
  text-shadow: 0 0 30px currentColor;
}

.description-scroll {
  flex: 1;
  overflow-y: auto;
  line-height: 1.7;
  padding-right: 0.5rem;
  min-height: 0;
  scrollbar-width: thin;
  scrollbar-color: rgba(147, 197, 253, 0.3) transparent;
}

.description-scroll::-webkit-scrollbar { width: 6px; }
.description-scroll::-webkit-scrollbar-track { background: transparent; }
.description-scroll::-webkit-scrollbar-thumb { background: rgba(147, 197, 253, 0.3); border-radius: 3px; }

.description-scroll p {
  margin: 0;
  white-space: pre-wrap;
  color: #94a3b8;
}

.points-display {
  text-align: center;
  font-weight: 600;
  color: #fbbf24;
  font-size: 1.2rem;
  padding-top: 1rem;
  margin-top: 1rem;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  flex-shrink: 0;
}

/* ========== 亮色主题适配 ========== */
[data-theme="light"] .tier-left-panel,
[data-theme="light"] .tier-details-container {
  background: rgba(248, 250, 252, 0.8);
  border-color: rgba(0, 0, 0, 0.08);
}

[data-theme="light"] .top-actions-container {
  background: rgba(241, 245, 249, 0.8);
  border-color: rgba(0, 0, 0, 0.06);
}

[data-theme="light"] .top-actions-container .action-item {
  background: rgba(255, 255, 255, 0.8);
  border-color: rgba(59, 130, 246, 0.3);
  color: #2563eb;
}

[data-theme="light"] .top-actions-container .action-item:hover {
  background: rgba(59, 130, 246, 0.1);
  border-color: #3b82f6;
  color: #1e40af;
}

[data-theme="light"] .tier-item {
  background: rgba(255, 255, 255, 0.6);
}

[data-theme="light"] .description-scroll p {
  color: #475569;
}

[data-theme="light"] .points-display {
  border-color: rgba(0, 0, 0, 0.06);
}

/* 亮色主题下的编辑/删除按钮 */
[data-theme="light"] .edit-btn,
[data-theme="light"] .delete-btn {
  background: rgba(241, 245, 249, 0.8);
  border: 1px solid rgba(59, 130, 246, 0.15);
  color: #475569;
}

[data-theme="light"] .edit-btn:hover {
  color: #2563eb;
  background: rgba(59, 130, 246, 0.1);
  border-color: rgba(59, 130, 246, 0.3);
}

[data-theme="light"] .delete-btn:hover {
  color: #dc2626;
  background: rgba(239, 68, 68, 0.1);
  border-color: rgba(239, 68, 68, 0.3);
}

/* 响应式适配 - 手机端优化 */
@media (max-width: 1200px) {
  .tier-layout {
    grid-template-columns: 1fr 1.8fr;
    gap: 1.5rem;
  }
}

@media (max-width: 1024px) {
  .tier-layout {
    grid-template-columns: 1fr 1.5fr;
    gap: 1.2rem;
  }
  
  .tier-details h2 {
    font-size: 1.8rem;
  }
}

@media (max-width: 640px) {
  .top-actions-container {
    flex-wrap: wrap;
    justify-content: stretch;
  }
  .top-actions-container .action-item {
    flex-grow: 1;
    text-align: center;
  }
  .tier-layout {
    /* 改为垂直堆叠布局 */
    grid-template-columns: 1fr;
    grid-template-rows: auto 1fr;
    gap: 1rem;
    height: auto;
    overflow: visible;
    padding: 0.8rem;
  }
  
  .tier-left-panel {
    order: 1;
    max-height: 40vh;
  }
  
  .tier-details-container {
    order: 2;
    min-height: 300px;
  }
  
  .tiers-list-container {
    max-height: 35vh;
    /* 添加触摸滚动优化 */
    -webkit-overflow-scrolling: touch;
    scrollbar-width: thin;
  }
  
  /* 优化触摸体验 */
  .tier-item,
  .action-item {
    -webkit-tap-highlight-color: transparent;
    touch-action: manipulation;
  }
}

@media (max-width: 640px) {
  .tier-layout {
    gap: 0.8rem;
    padding: 0.6rem;
  }
  
  .tier-left-panel {
    max-height: 35vh;
  }
  
  .tiers-list-container {
    max-height: 30vh;
    padding: 0.5rem;
  }
  
  .tier-item {
    padding: 0.7rem;
    font-size: 0.95rem;
    margin-bottom: 0.4rem;
  }
  
  .single-actions-container {
    padding: 0.5rem;
    gap: 0.4rem;
  }
  
  .action-item {
    padding: 0.7rem 1rem;
    font-size: 0.9rem;
  }
  
  .tier-details-container {
    padding: 1.2rem;
    min-height: 250px;
  }
  
  .tier-details h2 {
    font-size: 1.6rem;
    margin-bottom: 0.8rem;
  }
  
  .points-display {
    font-size: 1.1rem;
  }
}

@media (max-width: 480px) {
  .top-actions-container {
    flex-direction: column;
    align-items: stretch;
  }
  .talent-tier-selection {
    padding: 0.4rem;
    height: auto;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }

  .tier-layout {
    gap: 0.6rem;
    padding: 0;
    height: auto;
    min-height: 0;
  }

  .tier-left-panel {
    max-height: none;
    border-radius: 6px;
  }
  
  .tiers-list-container {
    max-height: 26vh;
    padding: 0.4rem;
  }
  
  .tier-item {
    padding: 0.6rem 0.8rem;
    font-size: 0.9rem;
    margin-bottom: 0.3rem;
    border-radius: 4px;
  }
  
  .tier-name {
    font-size: 0.9rem;
  }
  
  .tier-points {
    font-size: 0.8rem;
  }
  
  .single-actions-container {
    flex-direction: column;
    gap: 0.4rem;
    padding: 0.4rem;
  }
  
  .action-item {
    padding: 0.6rem;
    font-size: 0.85rem;
    border-radius: 4px;
  }
  
  .tier-details-container {
    padding: 1rem;
    min-height: 200px;
    border-radius: 6px;
  }
  
  .tier-details h2 {
    font-size: 1.4rem;
    margin-bottom: 0.6rem;
    text-align: center;
  }
  
  .description-scroll {
    font-size: 0.9rem;
    line-height: 1.5;
    padding-right: 0.3rem;
  }
  
  .points-display {
    font-size: 1rem;
    text-align: center;
    padding-top: 0.8rem;
    margin-top: 0.8rem;
  }
  
  .placeholder {
    font-size: 1rem;
    padding: 1rem;
    text-align: center;
    min-height: 150px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .top-actions-container {
    flex-direction: column;
    align-items: stretch;
    padding: 0.5rem;
  }
  .top-actions-container .action-item {
    text-align: center;
  }
}

@media (max-width: 360px) {
  .talent-tier-selection {
    padding: 0.3rem;
  }
  
  .tier-layout {
    gap: 0.4rem;
  }
  
  .tier-left-panel {
    max-height: 28vh;
  }
  
  .tiers-list-container {
    max-height: 24vh;
    padding: 0.3rem;
  }
  
  .tier-item {
    padding: 0.5rem 0.6rem;
    font-size: 0.85rem;
    margin-bottom: 0.2rem;
  }
  
  .tier-name {
    font-size: 0.8rem;
  }
  
  .tier-points {
    font-size: 0.75rem;
  }
  
  .tier-details-container {
    padding: 0.8rem;
    min-height: 180px;
  }
  
  .tier-details h2 {
    font-size: 1.2rem;
    margin-bottom: 0.5rem;
  }
  
  .description-scroll {
    font-size: 0.85rem;
    line-height: 1.4;
  }
  
  .points-display {
    font-size: 0.9rem;
    padding-top: 0.6rem;
    margin-top: 0.6rem;
  }
  
  .action-item {
    padding: 0.5rem;
    font-size: 0.8rem;
  }
  
  .placeholder {
    font-size: 0.9rem;
    padding: 0.8rem;
    min-height: 120px;
  }
}
</style>
