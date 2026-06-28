<template>
  <div class="game-map-panel">
    <!-- 区域地图覆盖层 -->
    <RegionMapPanel
      v-if="activeRegionMap"
      :regionMap="activeRegionMap"
      @close="activeRegionMap = null"
    />

    <!-- 未收录地点：右上角 Badge 按钮（仅非境界分层模式） -->
    <button
      v-if="unmappedNpcs.length > 0 && !activeRegionMap && !realmMapEnabled"
      class="unmapped-badge-btn"
      :class="{ active: showUnmappedPanel }"
      @click="showUnmappedPanel = !showUnmappedPanel"
      :title="`${unmappedNpcs.length} 个 NPC 在未收录地点`"
    >
      ⚠️ {{ unmappedNpcs.length }}
    </button>

    <!-- 未收录地点面板 -->
    <UnmappedLocationsPanel
      :show="showUnmappedPanel"
      :npcs="unmappedNpcs"
      :active-realm-key="realmMapEnabled ? currentRealmKey || undefined : undefined"
      @close="showUnmappedPanel = false"
      @location-added="handleLocationAdded"
    />

    <!-- 境界地图 Tab 栏（仅在境界分层地图模式开启时显示） -->
    <div v-if="realmMapEnabled" class="realm-map-tabs">
      <!-- 已生成的境界 Tab -->
      <button
        v-for="tab in realmTabs"
        :key="tab"
        class="realm-tab-btn"
        :class="{ active: activeRealmTab === tab || (realmTabs.length === 1 && !activeRealmTab) }"
        @click="activeRealmTab = tab"
      >{{ tab }}</button>

      <!-- 生成当前境界地图按钮 -->
      <button
        v-if="playerRealm && !realmTabs.includes(playerRealm)"
        class="realm-tab-btn realm-tab-generate"
        :disabled="isGeneratingRealmMap"
        @click="generateCurrentRealmMap"
      >
        {{ isGeneratingRealmMap ? '生成中...' : `+ 生成${playerRealm}地图` }}
      </button>

      <!-- 重新生成当前境界地图按钮（仅在当前 Tab 有地图时显示） -->
      <button
        v-if="currentRealmHasMap"
        class="realm-tab-btn realm-tab-regenerate"
        :disabled="isGeneratingRealmMap"
        :title="`重新生成【${currentRealmKey}】境界地图（会覆盖当前地图）`"
        @click="confirmRegenerateRealmMap"
      >
        {{ isGeneratingRealmMap ? '重新生成中...' : `重新生成${currentRealmKey}地图` }}
      </button>

      <!-- 未收录地点按钮（境界分层模式：每个境界都显示当前统计） -->
      <button
        v-if="!activeRegionMap"
        class="realm-tab-btn realm-tab-unmapped"
        :class="{ active: showUnmappedPanel }"
        :disabled="unmappedNpcs.length === 0"
        :title="`${unmappedNpcs.length} 个 NPC 在未收录地点`"
        @click="unmappedNpcs.length > 0 && (showUnmappedPanel = !showUnmappedPanel)"
      >
        未收录地点 {{ unmappedNpcs.length }}
      </button>

      <!-- 当地图集为空时的引导提示 -->
      <span v-if="realmTabs.length === 0 && !playerRealm" class="realm-tab-hint">
        请先在游戏中获取境界信息
      </span>
    </div>

    <!-- 重新生成确认弹窗 -->
    <Teleport to="body">
      <div v-if="showRegenerateConfirm" class="realm-regen-overlay" @click.self="showRegenerateConfirm = false">
        <div class="realm-regen-dialog">
          <h3>⚠️ 重新生成确认</h3>
          <p>将重新生成【{{ currentRealmKey }}】境界的世界地图，<br/>当前已有的地点、势力数据将被覆盖，是否继续？</p>
          <div class="realm-regen-actions">
            <button class="realm-regen-cancel" @click="showRegenerateConfirm = false">取消</button>
            <button class="realm-regen-confirm" @click="doRegenerateRealmMap">确认重新生成</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 世界信息头部 -->
    <div v-if="worldBackground" class="world-info-header">
      <div class="world-name">{{ worldName }}</div>
      <div class="world-background">{{ worldBackground }}</div>
    </div>

    <!-- Pixi.js Canvas容器 -->
    <div class="map-container" ref="mapContainerRef">
      <canvas ref="canvasRef"></canvas>

      <!-- 初始化地图按钮 (仅在地图为空时显示) -->
      <div v-if="!hasMapContent && !isInitializing" class="initialize-map-overlay">
        <div class="initialize-prompt">
          <div class="prompt-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="map-icon">
              <path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3V6z" />
              <path d="M9 3v15M15 6v15" />
            </svg>
          </div>
          <h3>地图尚未初始化</h3>
          <p>当前世界还没有生成势力和地点，选择密度后点击按钮开始生成</p>
          <div class="density-selector">
            <label class="density-label">地图密度：</label>
            <div class="density-options">
              <label
                v-for="opt in densityOptions"
                :key="opt.value"
                class="density-option"
                :class="{ active: mapDensity === opt.value }"
              >
                <input type="radio" :value="opt.value" v-model="mapDensity" />
                <span class="option-label">{{ opt.label }}</span>
                <span class="option-desc">{{ opt.desc }}</span>
              </label>
            </div>
          </div>
          <button @click="initializeMap" class="initialize-btn">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="btn-icon">
              <circle cx="12" cy="12" r="10" />
              <path d="M8 12h8M12 8v8" />
            </svg>
            初始化地图
          </button>
        </div>
      </div>

      <!-- 初始化进行中 -->
      <div v-if="isInitializing" class="initialize-map-overlay">
        <div class="initialize-prompt">
          <div class="loading-spinner"></div>
          <h3>正在生成地图内容...</h3>
          <p class="status-text">{{ mapStatus }}</p>
        </div>
      </div>
    </div>

    <!-- 地点信息弹窗 -->
    <div v-if="selectedLocation && !isFactionLocation(selectedLocation)" class="location-popup" :style="popupStyle">
      <div class="popup-header">
        <h4>{{ selectedLocation.name }}</h4>
        <button @click="closePopup" class="close-btn">×</button>
      </div>
      <div class="popup-content">
        <p class="location-type">{{ getLocationTypeName(selectedLocation.type) }}</p>
        <p class="location-desc">{{ selectedLocation.description || selectedLocation.描述 }}</p>
        <div v-if="selectedLocation.danger_level" class="location-detail">
          <strong>安全等级：</strong>{{ selectedLocation.danger_level }}
        </div>
        <div v-if="selectedLocation.suitable_for" class="location-detail">
          <strong>适合境界：</strong>{{ selectedLocation.suitable_for }}
        </div>
        <div v-if="selectedLocation.controlled_by" class="location-detail">
          <strong>控制势力：</strong>{{ selectedLocation.controlled_by }}
        </div>
        <!-- 进入区域地图 -->
        <button
          class="enter-region-btn"
          :class="{ loading: isLoadingRegion }"
          @click="enterRegionMap(selectedLocation)"
          :disabled="isLoadingRegion"
        >
          <span v-if="!isLoadingRegion">🗺️ 进入区域地图</span>
          <span v-else>⏳ 生成中...</span>
        </button>
      </div>
    </div>

    <!-- 势力信息弹窗 -->
    <div v-if="selectedLocation && isFactionLocation(selectedLocation)" class="location-popup faction-popup" :style="popupStyle">
      <div class="popup-header">
        <h4>{{ selectedLocation.name || selectedLocation.名称 }}</h4>
        <button @click="closePopup" class="close-btn">×</button>
      </div>
      <div class="popup-content">
        <p class="location-type">{{ selectedLocation.类型 || selectedLocation.type || '势力' }}</p>
        <p class="location-desc">{{ selectedLocation.description || selectedLocation.描述 }}</p>

        <div v-if="selectedLocation.等级" class="location-detail">
          <strong>势力等级：</strong>{{ selectedLocation.等级 }}
        </div>

        <div v-if="selectedLocation.leadership || selectedLocation.领导层" class="location-detail">
          <strong>掌门：</strong>{{ (selectedLocation.leadership?.宗主 || selectedLocation.领导层?.宗主) }}
          <span v-if="selectedLocation.leadership?.宗主修为 || selectedLocation.领导层?.宗主修为">
            （{{ selectedLocation.leadership?.宗主修为 || selectedLocation.领导层?.宗主修为 }}）
          </span>
        </div>

        <div v-if="selectedLocation.memberCount || selectedLocation.成员数量" class="location-detail">
          <strong>成员数量：</strong>{{ (selectedLocation.memberCount?.total || selectedLocation.成员数量?.总数 || selectedLocation.成员数量?.total) }}人
        </div>

        <div v-if="selectedLocation.特色 && selectedLocation.特色.length > 0" class="location-detail">
          <strong>势力特色：</strong>{{ Array.isArray(selectedLocation.特色) ? selectedLocation.特色.join('、') : selectedLocation.特色 }}
        </div>

        <div v-if="selectedLocation.与玩家关系" class="location-detail">
          <strong>关系：</strong>
          <span :class="getRelationClass(selectedLocation.与玩家关系)">
            {{ selectedLocation.与玩家关系 }}
          </span>
        </div>
      </div>
    </div>

    <!-- 大陆信息弹窗 -->
    <div v-if="selectedContinent" class="location-popup continent-popup" :style="popupStyle">
      <div class="popup-header">
        <h4>{{ selectedContinent.name }}</h4>
        <button @click="closePopup" class="close-btn">×</button>
      </div>
      <div class="popup-content">
        <p class="location-type">大陆</p>
        <p class="location-desc">{{ selectedContinent.description || '广袤的修仙大陆，蕴含无尽机缘与危险。' }}</p>

        <div v-if="selectedContinent.气候" class="location-detail">
          <strong>气候：</strong>{{ selectedContinent.气候 }}
        </div>

        <div v-if="selectedContinent.地理特征 && selectedContinent.地理特征.length > 0" class="location-detail">
          <strong>地理特征：</strong>{{ selectedContinent.地理特征.join('、') }}
        </div>

        <div v-if="selectedContinent.天然屏障 && selectedContinent.天然屏障.length > 0" class="location-detail">
          <strong>天然屏障：</strong>{{ selectedContinent.天然屏障.join('、') }}
        </div>

        <div v-if="selectedContinent.特点" class="location-detail">
          <strong>大陆特点：</strong>{{ selectedContinent.特点 }}
        </div>

        <div v-if="selectedContinent.主要势力 && selectedContinent.主要势力.length > 0" class="location-detail">
          <strong>主要势力：</strong>{{ Array.isArray(selectedContinent.主要势力) ? selectedContinent.主要势力.join('、') : selectedContinent.主要势力 }}
        </div>
      </div>
    </div>

    <!-- 地图图例 -->
    <div class="map-legend" :class="{ collapsed: legendCollapsed }">
      <div class="legend-header" @click="legendCollapsed = !legendCollapsed">
        <div class="legend-title">{{ worldName }}图例{{ props.isOnline ? '（联机）' : '' }}</div>
        <button class="legend-toggle">
          <ChevronUp v-if="!legendCollapsed" :size="16" />
          <ChevronDown v-if="legendCollapsed" :size="16" />
        </button>
      </div>
      <div v-if="!legendCollapsed" class="legend-items">
        <!-- 名山大川 -->
        <div class="legend-item">
          <Mountain :size="16" class="legend-icon mountain" />
          <span>名山大川</span>
        </div>
        <!-- 宗门势力 -->
        <div class="legend-item">
          <Building2 :size="16" class="legend-icon faction" />
          <span>宗门势力</span>
        </div>
        <!-- 城镇坊市 -->
        <div class="legend-item">
          <Store :size="16" class="legend-icon town" />
          <span>城镇坊市</span>
        </div>
        <!-- 洞天福地 -->
        <div class="legend-item">
          <Sparkles :size="16" class="legend-icon blessed" />
          <span>洞天福地</span>
        </div>
        <!-- 奇珍异地 -->
        <div class="legend-item">
          <Gem :size="16" class="legend-icon treasure" />
          <span>奇珍异地</span>
        </div>
        <!-- 凶险之地 -->
        <div class="legend-item">
          <AlertTriangle :size="16" class="legend-icon danger" />
          <span>凶险之地</span>
        </div>
        <!-- 其他特殊 -->
        <div class="legend-item">
          <Zap :size="16" class="legend-icon special" />
          <span>其他特殊</span>
        </div>
        <!-- 玩家位置 -->
        <div class="legend-item">
          <User :size="16" class="legend-icon player" />
          <span>玩家位置</span>
        </div>
        <!-- NPC位置 -->
        <div class="legend-item">
          <Users :size="16" class="legend-icon npc" />
          <span>NPC位置</span>
        </div>
      </div>
    </div>

    <!-- 地图操作按钮 -->
    <div class="map-actions" :class="{ expanded: actionsExpanded }">
      <div class="actions-header" @click="actionsExpanded = !actionsExpanded">
        <Menu :size="16" />
        <span>地图功能</span>
        <ChevronDown v-if="!actionsExpanded" :size="14" class="toggle-icon" />
        <ChevronUp v-else :size="14" class="toggle-icon" />
      </div>
      <div v-if="actionsExpanded" class="actions-content">
        <button
          v-if="hasMapContent"
          @click="showGenerateModal = true"
          class="action-btn"
          :disabled="isGenerating"
        >
          <Plus :size="14" />
          <span>追加生成</span>
        </button>
        <button
          @click="emit('toggle-text-mode')"
          class="action-btn text-mode-btn"
        >
          <FileText :size="14" />
          <span>文字模式</span>
        </button>
      </div>
    </div>

    <!-- 追加生成弹窗 -->
    <div v-if="showGenerateModal" class="generate-modal-overlay" @click.self="showGenerateModal = false">
      <div class="generate-modal">
        <div class="modal-header">
          <h3>追加生成内容</h3>
          <button @click="showGenerateModal = false" class="close-btn">×</button>
        </div>
        <div class="modal-body">
          <div class="generate-option">
            <label>
              <input type="checkbox" v-model="generateOptions.locations" />
              生成地点
            </label>
            <input
              type="number"
              v-model.number="generateOptions.locationCount"
              min="1"
              max="10"
              :disabled="!generateOptions.locations"
              class="count-input"
            />
            <span class="count-label">个</span>
          </div>
          <div class="generate-option">
            <label>
              <input type="checkbox" v-model="generateOptions.factions" />
              生成势力
            </label>
            <input
              type="number"
              v-model.number="generateOptions.factionCount"
              min="1"
              max="5"
              :disabled="!generateOptions.factions"
              class="count-input"
            />
            <span class="count-label">个</span>
          </div>
        </div>
        <div class="modal-footer">
          <button @click="showGenerateModal = false" class="cancel-btn">取消</button>
          <button
            @click="generateAdditionalContent"
            class="confirm-btn"
            :disabled="isGenerating || (!generateOptions.locations && !generateOptions.factions)"
          >
            {{ isGenerating ? '生成中...' : '开始生成' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch } from 'vue';
import { Mountain, Building2, Store, Sparkles, Gem, AlertTriangle, Zap, User, Users, ChevronUp, ChevronDown, Plus, FileText, Menu } from 'lucide-vue-next';
import { GameMapManager } from '@/utils/gameMapManager';
import { normalizeLocationsData, normalizeContinentBounds } from '@/utils/coordinateConverter';
import { useGameStateStore } from '@/stores/gameStateStore';
import { toast } from '@/utils/toast';
import { EnhancedWorldGenerator, generateRealmMap } from '@/utils/worldGeneration/enhancedWorldGenerator';
import { isTavernEnv } from '@/utils/tavern';
import type { WorldLocation } from '@/types/location';
import type { GameCoordinates } from '@/types/gameMap';
import type { NpcProfile, GameTime, WorldInfo } from '@/types/game';
import type { RegionMap } from '@/types/gameMap';
import RegionMapPanel from './RegionMapPanel.vue';
import { generateRegionMap, type RegionNpcLocationHint } from '@/utils/worldGeneration/regionMapGenerator';
import UnmappedLocationsPanel from './UnmappedLocationsPanel.vue';
import type { UnmappedNpc } from './UnmappedLocationsPanel.vue';

// Props
const props = defineProps<{
  isOnline?: boolean;
}>();

// Emits
const emit = defineEmits<{
  (e: 'toggle-text-mode'): void;
}>();

const gameStateStore = useGameStateStore();
const canvasRef = ref<HTMLCanvasElement | null>(null);
const mapContainerRef = ref<HTMLDivElement | null>(null);
const mapManager = ref<GameMapManager | null>(null);
const selectedLocation = ref<WorldLocation | null>(null);
const selectedContinent = ref<any | null>(null);
const mapStatus = ref('初始化中...');
const popupPosition = ref({ x: 0, y: 0 });
const isInitializing = ref(false);
const legendCollapsed = ref(false);
const actionsExpanded = ref(false);

// 追加生成相关
const showGenerateModal = ref(false);
const isGenerating = ref(false);
const generateOptions = ref({
  locations: true,
  locationCount: 3,
  factions: false,
  factionCount: 1
});

// 地图密度配置
type MapDensity = 'sparse' | 'normal' | 'dense';
const mapDensity = ref<MapDensity>('normal');

// ─── 境界地图集状态 ────────────────────────────────────────────────────────────
/** 当前激活的境界 Tab（如 "练气期"） */
const activeRealmTab = ref<string>('');
/** 境界分层地图功能开关（读自 userSettings） */
const realmMapEnabled = computed(() => !!(gameStateStore.userSettings as any)?.['境界分层地图']);
/** 已生成的境界 Tab 名称列表 */
const realmTabs = computed(() => {
  if (!realmMapEnabled.value) return [];
  const col = gameStateStore.realmMapCollection;
  return col ? Object.keys(col) : [];
});
/** 当前正在查看的境界 key（兜底到首个 key，避免 activeRealmTab 为空时丢失上下文） */
const currentRealmKey = computed(() => {
  if (!realmMapEnabled.value) return '';
  const col = gameStateStore.realmMapCollection;
  if (!col || Object.keys(col).length === 0) return '';
  if (activeRealmTab.value && col[activeRealmTab.value]) return activeRealmTab.value;
  return Object.keys(col)[0] || '';
});
/** 当前应展示的 WorldInfo（新模式取境界集合，旧模式取 worldInfo） */
const activeWorldInfo = computed(() => {
  if (!realmMapEnabled.value) return gameStateStore.worldInfo;
  const col = gameStateStore.realmMapCollection;
  if (!col || Object.keys(col).length === 0) return null;
  const key = currentRealmKey.value;
  return key ? col[key] : null;
});
/** 当前激活境界是否已有地图 */
const currentRealmHasMap = computed(() => {
  if (!realmMapEnabled.value) return !!gameStateStore.worldInfo;
  const col = gameStateStore.realmMapCollection;
  return !!(col && currentRealmKey.value && col[currentRealmKey.value]);
});
/** 当前玩家境界名称 */
const playerRealm = computed(() => {
  const attrs = gameStateStore.attributes as any;
  return attrs?.['境界']?.['名称'] || (typeof attrs?.['境界'] === 'string' ? attrs['境界'] : '') || '';
});
/** 境界地图生成中状态 */
const isGeneratingRealmMap = ref(false);

const REALM_ORDER_HINTS: Array<{ token: string; rank: number }> = [
  { token: '凡人', rank: 0 },
  { token: '练气', rank: 1 },
  { token: '筑基', rank: 2 },
  { token: '金丹', rank: 3 },
  { token: '元婴', rank: 4 },
  { token: '化神', rank: 5 },
  { token: '炼虚', rank: 6 },
  { token: '合体', rank: 7 },
  { token: '大乘', rank: 8 },
  { token: '渡劫', rank: 9 },
  { token: '真仙', rank: 10 },
  { token: '金仙', rank: 11 },
  { token: '太乙', rank: 12 },
  { token: '大罗', rank: 13 },
  { token: '淬体', rank: 1 },
  { token: '凝气', rank: 2 },
  { token: '通玄', rank: 3 },
  { token: '化真', rank: 4 },
  { token: '破虚', rank: 5 },
  { token: '登天', rank: 6 },
];

const getRealmOrderRank = (realmName: string): number => {
  const raw = String(realmName || '').trim();
  if (!raw) return -1;
  let best = -1;
  for (const item of REALM_ORDER_HINTS) {
    if (raw.includes(item.token)) {
      best = Math.max(best, item.rank);
    }
  }
  return best;
};

const extractNpcRealmText = (npcData: any): string => {
  const directRealm = npcData?.境界;
  if (typeof directRealm === 'string') return directRealm.trim();
  if (directRealm && typeof directRealm === 'object') {
    const name = String(directRealm?.名称 || '').trim();
    const stage = String(directRealm?.阶段 || '').trim();
    return [name, stage].filter(Boolean).join('');
  }

  const attrRealm = npcData?.属性?.境界;
  if (typeof attrRealm === 'string') return attrRealm.trim();
  if (attrRealm && typeof attrRealm === 'object') {
    const name = String(attrRealm?.名称 || '').trim();
    const stage = String(attrRealm?.阶段 || '').trim();
    return [name, stage].filter(Boolean).join('');
  }

  const fallback = npcData?.realm;
  return typeof fallback === 'string' ? fallback.trim() : '';
};

const extractNpcLocationDesc = (npcData: any): string => {
  const rawPos = npcData?.['当前位置'] ?? npcData?.['位置'];
  if (typeof rawPos === 'string') return rawPos.trim();
  if (rawPos && typeof rawPos === 'object') {
    const desc = rawPos?.['描述'] ?? rawPos?.description;
    return typeof desc === 'string' ? desc.trim() : '';
  }
  return '';
};

const isNpcInTargetRealm = (npcRealmText: string, targetRealm: string): boolean => {
  const npcRealm = String(npcRealmText || '').trim();
  const target = String(targetRealm || '').trim();
  if (!npcRealm || !target) return false;

  const npcRank = getRealmOrderRank(npcRealm);
  const targetRank = getRealmOrderRank(target);
  if (npcRank >= 0 && targetRank >= 0) {
    return npcRank === targetRank;
  }

  return npcRealm.includes(target) || target.includes(npcRealm);
};

/**
 * 收集“当前目标境界 X”的 NPC 位置线索，仅传同境界 NPC（不传 X+n）。
 */
const collectCurrentRealmNpcHints = (targetRealm: string) => {
  const relationships = gameStateStore.relationships;
  if (!relationships || typeof relationships !== 'object') return [];

  const hints: Array<{ 名字: string; 境界: string; 当前位置: string }> = [];
  const seenNames = new Set<string>();

  Object.entries(relationships as Record<string, any>).forEach(([npcName, npcData]) => {
    const realmText = extractNpcRealmText(npcData);
    if (!isNpcInTargetRealm(realmText, targetRealm)) return;

    const locationDesc = extractNpcLocationDesc(npcData);
    if (!locationDesc) return;

    if (seenNames.has(npcName)) return;
    seenNames.add(npcName);
    hints.push({
      名字: npcName,
      境界: realmText || targetRealm,
      当前位置: locationDesc,
    });
  });

  // 控制 token：最多传 80 个 NPC
  return hints.slice(0, 80);
};

/**
 * 收集低境界地图的一二级地点信息，作为高境界地图生成时的世界框架背景。
 * 仅用于提示词上下文，不参与当前地图渲染。
 */
const collectHistoricalMapContext = (targetRealm: string) => {
  const col = gameStateStore.realmMapCollection;
  if (!col || typeof col !== 'object') {
    return {
      historicalContinents: [] as Array<{ 名称: string; 来源境界?: string; 描述?: string }>,
      historicalLocations: [] as Array<{ 名称: string; 类型?: string; 描述?: string; 坐标?: { x: number; y: number }; 来源境界?: string }>,
    };
  }

  const realmKeys = Object.keys(col);
  if (realmKeys.length === 0) {
    return {
      historicalContinents: [] as Array<{ 名称: string; 来源境界?: string; 描述?: string }>,
      historicalLocations: [] as Array<{ 名称: string; 类型?: string; 描述?: string; 坐标?: { x: number; y: number }; 来源境界?: string }>,
    };
  }

  const targetRank = getRealmOrderRank(targetRealm);
  const targetIndex = realmKeys.indexOf(targetRealm);
  const shouldIncludeRealm = (key: string, idx: number): boolean => {
    if (key === targetRealm) return false;
    const rank = getRealmOrderRank(key);
    if (targetRank >= 0 && rank >= 0) return rank < targetRank;
    if (targetIndex >= 0) return idx < targetIndex;
    return true;
  };

  const selectedKeys = realmKeys.filter((key, idx) => shouldIncludeRealm(key, idx));

  const continentSet = new Set<string>();
  const locationSet = new Set<string>();
  const historicalContinents: Array<{ 名称: string; 来源境界?: string; 描述?: string }> = [];
  const historicalLocations: Array<{ 名称: string; 类型?: string; 描述?: string; 坐标?: { x: number; y: number }; 来源境界?: string }> = [];

  selectedKeys.forEach((realmKey) => {
    const wi: any = col[realmKey];

    (wi?.大陆信息 ?? []).forEach((c: any) => {
      const name = String(c?.名称 || c?.name || '').trim();
      if (!name || continentSet.has(name)) return;
      continentSet.add(name);
      historicalContinents.push({
        名称: name,
        来源境界: realmKey,
        描述: String(c?.描述 || c?.description || c?.特点 || '').trim() || undefined,
      });
    });

    (wi?.地点信息 ?? []).forEach((l: any) => {
      const name = String(l?.名称 || l?.name || '').trim();
      if (!name || locationSet.has(name)) return;
      locationSet.add(name);

      const x = resolveNumber(l?.坐标?.x ?? l?.coordinates?.x ?? l?.x);
      const y = resolveNumber(l?.坐标?.y ?? l?.coordinates?.y ?? l?.y);
      historicalLocations.push({
        名称: name,
        类型: String(l?.类型 || l?.type || '').trim() || undefined,
        描述: String(l?.描述 || l?.description || '').trim() || undefined,
        坐标: Number.isFinite(x) && Number.isFinite(y) ? { x: x!, y: y! } : undefined,
        来源境界: realmKey,
      });
    });
  });

  return { historicalContinents, historicalLocations };
};

/**
 * 当前正在编辑/渲染的地图数据。
 * - 旧模式：gameStateStore.worldInfo
 * - 境界分层模式：activeWorldInfo（来自 realmMapCollection）
 */
const getCurrentWorldInfo = (): WorldInfo | null => {
  if (realmMapEnabled.value) return activeWorldInfo.value;
  return gameStateStore.worldInfo;
};

/**
 * 持久化当前地图数据。
 * - 旧模式：写回 worldInfo
 * - 境界分层模式：写回当前激活境界对应的 realmMapCollection[key]
 */
const saveCurrentWorldInfo = (nextWorldInfo: WorldInfo): boolean => {
  if (!realmMapEnabled.value) {
    gameStateStore.updateState('worldInfo', nextWorldInfo);
    return true;
  }

  const key = currentRealmKey.value || playerRealm.value;
  if (!key) {
    toast.error('未找到当前境界地图，无法保存');
    return false;
  }

  const col: Record<string, WorldInfo> = { ...(gameStateStore.realmMapCollection ?? {}) };
  col[key] = nextWorldInfo;
  gameStateStore.realmMapCollection = col;
  if (!activeRealmTab.value) activeRealmTab.value = key;
  return true;
};

// ─── 区域地图状态 ─────────────────────────────────────────────────────────────
const activeRegionMap = ref<RegionMap | null>(null);
const isLoadingRegion = ref(false);

// ─── 未收录地点状态 ────────────────────────────────────────────────────────────
const showUnmappedPanel = ref(false);

/**
 * 计算所有位于「地图未收录地点」的 NPC。
 * 条件：NPC 有位置描述，但描述中的地点（及其上级）都无法精确匹配 worldInfo.地点信息，
 * 只能 fallback 到大陆层级。
 */
const unmappedNpcs = computed((): UnmappedNpc[] => {
  const relationships = gameStateStore.relationships;
  if (!relationships) return [];

  const worldInfo = (getCurrentWorldInfo() ?? gameStateStore.worldInfo) as any;
  const locations: any[] = worldInfo?.地点信息 ?? [];
  const continents: any[] = worldInfo?.大陆信息 ?? [];

  // 全局已收录地点（境界分层模式下遍历整个地图集，避免低境界误报未收录）
  const knownLocationNames = new Set<string>();
  const addLocationName = (loc: any) => {
    const name = String(loc?.名称 || loc?.name || '').trim();
    if (name) knownLocationNames.add(name);
  };

  locations.forEach(addLocationName);

  // 大陆池：当前地图优先，必要时回退到地图集中其他地图，避免当前境界缺大陆导致无法匹配
  const continentPool: any[] = [...continents];
  const knownContinentNames = new Set(
    continentPool
      .map((c: any) => String(c?.名称 || c?.name || '').trim())
      .filter(Boolean)
  );
  const addContinent = (c: any) => {
    const cname = String(c?.名称 || c?.name || '').trim();
    if (!cname || knownContinentNames.has(cname)) return;
    knownContinentNames.add(cname);
    continentPool.push(c);
  };

  if (realmMapEnabled.value) {
    const col = gameStateStore.realmMapCollection;
    if (col && typeof col === 'object') {
      Object.values(col).forEach((wi: any) => {
        (wi?.地点信息 ?? []).forEach(addLocationName);
        (wi?.大陆信息 ?? []).forEach(addContinent);
      });
    }
  }

  // 兼容旧数据：把全局 worldInfo 也纳入“已收录集合”
  const baseWorldInfo = gameStateStore.worldInfo as any;
  (baseWorldInfo?.地点信息 ?? []).forEach(addLocationName);
  (baseWorldInfo?.大陆信息 ?? []).forEach(addContinent);

  const result: UnmappedNpc[] = [];

  for (const [npcName, npcData] of Object.entries(relationships)) {
    const raw = (npcData as any)?.['当前位置'] || (npcData as any)?.['位置'];
    if (!raw || typeof raw !== 'object') continue;

    const desc: string = (raw as any)['描述'] || (raw as any).description || '';
    if (!desc) continue;

    const parts = desc.split('·').map((s: string) => s.trim()).filter(Boolean);
    // 必须至少有 字段1(大陆)·字段2(地点) 两段
    if (parts.length < 2) continue;

    // 字段2 = parts[1]（世界地图地点，如七玄山脉、青云门）
    const field2 = parts[1];
    // 字段3 = parts[2]（区域内建筑，如青石村、沧浪集），可能不存在
    const field3 = parts.length >= 3 ? parts[2] : undefined;

    // 检查字段2是否已精确匹配到地点信息（已收录则跳过）
    const hasExactMatch = knownLocationNames.has(field2);
    if (hasExactMatch) continue; // 字段2已在地图上，不需要添加

    // 匹配大陆（字段1 = parts[0]）
    const field1 = parts[0];
    const matchedContinent = continentPool.find(
      (c: any) => c.名称 === field1 || c.name === field1
    );
    if (!matchedContinent) continue; // 大陆都找不到，跳过

    const continentName: string = matchedContinent.名称 || matchedContinent.name || '';
    const bounds: { x: number; y: number }[] =
      matchedContinent.大洲边界 ?? matchedContinent.continent_bounds ?? [];

    result.push({
      npcName,
      locationDesc: desc,
      locationHint: field2,   // 世界地图要添加的是字段2
      buildingHint: field3,   // 字段3 仅用于面板展示（区域内建筑）
      continentName,
      continentBounds: bounds,
      npcData: npcData as any,
    });
  }

  return result;
});

/** 添加地点成功后，触发 NPC 位置重渲染 */
function handleLocationAdded(_locationName: string) {
  // worldInfo 响应式变化会自动触发 NPC watch 重新渲染
  toast.success(`已将「${_locationName}」添加到世界地图`);
}

/**
 * 解析 NPC 位置路径。
 * 兼容常见分隔符：· - — → > ＞ /
 */
function parseLocationPath(desc: string): string[] {
  return desc
    .split(/[·\-—→>＞/]/)
    .map((s: string) => s.trim())
    .filter(Boolean);
}

/**
 * 收集“当前地点”可用的 NPC 建筑线索：
 * - 仅保留路径第二段 == 当前地点名的记录
 * - 建筑名取路径最后一段（叶子节点）
 */
function collectRegionNpcHints(targetLocationName: string): RegionNpcLocationHint[] {
  const relationships = gameStateStore.relationships;
  if (!relationships || typeof relationships !== 'object') return [];

  const hints: RegionNpcLocationHint[] = [];

  for (const [npcName, npcData] of Object.entries(relationships as Record<string, any>)) {
    const raw = (npcData as any)?.['当前位置'] || (npcData as any)?.['位置'];
    const desc: string = raw?.['描述'] || raw?.description || '';
    if (!desc) continue;

    const parts = parseLocationPath(desc);
    if (parts.length < 3) continue; // 至少 大陆-地点-建筑

    const worldLocation = parts[1];
    if (worldLocation !== targetLocationName) continue;

    const buildingName = parts[parts.length - 1];
    if (!buildingName) continue;

    hints.push({
      npcName,
      fullPath: desc,
      buildingName,
    });

    if (hints.length >= 40) break;
  }

  return hints;
}


/**
 * 点击地点弹窗"进入区域地图"按钮
 * 1. 优先使用缓存；2. 没有则 AI 生成；3. 保存并显示
 */
async function enterRegionMap(location: WorldLocation) {
  const locationName = location.name || (location as any).名称;
  if (!locationName) return;

  // 已有缓存，直接显示
  const cached = gameStateStore.getRegionMap(locationName);
  if (cached) {
    activeRegionMap.value = cached;
    closePopup();
    return;
  }

  // AI 生成
  isLoadingRegion.value = true;
  try {
    const npcLocationHints = collectRegionNpcHints(locationName);

    const result = await generateRegionMap({
      locationName,
      locationType: (location as any).type || (location as any).类型 || '',
      locationDesc: location.description || (location as any).描述 || '',
      npcLocationHints,
    });

    if (result.success && result.regionMap) {
      gameStateStore.saveRegionMap(result.regionMap);
      activeRegionMap.value = result.regionMap;
      closePopup();
    } else {
      console.error('[区域地图] 生成失败', result.errors);
      alert('区域地图生成失败：' + (result.errors?.join(', ') || '未知错误'));
    }
  } catch (e) {
    console.error('[区域地图] 异常', e);
  } finally {
    isLoadingRegion.value = false;
  }
}
const densityOptions: { value: MapDensity; label: string; desc: string }[] = [
  { value: 'sparse', label: '稀疏', desc: '势力3-4个，地点6-8个' },
  { value: 'normal', label: '正常', desc: '势力5-8个，地点12-16个' },
  { value: 'dense', label: '密集', desc: '势力8-12个，地点20-30个' },
];
const densityMultipliers: Record<MapDensity, { faction: number; location: number }> = {
  sparse: { faction: 0.5, location: 0.5 },
  normal: { faction: 1, location: 1 },
  dense: { faction: 1.5, location: 1.5 },
};

const worldName = computed(() => activeWorldInfo.value?.世界名称 || '修仙界');
const worldBackground = computed(() => activeWorldInfo.value?.世界背景 || '');
const mapRenderConfig = computed(() => {
  const mapConfig = (activeWorldInfo.value as any)?.['地图配置'];
  const width = Number(mapConfig?.width) || 10000;
  const height = Number(mapConfig?.height) || 10000;
  const tileSize = Math.max(80, Math.round(Math.min(width, height) / 80));
  return {
    width,
    height,
    tileSize,
    minZoom: 0.1,
    maxZoom: 4,
  };
});
const mapSizeKey = computed(() => `${mapRenderConfig.value.width}x${mapRenderConfig.value.height}`);

const resolveNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const resolveNpcCoordinates = (npcName: string, npcData: any): GameCoordinates | null => {
  const raw = npcData?.['当前位置'] || npcData?.['位置'] || npcData?.coordinates;
  if (!raw || typeof raw !== 'object') return null;

  const rawAny = raw as any;
  const desc: string = rawAny['描述'] || rawAny.description || '';

  // ── 优先级 1：从描述中提取地点名，匹配世界地图已知地点坐标 ────────────
  // 描述格式：大陆·灵境·地点名（从后往前依次尝试，找最精确的）
  if (desc) {
    const worldInfo = getCurrentWorldInfo() ?? gameStateStore.worldInfo;
    const locations: any[] = worldInfo?.地点信息 ?? [];
    const parts = desc.split('·').map((s: string) => s.trim()).filter(Boolean);

    for (let i = parts.length - 1; i >= 0; i--) {
      const hint = parts[i];
      const matched = locations.find(
        (loc: any) => loc.名称 === hint || loc.name === hint
      );
      if (matched) {
        const lx = resolveNumber(matched.坐标?.x ?? matched.x ?? matched.coordinates?.x);
        const ly = resolveNumber(matched.坐标?.y ?? matched.y ?? matched.coordinates?.y);
        if (Number.isFinite(lx) && Number.isFinite(ly)) {
          return { x: lx!, y: ly! };
        }
      }
    }

    // 有描述但地点信息里没匹配到 → 继续尝试匹配大陆（兜底到大陆层级）
    const continents: any[] = worldInfo?.大陆信息 ?? [];
    for (let i = 0; i < parts.length; i++) {
      const hint = parts[i];
      const matchedContinent = continents.find(
        (c: any) => c.名称 === hint || c.name === hint
      );
      if (matchedContinent) {
        // 用大陆边界多边形的重心作为坐标
        const bounds: { x: number; y: number }[] =
          matchedContinent.大洲边界 ?? matchedContinent.continent_bounds ?? [];
        if (bounds.length > 0) {
          const cx = bounds.reduce((s: number, p: any) => s + (p.x ?? 0), 0) / bounds.length;
          const cy = bounds.reduce((s: number, p: any) => s + (p.y ?? 0), 0) / bounds.length;
          if (Number.isFinite(cx) && Number.isFinite(cy)) {
            return { x: cx, y: cy };
          }
        }
      }
    }

    // 描述里所有层级都匹配不到，不显示（避免乱放）
    return null;
  }

  // ── 优先级 2：无描述时，直接用 NPC 自身 x/y ─────────────────────────
  const x = resolveNumber(rawAny.x ?? rawAny['坐标']?.x ?? rawAny.coordinates?.x) ?? NaN;
  const y = resolveNumber(rawAny.y ?? rawAny['坐标']?.y ?? rawAny.coordinates?.y) ?? NaN;

  if (Number.isFinite(x) && Number.isFinite(y)) {
    return { x, y };
  }

  // ── 优先级 3：hash 伪随机兜底（完全无位置信息） ───────────────────────
  const mapConfig = mapRenderConfig.value;
  const seed = `${npcName}`;
  const hash = seed.split('').reduce((a: number, c: string) => a + c.charCodeAt(0), 0);
  const hx = mapConfig.width * 0.3 + (hash % 100) * (mapConfig.width * 0.004);
  const hy = mapConfig.height * 0.3 + ((hash * 7) % 100) * (mapConfig.height * 0.004);

  if (!Number.isFinite(hx) || !Number.isFinite(hy)) return null;
  return { x: hx, y: hy };
};

/**
 * 解析玩家位置坐标。
 * 优先使用位置描述匹配地点坐标，避免仅依赖 location.x/y 导致跨境界地图时坐标陈旧。
 */
const resolvePlayerCoordinates = (locationData: any): GameCoordinates | null => {
  if (!locationData || typeof locationData !== 'object') return null;

  const raw = locationData as any;
  const desc: string = raw['描述'] || raw.description || '';

  // 构造候选世界列表：当前地图优先，其次地图集，再次全局 worldInfo
  const worldCandidates: any[] = [];
  const pushWorld = (wi: any) => {
    if (!wi || typeof wi !== 'object') return;
    if (worldCandidates.includes(wi)) return;
    worldCandidates.push(wi);
  };

  pushWorld(getCurrentWorldInfo());
  if (realmMapEnabled.value) {
    const col = gameStateStore.realmMapCollection;
    if (col && typeof col === 'object') {
      Object.values(col).forEach((wi: any) => pushWorld(wi));
    }
  }
  pushWorld(gameStateStore.worldInfo);

  // ── 优先级 1：按描述匹配地点（从后往前，优先最细粒度） ───────────────────
  if (desc) {
    const parts = parseLocationPath(desc);
    for (const wi of worldCandidates) {
      const locations: any[] = wi?.地点信息 ?? [];
      for (let i = parts.length - 1; i >= 0; i--) {
        const hint = parts[i];
        const matched = locations.find((loc: any) => loc.名称 === hint || loc.name === hint);
        if (matched) {
          const lx = resolveNumber(matched.坐标?.x ?? matched.x ?? matched.coordinates?.x);
          const ly = resolveNumber(matched.坐标?.y ?? matched.y ?? matched.coordinates?.y);
          if (Number.isFinite(lx) && Number.isFinite(ly)) {
            return { x: lx!, y: ly! };
          }
        }
      }
    }

    // ── 优先级 2：玩家自身记录的精确坐标（优于大陆重心兜底，确保铺满后主角标对） ──
    {
      const px = resolveNumber(raw.x ?? raw['坐标']?.x ?? raw.coordinates?.x) ?? NaN;
      const py = resolveNumber(raw.y ?? raw['坐标']?.y ?? raw.coordinates?.y) ?? NaN;
      if (Number.isFinite(px) && Number.isFinite(py)) {
        return { x: px!, y: py! };
      }
    }

    // ── 优先级 3：按描述匹配大陆，使用大陆边界重心兜底 ─────────────────────
    for (const wi of worldCandidates) {
      const continents: any[] = wi?.大陆信息 ?? [];
      const partsForward = parseLocationPath(desc);
      for (const hint of partsForward) {
        const matchedContinent = continents.find((c: any) => c.名称 === hint || c.name === hint);
        if (!matchedContinent) continue;

        const bounds: { x: number; y: number }[] =
          matchedContinent.大洲边界 ?? matchedContinent.continent_bounds ?? [];
        if (bounds.length > 0) {
          const cx = bounds.reduce((s: number, p: any) => s + (p.x ?? 0), 0) / bounds.length;
          const cy = bounds.reduce((s: number, p: any) => s + (p.y ?? 0), 0) / bounds.length;
          if (Number.isFinite(cx) && Number.isFinite(cy)) {
            return { x: cx, y: cy };
          }
        }
      }
    }
  }

  // ── 优先级 4：无描述时回退玩家自身 x/y（若有效） ──────────────────────────
  const x = resolveNumber(raw.x ?? raw['坐标']?.x ?? raw.coordinates?.x) ?? NaN;
  const y = resolveNumber(raw.y ?? raw['坐标']?.y ?? raw.coordinates?.y) ?? NaN;
  if (Number.isFinite(x) && Number.isFinite(y)) {
    return { x, y };
  }

  return null;
};


// 检查地图是否有内容 (地点或势力)
const hasMapContent = computed(() => {
  const wi = activeWorldInfo.value;
  if (!wi) return false;
  const hasLocations = wi.地点信息?.length > 0;
  const hasFactions = wi.势力信息?.length > 0;
  return hasLocations || hasFactions;
});

// 地点类型中文名称映射（支持英文和中文类型）
const locationTypeNames: Record<string, string> = {
  // 英文类型（兼容旧数据）
  natural_landmark: '名山大川',
  sect_power: '宗门势力',
  city_town: '城镇坊市',
  blessed_land: '洞天福地',
  treasure_land: '奇珍异地',
  dangerous_area: '凶险之地',
  special_other: '其他特殊',
  // 中文类型（新数据）
  '名山大川': '名山大川',
  '城镇坊市': '城镇坊市',
  '洞天福地': '洞天福地',
  '奇珍异地': '奇珍异地',
  '凶险之地': '凶险之地',
  '其他特殊': '其他特殊',
};

const getLocationTypeName = (type: string): string => {
  return locationTypeNames[type] || type || '未知类型';
};

/**
 * 判断是否为势力地点
 */
const isFactionLocation = (location: any): boolean => {
  return location.类型 === '修仙宗门' ||
         location.类型 === '魔道宗门' ||
         location.类型 === '修仙世家' ||
         location.类型 === '散修联盟' ||
         location.类型 === '商会' ||
         location.类型 === '妖族势力' ||
         location.type === 'sect_power' ||
         !!location.leadership ||
         !!location.领导层 ||
         !!location.memberCount ||
         !!location.成员数量;
};

/**
 * 获取关系样式类名
 */
const getRelationClass = (relation: string): string => {
  if (relation === '友好' || relation === '盟友') return 'relation-friendly';
  if (relation === '敌对' || relation === '仇敌') return 'relation-hostile';
  return 'relation-neutral';
};

// 弹窗样式
const popupStyle = computed(() => {
  if (!selectedLocation.value && !selectedContinent.value) return {};

  const containerRect = mapContainerRef.value?.getBoundingClientRect();
  if (!containerRect) return {};

  let left = popupPosition.value.x;
  let top = popupPosition.value.y;

  // 确保弹窗不超出容器边界
  const popupWidth = 320; // 最小宽度
  const popupHeight = 200; // 估计高度
  const padding = 20;
  let showBelow = false; // 是否显示在点击位置下方

  // 水平方向调整
  if (left + popupWidth / 2 > containerRect.width - padding) {
    left = containerRect.width - popupWidth / 2 - padding;
  }
  if (left - popupWidth / 2 < padding) {
    left = popupWidth / 2 + padding;
  }

  // 垂直方向调整
  if (top - popupHeight < padding) {
    // 如果上方空间不足，显示在下方
    top = top + 20;
    showBelow = true;
  } else {
    // 显示在上方，添加小间距
    top = top - 10;
  }

  return {
    position: 'absolute',
    left: `${left}px`,
    top: `${top}px`,
    // 上方显示时向上偏移100%，下方显示时不偏移
    transform: showBelow ? 'translate(-50%, 0)' : 'translate(-50%, -100%)',
    zIndex: '2000',
  };
});

const setupMapManager = async () => {
  if (!canvasRef.value || !mapContainerRef.value) return;

  try {
    mapStatus.value = '正在初始化地图...';

    // 等待下一帧，确保 DOM 完全渲染
    await new Promise(resolve => requestAnimationFrame(resolve));

    // 获取容器尺寸并设置 canvas 尺寸
    const rect = mapContainerRef.value.getBoundingClientRect();
    const canvas = canvasRef.value;

    // 确保canvas有有效的尺寸
    if (rect.width === 0 || rect.height === 0) {
      console.warn('[地图] 容器尺寸无效，使用默认值');
      canvas.width = 800;
      canvas.height = 600;
    } else {
      canvas.width = rect.width;
      canvas.height = rect.height;
    }

    console.log('[地图] Canvas 尺寸:', { width: canvas.width, height: canvas.height });

    // 重新初始化地图管理器，确保地图尺寸更新
    mapManager.value?.destroy();
    mapManager.value = new GameMapManager(canvas, mapRenderConfig.value);

    // 监听地图事件
    mapManager.value.on('locationClick', (data: unknown) => {
      handleLocationClick(data);
    });

    mapManager.value.on('continentClick', (data: unknown) => {
      handleContinentClick(data);
    });

    // 加载地图数据
    await loadMapData({ silent: true, reset: true });

    mapStatus.value = '地图加载完成';
  } catch (error) {
    console.error('[地图] 初始化失败:', error);
    mapStatus.value = '地图加载失败';
    const errorMessage = (error as Error).message;

    // 提供更有帮助的错误信息
    if (errorMessage.includes('shader') || errorMessage.includes('WebGL')) {
      toast.error('地图初始化失败：显卡不支持或WebGL被禁用。请尝试更新浏览器或显卡驱动。');
    } else if (errorMessage.includes('canvas')) {
      toast.error('地图初始化失败：Canvas元素无效。请刷新页面重试。');
    } else {
      toast.error('地图初始化失败: ' + errorMessage);
    }
  }
};

onMounted(async () => {
  await setupMapManager();

  // 监听窗口大小变化
  window.addEventListener('resize', handleResize);

  // 监听全屏变化
  document.addEventListener('fullscreenchange', handleFullscreenChange);
});

onUnmounted(() => {
  window.removeEventListener('resize', handleResize);
  document.removeEventListener('fullscreenchange', handleFullscreenChange);
  mapManager.value?.destroy();
});

// 监听玩家位置变化
watch(
  () => gameStateStore.location,
  (newPos) => {
    if (mapManager.value) {
      const playerName = gameStateStore.character?.名字 || '道友';
      const coords = resolvePlayerCoordinates(newPos);
      if (coords) {
        mapManager.value.updatePlayerPosition(coords, playerName);
      } else {
        mapManager.value.clearPlayerMarker();
        console.warn('[地图] 玩家位置坐标无效，已清除玩家标记:', newPos);
      }
    }
  },
  { deep: true }
);

// 监听NPC关系变化，更新NPC位置
watch(
  () => gameStateStore.relationships,
  (relationships) => {
    if (!relationships || !mapManager.value) return;

    const npcs: Array<{ name: string; coordinates: GameCoordinates }> = [];

    Object.entries(relationships).forEach(([npcName, npcData]: [string, any]) => {
      const coords = resolveNpcCoordinates(npcName, npcData);
      if (coords) {
        npcs.push({
          name: npcName,
          coordinates: coords
        });
      }
    });

    mapManager.value.updateNPCPositions(npcs);
  },
  { deep: true }
);

// 监听联机状态，显示被入侵用户（世界主人）的位置
watch(
  () => {
    const online = gameStateStore.onlineState as any;
    return {
      isOnline: props.isOnline,
      ownerLocation: online?.穿越目标?.世界主人位置,
      ownerName: online?.穿越目标?.世界主人档案?.名字 || online?.穿越目标?.主人用户名
    };
  },
  ({ isOnline, ownerLocation, ownerName }) => {
    if (!mapManager.value) return;

    console.log('[地图] 联机状态变化:', { isOnline, ownerLocation, ownerName });

    if (isOnline && ownerLocation) {
      // 尝试从不同格式中提取坐标
      let x = ownerLocation.x ?? ownerLocation.坐标?.x ?? ownerLocation.coordinates?.x;
      let y = ownerLocation.y ?? ownerLocation.坐标?.y ?? ownerLocation.coordinates?.y;

      // 如果坐标缺失，根据地图配置生成一个默认位置（地图中心偏移）
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        console.warn('[地图] 世界主人位置坐标缺失，使用默认位置:', ownerLocation);
        const mapConfig = mapRenderConfig.value;
        // 使用描述的哈希值来生成一个相对固定的位置（避免每次刷新都变化）
        const desc = ownerLocation.描述 || ownerLocation.description || '未知';
        const hash = desc.split('').reduce((a: number, c: string) => a + c.charCodeAt(0), 0);
        x = mapConfig.width * 0.3 + (hash % 100) * (mapConfig.width * 0.004);
        y = mapConfig.height * 0.3 + ((hash * 7) % 100) * (mapConfig.height * 0.004);
      }

      if (Number.isFinite(x) && Number.isFinite(y)) {
        mapManager.value.updateOtherPlayerPosition({ x, y }, ownerName || '世界主人');
        console.log('[地图] 显示世界主人位置:', { x, y, ownerName });
      } else {
        mapManager.value.updateOtherPlayerPosition(null);
      }
    } else {
      // 非联机模式或没有位置信息时清除其他玩家标记
      mapManager.value.updateOtherPlayerPosition(null);
    }
  },
  { deep: true, immediate: true }
);

watch(
  () => mapSizeKey.value,
  (next, prev) => {
    if (!mapManager.value || next === prev) return;
    setupMapManager();
  }
);

// 🔥 修复：使用浅层监听 + 长度检查，避免深度监听导致的无限循环
watch(
  () => [
    activeWorldInfo.value?.大陆信息?.length,
    activeWorldInfo.value?.势力信息?.length,
    activeWorldInfo.value?.地点信息?.length,
    activeRealmTab.value, // Tab 切换时也触发重渲染
  ],
  (newLengths, oldLengths) => {
    // 只有在长度发生变化时才重新加载（避免无限循环）
    if (!mapManager.value || isInitializing.value) return;

    // 检查是否真的有变化
    if (oldLengths && newLengths.every((len, i) => len === oldLengths[i])) {
      return;
    }

    console.log('[地图] 检测到世界数据变化，重新加载地图', { newLengths, oldLengths });
    loadMapData({ silent: true, reset: true });
  }
);

/**
 * 生成当前境界的世界地图（境界地图集模式专用）
 */
const generateCurrentRealmMap = async (overwrite = false) => {
  const realm = overwrite
    ? (currentRealmKey.value || playerRealm.value)
    : (playerRealm.value || currentRealmKey.value);
  if (!realm) {
    toast.error('无法获取当前境界信息');
    return;
  }

  if (isGeneratingRealmMap.value) return;
  isGeneratingRealmMap.value = true;

  try {
    toast.info(`正在为【${realm}】境界生成专属地图...`);
    const attrs = gameStateStore.attributes as any;
    const charInfo = gameStateStore.character as any;
    const existingWorldInfo = getCurrentWorldInfo() ?? gameStateStore.worldInfo;
    const { historicalContinents, historicalLocations } = collectHistoricalMapContext(realm);
    const npcHints = collectCurrentRealmNpcHints(realm);
    console.log('[境界地图] 生成上下文统计:', {
      realm,
      npcHints: npcHints.length,
      historicalContinents: historicalContinents.length,
      historicalLocations: historicalLocations.length,
    });

    const result = await generateRealmMap({
      playerRealm: realm,
      // 用世界背景提供境界体系上下文（AI 从中推断完整修炼序列）
      playerRealmContext: existingWorldInfo?.世界背景 || realm,
      playerBackground: charInfo?.['背景'] || charInfo?.['出身'] || '',
      playerFaction: charInfo?.['宗门'] || attrs?.['宗门'] || '',
      playerLocation: (gameStateStore.location as any)?.['描述'] || '',
      worldName: existingWorldInfo?.世界名称,
      worldBackground: existingWorldInfo?.世界背景,
      worldEra: existingWorldInfo?.世界纪元,
      npcHints,
      historicalContinents,
      historicalLocations,
    });

    if (result.success && result.worldInfo) {
      const col: Record<string, WorldInfo> = { ...(gameStateStore.realmMapCollection ?? {}) };
      if (!overwrite && col[realm]) {
        // 理论上不会走到这里（UI 已做过滤），但作双重保险
        toast.error(`【${realm}】已有地图，请使用重新生成功能`);
        return;
      }
      col[realm] = result.worldInfo;
      gameStateStore.realmMapCollection = col;
      activeRealmTab.value = realm;
      await loadMapData({ silent: true, reset: true });
      toast.success(`【${realm}】境界地图生成完成！`);
    } else {
      toast.error('地图生成失败：' + (result.errors?.join(', ') || '未知错误'));
    }
  } catch (e) {
    console.error('[境界地图] 生成异常', e);
    toast.error('地图生成发生异常');
  } finally {
    isGeneratingRealmMap.value = false;
  }
};

/** 重新生成确认弹窗状态 */
const showRegenerateConfirm = ref(false);

/**
 * 重新生成当前激活境界的地图（先弹出确认提示）
 */
const confirmRegenerateRealmMap = () => {
  showRegenerateConfirm.value = true;
};

const doRegenerateRealmMap = async () => {
  showRegenerateConfirm.value = false;
  await generateCurrentRealmMap(true);
};

/**
 * 旧存档自动迁移：当第一次开启境界分层地图模式时，
 * 将现有的 worldInfo 作为"当前境界"的初始地图导入地图集
 */
watch(
  () => realmMapEnabled.value,
  (enabled) => {
    if (!enabled) return;
    const col = gameStateStore.realmMapCollection;
    const hasCollection = col && Object.keys(col).length > 0;
    if (hasCollection) return; // 已有数据，无需迁移

    const wi = gameStateStore.worldInfo;
    if (!wi || (!wi.势力信息?.length && !wi.地点信息?.length)) return;

    // 以当前玩家境界为 key（若没有则用 "初始境界"）
    const key = playerRealm.value || '初始境界';
    const newCol: Record<string, WorldInfo> = { [key]: wi };
    gameStateStore.realmMapCollection = newCol;
    activeRealmTab.value = key;
    toast.info(`已将现有地图迁移至【${key}】境界地图集`);
    console.log('[境界地图] 旧存档自动迁移完成', key);
  },
  { immediate: true }
);

/**
 * 初始化地图 - 生成势力和地点
 */
const initializeMap = async () => {
  const worldInfo = getCurrentWorldInfo();
  if (!worldInfo) {
    toast.error('未找到世界信息');
    return;
  }
  if (isScenarioModMapLocked(worldInfo)) {
    toast.warning('当前为剧本模组正典地图，已禁止随机初始化覆盖。');
    return;
  }

  isInitializing.value = true;
  mapStatus.value = '开始生成地图内容...';

  try {
    const continentCount = worldInfo.大陆信息?.length || 3;
    const multiplier = densityMultipliers[mapDensity.value];
    const factionCount = Math.max(3, Math.round(continentCount * 2 * multiplier.faction));
    const locationCount = Math.max(6, Math.round(continentCount * 4 * multiplier.location));
    const secretRealmsCount = Math.max(2, Math.round(locationCount * 0.25));
    const mapConfig = (worldInfo as any)?.['地图配置'] || {
      width: mapRenderConfig.value.width,
      height: mapRenderConfig.value.height,
      minLng: 0,
      maxLng: mapRenderConfig.value.width,
      minLat: 0,
      maxLat: mapRenderConfig.value.height,
    };

    console.log(`[地图] 密度: ${mapDensity.value}, 势力: ${factionCount}, 地点: ${locationCount}`);

    // 🔥 随机判断是否生成合欢宗（30%概率，仅酒馆环境）
    const shouldGenerateHehuan = isTavernEnv() && Math.random() < 0.3;
    if (shouldGenerateHehuan) {
      console.log('[地图] 🎲 随机触发合欢宗彩蛋');
    }

    // 创建世界生成器
    const generator = new EnhancedWorldGenerator({
      worldName: worldInfo.世界名称,
      worldBackground: worldInfo.世界背景,
      worldEra: worldInfo.世界纪元 || '修真盛世',
      factionCount: factionCount,
      locationCount: locationCount,
      secretRealmsCount: secretRealmsCount,
      continentCount: continentCount,
      mapConfig: mapConfig,
      maxRetries: 3,
      retryDelay: 1000,
      enableHehuanEasterEgg: shouldGenerateHehuan, // 🔥 根据随机结果决定是否生成合欢宗
      onStreamChunk: (chunk: string) => {
        // 更新生成状态显示
        mapStatus.value = chunk;
      }
    });

    console.log('[地图] 开始生成地图内容...');
    const result = await generator.generateValidatedWorld();

    if (result.success && result.worldInfo) {
      console.log('[地图] 地图生成成功，正在更新游戏状态...');

      // 保留现有的大陆信息，只更新势力和地点
      const updatedWorldInfo = {
        ...worldInfo,
        势力信息: result.worldInfo.势力信息 || [],
        地点信息: result.worldInfo.地点信息 || [],
      };

      // 更新游戏状态（境界分层模式下写回当前境界地图）
      if (!saveCurrentWorldInfo(updatedWorldInfo)) {
        return;
      }

      // 🔥 如果触发了合欢宗彩蛋，创建灰夫人NPC
      if (shouldGenerateHehuan) {
        const hehuanSect = (result.worldInfo.势力信息 || []).find(
          (f: any) => String(f.名称 || f.name || '').includes('合欢')
        );
        const sectName = hehuanSect?.名称 || (hehuanSect as any)?.name || '合欢宗';
        const gameTime = gameStateStore.gameTime as GameTime;
        const greyLady: NpcProfile = {
          名字: "灰夫人(合欢圣女)",
          性别: "女",
          出生日期: { 年: (gameTime?.年 || 1000) - 200, 月: 1, 日: 1 },
          种族: "人族",
          出生: "合欢宗",
          外貌描述: "身材极度丰满，拥有夸张的丰乳肥臀，腰肢纤细如蛇。面容妖媚，眼神含春，举手投足间散发着惊人的魅惑力。身着轻薄纱衣，曼妙身姿若隐若现。",
          性格特征: ["平易近人", "开放", "双性恋", "M体质", "S体质", "痴女(潜在)"],
          境界: { 名称: "金丹", 阶段: "圆满", 当前进度: 0, 下一级所需: 100, 突破描述: "阴阳调和，丹破婴生" },
          灵根: { name: "天阴灵根", tier: "天品" } as any,
          天赋: [{ name: "合欢圣体", description: "天生媚骨，极适合双修，采补效果翻倍" }] as any,
          先天六司: { 根骨: 8, 灵性: 9, 悟性: 8, 气运: 7, 魅力: 10, 心性: 5 },
          属性: {
            气血: { 当前: 5000, 上限: 5000 },
            灵气: { 当前: 8000, 上限: 8000 },
            神识: { 当前: 3000, 上限: 3000 },
            寿元上限: 500
          },
          与玩家关系: "陌生人",
          好感度: 10,
          当前位置: { 描述: `${sectName}驻地` },
          势力归属: sectName,
          人格底线: [],
          记忆: [
            "我是合欢宗的圣女，人称灰夫人。",
            "我的真实姓名是一个秘密，只有真正征服我的人才能知道。",
            "我渴望体验世间极致的快乐与痛苦，无论是给予还是接受。"
          ],
          当前外貌状态: "衣衫半解，媚眼如丝",
          当前内心想法: "观察着周围的人，寻找能让我感兴趣的猎物",
          背包: { 灵石: { 下品: 5000, 中品: 500, 上品: 50, 极品: 0 }, 物品: {} },
          实时关注: true,
          私密信息: {
            是否为处女: true,
            身体部位: [
              { 部位名称: "后庭", 特征描述: "九曲回廊，紧致幽深，内壁褶皱繁复，仿佛能吞噬一切", 敏感度: 80, 开发度: 0, 特殊印记: "未开发", 反应描述: "稍有触碰便轻颤，呼吸凌乱", 偏好刺激: "缓慢深入与节奏变化", 禁忌: "粗暴扩张" },
              { 部位名称: "阴道", 特征描述: "春水玉壶，名器天成，常年湿润，紧致如初", 敏感度: 90, 开发度: 0, 特殊印记: "白虎", 反应描述: "情绪一动便春水泛滥", 偏好刺激: "前戏充足与温热指探", 禁忌: "敷衍草率" },
              { 部位名称: "腰部", 特征描述: "七寸盘蛇，柔若无骨，可做出任何高难度姿势", 敏感度: 70, 开发度: 0 },
              { 部位名称: "手", 特征描述: "纤手观音，指若削葱，灵活多变，擅长挑逗", 敏感度: 60, 开发度: 0 },
              { 部位名称: "足", 特征描述: "玲珑鸳鸯，弓足如玉，脚趾圆润可爱，足弓优美", 敏感度: 85, 开发度: 0 },
              { 部位名称: "嘴", 特征描述: "如意鱼唇，樱桃小口，舌头灵活，深喉天赋异禀", 敏感度: 75, 开发度: 0 },
              { 部位名称: "胸部", 特征描述: "乳燕玉峰，波涛汹涌，乳晕粉嫩，乳头敏感易硬", 敏感度: 95, 开发度: 0 },
            ],
            性格倾向: "开放且顺从(待调教)",
            性取向: "双性恋",
            性经验等级: "资深",
            亲密节奏: "快慢随心，重视前戏与情绪引导",
            亲密需求: "渴望征服与被征服的拉扯感",
            安全偏好: "边界沟通+安全词+禁术防护",
            避孕措施: "避孕丹/隔绝阵",
            性癖好: ["吞精","BDSM", "足交", "乳交", "捆绑", "调教", "采补", "角色扮演", "支配", "被支配", "露出", "放尿", "凌辱", "刑具"],
            亲密偏好: ["前戏充分", "情话引导", "视觉挑逗", "角色扮演", "掌控节奏"],
            禁忌清单: ["毫无沟通", "粗暴撕扯", "当众羞辱"],
            性渴望程度: 80,
            当前性状态: "渴望",
            体液分泌状态: "充沛",
            性交总次数: 128,
            性伴侣名单: [],
            最近一次性行为时间: "无",
            生育状态: { 是否可孕: true, 当前状态: "未怀孕" },
            特殊体质: ["合欢圣体", "名器合集"]
          }
        };
        const currentRelations = gameStateStore.relationships || {};
        if (!currentRelations[greyLady.名字]) {
          gameStateStore.updateState('relationships', {
            ...currentRelations,
            [greyLady.名字]: greyLady
          });
          console.log('[地图] 🎲 合欢宗彩蛋：已生成灰夫人NPC');
        }
      }

      // 重新加载地图数据
      await loadMapData({ reset: true });

      toast.success('地图初始化完成！');
      console.log('[地图] 地图初始化完成');
    } else {
      const errorMsg = result.errors?.join(', ') || '生成失败';
      toast.error(`地图生成失败: ${errorMsg}`);
      console.error('[地图] 生成失败:', result.errors);
    }
  } catch (error) {
    console.error('[地图] 初始化失败:', error);
    toast.error('地图初始化失败: ' + (error as Error).message);
  } finally {
    isInitializing.value = false;
    mapStatus.value = '初始化完成';
  }
};

/**
 * 追加生成地点/势力
 */
const generateAdditionalContent = async () => {
  const worldInfo = getCurrentWorldInfo();
  if (!worldInfo) {
    toast.error('未找到世界信息');
    return;
  }
  if (isScenarioModMapLocked(worldInfo)) {
    toast.warning('当前为剧本模组正典地图，已禁止追加随机势力或地点。');
    return;
  }

  const { locations, locationCount, factions, factionCount } = generateOptions.value;
  if (!locations && !factions) {
    toast.warning('请至少选择一种生成类型');
    return;
  }

  isGenerating.value = true;
  showGenerateModal.value = false;

  try {
    const mapConfig = (worldInfo as any)?.['地图配置'] || {
      width: mapRenderConfig.value.width,
      height: mapRenderConfig.value.height,
    };

    // 🔥 随机判断是否生成合欢宗（30%概率，仅酒馆环境且生成势力时）
    const shouldGenerateHehuan = factions && isTavernEnv() && Math.random() < 0.3;
    if (shouldGenerateHehuan) {
      console.log('[地图] 🎲 追加生成：随机触发合欢宗彩蛋');
    }

    const generator = new EnhancedWorldGenerator({
      worldName: worldInfo.世界名称,
      worldBackground: worldInfo.世界背景,
      worldEra: worldInfo.世界纪元 || '修真盛世',
      factionCount: factions ? factionCount : 0,
      locationCount: locations ? locationCount : 0,
      secretRealmsCount: 0,
      continentCount: worldInfo.大陆信息?.length || 1,
      mapConfig: mapConfig,
      maxRetries: 2,
      retryDelay: 500,
      enableHehuanEasterEgg: shouldGenerateHehuan,
      existingFactions: worldInfo.势力信息?.map((f: any) => ({
        名称: f.名称 || f.name,
        位置: f.位置 || f.location,
        势力范围: f.势力范围 || f.territory
      })) || [],
      existingLocations: worldInfo.地点信息?.map((l: any) => ({
        名称: l.名称 || l.name,
        coordinates: l.coordinates || l.坐标
      })) || []
    });

    const result = await generator.generateValidatedWorld();

    if (result.success && result.worldInfo) {
      // 合并新生成的内容到现有数据
      const newFactions = result.worldInfo.势力信息 || [];
      const newLocations = result.worldInfo.地点信息 || [];

      const updatedWorldInfo = {
        ...worldInfo,
        势力信息: [...(worldInfo.势力信息 || []), ...newFactions],
        地点信息: [...(worldInfo.地点信息 || []), ...newLocations],
      };

      if (!saveCurrentWorldInfo(updatedWorldInfo)) {
        return;
      }

      // 🔥 如果触发了合欢宗彩蛋，创建灰夫人NPC
      if (shouldGenerateHehuan) {
        const hehuanSect = newFactions.find(
          (f: any) => String(f.名称 || f.name || '').includes('合欢')
        );
        const sectName = hehuanSect?.名称 || (hehuanSect as any)?.name || '合欢宗';
        const gameTime = gameStateStore.gameTime as GameTime;
        const greyLady: NpcProfile = {
          名字: "灰夫人(合欢圣女)",
          性别: "女",
          出生日期: { 年: (gameTime?.年 || 1000) - 200, 月: 1, 日: 1 },
          种族: "人族",
          出生: "合欢宗",
          外貌描述: "身材极度丰满，拥有夸张的丰乳肥臀，腰肢纤细如蛇。面容妖媚，眼神含春，举手投足间散发着惊人的魅惑力。身着轻薄纱衣，曼妙身姿若隐若现。",
          性格特征: ["平易近人", "开放", "双性恋", "M体质", "S体质", "痴女(潜在)"],
          境界: { 名称: "金丹", 阶段: "圆满", 当前进度: 0, 下一级所需: 100, 突破描述: "阴阳调和，丹破婴生" },
          灵根: { name: "天阴灵根", tier: "天品" } as any,
          天赋: [{ name: "合欢圣体", description: "天生媚骨，极适合双修，采补效果翻倍" }] as any,
          先天六司: { 根骨: 8, 灵性: 9, 悟性: 8, 气运: 7, 魅力: 10, 心性: 5 },
          属性: {
            气血: { 当前: 5000, 上限: 5000 },
            灵气: { 当前: 8000, 上限: 8000 },
            神识: { 当前: 3000, 上限: 3000 },
            寿元上限: 500
          },
          与玩家关系: "陌生人",
          好感度: 10,
          当前位置: { 描述: `${sectName}驻地` },
          势力归属: sectName,
          人格底线: [],
          记忆: [
            "我是合欢宗的圣女，人称灰夫人。",
            "我的真实姓名是一个秘密，只有真正征服我的人才能知道。",
            "我渴望体验世间极致的快乐与痛苦，无论是给予还是接受。"
          ],
          当前外貌状态: "衣衫半解，媚眼如丝",
          当前内心想法: "观察着周围的人，寻找能让我感兴趣的猎物",
          背包: { 灵石: { 下品: 5000, 中品: 500, 上品: 50, 极品: 0 }, 物品: {} },
          实时关注: true,
          私密信息: {
            是否为处女: true,
            身体部位: [
              { 部位名称: "后庭", 特征描述: "九曲回廊，紧致幽深，内壁褶皱繁复，仿佛能吞噬一切", 敏感度: 80, 开发度: 0, 特殊印记: "未开发", 反应描述: "稍有触碰便轻颤，呼吸凌乱", 偏好刺激: "缓慢深入与节奏变化", 禁忌: "粗暴扩张" },
              { 部位名称: "阴道", 特征描述: "春水玉壶，名器天成，常年湿润，紧致如初", 敏感度: 90, 开发度: 0, 特殊印记: "白虎", 反应描述: "情绪一动便春水泛滥", 偏好刺激: "前戏充足与温热指探", 禁忌: "敷衍草率" },
              { 部位名称: "腰部", 特征描述: "七寸盘蛇，柔若无骨，可做出任何高难度姿势", 敏感度: 70, 开发度: 0 },
              { 部位名称: "手", 特征描述: "纤手观音，指若削葱，灵活多变，擅长挑逗", 敏感度: 60, 开发度: 0 },
              { 部位名称: "足", 特征描述: "玲珑鸳鸯，弓足如玉，脚趾圆润可爱，足弓优美", 敏感度: 85, 开发度: 0 },
              { 部位名称: "嘴", 特征描述: "如意鱼唇，樱桃小口，舌头灵活，深喉天赋异禀", 敏感度: 75, 开发度: 0 },
              { 部位名称: "胸部", 特征描述: "乳燕玉峰，波涛汹涌，乳晕粉嫩，乳头敏感易硬", 敏感度: 95, 开发度: 0 },
            ],
            性格倾向: "开放且顺从(待调教)",
            性取向: "双性恋",
            性经验等级: "资深",
            亲密节奏: "快慢随心，重视前戏与情绪引导",
            亲密需求: "渴望征服与被征服的拉扯感",
            安全偏好: "边界沟通+安全词+禁术防护",
            避孕措施: "避孕丹/隔绝阵",
            性癖好: ["BDSM", "足交", "乳交", "捆绑", "调教", "采补", "角色扮演", "支配", "被支配", "露出", "放尿", "凌辱", "刑具"],
            亲密偏好: ["前戏充分", "情话引导", "视觉挑逗", "角色扮演", "掌控节奏"],
            禁忌清单: ["毫无沟通", "粗暴撕扯", "当众羞辱"],
            性渴望程度: 80,
            当前性状态: "渴望",
            体液分泌状态: "充沛",
            性交总次数: 128,
            性伴侣名单: [],
            最近一次性行为时间: "无",
            生育状态: { 是否可孕: true, 当前状态: "未怀孕" },
            特殊体质: ["合欢圣体", "名器合集"]
          }
        };
        const currentRelations = gameStateStore.relationships || {};
        if (!currentRelations[greyLady.名字]) {
          gameStateStore.updateState('relationships', {
            ...currentRelations,
            [greyLady.名字]: greyLady
          });
          console.log('[地图] 🎲 追加生成：合欢宗彩蛋已生成灰夫人NPC');
        }
      }

      await loadMapData({ reset: true });

      const msg = [];
      if (newFactions.length) msg.push(`${newFactions.length}个势力`);
      if (newLocations.length) msg.push(`${newLocations.length}个地点`);
      toast.success(`已追加生成: ${msg.join('、')}`);
    } else {
      toast.error('生成失败: ' + (result.errors?.join(', ') || '未知错误'));
    }
  } catch (error) {
    console.error('[地图] 追加生成失败:', error);
    toast.error('生成失败: ' + (error as Error).message);
  } finally {
    isGenerating.value = false;
  }
};

function isScenarioModMapLocked(worldInfo: any): boolean {
  const runtimeMode = (gameStateStore.saveData as any)?.世界?.状态?.剧本模组?.mode;
  const extensionMode = (gameStateStore.saveData as any)?.系统?.扩展?.剧本模组?.mode;
  const mapLock = worldInfo?.剧本地图?.locked;
  return runtimeMode === 'strict' || extensionMode === 'strict' || mapLock === true;
}

/**
 * 加载地图数据
 */
const loadMapData = async (options?: { silent?: boolean; reset?: boolean }) => {
  try {
    const { silent = false, reset = true } = options ?? {};
    mapStatus.value = '正在加载世界数据...';

    const worldInfo = getCurrentWorldInfo() ?? gameStateStore.worldInfo;
    if (!worldInfo) {
      if (!silent) {
        toast.warning('未找到世界数据');
      }
      mapStatus.value = '未找到世界数据';
      return;
    }

    if (reset) {
      mapManager.value?.clear();
    }

    const mapConfig = mapRenderConfig.value;
    let locationCount = 0;

    // 加载大陆
    if (worldInfo.大陆信息 && Array.isArray(worldInfo.大陆信息)) {
      worldInfo.大陆信息.forEach((continent: any) => {
        try {
          // 标准化大陆边界坐标
          if (continent.大洲边界 || continent.continent_bounds) {
            const bounds = continent.大洲边界 || continent.continent_bounds;
            continent.continent_bounds = normalizeContinentBounds(bounds, mapConfig.width, mapConfig.height);
            continent.大洲边界 = continent.continent_bounds;
          }
          mapManager.value?.addContinent(continent);
        } catch (error) {
          console.error('[地图] 加载大陆失败:', continent, error);
        }
      });
      console.log(`[地图] 已加载 ${worldInfo.大陆信息.length} 个大陆`);
    }

    // 加载势力（带势力范围）
    if (worldInfo.势力信息 && Array.isArray(worldInfo.势力信息)) {
      const factions = normalizeLocationsData(worldInfo.势力信息, mapConfig);
      factions.forEach((faction: WorldLocation) => {
        try {
          // 只添加势力范围，不添加地点标记（避免与地点信息重复）
          if (faction.territoryBounds && faction.territoryBounds.length >= 3) {
            mapManager.value?.addTerritory(faction);
          }
          // 不再自动为势力创建地点标记，地点由"地点信息"数组统一管理
        } catch (error) {
          console.error('[地图] 加载势力失败:', faction, error);
        }
      });
      console.log(`[地图] 已加载 ${factions.length} 个势力范围`);
    }

    // 加载地点（包括所有类型）
    if (worldInfo.地点信息 && Array.isArray(worldInfo.地点信息)) {
      const locations = normalizeLocationsData(worldInfo.地点信息, mapConfig);
      locations.forEach((location: WorldLocation) => {
        try {
          mapManager.value?.addLocation(location);
          locationCount++;
        } catch (error) {
          console.error('[地图] 加载地点失败:', location, error);
        }
      });
      console.log(`[地图] 已加载 ${locations.length} 个地点`);
    }

    // 更新玩家位置
    const playerPos = gameStateStore.location;
    const playerName = gameStateStore.character?.名字 || '道友';
    const playerCoords = resolvePlayerCoordinates(playerPos);
    if (playerCoords) {
      mapManager.value?.updatePlayerPosition(playerCoords, playerName);
      console.log('[地图] 已更新玩家位置', { playerCoords, desc: (playerPos as any)?.描述 });
    } else {
      mapManager.value?.clearPlayerMarker();
      console.warn('[地图] 玩家位置未能解析到有效坐标，已清除玩家标记:', playerPos);
    }

    // 更新NPC位置（从关系数据中提取）
    const relationships = gameStateStore.relationships;
    if (relationships && typeof relationships === 'object') {
      const npcs: Array<{ name: string; coordinates: GameCoordinates }> = [];

      Object.entries(relationships).forEach(([npcName, npcData]: [string, any]) => {
        const coords = resolveNpcCoordinates(npcName, npcData);
        if (coords) {
          npcs.push({
            name: npcName,
            coordinates: coords
          });
        }
      });

      if (npcs.length > 0) {
        mapManager.value?.updateNPCPositions(npcs);
        console.log(`[Map] Updated ${npcs.length} NPC positions`);
      }
    }

    if (props.isOnline) {
      const online = gameStateStore.onlineState as any;
      const ownerLocation = online?.穿越目标?.世界主人位置;
      const ownerName = online?.穿越目标?.世界主人档案?.名字 || online?.穿越目标?.主人用户名;

      console.log('[地图] loadMapData 检查世界主人位置:', { isOnline: props.isOnline, ownerLocation, ownerName });

      if (ownerLocation) {
        let x = ownerLocation.x ?? ownerLocation.坐标?.x ?? ownerLocation.coordinates?.x;
        let y = ownerLocation.y ?? ownerLocation.坐标?.y ?? ownerLocation.coordinates?.y;

        if (!Number.isFinite(x) || !Number.isFinite(y)) {
          const desc = ownerLocation.描述 || ownerLocation.description || '未知';
          const hash = desc.split('').reduce((a: number, c: string) => a + c.charCodeAt(0), 0);
          x = mapConfig.width * 0.3 + (hash % 100) * (mapConfig.width * 0.004);
          y = mapConfig.height * 0.3 + ((hash * 7) % 100) * (mapConfig.height * 0.004);
        }

        if (Number.isFinite(x) && Number.isFinite(y)) {
          mapManager.value?.updateOtherPlayerPosition({ x, y }, ownerName || '世界主人');
          console.log('[地图] 已更新世界主人位置:', { x, y, ownerName });
        }
      }
    }

    mapStatus.value = `已加载 ${locationCount} 个地点`;
    if (!silent) {
      toast.success('地图加载完成');
    }
  } catch (error) {
    console.error('[地图] 加载数据失败:', error);
    mapStatus.value = '数据加载失败';
    toast.error('加载地图数据失败: ' + (error as Error).message);
  }
};

/**
 * 处理地点点击
 */
const handleLocationClick = (data: unknown) => {
  console.log('[地图] handleLocationClick 被调用，data:', data);

  if (!data) {
    console.warn('[地图] 点击数据为空');
    return;
  }

  const locationData = data as any;

  // 清除大陆选择
  selectedContinent.value = null;

  // 设置选中的地点
  selectedLocation.value = locationData.location || locationData;
  console.log('[地图] selectedLocation 已设置:', selectedLocation.value);

  // 使用点击位置作为弹窗位置
  if (locationData.clickPosition) {
    popupPosition.value = {
      x: locationData.clickPosition.x,
      y: locationData.clickPosition.y,
    };
    console.log('[地图] 弹窗位置（点击位置）:', popupPosition.value);
  }
};

/**
 * 处理大陆点击
 */
const handleContinentClick = (data: unknown) => {
  console.log('[地图] handleContinentClick 被调用，data:', data);

  if (!data) {
    console.warn('[地图] 点击数据为空');
    return;
  }

  const continentData = data as any;

  // 清除地点选择
  selectedLocation.value = null;

  // 设置选中的大陆
  selectedContinent.value = continentData;
  console.log('[地图] selectedContinent 已设置:', selectedContinent.value);

  // 使用点击位置作为弹窗位置
  if (continentData.clickPosition) {
    popupPosition.value = {
      x: continentData.clickPosition.x,
      y: continentData.clickPosition.y,
    };
    console.log('[地图] 弹窗位置（点击位置）:', popupPosition.value);
  }
};

/**
 * 关闭弹窗
 */
const closePopup = () => {
  selectedLocation.value = null;
  selectedContinent.value = null;
};

/**
 * 处理窗口大小变化
 */
const handleResize = () => {
  if (mapContainerRef.value && mapManager.value) {
    try {
      const rect = mapContainerRef.value.getBoundingClientRect();
      mapManager.value.resize(rect.width, rect.height);
    } catch (e) {
      // 忽略 resize 过程中的错误
      console.warn('[地图] Resize 错误（已忽略）:', e);
    }
  }
};

/**
 * 处理全屏状态变化
 */
const handleFullscreenChange = () => {
  // 全屏状态变化时可能需要调整地图大小
  handleResize();
};
</script>

<style scoped>
.game-map-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  position: relative;
  overflow: hidden;
  background: var(--color-background);
}

/* 世界信息头部 */
.world-info-header {
  padding: 12px 16px;
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}

.world-name {
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--color-primary);
  white-space: nowrap;
}

.world-background {
  font-size: 0.85rem;
  color: var(--color-text-secondary);
  max-width: 400px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ─── 境界地图 Tab 栏 ─────────────────────────────────────────────────────────── */
.realm-map-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 8px 12px;
  background: rgba(0, 0, 0, 0.3);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  z-index: 10;
}
.realm-tab-btn {
  padding: 4px 14px;
  border-radius: 20px;
  font-size: 13px;
  cursor: pointer;
  border: 1px solid rgba(180, 140, 80, 0.4);
  background: rgba(100, 70, 20, 0.2);
  color: rgba(220, 180, 100, 0.85);
  transition: all 0.2s;
}
.realm-tab-btn:hover:not(:disabled) {
  background: rgba(140, 100, 30, 0.4);
  border-color: rgba(220, 170, 80, 0.7);
  color: rgba(255, 210, 120, 1);
}
.realm-tab-btn.active {
  background: rgba(180, 130, 40, 0.5);
  border-color: rgba(220, 170, 80, 0.9);
  color: rgba(255, 220, 140, 1);
  font-weight: 600;
  box-shadow: 0 0 8px rgba(180, 130, 40, 0.4);
}
.realm-tab-generate {
  border-style: dashed;
  border-color: rgba(100, 180, 120, 0.5);
  background: rgba(30, 80, 50, 0.2);
  color: rgba(120, 200, 140, 0.85);
}
.realm-tab-generate:hover:not(:disabled) {
  background: rgba(40, 100, 60, 0.4);
  border-color: rgba(120, 200, 140, 0.8);
  color: rgba(140, 220, 160, 1);
}
.realm-tab-generate:disabled { opacity: 0.5; cursor: not-allowed; }
.realm-tab-hint {
  font-size: 12px;
  color: rgba(180, 180, 180, 0.6);
  align-self: center;
  padding: 4px 8px;
}
.realm-tab-regenerate {
  margin-left: auto;
  border-color: rgba(190, 140, 80, 0.55);
  background: rgba(120, 85, 35, 0.22);
  color: rgba(240, 200, 130, 0.95);
  font-size: 13px;
  padding: 4px 12px;
  font-weight: 600;
}
.realm-tab-regenerate:hover:not(:disabled) {
  background: rgba(155, 108, 42, 0.38);
  border-color: rgba(220, 170, 90, 0.8);
  color: rgba(255, 220, 155, 1);
}
.realm-tab-unmapped {
  border-color: rgba(255, 165, 60, 0.5);
  background: rgba(110, 60, 15, 0.2);
  color: rgba(255, 195, 95, 0.92);
}
.realm-tab-unmapped:hover:not(:disabled) {
  background: rgba(140, 80, 20, 0.36);
  border-color: rgba(255, 180, 80, 0.75);
  color: rgba(255, 210, 130, 1);
}
.realm-tab-unmapped.active {
  background: rgba(170, 95, 20, 0.42);
  border-color: rgba(255, 195, 95, 0.85);
  color: rgba(255, 225, 150, 1);
  box-shadow: 0 0 8px rgba(255, 160, 40, 0.35);
}

/* ─── 重新生成确认弹窗 ────────────────────────────────────────────────────────── */
.realm-regen-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  z-index: 9000;
  display: flex;
  align-items: center;
  justify-content: center;
}
.realm-regen-dialog {
  background: linear-gradient(135deg, rgba(30, 20, 15, 0.98), rgba(20, 15, 10, 0.98));
  border: 1px solid rgba(200, 150, 80, 0.4);
  border-radius: 12px;
  padding: 28px 32px;
  max-width: 420px;
  width: 90%;
  color: rgba(230, 210, 180, 0.95);
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 220, 140, 0.1);
}
.realm-regen-dialog h3 {
  margin: 0 0 12px;
  font-size: 1.1rem;
  color: rgba(255, 200, 120, 1);
}
.realm-regen-dialog p {
  margin: 0 0 20px;
  font-size: 0.9rem;
  line-height: 1.6;
  color: rgba(200, 180, 150, 0.9);
}
.realm-regen-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
}
.realm-regen-cancel, .realm-regen-confirm {
  padding: 8px 20px;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}
.realm-regen-cancel {
  border: 1px solid rgba(180, 180, 180, 0.25);
  background: rgba(100, 100, 100, 0.12);
  color: rgba(180, 180, 180, 0.8);
}
.realm-regen-cancel:hover {
  background: rgba(120, 120, 120, 0.25);
  color: rgba(200, 200, 200, 1);
}
.realm-regen-confirm {
  border: 1px solid rgba(200, 80, 80, 0.5);
  background: rgba(120, 30, 30, 0.4);
  color: rgba(255, 160, 140, 1);
  font-weight: 600;
}
.realm-regen-confirm:hover {
  background: rgba(160, 40, 40, 0.6);
  border-color: rgba(230, 100, 100, 0.7);
  box-shadow: 0 0 12px rgba(200, 60, 60, 0.3);
}

/* ─── 未收录地点 Badge 按钮 ──────────────────────────────────────────────────── */
.unmapped-badge-btn {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 200;
  padding: 5px 12px;
  background: rgba(255, 160, 40, 0.15);
  border: 1px solid rgba(255, 160, 40, 0.45);
  border-radius: 20px;
  color: rgba(255, 200, 80, 0.95);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s, border-color 0.2s, transform 0.1s;
  backdrop-filter: blur(8px);
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
  white-space: nowrap;
}
.unmapped-badge-btn:hover {
  background: rgba(255, 160, 40, 0.28);
  border-color: rgba(255, 160, 40, 0.7);
  transform: scale(1.03);
}
.unmapped-badge-btn.active {
  background: rgba(255, 160, 40, 0.25);
  border-color: rgba(255, 200, 80, 0.7);
  box-shadow: 0 0 14px rgba(255, 160, 40, 0.3);
}

/* 地图容器 */
.map-container {
  flex: 1;
  position: relative;
  overflow: hidden;
  border-radius: 12px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
}

canvas {
  display: block;
  width: 100%;
  height: 100%;
  cursor: grab;
}

canvas:active {
  cursor: grabbing;
}

/* 地点信息弹窗 */
.location-popup {
  position: absolute;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 16px;
  padding: 16px;
  max-width: 400px;
  max-height: 50vh;
  box-shadow: 0 18px 60px rgba(0, 0, 0, 0.35);
  min-width: 280px;
  pointer-events: auto;
  z-index: 2000;
}

.popup-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.popup-header h4 {
  margin: 0;
  color: var(--color-text);
  font-size: 1.25rem;
  font-weight: 700;
}

.close-btn {
  width: 28px;
  height: 28px;
  border: none;
  background: rgba(239, 68, 68, 0.1);
  cursor: pointer;
  color: #ef4444;
  font-size: 1.4rem;
  border-radius: 6px;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
}

.close-btn:hover {
  background: rgba(220, 38, 38, 0.2);
  color: #dc2626;
  transform: scale(1.1);
}

.popup-content {
  font-size: 0.95rem;
  line-height: 1.6;
  max-height: 60vh;
  overflow-y: auto;
}

/* 进入区域地图按钮 */
.enter-region-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  margin-top: 10px;
  padding: 7px 12px;
  background: rgba(100, 200, 255, 0.12);
  border: 1px solid rgba(100, 200, 255, 0.35);
  border-radius: 6px;
  color: rgba(100, 200, 255, 0.9);
  font-size: 13px;
  cursor: pointer;
  transition: background 0.2s, border-color 0.2s;
}
.enter-region-btn:hover:not(:disabled) {
  background: rgba(100, 200, 255, 0.22);
  border-color: rgba(100, 200, 255, 0.6);
}
.enter-region-btn:disabled,
.enter-region-btn.loading {
  opacity: 0.6;
  cursor: not-allowed;
}

.location-type {
  color: var(--color-primary);
  font-weight: 700;
  margin: 0 0 10px 0;
  font-size: 1rem;
}

.location-desc {
  color: var(--color-text);
  margin: 0 0 14px 0;
  font-weight: 500;
  line-height: 1.6;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.location-detail {
  color: var(--color-text-secondary);
  margin: 8px 0;
  font-size: 0.875rem;
  font-weight: 500;
}

.relation-friendly {
  color: #10b981;
  font-weight: 700;
}

.relation-hostile {
  color: #ef4444;
  font-weight: 700;
}

.relation-neutral {
  color: #6b7280;
  font-weight: 600;
}

/* 初始化地图覆盖层 */
.initialize-map-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(6px);
  z-index: 2000;
}

.initialize-prompt {
  text-align: center;
  padding: 3rem 2rem;
  max-width: 500px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 16px;
  box-shadow: 0 18px 60px rgba(0, 0, 0, 0.35);
  animation: fadeIn 0.3s ease-in-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.prompt-icon {
  margin: 0 auto 1.5rem;
  width: 80px;
  height: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #3b82f6, #60a5fa);
  border-radius: 50%;
  box-shadow: 0 8px 24px rgba(59, 130, 246, 0.3);
}

.map-icon {
  width: 48px;
  height: 48px;
  color: white;
}

.initialize-prompt h3 {
  margin: 0 0 1rem 0;
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--color-text);
}

.initialize-prompt p {
  margin: 0 0 1.5rem 0;
  font-size: 1rem;
  color: var(--color-text-secondary);
  line-height: 1.6;
}

/* 密度选择器 */
.density-selector {
  margin-bottom: 1.5rem;
  text-align: left;
}

.density-label {
  display: block;
  font-size: 0.9rem;
  font-weight: 600;
  color: #475569;
  margin-bottom: 0.75rem;
}

.density-options {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.density-option {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  background: var(--color-surface-light);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.density-option:hover {
  border-color: var(--color-border-hover);
  background: var(--color-surface-hover);
}

.density-option.active {
  border-color: var(--color-primary);
  background: var(--color-surface);
}

.density-option input[type="radio"] {
  display: none;
}

.option-label {
  font-weight: 600;
  color: var(--color-text);
  min-width: 3rem;
}

.option-desc {
  font-size: 0.85rem;
  color: var(--color-text-secondary);
}

.initialize-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem 2rem;
  background: linear-gradient(135deg, #3b82f6, #60a5fa);
  color: white;
  border: none;
  border-radius: 12px;
  font-size: 1.1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
  box-shadow: 0 4px 16px rgba(59, 130, 246, 0.3);
}

.initialize-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(59, 130, 246, 0.4);
  background: linear-gradient(135deg, #2563eb, #3b82f6);
}

.initialize-btn:active {
  transform: translateY(0);
}

.btn-icon {
  width: 24px;
  height: 24px;
}

.loading-spinner {
  width: 60px;
  height: 60px;
  margin: 0 auto 1.5rem;
  border: 4px solid rgba(59, 130, 246, 0.2);
  border-top-color: #3b82f6;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.status-text {
  font-size: 0.9rem;
  color: var(--color-text-secondary);
  margin-top: 1rem;
  min-height: 1.5rem;
}

/* 地图图例 */
.map-legend {
  position: absolute;
  bottom: 24px;
  right: 24px;
  background: var(--color-surface);
  border-radius: 16px;
  box-shadow: 0 18px 60px rgba(0, 0, 0, 0.35);
  z-index: 1000;
  min-width: 200px;
  max-width: 280px;
  border: 1px solid var(--color-border);
  pointer-events: auto;
  transition: all 0.3s ease;
}

.map-legend.collapsed {
  min-width: auto;
}

.legend-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  cursor: pointer;
  user-select: none;
  border-radius: 14px 14px 0 0;
  transition: background 0.2s ease;
}

.legend-header:hover {
  background: var(--color-surface-hover);
}

.legend-title {
  font-weight: 700;
  color: var(--color-text);
  font-size: 1rem;
  flex: 1;
}

.legend-toggle {
  background: none;
  border: none;
  color: var(--color-text-secondary);
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: all 0.2s ease;
}

.legend-toggle:hover {
  background: var(--color-surface-light);
}

.legend-items {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 400px;
  overflow-y: auto;
  padding: 0 20px 20px;
}

.legend-items::-webkit-scrollbar {
  width: 6px;
}

.legend-items::-webkit-scrollbar-track {
  background: transparent;
  border-radius: 3px;
}

.legend-items::-webkit-scrollbar-thumb {
  background: transparent;
  border-radius: 3px;
}

.legend-items::-webkit-scrollbar-thumb:hover {
  background: transparent;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 0.9rem;
  color: var(--color-text);
  padding: 8px 10px;
  font-weight: 600;
  border-radius: 8px;
  transition: all 0.2s ease;
}

.legend-item:hover {
  background: var(--color-surface-hover);
}

.legend-icon {
  flex-shrink: 0;
}

/* 图标颜色 */
.legend-icon.mountain {
  color: #2D7D32;
}

.legend-icon.faction {
  color: #1565C0;
}

.legend-icon.town {
  color: #F57C00;
}

.legend-icon.blessed {
  color: #7B1FA2;
}

.legend-icon.treasure {
  color: #388E3C;
}

.legend-icon.danger {
  color: #D32F2F;
}

.legend-icon.special {
  color: #6B7280;
}

.legend-icon.player {
  color: #3b82f6;
  animation: pulse-player 2s ease-in-out infinite;
}

.legend-icon.npc {
  color: #8b5cf6;
}

@keyframes pulse-player {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.6;
  }
}

/* 全屏模式优化 */
.game-map-panel:fullscreen {
  background: #1a1a2e;
}

.game-map-panel:fullscreen .map-container {
  border: none;
  border-radius: 0;
}

.game-map-panel:fullscreen .map-legend {
  background: rgba(0, 0, 0, 0.8);
  color: white;
}

.game-map-panel:fullscreen .location-popup {
  background: rgba(0, 0, 0, 0.9);
  color: white;
}

/* 地图操作按钮 - 一体化样式，左下角 */
.map-actions {
  position: absolute;
  bottom: 12px;
  left: 12px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  z-index: 100;
  min-width: 100px;
  transition: all 0.2s ease;
  box-shadow: 0 14px 40px rgba(0, 0, 0, 0.35);
}

.map-actions.expanded {
  min-width: 130px;
}

.actions-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text);
  padding: 10px 14px;
  cursor: pointer;
  border-radius: 10px;
  transition: all 0.2s ease;
  user-select: none;
}

.actions-header:hover {
  background: var(--color-surface-hover);
}

.actions-header .toggle-icon {
  margin-left: auto;
  color: var(--color-text-secondary);
}

.actions-content {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 0 10px 10px;
}

.action-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: linear-gradient(135deg, #3b82f6 0%, #60a5fa 100%);
  border: none;
  border-radius: 8px;
  color: white;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 2px 8px rgba(59, 130, 246, 0.3);
}

.action-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
}

.action-btn:active:not(:disabled) {
  transform: translateY(0);
}

.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.action-btn.text-mode-btn {
  background: linear-gradient(135deg, #8b5cf6 0%, #a78bfa 100%);
  box-shadow: 0 2px 8px rgba(139, 92, 246, 0.3);
}

.action-btn.text-mode-btn:hover:not(:disabled) {
  box-shadow: 0 4px 12px rgba(139, 92, 246, 0.4);
}

/* 追加生成弹窗 */
.generate-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.generate-modal {
  background: #1e293b;
  border: 1px solid rgba(59, 130, 246, 0.3);
  border-radius: 12px;
  width: 320px;
  max-width: 90vw;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border-bottom: 1px solid rgba(59, 130, 246, 0.2);
}

.modal-header h3 {
  margin: 0;
  font-size: 16px;
  color: #e2e8f0;
}

.modal-body {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.generate-option {
  display: flex;
  align-items: center;
  gap: 8px;
}

.generate-option label {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #e2e8f0;
  font-size: 14px;
  flex: 1;
}

.count-input {
  width: 50px;
  padding: 4px 8px;
  background: rgba(15, 23, 42, 0.8);
  border: 1px solid rgba(59, 130, 246, 0.3);
  border-radius: 4px;
  color: #e2e8f0;
  font-size: 14px;
  text-align: center;
}

.count-input:disabled {
  opacity: 0.5;
}

.count-label {
  color: #94a3b8;
  font-size: 12px;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 16px;
  border-top: 1px solid rgba(59, 130, 246, 0.2);
}

.cancel-btn, .confirm-btn {
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.cancel-btn {
  background: transparent;
  border: 1px solid rgba(148, 163, 184, 0.3);
  color: #94a3b8;
}

.cancel-btn:hover {
  background: rgba(148, 163, 184, 0.1);
}

.confirm-btn {
  background: rgba(59, 130, 246, 0.8);
  border: none;
  color: white;
}

.confirm-btn:hover:not(:disabled) {
  background: rgba(59, 130, 246, 1);
}

.confirm-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 响应式设计 */
@media (max-width: 640px) {
  .game-map-panel {
    /* Reserve space so bottom legend and actions can sit side-by-side */
    --map-mobile-actions-reserve: 152px;
  }

  .world-info-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }

  .world-background {
    max-width: 100%;
  }

  .map-legend {
    left: auto;
    right: 12px;
    bottom: calc(12px + env(safe-area-inset-bottom));
    transform: none;
    width: min(320px, calc(100% - 24px - var(--map-mobile-actions-reserve)));
    min-width: 0;
    max-width: none;
  }

  .map-actions {
    bottom: calc(12px + env(safe-area-inset-bottom));
    left: 12px;
    right: auto;
    top: auto;
    max-width: var(--map-mobile-actions-reserve);
  }

  .location-popup {
    min-width: auto;
    max-width: calc(100vw - 40px);
  }
}
</style>
