<template>
  <div class="attribute-allocation-container">
    <ScenarioCreationPresetPanel
      v-if="store.scenarioCreationPreset"
      eyebrow="命格天成 · 剧本预制"
      title="先天六司"
      description="该组数值对应正典人物在本剧本阶段的初始状态。"
      :entries="presetAttributeEntries"
    />
    <template v-else>
    <div class="header">
      <h2>{{ $t('先天六命分配') }}</h2>
      <div class="points-display">
        {{ $t('剩余天道点:') }}
        <span :class="{ negative: store.remainingTalentPoints < 0 }">{{
          store.remainingTalentPoints
        }}</span>
      </div>
    </div>

    <div class="attributes-list">
      <div v-for="(value, key) in store.attributes" :key="key" class="attribute-item">
        <div class="attribute-info">
          <span class="attribute-name">{{ attributeNames[key as AttributeKey] }}</span>
          <p class="attribute-desc">{{ attributeDescriptions[key as AttributeKey] }}</p>
        </div>
        <div class="attribute-controls">
          <button @click="decrement(key as AttributeKey)" :disabled="value <= minValue">-</button>
          <span class="attribute-value">{{ value }}</span>
          <button
            @click="increment(key as AttributeKey)"
            :disabled="store.remainingTalentPoints <= 0 || value >= maxValue"
            :class="{ disabled: store.remainingTalentPoints <= 0 || value >= maxValue }"
          >
            +
          </button>
        </div>
      </div>
    </div>

    <div class="actions">
      <button @click="resetPoints" class="btn btn-secondary">{{ $t('重置') }}</button>
      <button @click="randomizePoints" class="btn btn-warning">{{ $t('🎲 随机') }}</button>
      <button @click="balancePoints" class="btn btn-success">{{ $t('⚖️ 均衡') }}</button>
    </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useCharacterCreationStore } from '../../stores/characterCreationStore'
import ScenarioCreationPresetPanel from './ScenarioCreationPresetPanel.vue'

const store = useCharacterCreationStore()

const minValue = 0 // 属性基础值
const maxValue = 10 // 属性最大值

const attributeNames = {
  root_bone: '根骨',
  spirituality: '灵性',
  comprehension: '悟性',
  fortune: '气运',
  charm: '魅力',
  temperament: '心性',
}

const attributeDescriptions = {
  root_bone: '决定气血上限、恢复速度、寿命上限。影响炼体修行、抗打击能力。',
  spirituality: '决定灵气上限、吸收效率。影响修炼速度、法术威力。',
  comprehension: '决定神识上限、学习效率。影响功法领悟、技能掌握速度。',
  fortune: '决定各种概率、物品掉落品质。影响天材地宝获取、贵人相助。',
  charm: '决定初始好感度、社交加成。影响NPC互动、门派声望获取。',
  temperament: '决定心魔抗性、意志力。影响走火入魔抵抗、关键抉择。',
}

const presetAttributeEntries = computed(() => Object.entries(store.attributes).map(([key, value]) => ({
  name: attributeNames[key as AttributeKey],
  description: String(value),
})))

type AttributeKey = keyof typeof attributeNames

function increment(key: AttributeKey) {
  if (store.remainingTalentPoints > 0 && store.attributes[key] < maxValue) {
    store.setAttribute(key, store.attributes[key] + 1)
  }
}

function decrement(key: AttributeKey) {
  if (store.attributes[key] > minValue) {
    store.setAttribute(key, store.attributes[key] - 1)
  }
}

function resetPoints() {
  // 重置所有属性为最小值 0
  Object.keys(store.attributes).forEach((key) => {
    store.setAttribute(key as AttributeKey, 0)
  })
}

function randomizePoints() {
  // 先重置所有属性为基础值
  resetPoints()

  // 获取可用于分配的点数 (初始天道点)
  let pointsToAllocate = store.remainingTalentPoints
  const attributeKeys = Object.keys(store.attributes) as AttributeKey[]

  // 随机分配点数
  while (pointsToAllocate > 0) {
    const randomKey = attributeKeys[Math.floor(Math.random() * attributeKeys.length)]
    const currentValue = store.attributes[randomKey]
    
    if (currentValue < maxValue) {
      store.setAttribute(randomKey, currentValue + 1)
      pointsToAllocate--
    }

    // 防止死循环：如果所有属性都达到最大值则停止
    const allMaxed = attributeKeys.every((key) => store.attributes[key] >= maxValue)
    if (allMaxed) {
      break
    }
  }
}

function balancePoints() {
  // 先重置所有属性
  resetPoints()

  // 获取可用点数，如果为负数则不分配
  const availablePoints = Math.max(0, store.remainingTalentPoints)
  if (availablePoints <= 0) return

  // 计算每个属性应分配的基础点数
  const attributeCount = Object.keys(store.attributes).length
  const pointsPerAttribute = Math.floor(availablePoints / attributeCount)
  let extraPoints = availablePoints % attributeCount

  // 均衡分配点数
  const attributeKeys = Object.keys(store.attributes) as AttributeKey[]
  attributeKeys.forEach((key) => {
    // 基础分配
    let pointsToAdd = pointsPerAttribute
    // 如果有余数，前面几个属性多分配1点
    if (extraPoints > 0) {
      pointsToAdd++
      extraPoints--
    }
    // 确保不超过最大值
    const finalValue = Math.min(minValue + pointsToAdd, maxValue)
    store.setAttribute(key, finalValue)
  })
}

onMounted(() => {
  // 不再自动重置，保留用户之前的选择
  // 如果用户需要重置，可以手动点击"重置"按钮
})
</script>

<style scoped>
/* ========== 深色玻璃拟态风格 ========== */
.attribute-allocation-container {
  height: 100%;
  display: flex;
  flex-direction: column;
  color: var(--color-text);
  background: rgba(30, 41, 59, 0.5);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 12px;
  padding: 1.5rem;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid rgba(147, 197, 253, 0.2);
}

.points-display .negative {
  color: #f87171 !important;
}

h2 {
  margin: 0;
  color: #93c5fd;
  font-size: 1.5rem;
  text-shadow: 0 0 20px rgba(147, 197, 253, 0.3);
}

.points-display {
  font-size: 1.2rem;
  color: #94a3b8;
}

.points-display span {
  font-weight: 600;
  color: #fbbf24;
  font-size: 1.5rem;
}

.attributes-list {
  overflow-y: auto;
  flex-grow: 1;
  scrollbar-width: thin;
  scrollbar-color: rgba(147, 197, 253, 0.3) transparent;
}

.attributes-list::-webkit-scrollbar { width: 6px; }
.attributes-list::-webkit-scrollbar-track { background: transparent; }
.attributes-list::-webkit-scrollbar-thumb { background: rgba(147, 197, 253, 0.3); border-radius: 3px; }

.attribute-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 0.5rem;
  margin-bottom: 0.5rem;
  border-radius: 8px;
  background: rgba(30, 41, 59, 0.4);
  border: 1px solid transparent;
  transition: all 0.25s ease;
}

.attribute-item:hover {
  background: rgba(51, 65, 85, 0.6);
  border-color: rgba(147, 197, 253, 0.2);
}

.attribute-item:last-child {
  margin-bottom: 0;
}

.attribute-info {
  flex-basis: 70%;
}

.attribute-name {
  font-size: 1.1rem;
  font-weight: 500;
  color: #93c5fd;
}

.attribute-desc {
  font-size: 0.85rem;
  color: #94a3b8;
  margin: 0.3rem 0 0 0;
  line-height: 1.4;
}

.attribute-controls {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.attribute-controls button {
  width: 35px;
  height: 35px;
  border-radius: 50%;
  background: rgba(30, 41, 59, 0.6);
  border: 1px solid rgba(147, 197, 253, 0.3);
  color: #93c5fd;
  font-size: 1.5rem;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  justify-content: center;
  align-items: center;
}

.attribute-controls button:hover:not(:disabled) {
  background: rgba(59, 130, 246, 0.3);
  border-color: #93c5fd;
  color: #bfdbfe;
}

.attribute-controls button:disabled,
.attribute-controls button.disabled {
  opacity: 0.4;
  cursor: not-allowed;
  background: rgba(30, 41, 59, 0.3);
  border-color: rgba(255, 255, 255, 0.06);
  color: #64748b;
}

.attribute-value {
  font-size: 1.4rem;
  font-weight: 600;
  min-width: 30px;
  text-align: center;
  color: #f1f5f9;
}

.actions {
  padding-top: 1rem;
  display: flex;
  justify-content: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.actions button {
  padding: 0.5rem 1.5rem;
  border: 1px solid rgba(147, 197, 253, 0.3);
  background: rgba(30, 41, 59, 0.6);
  color: #f1f5f9;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.25s ease;
}

.actions button:hover {
  background: rgba(51, 65, 85, 0.8);
  border-color: rgba(147, 197, 253, 0.5);
}

.actions .btn-secondary {
  border-color: rgba(148, 163, 184, 0.4);
  color: #94a3b8;
}

.actions .btn-secondary:hover {
  background: rgba(148, 163, 184, 0.2);
  border-color: #94a3b8;
  color: #f1f5f9;
}

.actions .btn-warning {
  border-color: rgba(251, 191, 36, 0.4);
  color: #fbbf24;
}

.actions .btn-warning:hover {
  background: rgba(251, 191, 36, 0.2);
  border-color: #fbbf24;
  color: #fef3c7;
}

.actions .btn-success {
  border-color: rgba(52, 211, 153, 0.4);
  color: #34d399;
}

.actions .btn-success:hover {
  background: rgba(52, 211, 153, 0.2);
  border-color: #34d399;
  color: #a7f3d0;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .attribute-allocation-container {
    padding-bottom: 1rem;
  }

  .header {
    flex-direction: column;
    gap: 0.5rem;
    text-align: center;
    padding-bottom: 0.75rem;
    margin-bottom: 1rem;
  }

  .header h2 {
    font-size: 1.3rem;
  }

  .points-display {
    font-size: 1rem;
  }

  .points-display span {
    font-size: 1.2rem;
  }

  .attributes-list {
    margin-bottom: 0.5rem;
  }

  .attribute-item {
    flex-direction: row;
    gap: 0.75rem;
    padding: 0.75rem 0.5rem;
  }

  .attribute-info {
    flex: 1;
    min-width: 0;
  }

  .attribute-name {
    font-size: 0.95rem;
  }

  .attribute-desc {
    font-size: 0.75rem;
    line-height: 1.3;
  }

  .attribute-controls {
    justify-content: flex-end;
    gap: 0.5rem;
    flex-shrink: 0;
  }

  .attribute-controls button {
    width: 32px;
    height: 32px;
    font-size: 1.4rem;
  }

  .attribute-value {
    font-size: 1.2rem;
    min-width: 28px;
  }

  .actions {
    gap: 0.5rem;
    padding: 0.75rem 0;
  }

  .actions button {
    padding: 0.5rem 1rem;
    font-size: 0.85rem;
    flex: 1;
    min-width: 70px;
  }
}

@media (max-width: 640px) {
  .header {
    gap: 0.5rem;
  }

  .header h2 {
    font-size: 1.2rem;
  }

  .attribute-item {
    flex-direction: column;
    gap: 0.75rem;
    padding: 1rem 0.5rem;
    align-items: center;
  }

  .attribute-info {
    flex-basis: auto;
    text-align: center;
    width: 100%;
  }

  .attribute-name {
    font-size: 1rem;
    display: block;
    margin-bottom: 0.25rem;
  }

  .attribute-controls {
    justify-content: center;
    gap: 1rem;
  }

  .attribute-controls button {
    width: 38px;
    height: 38px;
    font-size: 1.6rem;
  }

  .attribute-value {
    font-size: 1.4rem;
    min-width: 35px;
  }

  .actions {
    gap: 0.5rem;
    padding: 1rem 0 0.5rem;
  }

  .actions button {
    padding: 0.6rem 1.2rem;
    font-size: 0.9rem;
  }
}

@media (max-width: 480px) {
  .header h2 {
    font-size: 1.1rem;
  }

  .points-display {
    font-size: 0.9rem;
  }

  .points-display span {
    font-size: 1.1rem;
  }

  .attribute-name {
    font-size: 0.95rem;
  }

  .attribute-desc {
    font-size: 0.7rem;
  }

  .attribute-controls button {
    width: 36px;
    height: 36px;
    font-size: 1.5rem;
  }

  .attribute-value {
    font-size: 1.3rem;
    min-width: 32px;
  }

  .actions {
    flex-wrap: wrap;
    padding: 0.75rem 0;
  }

  .actions button {
    flex: 1 1 calc(33.333% - 0.5rem);
    min-width: 80px;
    padding: 0.6rem 0.75rem;
    font-size: 0.85rem;
  }
}

/* ========== 亮色主题适配 ========== */
[data-theme="light"] .attribute-allocation-container {
  background: rgba(248, 250, 252, 0.8);
  border-color: rgba(0, 0, 0, 0.08);
}

[data-theme="light"] .header {
  border-bottom-color: rgba(59, 130, 246, 0.2);
}

[data-theme="light"] h2 {
  color: #2563eb;
}

[data-theme="light"] .points-display {
  color: #475569;
}

[data-theme="light"] .points-display span {
  color: #d97706;
}

[data-theme="light"] .attribute-item {
  background: rgba(255, 255, 255, 0.6);
}

[data-theme="light"] .attribute-item:hover {
  background: rgba(241, 245, 249, 0.95);
  border-color: rgba(59, 130, 246, 0.2);
}

[data-theme="light"] .attribute-name {
  color: #2563eb;
}

[data-theme="light"] .attribute-desc {
  color: #475569;
}

[data-theme="light"] .attribute-value {
  color: #1e293b;
}

[data-theme="light"] .attribute-controls button {
  background: rgba(255, 255, 255, 0.8);
  border-color: rgba(59, 130, 246, 0.3);
  color: #2563eb;
}

[data-theme="light"] .attribute-controls button:hover:not(:disabled) {
  background: rgba(59, 130, 246, 0.1);
  border-color: #3b82f6;
}

[data-theme="light"] .actions button {
  background: rgba(255, 255, 255, 0.8);
  border-color: rgba(59, 130, 246, 0.3);
  color: #1e293b;
}

[data-theme="light"] .actions button:hover {
  background: rgba(241, 245, 249, 0.95);
  border-color: rgba(59, 130, 246, 0.5);
}
</style>
