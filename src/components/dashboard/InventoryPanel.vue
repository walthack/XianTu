<template>
  <!-- 移除容器，让内容直接填充GameView提供的panel-content区域 -->
  <div class="inventory-content">
    <!-- 标签页导航 -->
    <div class="tabs-header">
      <div class="tabs-nav">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          class="tab-btn"
          :class="{ active: activeTab === tab.id }"
          @click="activeTab = tab.id"
        >
          <component :is="tab.icon" :size="16" />
          <span>{{ t(tab.label) }}</span>
        </button>
      </div>

      <!-- 搜索和筛选区域 -->
      <div class="tools-section" v-if="activeTab === 'items'">
        <div class="search-box">
          <Search :size="16" class="search-icon" />
          <input
            type="text"
            v-model="searchQuery"
            :placeholder="isMobile ? t('搜索...') : t('搜索物品...')"
          />
        </div>
        <div class="filter-buttons">
          <select v-model="selectedCategory" class="filter-select">
            <option value="all">{{ t('全部物品') }}</option>
            <option v-for="cat in itemCategories" :key="cat" :value="cat">
              {{ t(cat) }}
            </option>
          </select>
          <select v-model="sortBy" class="filter-select">
            <option value="default">{{ t('默认排序') }}</option>
            <option value="quality">{{ t('品质排序') }}</option>
            <option value="name">{{ t('名称排序') }}</option>
          </select>
          <button
            v-if="isTavernEnvFlag"
            class="refresh-btn"
            @click="refreshFromTavern"
            :disabled="refreshing"
            :title="t('从酒馆同步最新数据')"
          >
            <RotateCcw :size="16" :class="{ spinning: refreshing }" />
          </button>
        </div>
      </div>
    </div>

    <!-- 标签内容 -->
    <div class="tab-content">
      <!-- 物品标签 -->
      <div v-if="activeTab === 'items'" class="items-tab">
        <!-- 自定义确认弹窗 -->
        <div
          v-if="showCustomConfirm"
          class="custom-confirm-overlay"
          @click="showCustomConfirm = false"
        >
          <div class="custom-confirm-modal" @click.stop>
            <div class="confirm-header">
              <h3>{{ confirmTitle }}</h3>
              <button class="confirm-close-btn" @click="showCustomConfirm = false">
                <X :size="20" />
              </button>
            </div>
            <div class="confirm-content">
              <p>{{ confirmMessage }}</p>
            </div>
            <div class="confirm-actions">
              <button class="confirm-btn cancel-btn" @click="showCustomConfirm = false">
                {{ t('取消') }}
              </button>
              <button class="confirm-btn confirm-btn" @click="handleConfirm">{{ t('确定') }}</button>
            </div>
          </div>
        </div>

        <!-- 移动端：模态框详情 -->
        <div v-if="showItemModal && isMobile" class="item-modal-overlay" @click="closeModal">
          <div class="item-modal" @click.stop>
            <div class="modal-header">
              <h3 :class="getItemQualityClass(selectedItem, 'text')">{{ selectedItem?.名称 }}</h3>
              <button class="modal-close-btn" @click="closeModal">
                <X :size="20" />
              </button>
            </div>
            <div class="modal-content">
              <div class="modal-icon-simple" :class="getItemQualityClass(selectedItem)">
                <div class="item-type-text">{{ selectedItem?.类型 }}</div>
              </div>
              <div class="modal-info">
                <div class="modal-meta">
                  {{ t(selectedItem?.类型 ?? '未知') }} / {{ selectedItem?.品质?.quality ? t(selectedItem.品质.quality) : t('未知') }}
                  <span
                    v-if="selectedItem?.品质?.grade !== undefined"
                    class="grade-display"
                    :class="getItemGradeClass(selectedItem)"
                  >
                    {{ t(getItemGradeText(selectedItem)) }}({{ selectedItem.品质.grade }})
                  </span>
                </div>
                <p class="modal-description">{{ selectedItem?.描述 }}</p>
                <div
                  v-if="selectedItem?.类型 === '装备' && selectedItem?.装备增幅"
                  class="modal-attributes"
                >
                  <h4>{{ t('装备增幅:') }}</h4>
                  <div class="attribute-text">
                    {{ typeof selectedItem.装备增幅 === 'string' ? selectedItem.装备增幅 : formatItemAttributes(selectedItem.装备增幅) }}
                  </div>
                </div>
                <div
                  v-if="selectedItem?.类型 === '装备' && selectedItem?.特殊效果"
                  class="modal-attributes"
                >
                  <h4>{{ t('特殊效果:') }}</h4>
                  <div class="attribute-text">
                    {{ typeof selectedItem.特殊效果 === 'string' ? selectedItem.特殊效果 : formatItemAttributes(selectedItem.特殊效果) }}
                  </div>
                </div>
              </div>
            </div>
            <div class="modal-actions">
              <!-- 装备：装备和丢弃 -->
              <template v-if="selectedItem?.类型 === '装备'">
                <button
                  class="action-btn"
                  :class="isEquipped(selectedItem) ? 'unequip-btn' : 'equip-btn'"
                  :disabled="equipBusy"
                  @click="toggleEquip(selectedItem)"
                >
                  {{ isEquipped(selectedItem) ? t('卸下') : t('装备') }}
                </button>
                <button class="action-btn discard-btn" @click="discardItem(selectedItem)">
                  {{ t('丢弃') }}
                </button>
              </template>
              <!-- 功法：修炼和丢弃 -->
              <template v-else-if="selectedItem?.类型 === '功法'">
                <button
                  class="action-btn"
                  :class="isCultivating(selectedItem) ? 'stop-cultivate-btn' : 'cultivate-btn'"
                  :disabled="cultivateBusy"
                  @click="toggleCultivate(selectedItem)"
                >
                  {{ isCultivating(selectedItem) ? t('停止修炼') : t('修炼') }}
                </button>
                <button class="action-btn discard-btn" @click="discardItem(selectedItem)">
                  {{ t('丢弃') }}
                </button>
              </template>
              <!-- 其他物品：使用和丢弃 -->
              <template v-else-if="selectedItem">
                <button class="action-btn use-btn" @click="useItem(selectedItem)">{{ t('使用') }}</button>
                <button class="action-btn discard-btn" @click="discardItem(selectedItem)">
                  {{ t('丢弃') }}
                </button>
              </template>
            </div>
          </div>
        </div>

        <div class="items-grid">
          <div v-if="loading" class="grid-placeholder">
            <div class="loading-spinner"></div>
            <p>{{ t('加载中...') }}</p>
          </div>
          <div v-else-if="filteredItems.length === 0" class="grid-placeholder">
            <BoxSelect :size="48" />
            <p v-if="selectedCategory === 'all'">{{ t('空空如也') }}</p>
            <p v-else-if="selectedCategory === '装备'">{{ t('暂无装备') }}</p>
            <p v-else-if="selectedCategory === '功法'">{{ t('暂无功法') }}</p>
            <p v-else-if="selectedCategory === '其他'">{{ t('暂无其他物品') }}</p>
            <p v-else>{{ t('暂无{0}').replace('{0}', t(selectedCategory)) }}</p>
            <span v-if="selectedCategory !== 'all'" class="filter-tip"> {{ t('可以试试搜索其他分类') }} </span>
          </div>
          <div
            v-else
            v-for="item in filteredItems"
            :key="item.物品ID"
            class="item-card"
            :class="getItemQualityClass(item, 'card')"
            @click="selectItem(item)"
          >
            <!-- 物品图标和品质 -->
            <div class="item-top-section">
              <div class="item-icon-area" :class="getItemQualityClass(item, 'border')">
                <div class="item-type-icon">{{ getItemTypeIcon(item.类型) }}</div>
                <div class="item-quality-badge" :class="getItemQualityClass(item, 'text')">
                  {{ item.品质?.quality ? t(item.品质.quality) : t('未知') }}
                </div>
              </div>
            </div>

            <!-- 数量显示 -->
            <div v-if="item.数量 > 1" class="item-quantity-display">×{{ item.数量 }}</div>

            <!-- 物品名称 -->
            <div class="item-name-section">
              <div class="item-name" :title="item.名称">{{ item.名称 }}</div>
            </div>

            <!-- 底部信息：类型和品级 -->
            <div class="item-bottom-section">
              <div class="item-type-label">{{ t(item.类型) }}</div>
              <div
                v-if="item.品质?.grade !== undefined"
                class="item-grade-info"
                :class="getItemGradeClass(item)"
              >
                {{ t(getItemGradeText(item)) }}({{ item.品质.grade }})
              </div>
            </div>
          </div>
        </div>

        <!-- 桌面端物品详情侧边栏 -->
        <div v-if="!isMobile" class="item-details-sidebar">
          <div v-if="selectedItem" class="details-content">
            <div class="details-header">
              <div class="details-icon-large" :class="getItemQualityClass(selectedItem)">
                <div class="item-type-text-large">{{ selectedItem.类型 }}</div>
              </div>
              <div class="details-title-area">
                <h3>{{ selectedItem.名称 }}</h3>
                <div class="details-meta">
                  {{ t(selectedItem.类型) }} / {{ selectedItem.品质?.quality ? t(selectedItem.品质.quality) : t('未知') }}
                  <span
                    v-if="selectedItem.品质?.grade !== undefined"
                    class="grade-display"
                    :class="getItemGradeClass(selectedItem)"
                  >
                    {{ t(getItemGradeText(selectedItem)) }}({{ selectedItem.品质.grade }})
                  </span>
                </div>
              </div>
            </div>
            <div class="details-body">
              <p class="details-description">{{ selectedItem.描述 }}</p>

              <!-- 功法特有属性 -->
              <template v-if="selectedItem.类型 === '功法'">
                <!-- 功法效果 -->
                <div v-if="selectedItem.功法效果" class="details-attributes">
                  <h4>{{ t('功法效果:') }}</h4>
                  <div class="attribute-text">
                    {{ typeof selectedItem.功法效果 === 'string' ? selectedItem.功法效果 : JSON.stringify(selectedItem.功法效果) }}
                  </div>
                </div>

                <!-- 功法技能 -->
                <div
                  v-if="selectedItem.功法技能 && Array.isArray(selectedItem.功法技能) && selectedItem.功法技能.length > 0"
                  class="details-attributes"
                >
                  <h4>{{ t('功法技能:') }}</h4>
                  <div class="technique-skills">
                    <div
                      v-for="(skill, index) in selectedItem.功法技能"
                      :key="index"
                      class="skill-item"
                    >
                      <div class="skill-header">
                        <span class="skill-name">{{ skill.技能名称 }}</span>
                        <span v-if="skill.解锁需要熟练度" class="skill-unlock-requirement">
                          {{ t('需要:') }} {{ skill.解锁需要熟练度 }}%
                        </span>
                      </div>
                      <div class="skill-description">{{ skill.技能描述 }}</div>
                      <div v-if="skill.消耗" class="skill-cost">{{ t('消耗:') }} {{ skill.消耗 }}</div>
                    </div>
                  </div>
                </div>
              </template>

              <!-- 装备装备增幅 -->
              <div
                v-if="selectedItem.类型 === '装备' && selectedItem.装备增幅"
                class="details-attributes"
              >
                <h4>{{ t('装备增幅:') }}</h4>
                <div class="attribute-text">{{ typeof selectedItem.装备增幅 === 'string' ? selectedItem.装备增幅 : formatItemAttributes(selectedItem.装备增幅) }}</div>
              </div>

              <!-- 装备特殊效果 -->
              <div
                v-if="selectedItem.类型 === '装备' && selectedItem.特殊效果"
                class="details-attributes"
              >
                <h4>{{ t('特殊效果:') }}</h4>
                <div class="attribute-text">{{ typeof selectedItem.特殊效果 === 'string' ? selectedItem.特殊效果 : formatItemAttributes(selectedItem.特殊效果) }}</div>
              </div>
            </div>
            <div class="details-actions">
              <!-- 装备：装备和丢弃 -->
              <template v-if="selectedItem?.类型 === '装备'">
                <button
                  class="action-btn"
                  :class="isEquipped(selectedItem) ? 'unequip-btn' : 'equip-btn'"
                  :disabled="equipBusy"
                  @click="toggleEquip(selectedItem)"
                >
                  {{ isEquipped(selectedItem) ? t('卸下') : t('装备') }}
                </button>
                <button class="action-btn discard-btn" @click="discardItem(selectedItem)">
                  {{ t('丢弃') }}
                </button>
              </template>
              <!-- 功法：修炼和丢弃 -->
              <template v-else-if="selectedItem?.类型 === '功法'">
                <button
                  class="action-btn"
                  :class="isCultivating(selectedItem) ? 'stop-cultivate-btn' : 'cultivate-btn'"
                  :disabled="cultivateBusy"
                  @click="toggleCultivate(selectedItem)"
                >
                  {{ isCultivating(selectedItem) ? t('停止修炼') : t('修炼') }}
                </button>
                <button class="action-btn discard-btn" @click="discardItem(selectedItem)">
                  {{ t('丢弃') }}
                </button>
              </template>
              <!-- 其他物品：使用和丢弃 -->
              <template v-else>
                <button class="action-btn use-btn" @click="useItem(selectedItem!)">{{ t('使用') }}</button>
                <button class="action-btn discard-btn" @click="discardItem(selectedItem!)">
                  {{ t('丢弃') }}
                </button>
              </template>
            </div>
          </div>
          <div v-else class="details-placeholder">
            <BoxSelect :size="48" />
            <p>{{ t('选择物品查看详情') }}</p>
          </div>
        </div>
      </div>

      <!-- 装备标签 -->
      <div v-if="activeTab === 'equipment'" class="equipment-tab">
        <div class="equipment-showcase">
          <!-- 装备总览卡片 -->
          <div class="equipment-overview">
            <div class="overview-header">
              <div class="overview-title">
                <Sword :size="20" class="title-icon" />
                <span>法宝装备</span>
              </div>
              <div class="overview-stats">
                <div class="stat-item">
                  <span class="stat-label">已装备</span>
                  <span class="stat-value">{{ equippedCount }}/{{ equipmentSlots.length }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- 装备槽位网格 -->
          <div class="equipment-slots-grid">
            <div
              v-for="(slot, index) in equipmentSlots"
              :key="index"
              class="equipment-slot-card"
              :class="[
                slot.item ? 'equipped' : 'empty',
                slot.item ? getItemQualityClass(slot.item, 'card') : ''
              ]"
            >
              <!-- 槽位标题栏 -->
              <div class="slot-title-bar">
                <div class="slot-position">
                  <div class="position-icon">{{ getSlotIcon(slot.name) }}</div>
                  <span class="position-name">{{ slot.name }}</span>
                </div>
                <button
                  v-if="slot.item"
                  class="slot-unequip-btn"
                  :disabled="equipBusy"
                  @click="unequipItem(slot)"
                  :title="t('卸下装备')"
                >
                  <X :size="14" />
                </button>
              </div>

              <!-- 已装备内容 -->
              <div v-if="slot.item" class="equipped-content">
                <!-- 装备图标区 -->
                <div class="equipped-icon-area">
                  <div class="icon-glow" :class="getItemQualityClass(slot.item, 'glow')"></div>
                  <div class="icon-frame" :class="getItemQualityClass(slot.item, 'border')">
                    <div class="icon-inner">
                      <Sword :size="32" :class="getItemQualityClass(slot.item, 'text')" />
                    </div>
                  </div>
                  <div class="quality-badge" :class="getItemQualityClass(slot.item, 'badge')">
                    {{ slot.item.品质?.quality ? t(slot.item.品质.quality) : '？' }}
                  </div>
                </div>

                <!-- 装备信息区 -->
                <div class="equipped-info">
                  <div class="equipped-name" :class="getItemQualityClass(slot.item, 'text')">
                    {{ slot.item.名称 }}
                  </div>
                  <div class="equipped-grade">
                    <span
                      v-if="slot.item.品质?.grade !== undefined"
                      class="grade-badge"
                      :class="getItemGradeClass(slot.item)"
                    >
                      {{ t(getItemGradeText(slot.item)) }} ({{ slot.item.品质.grade }})
                    </span>
                  </div>
                  <div v-if="slot.item.描述" class="equipped-desc">
                    {{ slot.item.描述 }}
                  </div>

                  <!-- 装备效果 -->
                  <div class="equipped-effects">
                    <div v-if="slot.item.类型 === '装备' && slot.item.装备增幅" class="effect-section">
                      <div class="effect-label">
                        <div class="effect-dot"></div>
                        <span>增幅效果</span>
                      </div>
                      <div class="effect-content">
                        {{ typeof slot.item.装备增幅 === 'string' ? slot.item.装备增幅 : formatItemAttributes(slot.item.装备增幅) }}
                      </div>
                    </div>
                    <div v-if="slot.item.类型 === '装备' && slot.item.特殊效果" class="effect-section special">
                      <div class="effect-label">
                        <div class="effect-dot special"></div>
                        <span>特殊效果</span>
                      </div>
                      <div class="effect-content">
                        {{ typeof slot.item.特殊效果 === 'string' ? slot.item.特殊效果 : formatItemAttributes(slot.item.特殊效果) }}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- 空槽位内容 -->
              <div v-else class="empty-slot-content">
                <div class="empty-slot-icon">
                  <Package :size="40" />
                </div>
                <div class="empty-slot-text">
                  <div class="empty-main">空槽位</div>
                  <div class="empty-hint">可装备法宝</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 财产管理标签 -->
      <div v-if="activeTab === 'currency'" class="currency-tab">
        <div class="currency-summary">
          <div class="summary-title">总价值</div>
          <div class="summary-value">
            {{ formatNumber(totalValueInBase) }}
            <span class="summary-unit">{{ baseCurrencyLabel }}</span>
          </div>
          <div v-if="currentMarketLabel" class="summary-hint">{{ currentMarketLabel }}</div>
        </div>
        <div class="currency-grid">
          <div
            v-for="c in currencyCards"
            :key="c.id"
            class="currency-card"
            :class="c.colorClass"
          >
            <div class="currency-card-top">
              <div class="currency-icon" :class="`icon-${c.colorClass}`">
                <component :is="c.icon" :size="isMobile ? 32 : 40" />
              </div>
              <div class="currency-info">
                <div class="currency-amount">{{ formatNumber(c.amount) }}</div>
                <div class="currency-label">{{ c.label }}</div>
                <div class="currency-sub">{{ c.subLabel }}</div>
              </div>
              <button
                v-if="c.canDelete"
                class="currency-delete-btn"
                :title="t('删除')"
                @click="confirmDeleteCurrency(c.id)"
              >
                <Trash2 :size="16" />
              </button>
            </div>
            <div v-if="c.exchangeUp || c.exchangeDown" class="currency-exchange">
              <button
                v-if="c.exchangeUp"
                class="exchange-btn"
                @click="handleExchange(c.id, 'up')"
                :disabled="c.exchangeUp && c.amount < c.exchangeUp.cost"
                :title="c.exchangeUp ? c.exchangeUp.title : ''"
              >
                {{ t('↑ 兑换') }}
              </button>
              <button
                v-if="c.exchangeDown"
                class="exchange-btn down"
                @click="handleExchange(c.id, 'down')"
                :disabled="c.amount < 1"
                :title="c.exchangeDown ? c.exchangeDown.title : ''"
              >
                {{ t('↓ 分解') }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- 数量选择弹窗 -->
  <QuantitySelectModal
    :visible="showQuantityModal"
    :item="quantityModalItem"
    :title="quantityModalTitle"
    :action-label="quantityModalActionLabel"
    :action-type="quantityModalType"
    :confirm-text="quantityModalConfirmText"
    :description="quantityModalDescription"
    @close="handleQuantityClose"
    @confirm="handleQuantityConfirm"
  />
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { Search, BoxSelect, Gem, Coins, HandCoins, BadgeDollarSign, Package, X, RotateCcw, Sword, Trash2 } from 'lucide-vue-next'
import { useI18n } from '@/i18n'
import { useCharacterStore } from '@/stores/characterStore'
import { useGameStateStore } from '@/stores/gameStateStore'
import { useActionQueueStore } from '@/stores/actionQueueStore'
import { EnhancedActionQueueManager } from '@/utils/enhancedActionQueue'
import { isTavernEnv } from '@/utils/tavern'
import type { Item, ConsumableItem } from '@/types/game'
import { toast } from '@/utils/toast'
import { debug } from '@/utils/debug'
import QuantitySelectModal from '@/components/common/QuantitySelectModal.vue'
import {
  DEFAULT_BASE_CURRENCY_ID,
  DEFAULT_CURRENCIES,
  syncWalletToLegacySpiritStones,
  normalizeInventoryCurrencies,
} from '@/utils/currencySystem'

const { t } = useI18n()
const characterStore = useCharacterStore()
const gameStateStore = useGameStateStore()
const actionQueue = useActionQueueStore()
const enhancedActionQueue = EnhancedActionQueueManager.getInstance()
const isTavernEnvFlag = isTavernEnv()
const loading = ref(false)
const refreshing = ref(false)
const selectedItem = ref<Item | null>(null)
const searchQuery = ref('')
const selectedCategory = ref('all')
const sortBy = ref('default')
const activeTab = ref('items')
const showCustomConfirm = ref(false)
const confirmTitle = ref('')
const confirmMessage = ref('')
const showQuantityModal = ref(false)
const quantityModalItem = ref<Item | null>(null)
const quantityModalTitle = ref('')
const quantityModalActionLabel = ref('')
const quantityModalType = ref<'use' | 'discard' | 'other'>('use')
const quantityModalConfirmText = ref('')
const quantityModalDescription = ref('')
const quantityModalCallback = ref<((quantity: number) => void) | null>(null)
const showItemModal = ref(false)
const confirmCallback = ref<(() => void) | null>(null)

// 操作锁，防止连点导致状态错乱或数据不同步
const equipBusy = ref(false)
const cultivateBusy = ref(false)

// 响应式检测
const isMobile = computed(() => {
  return window.innerWidth <= 768
})

// 标签配置
const tabs = computed(() => [
  { id: 'items', label: '背包物品', icon: Package },
  { id: 'equipment', label: '法宝装备', icon: Sword },
  { id: 'currency', label: '财产管理', icon: Gem },
])

// 装备槽位（短路径：装备）
const equipmentSlots = computed(() => {
  const equipment = gameStateStore.equipment
  const slotKeys = ['装备1', '装备2', '装备3', '装备4', '装备5', '装备6'] as const

  if (!equipment) {
    return slotKeys.map((slotKey) => ({ name: t(slotKey), slotKey, item: null }))
  }

  return slotKeys.map((slotKey) => {
    const equippedValue = (equipment as any)[slotKey] as unknown
    let item: Item | null = null

    const itemId =
      typeof equippedValue === 'string'
        ? equippedValue
        : typeof equippedValue === 'object' && equippedValue !== null && '物品ID' in equippedValue
          ? String((equippedValue as any).物品ID || '')
          : ''

    if (itemId) {
      // 从背包获取完整物品信息（背包.物品 是 Record<string, Item>）
      const bag = gameStateStore.inventory?.物品 || {} // 物品是对象
      const fromInv = bag[itemId] // 直接通过物品ID获取
      if (fromInv && typeof fromInv === 'object') {
        item = fromInv as Item
      } else {
        // 如果背包中没有找到，构造一个最小对象
        item = {
          物品ID: itemId,
          名称:
            typeof equippedValue === 'object' && equippedValue !== null && '名称' in equippedValue
              ? String((equippedValue as any).名称 || itemId)
              : itemId,
          类型: '装备',
          品质: { quality: '凡', grade: 1 },
          描述: '装备数据缺失',
          数量: 1,
          已装备: true,
        } as Item
      }
    } else {
      item = null
    }

    return { name: t(slotKey), slotKey, item }
  })
})

// 卸下装备功能
const unequipItem = async (slot: { name: string; slotKey: string; item: Item | null }) => {
  if (equipBusy.value) return
  if (!slot.item) return
  equipBusy.value = true
  const itemToUnequip = slot.item

  debug.log(t('背包面板'), t('卸下装备'), itemToUnequip.名称)

  try {
    // 检查数据是否存在
    if (!gameStateStore.equipment) {
      toast.error(t('装备栏数据不存在'))
      return
    }

    // 检查背包是否存在
    if (!gameStateStore.inventory?.物品) {
      toast.error(t('背包数据不存在'))
      return
    }

    // 获取存档数据
    const saveData = gameStateStore.toSaveData()
    if (!saveData) {
      toast.error(t('存档数据不存在'))
      return
    }

    const saveAny = saveData as any
    if (!saveAny.角色) saveAny.角色 = {}
    if (!saveAny.角色.装备) {
      saveAny.角色.装备 = { 装备1: null, 装备2: null, 装备3: null, 装备4: null, 装备5: null, 装备6: null }
    }
    const slotKey = slot.slotKey as keyof typeof saveAny.角色.装备

    // 清空装备槽位
    saveAny.角色.装备[slotKey] = null

    // 清除物品的已装备标记
    if (saveAny.角色?.背包?.物品?.[itemToUnequip.物品ID]) {
      saveAny.角色.背包.物品[itemToUnequip.物品ID].已装备 = false
    }

    // 移除装备属性加成
    const { removeEquipmentBonus } = await import('@/utils/equipmentBonusApplier')
    removeEquipmentBonus(saveData, itemToUnequip.物品ID)

    // 更新 gameStateStore 并保存
    gameStateStore.loadFromSaveData(saveData)
    await gameStateStore.saveGame()

    // 添加到操作队列
    actionQueue.addAction({
      type: 'unequip',
      itemName: itemToUnequip.名称,
      itemType: itemToUnequip.类型,
      description: t('卸下了《{0}》装备').replace('{0}', itemToUnequip.名称),
    })

    toast.success(t('已卸下《{0}》').replace('{0}', itemToUnequip.名称))
    debug.log(t('背包面板'), t('装备卸下成功'), itemToUnequip.名称)
  } catch (error) {
    debug.error(t('背包面板'), t('卸下装备失败'), error)
    toast.error(t('卸下装备失败'))
  } finally {
    equipBusy.value = false
  }
}

const itemList = computed<Item[]>(() => {
  const items = gameStateStore.inventory?.物品 || {}
  // 物品现在是对象格式 Record<string, Item>
  // 过滤掉以 _ 开头的元数据字段（如 _AI装备流程提醒）
  return Object.entries(items)
    .filter(([key, val]) => {
      // 过滤掉元数据字段
      if (key.startsWith('_')) {
        return false
      }
      // 过滤掉无效值
      return val && typeof val === 'object'
    })
    .map(([, val]) => {
      const item = val as Partial<Item>

      // 🔍 调试：检查品质数据是否缺失
      if (!item.品质 && (item.类型 === '功法' || item.类型 === '装备')) {
        console.warn(t('[背包面板-警告] 物品缺少品质数据:'), {
          物品ID: item.物品ID,
          名称: item.名称,
          类型: item.类型,
          完整数据: item
        });
      }

      return {
        ...item,
        物品ID: String(item.物品ID || ''),
        名称: String(item.名称 || ''),
        类型: String(item.类型 || '其他') as '装备' | '功法' | '丹药' | '材料' | '其他',
        品质: item.品质 || { quality: '凡', grade: 1 },
        描述: String(item.描述 || ''),
        数量: Number(item.数量 || 1),
      } as Item
    })
    .filter((item: Item) => item.名称 && item.类型)
})

const itemCategories = computed(() => {
  // 五个分类：装备、功法、丹药、材料、其他
  return ['装备', '功法', '丹药', '材料', '其他']
})

// 品质排序映射，兼容 "*阶" 与简写
const qualityOrder: { [key: string]: number } = {
  凡: 1,
  凡阶: 1,
  黄: 2,
  黄阶: 2,
  玄: 3,
  玄阶: 3,
  地: 4,
  地阶: 4,
  天: 5,
  天阶: 5,
  仙: 6,
  仙阶: 6,
  神: 7,
  神阶: 7,
}

const filteredItems = computed(() => {
  let items = [...itemList.value]

  // 标准化物品类型和品质：允许装备、功法、丹药、材料、其他五种类型，并确保品质格式正确
  const validTypes = ['装备', '功法', '丹药', '材料', '其他']
  items = items.map((item) => {
    // 标准化类型：不在有效类型列表中的归为"其他"
    const normalizedType = validTypes.includes(item.类型) ? item.类型 : '其他'

    // 标准化品质字段
    let normalizedQuality = item.品质
    if (!normalizedQuality || typeof normalizedQuality !== 'object') {
      // 如果品质字段缺失或格式错误，设置默认值
      normalizedQuality = { quality: '凡', grade: 1 }
    } else {
      // 确保quality字段存在且为字符串（支持自定义品级）
      if (!normalizedQuality.quality || typeof normalizedQuality.quality !== 'string') {
        normalizedQuality.quality = '凡'
      }
      // 确保grade字段正确（支持数字0-10或自定义字符串）
      if (normalizedQuality.grade === undefined || normalizedQuality.grade === null) {
        normalizedQuality.grade = 1
      } else if (typeof normalizedQuality.grade === 'string') {
        // 自定义字符串品级，保持原样
      } else if (
        typeof normalizedQuality.grade !== 'number' ||
        normalizedQuality.grade < 0 ||
        normalizedQuality.grade > 10
      ) {
        normalizedQuality.grade = 1
      }
    }

    return {
      ...item,
      类型: normalizedType,
      品质: normalizedQuality,
    }
  })

  if (searchQuery.value) {
    items = items.filter((item) => item.名称.includes(searchQuery.value))
  }

  if (selectedCategory.value !== 'all') {
    items = items.filter((item) => item.类型 === selectedCategory.value)
  }

  if (sortBy.value === 'quality') {
    const rank = (q: unknown) => qualityOrder[String(q ?? '凡')] || 0
    items.sort((a, b) => rank(b.品质?.quality) - rank(a.品质?.quality))
  } else if (sortBy.value === 'name') {
    items.sort((a, b) => a.名称.localeCompare(b.名称))
  }

  return items
})

// 格式化物品属性显示（支持嵌套对象，如「后天六司」）
const formatItemAttributes = (attributes: Record<string, unknown>): string => {
  if (!attributes || typeof attributes !== 'object') {
    return '无特殊属性'
  }

  const parts: string[] = []

  for (const [key, value] of Object.entries(attributes)) {
    if (value === null || value === undefined) continue

    if (typeof value === 'object' && !Array.isArray(value)) {
      // 处理如「后天六司」这类嵌套对象
      const nested = Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => typeof v === 'number' || typeof v === 'string')
        .map(([k, v]) => `${k}+${v}`)
        .join('、')
      if (nested) parts.push(`${key}(${nested})`)
    } else {
      parts.push(`${key}+${value}`)
    }
  }

  return parts.length ? parts.join('、') : '无特殊属性'
}

// 格式化功法属性加成显示
const formatAttributeBonus = (attributeBonus: Record<string, unknown>): string => {
  if (!attributeBonus || typeof attributeBonus !== 'object') {
    return '无属性加成'
  }
  const parts: string[] = []
  for (const [key, value] of Object.entries(attributeBonus)) {
    if (value && typeof value === 'number') {
      parts.push(`${key}+${value}`)
    }
  }
  return parts.length > 0 ? parts.join('、') : '无属性加成'
}

// 获取物品类型图标
const getItemTypeIcon = (type: string): string => {
  const typeIcons: Record<string, string> = {
    装备: '⚔️',
    功法: '📜',
    丹药: '💊',
    材料: '💎',
    其他: '📦',
  }
  return typeIcons[type] || '📦'
}

// 获取装备槽位图标
const getSlotIcon = (slotName: string): string => {
  const slotIcons: Record<string, string> = {
    '装备1': '⚔️',
    '装备2': '🛡️',
    '装备3': '👑',
    '装备4': '💍',
    '装备5': '📿',
    '装备6': '🔮',
  }
  return slotIcons[slotName] || '⚡'
}

// 已装备数量
const equippedCount = computed(() => {
  return equipmentSlots.value.filter(slot => slot.item).length
})

// 质量等阶规范化（兼容 "凡阶/黄阶/…" 与 "凡/黄/…"；支持自定义品质）
const PRESET_QUALITIES = ['凡', '黄', '玄', '地', '天', '仙', '神']
const getNormalizedQuality = (quality: unknown): { value: string; isCustom: boolean } => {
  const raw = String(quality || '').trim()
  if (!raw) return { value: '未知', isCustom: false }
  const s = raw.endsWith('阶') ? raw.slice(0, -1) : raw
  if (PRESET_QUALITIES.includes(s)) {
    return { value: s, isCustom: false }
  }
  // 自定义品质，保留原值
  return { value: s, isCustom: true }
}

// 获取品级文本显示（支持数字和自定义字符串）
const getGradeText = (grade: number | string): string => {
  // 自定义字符串品级，直接返回
  if (typeof grade === 'string') return grade
  // 数字品级
  if (grade === 0) return '残缺'
  if (grade >= 1 && grade <= 3) return '下品'
  if (grade >= 4 && grade <= 6) return '中品'
  if (grade >= 7 && grade <= 9) return '上品'
  if (grade === 10) return '极品'
  return '未知'
}

const isPlainMundaneGradeZero = (item?: Item | null): boolean => {
  return item?.品质?.quality === '凡' && item.品质.grade === 0
}

const getItemGradeText = (item?: Item | null): string => {
  if (!item?.品质 || item.品质.grade === undefined) return '未知'
  if (isPlainMundaneGradeZero(item)) return '凡品'
  return getGradeText(item.品质.grade)
}

// 获取品级样式（支持数字和自定义字符串）
const getGradeClass = (grade: number | string): string => {
  // 自定义字符串品级，使用特殊样式
  if (typeof grade === 'string') return 'grade-custom'
  // 数字品级
  if (grade === 0) return 'grade-broken'
  if (grade >= 1 && grade <= 3) return 'grade-low'
  if (grade >= 4 && grade <= 6) return 'grade-mid'
  if (grade >= 7 && grade <= 9) return 'grade-high'
  if (grade === 10) return 'grade-perfect'
  return 'grade-unknown'
}

const getItemGradeClass = (item?: Item | null): string => {
  if (!item?.品质 || item.品质.grade === undefined) return 'grade-unknown'
  if (isPlainMundaneGradeZero(item)) return 'grade-low'
  return getGradeClass(item.品质.grade)
}

// 从背包中移除物品的辅助函数
const removeItemFromInventory = async (item: Item) => {
  const items = gameStateStore.inventory?.物品
  if (!items || typeof items !== 'object') {
    throw new Error(t('背包数据不存在或格式不正确'))
  }

  // [REFACTORED] 从对象中移除物品
  delete items[item.物品ID]

  // 保存数据
  await characterStore.saveCurrentGame()

  debug.log(t('背包面板'), t('物品移除成功'), item.名称)

  // 如果当前选中的是被移除的物品，清除选择
  if (selectedItem.value?.物品ID === item.物品ID) {
    selectedItem.value = null
  }

  // 关闭弹窗
  if (isMobile.value) {
    showItemModal.value = false
  }
}

// 更新背包中物品的辅助函数
const updateItemInInventory = async (item: Item) => {
  const items = gameStateStore.inventory?.物品
  if (!items || typeof items !== 'object') {
    throw new Error(t('背包数据不存在或格式不正确'))
  }

  // [REFACTORED] 更新对象中的物品
  if (items[item.物品ID]) {
    items[item.物品ID] = item

    // 保存数据
    await characterStore.saveCurrentGame()

    debug.log(t('背包面板'), t('物品更新成功'), item.名称)
  } else {
    throw new Error(t('尝试更新一个不存在于背包的物品: {0}').replace('{0}', item.名称))
  }

  // 如果当前选中的是被更新的物品，更新选择
  if (selectedItem.value?.物品ID === item.物品ID) {
    selectedItem.value = item
  }
}

// 切换修炼状态
const toggleCultivate = async (item: Item) => {
  if (cultivateBusy.value) return
  if (item.类型 !== '功法') {
    toast.error(t('只有功法才能修炼'))
    return
  }
  cultivateBusy.value = true
  try {
    if (isCultivating(item)) {
      await enhancedActionQueue.stopCultivation(item)
    } else {
      await enhancedActionQueue.cultivateItem(item)
    }
  } finally {
    cultivateBusy.value = false
  }
}

// 使用物品功能 - 数量选择弹窗
const useItem = async (item: Item) => {
  if (!item) {
    return
  }

  debug.log(t('背包面板'), t('使用物品'), item.名称)

  // 如果物品数量大于1，弹出数量选择弹窗
  if (item.数量 > 1) {
    quantityModalItem.value = item
    quantityModalTitle.value = t('使用物品')
    quantityModalActionLabel.value = t('使用数量')
    quantityModalType.value = 'use'
    quantityModalConfirmText.value = t('确定使用')
    // 丹药、材料、其他类型都可能有使用效果
    const consumableTypes = ['丹药', '材料', '其他']
    quantityModalDescription.value = (consumableTypes.includes(item.类型) && '使用效果' in item ? (item as ConsumableItem).使用效果 : '') || t('暂无特殊效果')
    quantityModalCallback.value = (quantity: number) => useItemWithQuantity(item, quantity)
    showQuantityModal.value = true
    return
  }

  // 数量为1时直接使用
  await useItemWithQuantity(item, 1)
}

const useItemWithQuantity = async (item: Item, quantity: number) => {
  try {
    // 丹药、材料、其他类型可以直接使用
    const consumableTypes = ['丹药', '材料', '其他']
    if (!consumableTypes.includes(item.类型)) {
      toast.error(t('该物品无法直接使用'))
      return
    }
    // 使用增强版动作队列管理器
    await enhancedActionQueue.useItem(item, quantity)

    // 更新UI状态
    if (isMobile.value) {
      showItemModal.value = false
    }
    selectedItem.value = null

    debug.log(t('背包面板'), t('使用物品成功'), item.名称)
  } catch (error) {
    debug.error(t('背包面板'), t('使用物品失败'), error)
    toast.error(t('使用物品失败'))
  }
}

// 数量选择弹窗的处理函数
const handleQuantityConfirm = async (quantity: number) => {
  if (quantityModalCallback.value) {
    await quantityModalCallback.value(quantity)
  }
  handleQuantityClose()
}

const handleQuantityClose = () => {
  showQuantityModal.value = false
  quantityModalItem.value = null
  quantityModalTitle.value = ''
  quantityModalActionLabel.value = ''
  quantityModalType.value = 'use'
  quantityModalConfirmText.value = ''
  quantityModalDescription.value = ''
  quantityModalCallback.value = null
}

// 丢弃物品功能 - 支持数量选择
const discardItem = async (item: Item) => {
  if (!item) {
    return
  }

  // 如果物品数量大于1，弹出数量选择弹窗
  if (item.数量 > 1) {
    const itemQuality = item.品质?.quality || '凡'
    const qualityColor = itemQuality === '凡' ? '' : `【${t(itemQuality)}】`

    quantityModalItem.value = item
    quantityModalTitle.value = t('丢弃物品')
    quantityModalActionLabel.value = t('丢弃数量')
    quantityModalType.value = 'discard'
    quantityModalConfirmText.value = t('确定丢弃')
    quantityModalDescription.value = `${qualityColor}${item.名称} - ${t('此操作不可撤销！')}`
    quantityModalCallback.value = (quantity: number) => discardItemWithQuantity(item, quantity)
    showQuantityModal.value = true
    return
  }

  // 数量为1时使用确认弹窗
  const itemQuality = item.品质?.quality || '凡'
  const qualityColor = itemQuality === '凡' ? '' : `【${t(itemQuality)}】`
  confirmTitle.value = t('丢弃物品')
  confirmMessage.value = t('确定要丢弃 {0}{1} 吗？\n\n此操作不可撤销！').replace('{0}', qualityColor).replace('{1}', item.名称)
  confirmCallback.value = async () => {
    await discardItemWithQuantity(item, 1)
  }
  showCustomConfirm.value = true
}

const discardItemWithQuantity = async (item: Item, quantity: number) => {
  debug.log(t('背包面板'), t('丢弃物品'), { 物品名称: item.名称, 数量: quantity })
  try {
    if (quantity >= item.数量) {
      // 全部丢弃
      await removeItemFromInventory(item)
      toast.success(t('已丢弃《{0}》').replace('{0}', item.名称))
    } else {
      // 部分丢弃，减少数量
      const updatedItem = { ...item, 数量: item.数量 - quantity }
      await updateItemInInventory(updatedItem)
      toast.success(t('已丢弃 {0} 个《{1}》').replace('{0}', quantity.toString()).replace('{1}', item.名称))
    }

    if (isMobile.value) {
      showItemModal.value = false
    }
    selectedItem.value = null
  } catch (error) {
    debug.error(t('背包面板'), t('丢弃失败'), error)
    toast.error(t('丢弃物品失败'))
  }
}
const toggleEquip = async (item: Item) => {
  if (!item || equipBusy.value) return
  if (item.类型 !== '装备') {
    toast.error(t('只有装备才能穿戴'))
    return
  }
  equipBusy.value = true

  try {
    if (isEquipped(item)) {
      // 卸下装备
      await enhancedActionQueue.unequipItem(item)
    } else {
      // 装备物品
      await enhancedActionQueue.equipItem(item)
    }
  } catch (error) {
    console.error('装备切换失败:', error)
    toast.error(t('装备操作失败，请稍后重试'))
  } finally {
    equipBusy.value = false
  }
}

// 检查物品是否已装备 - 直接检查背包物品的已装备字段
const isEquipped = (item: Item | null): boolean => {
  if (!item || !item.物品ID) return false

  const inventoryItems = gameStateStore.inventory?.物品
  if (!inventoryItems) return false

  // 背包物品是对象，不是数组
  const currentItemState = inventoryItems[item.物品ID]
  if (!currentItemState) return false

  return currentItemState.已装备 === true
}

// 检查功法是否正在修炼 - 以 角色.修炼.修炼功法 为准
const isCultivating = (item: Item | null): boolean => {
  if (!item || !item.物品ID) return false

  const cultivatingId = (gameStateStore.cultivation as any)?.修炼功法?.物品ID
  return cultivatingId === item.物品ID
}

const getItemQualityClass = (
  item: Item | null,
  type: 'border' | 'text' | 'badge' | 'card' | 'glow' = 'border',
): string => {
  if (!item) return ''
  const { value: q, isCustom } = getNormalizedQuality(item.品质?.quality)
  if (q === '未知') return ''
  // 自定义品质使用特殊样式
  if (isCustom) return type === 'glow' ? 'q-custom-glow' : `${type}-quality-custom`
  if (type === 'glow') return `q-${q}-glow`
  return `${type}-quality-${q}`
}

// 选择物品
const selectItem = (item: Item) => {
  selectedItem.value = item
  if (isMobile.value) {
    showItemModal.value = true
  }
}

// 处理确认回调
const handleConfirm = () => {
  if (confirmCallback.value) {
    confirmCallback.value()
  }
  showCustomConfirm.value = false
}

// 关闭模态框
const closeModal = () => {
  showItemModal.value = false
}

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v))

const formatNumber = (value: unknown) => {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : 0
  if (Math.abs(n) >= 1e12) return n.toExponential(2)
  if (Math.abs(n) >= 1e6) return n.toLocaleString(undefined, { maximumFractionDigits: 0 })
  return n.toLocaleString(undefined, { maximumFractionDigits: 4 })
}

const normalizedInventoryRef = ref<any>(null)
watch(
  () => gameStateStore.inventory,
  (inv) => {
    if (!inv || typeof inv !== 'object') return
    if (normalizedInventoryRef.value === inv) return
    try {
      normalizeInventoryCurrencies(inv as any)
    } catch (e) {
      console.warn('[背包面板] 货币系统规范化失败（将继续使用原数据）', e)
    }
    normalizedInventoryRef.value = inv
  },
  { immediate: true },
)

// 注意：不要在 computed/渲染链里写入 inv（否则可能触发无限重算卡死）
const getCurrencyWallet = () => {
  const inv: any = gameStateStore.inventory as any
  if (!inv) return null
  return inv
}

const ensureCurrencyWalletWritable = () => {
  const inv: any = gameStateStore.inventory as any
  if (!inv) return null
  if (!inv.货币 || typeof inv.货币 !== 'object' || Array.isArray(inv.货币)) inv.货币 = {}
  if (!inv.货币设置 || typeof inv.货币设置 !== 'object' || Array.isArray(inv.货币设置)) {
    inv.货币设置 = { 禁用币种: [], 基准币种: DEFAULT_BASE_CURRENCY_ID }
  }
  if (!Array.isArray(inv.货币设置.禁用币种)) inv.货币设置.禁用币种 = []
  if (typeof inv.货币设置.基准币种 !== 'string' || !inv.货币设置.基准币种.trim()) inv.货币设置.基准币种 = DEFAULT_BASE_CURRENCY_ID
  return inv
}

const iconByName: Record<string, any> = {
  Gem,
  Coins,
  HandCoins,
  BadgeDollarSign,
}

const marketLocationKey = computed(() => gameStateStore.location?.描述 || '全局')

const getMarketMultiplier = (currencyId: string): number => {
  const world: any = gameStateStore.worldInfo as any
  const locKey = marketLocationKey.value
  const raw =
    world?.经济?.地区波动?.[locKey]?.货币波动?.[currencyId] ??
    world?.经济?.货币波动?.[currencyId] ??
    1
  const n = typeof raw === 'number' && Number.isFinite(raw) ? raw : 1
  return clamp(n, 0.6, 1.6)
}

const setMarketMultiplier = (currencyId: string, next: number) => {
  const world: any = gameStateStore.worldInfo as any
  if (!world) return
  if (!world.经济 || typeof world.经济 !== 'object' || Array.isArray(world.经济)) world.经济 = {}
  if (!world.经济.地区波动 || typeof world.经济.地区波动 !== 'object' || Array.isArray(world.经济.地区波动)) {
    world.经济.地区波动 = {}
  }
  const locKey = marketLocationKey.value
  if (!world.经济.地区波动[locKey] || typeof world.经济.地区波动[locKey] !== 'object') {
    world.经济.地区波动[locKey] = { 货币波动: {} }
  }
  if (!world.经济.地区波动[locKey].货币波动 || typeof world.经济.地区波动[locKey].货币波动 !== 'object') {
    world.经济.地区波动[locKey].货币波动 = {}
  }
  world.经济.地区波动[locKey].货币波动[currencyId] = clamp(next, 0.6, 1.6)
}

const baseCurrencyId = computed(() => {
  const inv: any = gameStateStore.inventory as any
  const wallet: Record<string, any> = inv?.货币 && typeof inv.货币 === 'object' ? inv.货币 : {}
  const raw = inv?.货币设置?.基准币种
  const candidate = typeof raw === 'string' && raw.trim() ? raw.trim() : DEFAULT_BASE_CURRENCY_ID
  if (wallet && candidate in wallet) return candidate
  if (wallet && DEFAULT_BASE_CURRENCY_ID in wallet) return DEFAULT_BASE_CURRENCY_ID
  const first = wallet ? Object.keys(wallet)[0] : ''
  return first || DEFAULT_BASE_CURRENCY_ID
})

const baseCurrencyLabel = computed(() => {
  const inv: any = gameStateStore.inventory as any
  const wallet: any = inv?.货币
  const baseId = baseCurrencyId.value
  const name = wallet?.[baseId]?.名称
  return typeof name === 'string' && name.trim() ? name.trim() : baseId
})

const totalValueInBase = computed(() => {
  const inv: any = gameStateStore.inventory as any
  const wallet: Record<string, any> = inv?.货币 && typeof inv.货币 === 'object' ? inv.货币 : {}
  const baseId = baseCurrencyId.value
  const baseValueDegree = typeof wallet?.[baseId]?.价值度 === 'number' && Number.isFinite(wallet[baseId].价值度) ? wallet[baseId].价值度 : 1
  const baseMult = getMarketMultiplier(baseId)
  const denom = baseValueDegree * baseMult || 1

  let sum = 0
  for (const asset of Object.values(wallet)) {
    if (!asset || typeof asset !== 'object') continue
    const amount = typeof asset.数量 === 'number' && Number.isFinite(asset.数量) ? asset.数量 : 0
    const valueDegree = typeof asset.价值度 === 'number' && Number.isFinite(asset.价值度) ? asset.价值度 : 0
    const id = typeof asset.币种 === 'string' && asset.币种.trim() ? asset.币种.trim() : ''
    const mult = id ? getMarketMultiplier(id) : 1
    sum += (amount * valueDegree * mult) / denom
  }
  return sum
})

const currentMarketLabel = computed(() => {
  const loc = marketLocationKey.value
  if (!loc) return ''
  const m = getMarketMultiplier('灵石_下品')
  if (m === 1) return `当前地区：${loc}（汇率平稳）`
  return `当前地区：${loc}（汇率波动系数：${m.toFixed(3)}）`
})

type CurrencyCard = {
  id: string
  label: string
  subLabel: string
  amount: number
  valueDegree: number
  colorClass: string
  icon: any
  canDelete: boolean
  exchangeUp?: { cost: number; title: string }
  exchangeDown?: { yield: number; title: string }
}

const currencyCards = computed<CurrencyCard[]>(() => {
  const inv: any = gameStateStore.inventory as any
  const wallet: Record<string, any> = inv?.货币 && typeof inv.货币 === 'object' ? inv.货币 : {}

  const order = [
    '灵石_下品',
    '灵石_中品',
    '灵石_上品',
    '灵石_极品',
    '铜铢',
    '银铢',
    '金铢',
  ]

  const knownIds = new Set(Object.keys(wallet))
  const extraIds = Array.from(knownIds).filter((id) => !order.includes(id)).sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))
  const ids = [...order, ...extraIds].filter((id) => wallet[id])

  const baseId = baseCurrencyId.value
  const baseValueDegree = typeof wallet?.[baseId]?.价值度 === 'number' && Number.isFinite(wallet[baseId].价值度) ? wallet[baseId].价值度 : 1
  const baseMult = getMarketMultiplier(baseId)
  const denom = baseValueDegree * baseMult || 1

  const toBaseValue = (id: string, amount: number, valueDegree: number) => {
    const mult = getMarketMultiplier(id)
    return (amount * valueDegree * mult) / denom
  }

  const makeExchange = (id: string) => {
    const fee = 0.02
    const baseRatio = 100
    const map: Record<string, { up?: string; down?: string }> = {
      灵石_下品: { up: '灵石_中品' },
      灵石_中品: { up: '灵石_上品', down: '灵石_下品' },
      灵石_上品: { up: '灵石_极品', down: '灵石_中品' },
      灵石_极品: { down: '灵石_上品' },
      铜铢: { up: '银铢' },
      银铢: { up: '金铢', down: '铜铢' },
      金铢: { down: '银铢' },
    }
    const pair = map[id]
    if (!pair) return {}

    const fromMult = getMarketMultiplier(id)
    const out: any = {}
    if (pair.up) {
      const toMult = getMarketMultiplier(pair.up)
      const ratio = toMult / fromMult
      const cost = Math.max(1, Math.ceil(baseRatio * ratio * (1 + fee)))
      out.exchangeUp = {
        cost,
        title: `兑换：${cost} ${wallet[id]?.名称 ?? id} → 1 ${wallet[pair.up]?.名称 ?? pair.up}（波动系数比值：${ratio.toFixed(3)}）`,
      }
    }
    if (pair.down) {
      const toMult = getMarketMultiplier(pair.down)
      const ratio = toMult / fromMult
      const yieldAmount = Math.max(1, Math.floor((baseRatio / ratio) * (1 - fee)))
      out.exchangeDown = {
        yield: yieldAmount,
        title: `分解：1 ${wallet[id]?.名称 ?? id} → ${yieldAmount} ${wallet[pair.down]?.名称 ?? pair.down}（波动系数比值：${ratio.toFixed(3)}）`,
      }
    }
    return out
  }

  return ids.map((id) => {
    const asset = wallet[id] || {}
    const label = typeof asset.名称 === 'string' && asset.名称.trim() ? asset.名称.trim() : id
    const amount = typeof asset.数量 === 'number' && Number.isFinite(asset.数量) ? asset.数量 : 0
    const valueDegree =
      typeof asset.价值度 === 'number' && Number.isFinite(asset.价值度)
        ? asset.价值度
        : (DEFAULT_CURRENCIES as any)[id]?.价值度 ?? 0
    const iconName = typeof asset.图标 === 'string' && asset.图标.trim() ? asset.图标.trim() : (DEFAULT_CURRENCIES as any)[id]?.图标
    const icon = (iconName && iconByName[iconName]) || Coins

    const approx = toBaseValue(id, amount, valueDegree)
    const subLabel = `≈ ${formatNumber(approx)} ${baseCurrencyLabel.value}`

    const colorClass =
      id.startsWith('灵石_') ? (id === '灵石_极品' ? 'grade-legend' : id === '灵石_上品' ? 'grade-epic' : id === '灵石_中品' ? 'grade-rare' : 'grade-common') : 'grade-money'

    const canDelete = true

    const exchange = makeExchange(id)

    return { id, label, subLabel, amount, valueDegree, colorClass, icon, canDelete, ...exchange }
  })
})

const confirmDeleteCurrency = (currencyId: string) => {
  confirmTitle.value = '删除币种'
  confirmMessage.value = `确定删除币种「${currencyId}」并清空其数量吗？（可在后续剧情/AI再次创建）`
  confirmCallback.value = async () => {
    const inv = ensureCurrencyWalletWritable()
    if (!inv) return

    if (inv.货币 && typeof inv.货币 === 'object') {
      delete inv.货币[currencyId]
    }
    if (!inv.货币设置) inv.货币设置 = { 禁用币种: [], 基准币种: DEFAULT_BASE_CURRENCY_ID }
    if (!Array.isArray(inv.货币设置.禁用币种)) inv.货币设置.禁用币种 = []
    if (!inv.货币设置.禁用币种.includes(currencyId)) inv.货币设置.禁用币种.push(currencyId)

    // 如果删掉了基准币种，自动切换到默认或现存第一项
    if (inv.货币设置.基准币种 === currencyId) {
      const remaining = inv.货币 ? Object.keys(inv.货币) : []
      inv.货币设置.基准币种 = remaining.includes(DEFAULT_BASE_CURRENCY_ID) ? DEFAULT_BASE_CURRENCY_ID : remaining[0] || DEFAULT_BASE_CURRENCY_ID
    }

    syncWalletToLegacySpiritStones(inv)
    await characterStore.saveCurrentGame()
    toast.success('币种已删除')
  }
  showCustomConfirm.value = true
}

// 灵石兑换功能（动态汇率）
const handleExchange = async (fromCurrencyId: string, direction: 'up' | 'down') => {
  const inv = ensureCurrencyWalletWritable()
  if (!inv) return

  const wallet: Record<string, any> = inv.货币
  if (!wallet || typeof wallet !== 'object') return

  const map: Record<string, { up?: string; down?: string }> = {
    灵石_下品: { up: '灵石_中品' },
    灵石_中品: { up: '灵石_上品', down: '灵石_下品' },
    灵石_上品: { up: '灵石_极品', down: '灵石_中品' },
    灵石_极品: { down: '灵石_上品' },
    铜铢: { up: '银铢' },
    银铢: { up: '金铢', down: '铜铢' },
    金铢: { down: '银铢' },
  }
  const pair = map[fromCurrencyId]
  if (!pair) return

  const fee = 0.02
  // 基础比率按币种价值度推导（六朝铢系非百进制：1金铢=20银铢；灵石档与铜→银仍是100）
  const valueOf = (id: string): number => Number((DEFAULT_CURRENCIES as any)[id]?.价值度) || 0
  const baseRatioFor = (lowId: string, highId: string): number => {
    const low = valueOf(lowId)
    const high = valueOf(highId)
    return low > 0 && high > 0 ? Math.round(high / low) : 100
  }
  const fromMult = getMarketMultiplier(fromCurrencyId)

  const ensureAsset = (id: string) => {
    if (!wallet[id] || typeof wallet[id] !== 'object') {
      const def: any = (DEFAULT_CURRENCIES as any)[id]
      wallet[id] = def ? { ...def, 数量: 0 } : { 币种: id, 名称: id, 数量: 0, 价值度: 0, 图标: 'Coins' }
    }
    if (typeof wallet[id].数量 !== 'number' || !Number.isFinite(wallet[id].数量)) wallet[id].数量 = 0
  }

  ensureAsset(fromCurrencyId)
  const fromAmount = wallet[fromCurrencyId].数量 as number

  if (direction === 'up' && pair.up) {
    ensureAsset(pair.up)
    const toMult = getMarketMultiplier(pair.up)
    const ratio = toMult / fromMult
    const cost = Math.max(1, Math.ceil(baseRatioFor(fromCurrencyId, pair.up) * ratio * (1 + fee)))
    if (fromAmount < cost) return

    wallet[fromCurrencyId].数量 = fromAmount - cost
    wallet[pair.up].数量 = (wallet[pair.up].数量 as number) + 1

    // 轻微施加“交易压力”，体现波动
    setMarketMultiplier(pair.up, toMult * (1 + clamp(cost / 50000, 0, 0.01)))
    setMarketMultiplier(fromCurrencyId, fromMult * (1 - clamp(cost / 80000, 0, 0.006)))
  }

  if (direction === 'down' && pair.down) {
    if (fromAmount < 1) return
    ensureAsset(pair.down)
    const toMult = getMarketMultiplier(pair.down)
    const ratio = toMult / fromMult
    const yieldAmount = Math.max(1, Math.floor((baseRatioFor(pair.down, fromCurrencyId) / ratio) * (1 - fee)))

    wallet[fromCurrencyId].数量 = fromAmount - 1
    wallet[pair.down].数量 = (wallet[pair.down].数量 as number) + yieldAmount

    setMarketMultiplier(pair.down, toMult * (1 + clamp(yieldAmount / 80000, 0, 0.01)))
    setMarketMultiplier(fromCurrencyId, fromMult * (1 - clamp(yieldAmount / 120000, 0, 0.006)))
  }

  syncWalletToLegacySpiritStones(inv)
  await characterStore.saveCurrentGame()
}

// 手动刷新数据
const refreshFromTavern = async () => {
  if (refreshing.value) return

  refreshing.value = true
  try {
    debug.log(t('背包面板'), t('手动刷新酒馆数据'))
    await characterStore.reloadFromStorage()
  } catch (error) {
    debug.error(t('背包面板'), t('刷新数据失败'), error)
  } finally {
    refreshing.value = false
  }
}

</script>

<style scoped>
.inventory-content {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--color-background);
  overflow: hidden;
}

/* 自定义确认弹窗样式 */
.custom-confirm-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  backdrop-filter: blur(4px);
}

.custom-confirm-modal {
  background: var(--color-surface);
  border-radius: 16px;
  width: 100%;
  max-width: 400px;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  animation: modal-appear 0.3s ease-out;
  border: 1px solid var(--color-primary-border);
}

.confirm-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px 16px 24px;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-primary-light);
}

.confirm-header h3 {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--color-text);
}

.confirm-close-btn {
  background: none;
  border: none;
  padding: 4px;
  border-radius: 6px;
  cursor: pointer;
  color: var(--color-text-secondary);
  transition: all 0.2s ease;
}

.confirm-close-btn:hover {
  background: var(--color-surface-hover);
  color: var(--color-text);
}

.confirm-content {
  padding: 24px;
}

.confirm-content p {
  margin: 0;
  color: var(--color-text);
  line-height: 1.6;
  white-space: pre-line;
}

.confirm-actions {
  display: flex;
  gap: 12px;
  padding: 16px 24px 24px 24px;
  justify-content: flex-end;
}

.confirm-btn {
  padding: 10px 20px;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  min-width: 80px;
}

.cancel-btn {
  background: var(--color-surface-hover);
  color: var(--color-text-secondary);
}

.cancel-btn:hover {
  background: var(--color-surface-light);
  color: var(--color-text);
}

.confirm-btn.confirm-btn {
  background: var(--color-primary);
  color: white;
  border-color: var(--color-primary);
}

.confirm-btn.confirm-btn:hover {
  background: var(--color-primary-hover);
}

/* 移动端模态框 */
.item-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  backdrop-filter: blur(4px);
}

.item-modal {
  background: var(--color-surface);
  border-radius: 16px;
  width: 100%;
  max-width: 400px;
  max-height: 80vh;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  animation: modal-appear 0.3s ease-out;
  border: 1px solid var(--color-primary-border);
}

@keyframes modal-appear {
  from {
    opacity: 0;
    transform: scale(0.9) translateY(20px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-primary-light);
}

.modal-header h3 {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 600;
}

.modal-close-btn {
  background: none;
  border: none;
  padding: 4px;
  border-radius: 6px;
  cursor: pointer;
  color: var(--color-text-secondary);
  transition: all 0.2s ease;
}

.modal-close-btn:hover {
  background: var(--color-surface-hover);
  color: var(--color-text);
}

.modal-content {
  padding: 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

.modal-icon-simple {
  width: 80px;
  height: 80px;
  border-radius: 12px;
  border: 3px solid var(--color-border);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 16px;
  background: var(--color-surface-hover);
  font-weight: bold;
  font-size: 14px;
  color: var(--color-text);
}

.modal-info {
  width: 100%;
}

.modal-meta {
  color: var(--color-text-secondary);
  font-size: 0.9rem;
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.grade-display {
  font-size: 0.8rem;
  font-weight: bold;
  padding: 2px 6px;
  border-radius: 4px;
  border: 1px solid currentColor;
  white-space: nowrap;
}

/* 品级颜色样式 */
.grade-display.grade-broken {
  background: #78736a;
  color: white;
  border-color: #78736a;
}

.grade-display.grade-low {
  background: #4f9b7e; /* 绿色 - 下品 */
  color: white;
  border-color: #4f9b7e;
}

.grade-display.grade-mid {
  background: #4c87ad; /* 蓝色 - 中品 */
  color: white;
  border-color: #4c87ad;
}

.grade-display.grade-high {
  background: #8a6fa8; /* 紫色 - 上品 */
  color: white;
  border-color: #8a6fa8;
}

.grade-display.grade-perfect {
  background: #c69431; /* 金色 - 极品 */
  color: white;
  border-color: #c69431;
}

.grade-display.grade-unknown {
  background: #a29c90;
  color: white;
  border-color: #a29c90;
}

.grade-display.grade-custom {
  background: linear-gradient(135deg, #4f97ab, #9668b0);
  color: white;
  border-color: #4f97ab;
}

.modal-description {
  color: var(--color-text);
  line-height: 1.6;
  margin-bottom: 16px;
}

.modal-attributes {
  background: var(--color-surface-light);
  border-radius: 8px;
  padding: 12px;
  margin-top: 16px;
}

.modal-attributes h4 {
  margin: 0 0 8px 0;
  font-size: 0.9rem;
  color: var(--color-text-secondary);
  font-weight: 600;
}

.modal-actions {
  display: flex;
  gap: 8px;
  padding: 16px 20px;
  border-top: 1px solid var(--color-border);
}

/* 主内容区域 */
.inventory-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* 标签导航 */
.tabs-header {
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
  padding: 16px;
  flex-shrink: 0;
  border-radius: 12px 12px 0 0;
}

.tabs-nav {
  display: flex;
  gap: 4px;
  margin-bottom: 16px;
}

.tab-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all 0.2s ease;
  font-weight: 500;
}

.tab-btn:hover {
  background: var(--color-surface-hover);
  color: var(--color-text);
}

.tab-btn.active {
  background: var(--color-primary);
  color: white;
}

/* 工具栏 */
.tools-section {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
}

.search-box {
  position: relative;
  flex: 1;
  min-width: 150px;
}

.search-icon {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--color-text-secondary);
  z-index: 1;
}

.search-box input {
  width: 100%;
  padding: 10px 12px 10px 40px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-background);
  font-size: 14px;
  transition: all 0.2s ease;
}

.search-box input:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px rgba(var(--color-primary-rgb), 0.1);
}

.filter-buttons {
  display: flex;
  gap: 8px;
}

.filter-select {
  padding: 8px 12px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-background);
  color: var(--color-text);
  font-size: 13px;
  min-width: 80px;
}

.filter-select option {
  background: var(--color-surface);
  color: var(--color-text);
}

.refresh-btn {
  padding: 8px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-background);
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 32px;
  height: 32px;
}

.refresh-btn:hover:not(:disabled) {
  background: var(--color-surface-hover);
  color: var(--color-primary);
  border-color: var(--color-primary);
}

.refresh-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.refresh-btn .spinning {
  animation: spin 1s linear infinite;
}

/* 标签内容 */
.tab-content {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}

/* 物品标签 */
.items-tab {
  display: flex;
  height: 100%;
}

.items-grid {
  flex: 1;
  padding: 20px;
  overflow-y: auto;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  grid-auto-rows: minmax(160px, auto);
  gap: 18px;
  align-content: start;
  background: var(--color-background);
}

.grid-placeholder {
  grid-column: 1 / -1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px;
  color: var(--color-text-secondary);
  text-align: center;
}

.filter-tip {
  font-size: 0.8rem;
  color: var(--color-text-muted);
  margin-top: 8px;
  opacity: 0.8;
}

.loading-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--color-border);
  border-top: 3px solid var(--color-primary);
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 16px;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* 物品卡片 - 重新设计美观布局 */
.item-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 10px;
  cursor: pointer;
  transition: all 0.3s ease;
  display: flex;
  flex-direction: column;
  min-height: 160px;
  position: relative;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.item-card:hover {
  border-color: var(--color-primary);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  background: var(--color-surface-light);
}

/* 顶部区域：图标和品质 */
.item-top-section {
  position: relative;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  margin-bottom: 8px;
}

.item-icon-area {
  width: 48px;
  height: 48px;
  border-radius: 8px;
  border: 2px solid var(--color-border);
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-background);
  position: relative;
}

.item-type-icon {
  font-size: 24px;
  opacity: 0.9;
}

.item-quality-badge {
  position: absolute;
  top: -6px;
  right: -6px;
  font-size: 10px;
  font-weight: bold;
  padding: 3px 6px;
  border-radius: 6px;
  background: var(--color-surface);
  border: 1px solid currentColor;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  z-index: 2;
  min-width: 20px;
  text-align: center;
}

/* 数量显示 - 更大更显眼 */
.item-quantity-display {
  position: absolute;
  top: 6px;
  right: 6px;
  /* 仅改变文字颜色，不改背景 */
  background: transparent;
  color: var(--color-accent, #7c4dff);
  font-size: 12px;
  font-weight: 700;
  padding: 0;
  border-radius: 0;
  box-shadow: none;
  border: none;
  z-index: 4;
  min-width: 0;
  text-align: right;
}

/* 名称区域 */
.item-name-section {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 4px;
  min-height: 40px;
}

.item-name {
  font-size: 13px;
  font-weight: 600;
  line-height: 1.4;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  word-break: break-word;
  color: var(--color-text);
}

/* 底部区域：类型和品级 */
.item-bottom-section {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 6px;
  margin-top: auto;
  padding-top: 6px;
  flex-wrap: wrap;
}

.item-type-label {
  font-size: 10px;
  color: var(--color-text-secondary);
  background: var(--color-background);
  padding: 3px 8px;
  border-radius: 4px;
  border: 1px solid var(--color-border);
  flex-shrink: 0;
  white-space: nowrap;
}

.item-grade-info {
  font-size: 9px;
  font-weight: bold;
  padding: 3px 6px;
  border-radius: 4px;
  border: 1px solid currentColor;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
  flex-shrink: 0;
  white-space: nowrap;
}

/* 品级样式 - 简化版本 */
.grade-broken {
  background: #78736a;
  color: white;
}

.grade-low {
  background: #4f9b7e; /* 绿色 - 下品 */
  color: white;
}

.grade-mid {
  background: #4c87ad; /* 蓝色 - 中品 */
  color: white;
}

.grade-high {
  background: #8a6fa8; /* 紫色 - 上品 */
  color: white;
}

.grade-perfect {
  background: #c69431; /* 金色 - 极品 */
  color: white;
}

.grade-unknown {
  background: #a29c90;
  color: white;
}

.grade-custom {
  background: linear-gradient(135deg, #4f97ab, #9668b0);
  color: white;
}

/* 灵石品质样式 - 颜色递增 */
.grade-common {
  background: linear-gradient(135deg, #a29c90, #78736a);
  border-color: #a29c90;
  color: white;
  box-shadow: 0 2px 8px rgba(156, 163, 175, 0.3);
}

.grade-rare {
  background: linear-gradient(135deg, #4c87ad, #3a6c8c);
  border-color: #4c87ad;
  color: white;
  box-shadow: 0 2px 8px rgba(76, 135, 173, 0.4);
}

.grade-epic {
  background: linear-gradient(135deg, #8a6fa8, #70518f);
  border-color: #8a6fa8;
  color: white;
  box-shadow: 0 2px 8px rgba(138, 111, 168, 0.4);
}

.grade-legend {
  background: linear-gradient(135deg, #c69431, #a97528);
  border-color: #c69431;
  color: white;
  box-shadow: 0 2px 12px rgba(198, 148, 49, 0.5);
}

/* 桌面端详情侧边栏 */
.item-details-sidebar {
  width: 320px;
  border-left: 1px solid var(--color-border);
  background: var(--color-surface);
  display: flex;
  flex-direction: column;
}

.details-content {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.details-header {
  padding: 20px;
  border-bottom: 1px solid var(--color-border);
  display: flex;
  align-items: center;
  gap: 16px;
}

.details-icon-large {
  width: 60px;
  height: 60px;
  border-radius: 10px;
  border: 2px solid var(--color-border);
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-background);
  flex-shrink: 0;
  font-weight: bold;
  font-size: 12px;
  color: var(--color-text);
}

.details-title-area h3 {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 600;
}

.details-meta {
  font-size: 0.85rem;
  color: var(--color-text-secondary);
  margin-top: 4px;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.details-body {
  flex: 1;
  padding: 20px;
  overflow-y: auto;
}

.details-description {
  color: var(--color-text);
  line-height: 1.6;
  margin-bottom: 20px;
}

.details-attributes h4 {
  margin: 0 0 12px 0;
  font-size: 0.9rem;
  color: var(--color-text-secondary);
  font-weight: 600;
}

.details-placeholder {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--color-text-secondary);
  text-align: center;
}

.details-actions {
  padding: 16px 20px;
  border-top: 1px solid var(--color-border);
  display: flex;
  gap: 8px;
}

/* 财产管理标签 */
.currency-tab {
  padding: 24px;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.currency-summary {
  display: flex;
  align-items: baseline;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid var(--color-border);
  border-radius: 12px;
  background: var(--color-surface);
  margin-bottom: 16px;
}

.summary-title {
  font-size: 0.9rem;
  font-weight: 700;
  color: var(--color-text);
}

.summary-value {
  font-size: 1rem;
  font-weight: 700;
  color: var(--color-text);
}

.summary-unit {
  margin-left: 6px;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--color-text-secondary);
}

.summary-hint {
  margin-left: auto;
  font-size: 0.85rem;
  color: var(--color-text-secondary);
}

.currency-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;
  width: 100%;
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding-right: 4px;
}

.currency-card {
  background: var(--color-surface);
  border: 2px solid var(--color-border);
  border-radius: 12px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  transition: all 0.3s ease;
  cursor: default;
  position: relative;
  overflow: hidden;
}

.currency-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 4px;
  opacity: 0.8;
  transition: opacity 0.3s ease;
}

.currency-card.grade-common::before {
  background: linear-gradient(90deg, #a29c90, #78736a);
}

.currency-card.grade-rare::before {
  background: linear-gradient(90deg, #4c87ad, #3a6c8c);
}

.currency-card.grade-epic::before {
  background: linear-gradient(90deg, #8a6fa8, #70518f);
}

.currency-card.grade-legend::before {
  background: linear-gradient(90deg, #c69431, #a97528);
}

.currency-card.grade-money::before {
  background: linear-gradient(90deg, #5f9b6a, #4e8557);
}

.currency-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.1);
}

.currency-card:hover::before {
  opacity: 1;
}

.currency-card-top {
  display: flex;
  align-items: center;
  gap: 16px;
}

.currency-icon {
  flex-shrink: 0;
  color: var(--color-text-secondary);
  transition: color 0.3s ease;
}

/* 灵石图标颜色 */
.icon-grade-common {
  color: #a29c90;
}

.icon-grade-rare {
  color: #4c87ad;
}

.icon-grade-epic {
  color: #8a6fa8;
}

.icon-grade-legend {
  color: #c69431;
}

.icon-grade-money {
  color: #5f9b6a;
}

.currency-info {
  flex: 1;
}

.currency-amount {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--color-text);
  margin-bottom: 4px;
}

.currency-label {
  font-size: 0.9rem;
  color: var(--color-text-secondary);
}

.currency-sub {
  margin-top: 2px;
  font-size: 0.8rem;
  color: var(--color-text-secondary);
}

.currency-delete-btn {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}

.currency-delete-btn:hover {
  border-color: #c34b3c;
  color: #c34b3c;
  background: rgba(195, 75, 60, 0.08);
}

.currency-delete-btn:active {
  transform: scale(0.98);
}

/* 兑换功能 */
.currency-exchange {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

.exchange-btn {
  flex: 1;
  padding: 6px 12px;
  border: 1px solid var(--color-primary);
  border-radius: 6px;
  background: var(--color-surface);
  color: var(--color-primary);
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
  overflow: hidden;
}

.exchange-btn::before {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
  transition: left 0.5s ease;
}

.exchange-btn:hover:not(:disabled) {
  background: var(--color-primary);
  color: white;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(var(--color-primary-rgb), 0.3);
}

.exchange-btn:hover:not(:disabled)::before {
  left: 100%;
}

.exchange-btn.down {
  border-color: var(--color-warning);
  color: var(--color-warning);
}

.exchange-btn.down:hover:not(:disabled) {
  background: var(--color-warning);
  color: white;
  box-shadow: 0 4px 12px rgba(var(--color-warning-rgb), 0.3);
}

.exchange-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

.exchange-btn:active:not(:disabled) {
  transform: translateY(0) scale(0.98);
}

/* 按钮样式 */
.action-btn {
  flex: 1;
  padding: 12px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-surface-hover);
  color: var(--color-text);
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.action-btn:hover {
  background: var(--color-surface-light);
  transform: translateY(-1px);
}

.use-btn {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: white;
}

.use-btn:hover {
  background: var(--color-primary-hover);
}

.discard-btn {
  background: var(--color-error);
  border-color: var(--color-error);
  color: white;
}

.discard-btn:hover {
  background: var(--color-error-hover);
}

/* 属性文本显示 */
.attribute-text {
  background: var(--color-background);
  border-radius: 6px;
  padding: 12px;
  font-size: 0.9rem;
  color: var(--color-text);
  line-height: 1.4;
  word-break: break-all;
}

/* 功法效果样式 */
.skill-effects {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.effect-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
}

.effect-label {
  font-weight: 600;
  color: var(--color-text-secondary);
  min-width: 80px;
}

.effect-value {
  color: var(--color-success);
  font-weight: 500;
}

.special-abilities {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.ability-tag {
  background: var(--color-primary);
  color: white;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 0.8rem;
  font-weight: 500;
}

/* 功法技能样式 */
.technique-skills {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.skill-item {
  background: var(--color-background);
  border-radius: 8px;
  padding: 12px;
  border: 1px solid var(--color-border);
}

.skill-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.skill-name {
  font-weight: 600;
  color: var(--color-text);
}

.skill-type {
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 0.8rem;
  font-weight: 500;
}

.skill-type.type-攻击 {
  background: var(--color-error);
  color: white;
}

.skill-type.type-防御 {
  background: var(--color-info);
  color: white;
}

.skill-type.type-辅助 {
  background: var(--color-success);
  color: white;
}

.skill-type.type-移动 {
  background: var(--color-warning);
  color: white;
}

.skill-type.type-其他 {
  background: var(--color-text-secondary);
  color: white;
}

.skill-description {
  color: var(--color-text);
  font-size: 0.9rem;
  line-height: 1.4;
  margin-bottom: 6px;
}

.skill-unlock-requirement {
  font-size: 0.75rem;
  color: var(--color-warning);
  font-weight: 600;
  padding: 2px 8px;
  background: rgba(var(--color-warning-rgb), 0.1);
  border-radius: 4px;
  margin-left: auto;
}

.skill-cost {
  color: var(--color-info);
  font-size: 0.8rem;
  font-weight: 500;
  margin-top: 4px;
}

.skill-unlock {
  color: var(--color-text-secondary);
  font-size: 0.8rem;
}

.cultivate-btn {
  background: var(--color-info);
  border-color: var(--color-info);
  color: white;
}

.cultivate-btn:hover {
  background: var(--color-info-hover);
}

.equip-btn {
  background: var(--color-success);
  border-color: var(--color-success);
  color: white;
}

.equip-btn:hover {
  background: var(--color-success-hover);
}

/* 品质样式系统 - 内联文字样式，不填充整行 */
/* 神阶 - 深红色（最高品质） */
.text-quality-神,
.text-quality-神阶 {
  color: white !important;
  background: linear-gradient(135deg, #a83a2c, #8e2f24) !important;
  border: 1px solid #a83a2c !important;
  box-shadow: 0 2px 8px rgba(168, 58, 44, 0.3) !important;
  text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.5) !important;
  padding: 2px 6px !important;
  border-radius: 4px !important;
  display: inline !important;
  white-space: nowrap !important;
}

/* 仙阶 - 粉紫色 */
.text-quality-仙,
.text-quality-仙阶 {
  color: white !important;
  background: linear-gradient(135deg, #ec4899, #db2777) !important;
  border: 1px solid #ec4899 !important;
  box-shadow: 0 2px 8px rgba(236, 72, 153, 0.3) !important;
  text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.5) !important;
  padding: 2px 6px !important;
  border-radius: 4px !important;
  display: inline !important;
  white-space: nowrap !important;
}

/* 天阶 - 蓝色 */
.text-quality-天,
.text-quality-天阶 {
  color: white !important;
  background: linear-gradient(135deg, #4c87ad, #3a6c8c) !important;
  border: 1px solid #4c87ad !important;
  box-shadow: 0 2px 8px rgba(76, 135, 173, 0.3) !important;
  text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.5) !important;
  padding: 2px 6px !important;
  border-radius: 4px !important;
  display: inline !important;
  white-space: nowrap !important;
}

/* 地阶 - 橙色 */
.text-quality-地,
.text-quality-地阶 {
  color: white !important;
  background: linear-gradient(135deg, #c69431, #a97528) !important;
  border: 1px solid #c69431 !important;
  box-shadow: 0 2px 8px rgba(198, 148, 49, 0.3) !important;
  text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.5) !important;
  padding: 2px 6px !important;
  border-radius: 4px !important;
  display: inline !important;
  white-space: nowrap !important;
}

/* 玄阶 - 紫色 */
.text-quality-玄,
.text-quality-玄阶 {
  color: white !important;
  background: linear-gradient(135deg, #8a6fa8, #70518f) !important;
  border: 1px solid #8a6fa8 !important;
  box-shadow: 0 2px 8px rgba(138, 111, 168, 0.3) !important;
  text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.5) !important;
  padding: 2px 6px !important;
  border-radius: 4px !important;
  display: inline !important;
  white-space: nowrap !important;
}

/* 黄阶 - 金黄色 */
.text-quality-黄,
.text-quality-黄阶 {
  color: white !important;
  background: linear-gradient(135deg, #bd9a2e, #ca8a04) !important;
  border: 1px solid #bd9a2e !important;
  box-shadow: 0 2px 8px rgba(234, 179, 8, 0.3) !important;
  text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.5) !important;
  padding: 2px 6px !important;
  border-radius: 4px !important;
  display: inline !important;
  white-space: nowrap !important;
}

/* 凡阶 - 灰色（最低品质） */
.text-quality-凡,
.text-quality-凡阶 {
  color: white !important;
  background: linear-gradient(135deg, #78736a, #4e4b45) !important;
  border: 1px solid #78736a !important;
  box-shadow: 0 2px 8px rgba(107, 114, 128, 0.3) !important;
  text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.5) !important;
  padding: 2px 6px !important;
  border-radius: 4px !important;
  display: inline !important;
  white-space: nowrap !important;
}

/* 边框样式也需要修复 */
.border-quality-神 {
  border-color: #a83a2c !important;
}

.border-quality-仙 {
  border-color: #ec4899 !important;
}

.border-quality-天 {
  border-color: #4c87ad !important;
}

.border-quality-地 {
  border-color: #c69431 !important;
}

.border-quality-玄 {
  border-color: #8a6fa8 !important;
}

.border-quality-凡 {
  border-color: #78736a !important;
}

.border-quality-凡 {
  border-color: #78736a !important;
}

/* 自定义品质样式 - 使用渐变彩虹色 */
.border-quality-custom {
  border-color: #4f97ab !important;
  border-width: 2px !important;
}

.text-quality-custom {
  color: #4f97ab !important;
  font-weight: bold;
}

.card-quality-custom {
  background: linear-gradient(135deg, rgba(6, 182, 212, 0.1), rgba(150, 104, 176, 0.1)) !important;
  border-color: #4f97ab !important;
}

.badge-quality-custom {
  background: linear-gradient(135deg, #4f97ab, #9668b0) !important;
  color: white !important;
}

/* 装备标签页样式 */
.equipment-tab {
  height: 100%;
  overflow-y: auto;
  padding: 0;
}

.equipment-showcase {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

/* 装备总览卡片 */
.equipment-overview {
  background: linear-gradient(135deg, rgba(var(--color-primary-rgb), 0.08), rgba(var(--color-primary-rgb), 0.02));
  border: 1px solid rgba(var(--color-primary-rgb), 0.2);
  border-radius: 16px;
  padding: 20px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.05);
}

.overview-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.overview-title {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 1.25rem;
  font-weight: 800;
  color: var(--color-text);
}

.title-icon {
  color: var(--color-primary);
}

.overview-stats {
  display: flex;
  gap: 24px;
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
}

.stat-label {
  font-size: 0.75rem;
  color: var(--color-text-secondary);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.stat-value {
  font-size: 1.5rem;
  font-weight: 900;
  color: var(--color-primary);
  line-height: 1;
}

/* 装备槽位网格 */
.equipment-slots-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 20px;
}

/* 装备槽位卡片 */
.equipment-slot-card {
  background: var(--color-surface);
  border: 2px solid var(--color-border);
  border-radius: 16px;
  overflow: hidden;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
}

.equipment-slot-card.empty {
  border-style: dashed;
  border-color: var(--color-border);
  opacity: 0.7;
}

.equipment-slot-card.empty:hover {
  opacity: 1;
  border-color: rgba(var(--color-primary-rgb), 0.3);
  transform: translateY(-2px);
}

.equipment-slot-card.equipped {
  border-color: rgba(var(--color-primary-rgb), 0.4);
  box-shadow: 0 4px 16px rgba(var(--color-primary-rgb), 0.1);
}

.equipment-slot-card.equipped:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 24px rgba(var(--color-primary-rgb), 0.2);
  border-color: rgba(var(--color-primary-rgb), 0.6);
}

/* 槽位标题栏 */
.slot-title-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: var(--color-surface-light);
  border-bottom: 1px solid var(--color-border);
}

.slot-position {
  display: flex;
  align-items: center;
  gap: 10px;
}

.position-icon {
  font-size: 1.25rem;
  line-height: 1;
}

.position-name {
  font-size: 0.9rem;
  font-weight: 700;
  color: var(--color-text);
}

.slot-unequip-btn {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  border: none;
  background: rgba(195, 75, 60, 0.1);
  color: #c34b3c;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.slot-unequip-btn:hover {
  background: #c34b3c;
  color: white;
  transform: scale(1.1);
}

.slot-unequip-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

/* 已装备内容 */
.equipped-content {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* 装备图标区 */
.equipped-icon-area {
  display: flex;
  align-items: center;
  gap: 16px;
  position: relative;
}

.icon-glow {
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 80px;
  height: 80px;
  border-radius: 50%;
  filter: blur(20px);
  opacity: 0.3;
  pointer-events: none;
}

.icon-glow.q-凡-glow { background: #807b72; }
.icon-glow.q-黄-glow { background: #daa520; }
.icon-glow.q-玄-glow { background: #9370db; }
.icon-glow.q-地-glow { background: #00ced1; }
.icon-glow.q-天-glow { background: #ff69b4; }
.icon-glow.q-仙-glow { background: #ffd700; }
.icon-glow.q-神-glow { background: #9932cc; }
.icon-glow.q-custom-glow { background: rgba(var(--color-primary-rgb), 0.8); }

.icon-frame {
  width: 80px;
  height: 80px;
  border-radius: 16px;
  border: 3px solid;
  background: var(--color-background);
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  z-index: 1;
  flex-shrink: 0;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.icon-inner {
  display: flex;
  align-items: center;
  justify-content: center;
}

.quality-badge {
  position: absolute;
  bottom: -8px;
  left: 50%;
  transform: translateX(-50%);
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 0.7rem;
  font-weight: 800;
  color: white;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
  white-space: nowrap;
  z-index: 2;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}

.quality-badge.q-凡-badge { background: linear-gradient(135deg, #807b72, #696969); }
.quality-badge.q-黄-badge { background: linear-gradient(135deg, #daa520, #b8860b); }
.quality-badge.q-玄-badge { background: linear-gradient(135deg, #9370db, #8a2be2); }
.quality-badge.q-地-badge { background: linear-gradient(135deg, #00ced1, #20b2aa); }
.quality-badge.q-天-badge { background: linear-gradient(135deg, #ff69b4, #ff1493); }
.quality-badge.q-仙-badge { background: linear-gradient(135deg, #ffd700, #ffa500); }
.quality-badge.q-神-badge { background: linear-gradient(135deg, #9932cc, #8b008b); }

/* 装备信息区 */
.equipped-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.equipped-name {
  font-size: 1.1rem;
  font-weight: 800;
  line-height: 1.3;
  color: var(--color-text);
}

.equipped-grade {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.grade-badge {
  padding: 4px 10px;
  border-radius: 8px;
  font-size: 0.75rem;
  font-weight: 700;
  border: 1px solid;
  display: inline-block;
}

.equipped-desc {
  font-size: 0.85rem;
  line-height: 1.5;
  color: var(--color-text-secondary);
  padding: 10px;
  background: var(--color-surface-light);
  border-radius: 10px;
  border-left: 3px solid rgba(var(--color-primary-rgb), 0.5);
}

/* 装备效果 */
.equipped-effects {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 4px;
}

.effect-section {
  padding: 12px;
  background: linear-gradient(135deg, rgba(var(--color-primary-rgb), 0.05), rgba(var(--color-primary-rgb), 0.02));
  border: 1px solid rgba(var(--color-primary-rgb), 0.15);
  border-radius: 10px;
}

.effect-section.special {
  background: linear-gradient(135deg, rgba(150, 104, 176, 0.08), rgba(150, 104, 176, 0.02));
  border-color: rgba(150, 104, 176, 0.2);
}

.effect-label {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--color-text);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.effect-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--color-primary);
  box-shadow: 0 0 8px rgba(var(--color-primary-rgb), 0.6);
}

.effect-dot.special {
  background: #9668b0;
  box-shadow: 0 0 8px rgba(150, 104, 176, 0.6);
}

.effect-content {
  font-size: 0.85rem;
  line-height: 1.6;
  color: var(--color-text);
  padding-left: 14px;
}

/* 空槽位内容 */
.empty-slot-content {
  padding: 40px 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  min-height: 200px;
}

.empty-slot-icon {
  color: var(--color-text-muted);
  opacity: 0.4;
}

.empty-slot-text {
  text-align: center;
}

.empty-main {
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--color-text-secondary);
  margin-bottom: 4px;
}

.empty-hint {
  font-size: 0.8rem;
  color: var(--color-text-muted);
}

/* 品质边框颜色 */
.q-凡-border { border-color: #807b72; }
.q-黄-border { border-color: #daa520; }
.q-玄-border { border-color: #9370db; }
.q-地-border { border-color: #00ced1; }
.q-天-border { border-color: #ff69b4; }
.q-仙-border { border-color: #ffd700; }
.q-神-border { border-color: #9932cc; }

/* 品质文字颜色 */
.q-凡-text { color: #807b72; }
.q-黄-text { color: #daa520; }
.q-玄-text { color: #9370db; }
.q-地-text { color: #00ced1; }
.q-天-text { color: #ff69b4; }
.q-仙-text { color: #ffd700; }
.q-神-text { color: #9932cc; }

/* 品级样式 */
.item-grade {
  border-radius: 5px;
  border: 2px solid #a29c90;
}

.item-type-text {
  font-size: 12px;
  font-weight: bold;
  text-align: center;
  color: var(--color-text);
  line-height: 1.2;
  word-break: break-word;
}

.item-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.item-name {
  font-size: 1.1rem;
  font-weight: 700;
  margin-bottom: 0;
  line-height: 1.3;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  color: var(--color-text);
}

.item-quality {
  font-size: 0.9rem;
  color: var(--color-text-secondary);
  border-radius: 6px;
  margin-bottom: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  width: fit-content;
}

.item-description {
  font-size: 0.85rem;
  color: var(--color-text-secondary);
  line-height: 1.5;
  margin-bottom: 0;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  -webkit-box-orient: vertical;
  background: var(--color-surface-light);
  padding: 8px 12px;
  border-radius: 8px;
  border-left: 3px solid var(--color-primary);
}

.item-effects {
  background: var(--color-surface-light);
  padding: 8px;
  border-radius: 6px;
  border-left: 3px solid var(--color-info);
}

.effects-title {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--color-info);
  margin-bottom: 4px;
}

.effects-text {
  font-size: 0.8rem;
  color: var(--color-text);
  line-height: 1.3;
}

/* 空装备槽位 */
.empty-equipment-slot {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  height: 120px;
  gap: 8px;
}

.empty-icon {
  color: var(--color-text-muted);
  opacity: 0.5;
}

.empty-text {
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--color-text-secondary);
}

.empty-hint {
  font-size: 0.8rem;
  color: var(--color-text-muted);
  font-style: italic;
}

/* 移动端适配 - 优化卡片显示 */
@media (max-width: 640px) {
  .tabs-header {
    padding: 12px;
  }

  .tools-section {
    flex-direction: column;
    gap: 8px;
    align-items: stretch;
  }

  .search-box {
    min-width: auto;
  }

  .filter-buttons {
    justify-content: space-between;
  }

  .filter-select {
    flex: 1;
  }

  .items-grid {
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    grid-auto-rows: minmax(150px, auto);
    padding: 16px;
    gap: 12px;
  }

  .item-card {
    min-height: 150px;
    padding: 8px;
  }

  .item-icon-area {
    width: 40px;
    height: 40px;
  }

  .item-type-icon {
    font-size: 20px;
  }

  .item-name-section {
    min-height: 36px;
    padding: 3px;
  }

  .item-name {
    font-size: 11px;
    line-height: 1.3;
  }

  .item-type-label {
    font-size: 9px;
    padding: 2px 6px;
  }

  .item-grade-info {
    font-size: 8px;
    padding: 2px 5px;
  }

  .currency-grid {
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 12px;
  }

  .currency-card {
    padding: 16px;
  }

  .currency-amount {
    font-size: 1.25rem;
  }

  /* 装备页面移动端适配 */
  .equipment-content {
    padding: 12px;
  }

  .equipment-header {
    flex-direction: column;
    gap: 12px;
    align-items: flex-start;
  }

  .equipment-slots-grid {
    grid-template-columns: 1fr;
    gap: 16px;
  }

  .equipment-slot-card {
    min-height: auto;
  }

  .equipped-icon-area {
    flex-direction: column;
    align-items: flex-start;
  }
}

@media (max-width: 480px) {
  .tabs-nav {
    justify-content: center;
  }

  .tab-btn {
    flex: 1;
    justify-content: center;
  }

  .items-grid {
    grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
    grid-auto-rows: minmax(140px, auto);
    gap: 10px;
    padding: 12px;
  }

  .item-card {
    min-height: 140px;
    padding: 6px;
  }

  .item-icon-area {
    width: 32px;
    height: 32px;
  }

  .item-type-icon {
    font-size: 16px;
  }

  .item-name-section {
    min-height: 32px;
    padding: 2px;
  }

  .item-name {
    font-size: 10px;
    line-height: 1.3;
  }

  .item-type-label {
    font-size: 8px;
    padding: 2px 4px;
  }

  .item-grade-info {
    font-size: 7px;
    padding: 2px 3px;
  }

  .item-quality-badge {
    font-size: 6px;
    padding: 1px 2px;
  }

  .item-quantity-badge {
    font-size: 8px;
    padding: 1px 4px;
  }

  .currency-grid {
    grid-template-columns: 1fr;
  }

  .currency-card {
    padding: 14px;
  }
}
</style>
