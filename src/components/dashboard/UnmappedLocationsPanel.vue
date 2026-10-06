<template>
  <Transition name="panel-slide">
    <div v-if="show" class="unmapped-panel">
      <!-- 标题栏 -->
      <div class="panel-header">
        <span class="panel-title">⚠️ 未收录地点</span>
        <span class="panel-count">{{ props.npcs.length }} 个 NPC</span>
        <button class="panel-close" @click="emit('close')">×</button>
      </div>

      <div class="panel-desc">
        以下 NPC 所在地点未收录到世界地图，可点击「添加」让 AI 确定坐标。
      </div>

      <!-- NPC 列表 -->
      <div class="npc-list">
        <div
          v-for="npc in visibleNpcs"
          :key="npc.npcName"
          class="npc-row"
        >
          <!-- 头像 + 名字 -->
          <div class="npc-info">
            <div class="npc-avatar">{{ npc.npcName.charAt(0) }}</div>
            <div class="npc-detail">
              <div class="npc-name">{{ npc.npcName }}</div>
              <div class="npc-desc">{{ npc.locationDesc }}</div>
              <div class="npc-fallback">
                📍 当前显示在：<span class="fallback-name">{{ npc.continentName }}（大陆）</span>
              </div>
              <div v-if="npc.buildingHint" class="npc-building-hint">
                🏠 区域内位置：<span>{{ npc.buildingHint }}</span>
              </div>
            </div>
          </div>

          <!-- 操作按钮 -->
          <div class="npc-actions">
            <button
              v-if="getState(npc.npcName) === 'idle'"
              class="btn-add"
              @click="handleAdd(npc)"
            >
              🗺️ 添加「{{ npc.locationHint }}」
            </button>
            <div v-else-if="getState(npc.npcName) === 'loading'" class="btn-loading">
              <span class="spinner">⟳</span> AI 定位中...
            </div>
            <div v-else-if="getState(npc.npcName) === 'success'" class="btn-success">
              ✅ 已添加到地图
            </div>
            <div v-else-if="getState(npc.npcName) === 'error'" class="btn-error">
              <span>❌ {{ getError(npc.npcName) }}</span>
              <button class="btn-retry" @click="handleAdd(npc)">重试</button>
            </div>
            <button
              v-if="getState(npc.npcName) !== 'success'"
              class="btn-ignore"
              @click="handleIgnore(npc.npcName)"
            >
              忽略
            </button>
          </div>
        </div>

        <div v-if="visibleNpcs.length === 0" class="npc-empty">
          所有未收录地点已处理完毕 🎉
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import {LEVELS} from '@/utils/realmUtils';
import {entityName} from '@/modules/scenarioMods/namedEntities';
import { ref, computed } from 'vue';
import { useGameStateStore } from '@/stores/gameStateStore';
import { generateLocationPlacement } from '@/utils/worldGeneration/locationPlacementGenerator';

// ─── Props / Emits ───────────────────────────────────────────────────────────

export interface UnmappedNpc {
  npcName: string;
  /** 完整位置描述，如"苍冥灵境·七玄山脉·青石村" */
  locationDesc: string;
  /** 字段2：世界地图地点（待添加），如"七玄山脉" */
  locationHint: string;
  /** 字段3：区域内建筑名（仅展示，不添加到世界地图），如"青石村" */
  buildingHint?: string;
  /** 最终 fallback 到的大陆名 */
  continentName: string;
  /** 大陆边界点 */
  continentBounds?: { x: number; y: number }[];
  /** NPC 数据（用于提取境界、势力） */
  npcData: any;
}

const props = defineProps<{
  show: boolean;
  npcs: UnmappedNpc[];
  /** 当境界分层地图模式开启时，传入当前激活的境界 Tab 名称 */
  activeRealmKey?: string;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'locationAdded', locationName: string): void;
}>();

// ─── State ────────────────────────────────────────────────────────────────────

const gameStateStore = useGameStateStore();

// 本次会话忽略的 NPC
const ignoredNpcs = ref<Set<string>>(new Set());
// 每个 NPC 的操作状态
const npcStates = ref<Map<string, 'idle' | 'loading' | 'success' | 'error'>>(new Map());
const npcErrors = ref<Map<string, string>>(new Map());

// ─── Computed ─────────────────────────────────────────────────────────────────

const visibleNpcs = computed(() =>
  props.npcs.filter((n) => !ignoredNpcs.value.has(n.npcName))
);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getState(name: string): 'idle' | 'loading' | 'success' | 'error' {
  return npcStates.value.get(name) ?? 'idle';
}

function getError(name: string): string {
  return npcErrors.value.get(name) ?? '未知错误';
}

function handleIgnore(name: string) {
  ignoredNpcs.value.add(name);
}

const REALM_RANK_HINTS=LEVELS.map(e=>({token:e.name,rank:e.level}));

function getRealmRank(realmKey: string): number {
  const raw = String(realmKey || '').trim();
  if (!raw) return -1;
  let best = -1;
  for (const item of REALM_RANK_HINTS) {
    if (raw.includes(item.token)) {
      best = Math.max(best, item.rank);
    }
  }
  return best;
}

/**
 * 未收录地点默认优先写入玩家主活动区域：
 * 1. 优先玩家当前境界 map（如果已存在）
 * 2. 否则回退到地图集中“最高境界” key
 * 3. 再回退到当前 Tab
 */
function resolvePreferredRealmKey(): string | undefined {
  const col = gameStateStore.realmMapCollection;
  if (!col || Object.keys(col).length === 0) return props.activeRealmKey;

  const attrs = gameStateStore.attributes as any;
  const playerRealm =
    String(attrs?.['境界']?.['名称'] || (typeof attrs?.['境界'] === 'string' ? attrs['境界'] : '') || '').trim();
  if (playerRealm && col[playerRealm]) return playerRealm;

  const keys = Object.keys(col);
  const highest = keys
    .map((key) => ({ key, rank: getRealmRank(key) }))
    .sort((a, b) => b.rank - a.rank)[0]?.key;

  return highest || props.activeRealmKey;
}

async function handleAdd(npc: UnmappedNpc) {
  npcStates.value.set(npc.npcName, 'loading');
  npcErrors.value.delete(npc.npcName);

  // 提取 NPC 境界和势力
  const npcData = npc.npcData as any;
  const realm: string =
    npcData?.境界 ?? npcData?.属性?.境界 ?? npcData?.realm ?? '';
  const faction: string =
    entityName('faction',npcData?.factionId ?? npcData?.势力归属 ?? npcData?.所属势力 ?? npcData?.faction ?? '');

  // 在境界模式下，优先写入玩家当前/最高境界地图；否则用全局 worldInfo
  const realmKey = resolvePreferredRealmKey();
  const realmCol = gameStateStore.realmMapCollection;
  const activeRealmInfo = (realmKey && realmCol && realmCol[realmKey]) ? realmCol[realmKey] as any : null;
  const worldInfo = activeRealmInfo ?? (gameStateStore.worldInfo as any);
  const existingLocations: any[] = worldInfo?.地点信息 ?? [];
  const mapCfg = worldInfo?.['地图配置'] ?? {};
  const mapConfig = {
    width: Number(mapCfg?.width) || 10000,
    height: Number(mapCfg?.height) || 10000,
  };

  const result = await generateLocationPlacement({
    locationName: npc.locationHint,
    locationDesc: npc.locationDesc,
    continentName: npc.continentName,
    continentBounds: npc.continentBounds,
    npcName: npc.npcName,
    npcRealm: realm,
    npcFaction: faction,
    existingLocations,
    mapSize: mapConfig,
  });

  if (result.success && result.location) {
    // 境界模式写入对应境界地图；否则写入全局 worldInfo
    if (realmKey && realmCol && realmCol[realmKey]) {
      gameStateStore.addWorldLocationToRealm(realmKey, result.location);
    } else {
      gameStateStore.addWorldLocation(result.location);
    }
    npcStates.value.set(npc.npcName, 'success');
    emit('locationAdded', result.location.名称);
    // 成功后 2 秒自动从列表消失
    setTimeout(() => {
      ignoredNpcs.value.add(npc.npcName);
    }, 2000);
  } else {
    npcStates.value.set(npc.npcName, 'error');
    npcErrors.value.set(npc.npcName, result.error ?? '定位失败');
  }
}
</script>

<style scoped>
/* ─── 面板容器 ──────────────────────────────────────────────────────────────── */
.unmapped-panel {
  position: absolute;
  top: 52px;
  right: 12px;
  width: 380px;
  max-height: calc(100% - 70px);
  background: rgba(15, 20, 32, 0.97);
  border: 1px solid rgba(255, 180, 60, 0.3);
  border-radius: 12px;
  backdrop-filter: blur(16px);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6), 0 0 20px rgba(255, 180, 60, 0.05);
  z-index: 300;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* ─── 标题栏 ─────────────────────────────────────────────────────────────────── */
.panel-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(255, 180, 60, 0.06);
  flex-shrink: 0;
}
.panel-title {
  font-size: 14px;
  font-weight: 600;
  color: rgba(255, 200, 80, 0.95);
  flex: 1;
}
.panel-count {
  font-size: 11px;
  color: rgba(255, 180, 60, 0.6);
  background: rgba(255, 180, 60, 0.12);
  padding: 2px 7px;
  border-radius: 10px;
}
.panel-close {
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.4);
  font-size: 18px;
  cursor: pointer;
  line-height: 1;
  padding: 0 2px;
}
.panel-close:hover { color: rgba(255, 255, 255, 0.8); }

/* ─── 描述 ──────────────────────────────────────────────────────────────────── */
.panel-desc {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.4);
  padding: 8px 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  flex-shrink: 0;
}

/* ─── NPC 列表 ──────────────────────────────────────────────────────────────── */
.npc-list {
  overflow-y: auto;
  flex: 1;
  padding: 8px 0;
}

.npc-row {
  padding: 10px 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.npc-row:last-child { border-bottom: none; }

.npc-info {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.npc-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: linear-gradient(135deg, rgba(138, 111, 168, 0.8), rgba(109, 40, 217, 0.6));
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  color: #fff;
  font-weight: 600;
  flex-shrink: 0;
}

.npc-detail { flex: 1; min-width: 0; }
.npc-name {
  font-size: 13px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.9);
  margin-bottom: 2px;
}
.npc-desc {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.45);
  word-break: break-all;
  margin-bottom: 3px;
}
.npc-fallback {
  font-size: 11px;
  color: rgba(255, 180, 60, 0.55);
}
.fallback-name {
  color: rgba(255, 180, 60, 0.8);
}
.npc-building-hint {
  font-size: 11px;
  color: rgba(150, 200, 255, 0.45);
  margin-top: 2px;
}
.npc-building-hint span {
  color: rgba(150, 200, 255, 0.7);
}

/* ─── 操作按钮 ──────────────────────────────────────────────────────────────── */
.npc-actions {
  display: flex;
  gap: 6px;
  align-items: center;
  flex-wrap: wrap;
}

.btn-add {
  flex: 1;
  padding: 6px 10px;
  background: rgba(138, 111, 168, 0.15);
  border: 1px solid rgba(138, 111, 168, 0.4);
  border-radius: 6px;
  color: rgba(167, 139, 250, 0.95);
  font-size: 12px;
  cursor: pointer;
  transition: background 0.2s, border-color 0.2s;
  text-align: left;
}
.btn-add:hover {
  background: rgba(138, 111, 168, 0.28);
  border-color: rgba(138, 111, 168, 0.7);
}

.btn-loading {
  flex: 1;
  padding: 6px 10px;
  font-size: 12px;
  color: rgba(255, 200, 80, 0.7);
  display: flex;
  align-items: center;
  gap: 5px;
}
.spinner {
  display: inline-block;
  animation: spin 1s linear infinite;
}
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.btn-success {
  flex: 1;
  padding: 6px 10px;
  font-size: 12px;
  color: rgba(100, 220, 120, 0.9);
}

.btn-error {
  flex: 1;
  display: flex;
  gap: 6px;
  align-items: center;
  font-size: 11px;
  color: rgba(255, 100, 100, 0.8);
}
.btn-retry {
  background: rgba(255, 100, 80, 0.12);
  border: 1px solid rgba(255, 100, 80, 0.3);
  border-radius: 4px;
  color: rgba(255, 130, 100, 0.9);
  font-size: 11px;
  padding: 2px 8px;
  cursor: pointer;
}
.btn-retry:hover { background: rgba(255, 100, 80, 0.22); }

.btn-ignore {
  padding: 6px 10px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  color: rgba(255, 255, 255, 0.3);
  font-size: 11px;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.2s;
}
.btn-ignore:hover {
  background: rgba(255, 255, 255, 0.09);
  color: rgba(255, 255, 255, 0.5);
}

.npc-empty {
  text-align: center;
  color: rgba(255, 255, 255, 0.3);
  font-size: 12px;
  padding: 24px 0;
}

/* ─── 动画 ─────────────────────────────────────────────────────────────────── */
.panel-slide-enter-active,
.panel-slide-leave-active {
  transition: opacity 0.2s, transform 0.2s;
}
.panel-slide-enter-from,
.panel-slide-leave-to {
  opacity: 0;
  transform: translateY(-8px) scale(0.97);
}
</style>
