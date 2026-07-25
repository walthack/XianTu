<template>
  <div class="game-view">
    <!-- 顶部栏 -->
    <TopBar></TopBar>

    <!-- 主要内容区域 -->
    <div v-if="isDataReady" class="game-content" :class="{ 'panel-mode': isPanelOpen }">
      <!-- 左侧功能栏 -->
      <div class="left-sidebar" :class="{ collapsed: leftSidebarCollapsed }">
        <div class="sidebar-wrapper">
          <LeftSidebar />
        </div>
      </div>

      <!-- Mobile Overlay -->
      <div
        v-if="isMobile && (!leftSidebarCollapsed || !rightSidebarCollapsed)"
        class="mobile-sidebar-overlay"
        @click="closeSidebars"
      ></div>

      <!-- 左侧收缩按钮 -->
      <button
        class="collapse-btn left"
        :class="{ collapsed: leftSidebarCollapsed }"
        @click="leftSidebarCollapsed = !leftSidebarCollapsed"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline :points="leftSidebarCollapsed ? '9,18 15,12 9,6' : '15,18 9,12 15,6'"/>
        </svg>
      </button>

      <!-- 主游戏区域 -->
      <div class="main-content">
        <!-- 功能面板覆盖层 -->
        <div v-if="isPanelOpen" class="panel-overlay">
          <div class="panel-header compact" aria-label="功能面板导航">
            <button class="back-btn" @click="closePanel" :title="$t('返回')" :aria-label="$t('返回')">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <div class="panel-title-compact">
              <component :is="currentPanelIcon" :size="16" class="panel-title-icon" />
              <span class="title-text">{{ currentPanelTitle }}</span>
            </div>
            <div class="panel-actions">
              <button v-for="btn in currentPanelActions" :key="btn.key" class="action-btn-compact" :title="btn.title" @click="btn.onClick" :aria-label="btn.title">
                <component :is="btn.icon" :size="14" />
              </button>
            </div>
          </div>
          <div class="panel-content compact">
            <div class="panel-shell">
              <router-view v-slot="{ Component }">
                <keep-alive>
                  <component :is="Component" />
                </keep-alive>
              </router-view>
            </div>
          </div>
        </div>

        <!-- 正常路由视图 -->
        <router-view v-else-if="!uiStore.showCharacterManagement" v-slot="{ Component }">
          <keep-alive>
            <component :is="Component" />
          </keep-alive>
        </router-view>

        <!-- 角色管理面板 -->
        <div v-if="uiStore.showCharacterManagement" class="panel-overlay">
          <div class="panel-header">
            <h2 class="panel-title">
              <Users2 :size="20" class="panel-title-icon" />
              {{ $t('角色管理') }}
            </h2>
            <button class="panel-close-btn" @click="uiStore.closeCharacterManagement()" :title="$t('关闭')">
              <X :size="20" />
            </button>
          </div>
          <div class="panel-content">
            <div class="panel-shell">
              <CharacterManagement @back="uiStore.closeCharacterManagement" />
            </div>
          </div>
        </div>
      </div>

      <!-- 右侧收缩按钮 -->
      <button
        class="collapse-btn right"
        :class="{ collapsed: rightSidebarCollapsed }"
        @click="rightSidebarCollapsed = !rightSidebarCollapsed"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline :points="rightSidebarCollapsed ? '15,18 9,12 15,6' : '9,18 15,12 9,6'"/>
        </svg>
      </button>

      <!-- 右侧区域: 角色信息栏 -->
      <div
        class="right-panel-area"
        :class="{ collapsed: rightSidebarCollapsed }"
        v-show="!isPanelOpen"
      >
        <div class="sidebar-wrapper">
          <ErrorBoundary>
            <RightSidebar />
          </ErrorBoundary>
        </div>
      </div>
    </div>

    <!-- 数据未就绪时的提示 -->
    <div v-else class="data-loading">
      <div class="loading-content">
        <div class="loading-spinner-wrapper">
          <div class="loading-spinner"></div>
          <div class="spinner-glow"></div>
        </div>
        <h2 class="loading-title">{{ $t('道法自然，天地初开') }}</h2>
        <p class="loading-message">{{ $t('正在加载修仙世界...') }}</p>
        <div class="loading-steps">
          <div class="loading-step">
            <span class="step-icon">✓</span>
            <span class="step-text">{{ $t('连接天道') }}</span>
          </div>
          <div class="loading-step">
            <span class="step-icon">✓</span>
            <span class="step-text">{{ $t('加载角色数据') }}</span>
          </div>
          <div class="loading-step active">
            <span class="step-icon">○</span>
            <span class="step-text">{{ $t('读取存档信息') }}</span>
          </div>
        </div>
        <p class="loading-hint">{{ $t('提示：请在左侧菜单选择角色并加载存档') }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { useCharacterStore } from '@/stores/characterStore';
import { useGameStateStore } from '@/stores/gameStateStore';
import { useUIStore } from '@/stores/uiStore';
import { useRouter, useRoute } from 'vue-router';
import { X, Package, User, Brain, Users, BookOpen, Zap, Settings, Save, Map, Scroll, Bell, Home, Box, Users2, Database, RefreshCw, FlaskConical, Trash2, BarChart3, Coins, FileText, Plug, Globe, Hammer, Building2, Swords, ClipboardList, Shield } from 'lucide-vue-next';
import { panelBus, type PanelAction } from '@/utils/panelBus';
import { detectSectMigration } from '@/utils/sectMigration';
import TopBar from '@/components/dashboard/TopBar.vue'
import LeftSidebar from '@/components/dashboard/LeftSidebar.vue'
import RightSidebar from '@/components/dashboard/RightSidebar.vue'
import CharacterManagement from '@/components/character-creation/CharacterManagement.vue';
import ErrorBoundary from '@/components/common/ErrorBoundary.vue';
import SectMigrationModal from '@/components/dashboard/components/SectMigrationModal.vue';

const characterStore = useCharacterStore();
const gameStateStore = useGameStateStore();
const uiStore = useUIStore();
const router = useRouter();
const route = useRoute();

// 侧边栏收缩状态
const leftSidebarCollapsed = ref(false);
const rightSidebarCollapsed = ref(false);

// 移动端适配
const isMobile = ref(false);

// 检测设备并设置初始状态
const checkDeviceAndSetup = () => {
  isMobile.value = window.innerWidth <= 768;

  // 移动端默认收缩侧边栏
  if (isMobile.value) {
    leftSidebarCollapsed.value = true;
    rightSidebarCollapsed.value = true;
  }
};

const closeSidebars = () => {
  leftSidebarCollapsed.value = true;
  rightSidebarCollapsed.value = true;
};

const lastMigrationPromptKey = ref<string | null>(null);

const getActiveSaveKey = () => {
  const active = characterStore.rootState.当前激活存档;
  if (!active) return null;
  return `${active.角色ID}::${active.存档槽位}`;
};

const maybePromptSectMigration = () => {
  if (!gameStateStore.isGameLoaded) return;
  const saveKey = getActiveSaveKey();
  if (!saveKey || lastMigrationPromptKey.value === saveKey) return;

  const saveData = gameStateStore.getCurrentSaveData();
  const check = detectSectMigration(saveData);
  if (!check.needed) {
    return;
  }

  lastMigrationPromptKey.value = saveKey;
  uiStore.showDetailModal({
    title: '宗门存档迁移',
    component: SectMigrationModal,
    props: {
      reasons: check.reasons,
      fromVersion: check.fromVersion,
      toVersion: check.toVersion,
    }
  });
};

// 面板状态管理
const panelRoutes = new Set([
  'Inventory', 'CharacterDetails', 'Memory', 'Relationships',
  'Cultivation', 'Techniques', 'ThousandDao', 'Settings', 'Save', 'WorldMap',
  'Events', 'Crafting', 'Sect', 'SectOverview', 'SectMembers', 'SectManagement', 'SectLibrary', 'SectTasks', 'SectContribution', 'SectWar', 'GameVariables',
  'Prompts', 'APIManagement', 'Travel', 'BackendAdminPanel'
]);

// 不需要角色数据就能访问的面板（设置类）
const noDataRequiredRoutes = new Set([
  'Settings', 'Prompts', 'APIManagement', 'BackendAdminPanel'
]);

// 右侧相关面板（应该影响右侧收缩按钮）
const rightPanelRoutes = new Set([
  'Memory', 'Relationships', 'Cultivation', 'Techniques', 'ThousandDao', 'Settings', 'Save',
  'Sect', 'SectOverview', 'SectMembers', 'SectManagement', 'SectLibrary', 'SectTasks', 'SectContribution', 'SectWar'
]);

type IconComponent = typeof Package;

const panelTitles: Record<string, { title: string; icon: IconComponent }> = {
  Inventory: { title: '背包物品', icon: Package },
  CharacterDetails: { title: '人物详情', icon: User },
  Memory: { title: '记忆中心', icon: Brain },
  Relationships: { title: '人物关系', icon: Users },
  Cultivation: { title: '修炼系统', icon: BookOpen },
  Techniques: { title: '修炼功法', icon: Zap },
  ThousandDao: { title: '三千大道', icon: Scroll },
  Settings: { title: '系统设置', icon: Settings },
  Save: { title: '保存游戏', icon: Save },
  WorldMap: { title: '世界地图', icon: Map },
  Events: { title: '世界事件', icon: Bell },
  Crafting: { title: '炼制工坊', icon: Hammer },
  Sect: { title: '宗门势力', icon: Home },
  SectOverview: { title: '宗门概览', icon: Home },
  SectMembers: { title: '宗门成员', icon: Users },
  SectManagement: { title: '宗门经营', icon: Building2 },
  SectLibrary: { title: '宗门藏经', icon: BookOpen },
  SectTasks: { title: '宗门任务', icon: ClipboardList },
  SectContribution: { title: '贡献兑换', icon: Coins },
  SectWar: { title: '宗门大战', icon: Swords },
  GameVariables: { title: '游戏变量', icon: Database },
  Prompts: { title: '提示词管理', icon: FileText },
  APIManagement: { title: 'API管理', icon: Plug },
  Travel: { title: '联机穿越', icon: Globe },
  BackendAdminPanel: { title: '仙官后台', icon: Shield }
};

const isPanelOpen = computed(() => {
  return panelRoutes.has(String(route.name));
});

const currentPanelTitle = computed(() => {
  const routeName = String(route.name);
  const panelInfo = panelTitles[routeName];
  return panelInfo?.title || '功能面板';
});

const currentPanelIcon = computed(() => {
  const routeName = String(route.name);
  const panelInfo = panelTitles[routeName];
  return panelInfo?.icon || Box;
});

const closePanel = () => {
  // 关闭面板时返回到主游戏面板，而不是重复路由到/game
  if (route.name !== 'GameMain') {
    router.push('/game');
  }
};

const panelActionMap: Record<string, Array<{ key: string; title: string; icon: IconComponent; action: PanelAction }>> = {
  Memory: [
    { key: 'refresh', title: '刷新', icon: RefreshCw, action: 'refresh' },
    { key: 'test', title: '测试转化', icon: FlaskConical, action: 'test' },
    { key: 'clear', title: '清理', icon: Trash2, action: 'clear' },
  ],
  Events: [
    { key: 'refresh', title: '刷新', icon: RefreshCw, action: 'refresh' },
  ],
  Save: [
    { key: 'refresh', title: '刷新', icon: RefreshCw, action: 'refresh' },
    { key: 'save', title: '快速存档', icon: Save, action: 'save' },
  ],
  ThousandDao: [
    { key: 'refresh', title: '刷新', icon: RefreshCw, action: 'refresh' },
  ],
  GameVariables: [
    { key: 'refresh', title: '刷新数据', icon: RefreshCw, action: 'refresh' },
    { key: 'export', title: '导出JSON', icon: Save, action: 'export' },
    { key: 'stats', title: '数据统计', icon: BarChart3, action: 'stats' },
  ]
};

const currentPanelActions = computed(() => {
  const routeName = String(route.name);
  const defs = panelActionMap[routeName] || [];
  return defs.map(d => ({
    key: d.key,
    title: d.title,
    icon: d.icon,
    onClick: () => panelBus.emit(d.action)
  }));
});

const isDataReady = computed(() => {
  // 设置类面板（Settings、APIManagement、Prompts）不需要角色数据即可访问
  const currentRouteName = String(route.name);
  if (noDataRequiredRoutes.has(currentRouteName)) {
    return true;
  }
  // 其他面板需要有角色档案才能显示界面
  return !!characterStore.activeCharacterProfile;
});

// 应用保存的设置
const applySettings = () => {
  try {
    const savedSettings = localStorage.getItem('dad_game_settings');
    if (savedSettings) {
      const settings = JSON.parse(savedSettings);

      // 应用UI缩放
      if (settings.uiScale) {
        const scaleValue = settings.uiScale / 100;
        document.documentElement.style.setProperty('--ui-scale', scaleValue.toString());
      }

      // 应用字体大小
      if (settings.fontSize) {
        const fontSizeMap: Record<string, string> = {
          small: '0.875rem',
          medium: '1rem',
          large: '1.125rem'
        };
        const fontSize = fontSizeMap[settings.fontSize] || '1rem';
        document.documentElement.style.setProperty('--base-font-size', fontSize);
      }

      // 应用主题
      if (settings.theme) {
        let targetTheme = settings.theme;
        if (settings.theme === 'auto') {
          targetTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        }
        document.documentElement.setAttribute('data-theme', targetTheme);
      }
    }
  } catch (error) {
    console.error('[GameView] 应用设置失败:', error);
  }
};

// 组件挂载时应用设置
onMounted(async () => {
  applySettings();
  checkDeviceAndSetup();

  // 监听窗口大小变化
  window.addEventListener('resize', checkDeviceAndSetup);

  // 🔴 启动游戏内定期授权验证（每30分钟验证一次）
});

// 组件卸载时清理
onBeforeUnmount(() => {
  window.removeEventListener('resize', checkDeviceAndSetup);

  // 🔴 停止定期授权验证
});

watch(
  () => [gameStateStore.isGameLoaded, characterStore.rootState.当前激活存档?.角色ID, characterStore.rootState.当前激活存档?.存档槽位],
  ([isLoaded]) => {
    if (!isLoaded) {
      lastMigrationPromptKey.value = null;
      return;
    }
    maybePromptSectMigration();
  },
  { immediate: true }
);

// 监听面板状态变化，智能调整布局
watch(isPanelOpen, (isOpen) => {
  if (isOpen) {
    const currentRoute = String(route.name);

    // 移动端：打开任何面板时都自动收起左侧边栏
    if (isMobile.value) {
      leftSidebarCollapsed.value = true;
    }

    // 只有右侧相关面板才收起右侧边栏
    if (rightPanelRoutes.has(currentRoute)) {
      rightSidebarCollapsed.value = true;
    }
    // 左侧功能面板不影响侧边栏状态
  }
  // 注意：我们不在面板关闭时自动展开侧边栏，让用户保持之前的偏好
});
</script>

<style scoped>
.game-view {
  width: 100%;
  height: 100%;
  background: var(--color-background);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 14px;
  display: grid;
  grid-template-rows: auto 1fr;
  overflow: hidden;
}

.game-content {
  flex: 1;
  display: flex;
  align-items: stretch;
  gap: 0;
  padding: 0;
  position: relative;
  min-height: 0;
  background: var(--color-background);
}

.left-sidebar {
  width: 240px;
  min-width: 240px;
  background: var(--color-surface);
  transition: all 0.3s ease;
  z-index: 10;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--color-border);
  flex-shrink: 0;
}

.left-sidebar.collapsed {
  width: 0;
  min-width: 0;
  overflow: hidden;
}

.right-panel-area {
  width: 260px;
  background: var(--color-surface);
  transition: all 0.3s ease;
  border-left: 1px solid var(--color-border);
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
}

.right-panel-area.collapsed {
  width: 0;
  overflow: hidden;
}

.sidebar-wrapper {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow-x: visible; /* 防止边框被截断 */
}

.main-content {
  flex: 1;
  background: var(--color-background);
  margin: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
  position: relative;
}

/* 收缩按钮样式 */
.collapse-btn {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 20px;
  height: 40px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  cursor: pointer;
  transition: all 0.3s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 20;
  color: var(--color-text-secondary);
  padding: 0;
}

.collapse-btn:hover {
  background: var(--color-surface-light);
  color: var(--color-text);
}

/* 左侧收缩按钮 */
.collapse-btn.left {
  left: 240px;
  border-radius: 0 6px 6px 0;
  border-left: none;
  transition: left 0.3s ease, background 0.2s ease;
}

/* 左侧栏收缩时，按钮移动到最左侧 */
.collapse-btn.left.collapsed {
  left: 0;
  border-left: 1px solid var(--color-border);
}

/* 右侧收缩按钮 */
.collapse-btn.right {
  right: 260px;
  border-radius: 6px 0 0 6px;
  border-right: none;
  transition: right 0.3s ease, background 0.2s ease;
}

/* 右侧栏收缩时，按钮移动到最右侧 */
.right-panel-area.collapsed ~ .collapse-btn.right,
.collapse-btn.right.collapsed {
  right: 0;
  border-right: 1px solid var(--color-border);
}

/* 面板覆盖模式样式 - 只隐藏右侧栏，保留左侧栏 */
.game-content.panel-mode .right-panel-area {
  display: none;
}

.game-content.panel-mode .collapse-btn.right {
  display: none;
}

.panel-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  width: 100%;
  height: 100%;
  background: var(--color-background);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  z-index: 100;
}

.panel-header { position: relative; display: flex; align-items: center; gap: 8px; padding: 6px 12px; min-height: 30px; height: auto; background: transparent; border-bottom: none; flex-shrink: 0; }
.panel-header::after { content: ''; position: absolute; left: 8px; right: 8px; bottom: 0; height: 1px; background: linear-gradient(90deg, transparent, rgba(var(--color-primary-rgb,46,92,184), .35), transparent); }

.panel-header.compact::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 2px;
  background: linear-gradient(90deg, transparent, var(--color-primary), transparent);
  opacity: 0.25;
}

.panel-title-icon { color: var(--color-primary); flex-shrink: 0; }
.panel-title-compact { display: flex; align-items: center; gap: 8px; min-width: 0; flex: 1; justify-content: center; }
.panel-title-compact .title-text { font-size: 0.92rem; font-weight: 600; color: var(--color-text); letter-spacing: 0.2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.back-btn { background: transparent; border: none; padding: 2px 6px; border-radius: 4px; color: var(--color-text-secondary); cursor: pointer; transition: all 0.2s ease; display: inline-flex; align-items: center; }
.back-btn:hover { background: var(--color-surface-hover); color: var(--color-text); }
.panel-actions { margin-left: auto; display: flex; align-items: center; gap: 4px; }
.action-btn-compact { background: transparent; border: none; width: 26px; height: 26px; border-radius: 4px; color: var(--color-text-secondary); display: inline-flex; align-items: center; justify-content: center; cursor: pointer; transition: var(--transition-fast); }
.action-btn-compact:hover { background: var(--color-surface-hover); color: var(--color-text); }

.panel-content {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  padding: 12px;
  background: transparent;
}

.panel-shell {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: linear-gradient(160deg, rgba(var(--color-surface-rgb), 0.98), rgba(var(--color-surface-rgb), 0.92));
  border: 1px solid rgba(var(--color-border-rgb), 0.55);
  border-radius: 18px;
  box-shadow: 0 16px 36px rgba(0, 0, 0, 0.08);
  overflow: hidden;
}

.panel-header.compact { padding: 6px 10px; position: sticky; top: 0; z-index: 2; background: var(--color-background); }
.panel-content.compact { padding: 8px 10px 10px 10px; }

/* 数据加载提示样式 */
.data-loading {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, var(--color-background) 0%, var(--color-surface) 100%);
  position: relative;
  overflow: hidden;
}

.data-loading::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: radial-gradient(circle at 50% 50%, rgba(var(--color-primary-rgb, 46, 92, 184), 0.05) 0%, transparent 70%);
  animation: pulse 3s ease-in-out infinite;
}

.loading-content {
  text-align: center;
  padding: 60px 40px;
  max-width: 500px;
  position: relative;
  z-index: 1;
}

.loading-spinner-wrapper {
  position: relative;
  width: 80px;
  height: 80px;
  margin: 0 auto 32px;
}

.loading-spinner {
  width: 80px;
  height: 80px;
  border: 3px solid transparent;
  border-top: 3px solid var(--color-primary);
  border-right: 3px solid var(--color-primary);
  border-radius: 50%;
  animation: spin 1.2s cubic-bezier(0.68, -0.55, 0.27, 1.55) infinite;
  position: relative;
}

.spinner-glow {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 60px;
  height: 60px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(var(--color-primary-rgb, 46, 92, 184), 0.3) 0%, transparent 70%);
  animation: glow 2s ease-in-out infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

@keyframes glow {
  0%, 100% { opacity: 0.3; transform: translate(-50%, -50%) scale(0.9); }
  50% { opacity: 0.8; transform: translate(-50%, -50%) scale(1.1); }
}

@keyframes pulse {
  0%, 100% { opacity: 0.5; }
  50% { opacity: 1; }
}

.loading-title {
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--color-text);
  margin: 0 0 12px 0;
  letter-spacing: 2px;
  background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-accent) 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.loading-message {
  font-size: 1rem;
  color: var(--color-text-secondary);
  margin: 0 0 32px 0;
  font-weight: 500;
}

.loading-steps {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 32px;
  text-align: left;
}

.loading-step {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  background: var(--color-background);
  border-radius: 8px;
  border: 1px solid var(--color-border);
  transition: all 0.3s ease;
}

.loading-step.active {
  background: rgba(var(--color-primary-rgb, 46, 92, 184), 0.1);
  border-color: var(--color-primary);
}

.step-icon {
  font-size: 1.2rem;
  font-weight: bold;
  color: var(--color-success);
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.loading-step.active .step-icon {
  color: var(--color-primary);
  animation: bounce 1s ease-in-out infinite;
}

@keyframes bounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-4px); }
}

.step-text {
  font-size: 0.95rem;
  color: var(--color-text);
  font-weight: 500;
}

.loading-hint {
  font-size: 0.875rem;
  color: var(--color-text-secondary);
  margin: 0;
  padding: 12px 20px;
  background: var(--color-background);
  border-radius: 8px;
  border-left: 3px solid var(--color-primary);
}

/* 移动端适配 */
@media (max-width: 768px) {
  .game-view {
    font-size: 13px;
  }

  /* 移动端侧边栏浮动显示，不占用主内容空间 */
  .left-sidebar {
    position: fixed;
    top: 0; /* 从顶部开始 */
    left: 0;
    bottom: 0;
    height: 100%;
    width: 280px;
    z-index: 1000;
    transform: translateX(-100%);
    transition: transform 0.3s ease;
    box-shadow: 2px 0 8px rgba(0, 0, 0, 0.15);
    overflow: hidden;
    background: var(--color-surface); /* 和右侧栏一样的背景色 */
  }

  .left-sidebar:not(.collapsed) {
    transform: translateX(0);
  }

  .left-sidebar .sidebar-wrapper {
    overflow-y: auto;
    overflow-x: visible;
    height: 100%;
    -webkit-overflow-scrolling: touch;
    box-sizing: border-box;
    padding-right: 2px; /* 防止边框被截断 */
  }

  .right-panel-area {
    position: fixed;
    top: 0; /* 从顶部开始 */
    right: 0;
    bottom: 0;
    height: 100%;
    width: 260px;
    z-index: 1000;
    transform: translateX(100%);
    transition: transform 0.3s ease;
    box-shadow: -2px 0 8px rgba(0, 0, 0, 0.15);
    overflow: hidden;
    background: var(--color-surface); /* 和左侧栏一样的背景色 */
  }

  .right-panel-area:not(.collapsed) {
    transform: translateX(0);
  }

  .right-panel-area .sidebar-wrapper {
    overflow-y: auto;
    overflow-x: hidden;
    height: 100%;
    -webkit-overflow-scrolling: touch;
    box-sizing: border-box;
  }

  /* 移动端背景遮罩层 */
  .mobile-sidebar-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: rgba(0, 0, 0, 0.5);
    z-index: 999; /* Below sidebars (1000) but above everything else */
  }

  /* 移动端收缩按钮样式 - 参考电脑版样式 */
  .collapse-btn {
    position: fixed;
    z-index: 1001;
    width: 20px;
    height: 44px;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    color: var(--color-text-secondary);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    display: flex;
    align-items: center;
    justify-content: center;
    touch-action: manipulation;
    top: 50%;
    transform: translateY(-50%);
    transition: all 0.3s ease;
  }

  .collapse-btn svg {
    width: 14px;
    height: 14px;
  }

  .collapse-btn:active {
    background: var(--color-surface-light);
    color: var(--color-text);
  }

  /* 左侧按钮：默认在左边缘，跟随侧边栏一起移动 */
  .collapse-btn.left {
    left: 0;
    border-radius: 0 8px 8px 0;
    border-left: none;
    transform: translateX(0) translateY(-50%);
    transition: transform 0.3s ease, background 0.2s ease;
  }

  /* 左侧栏展开时，按钮跟随移动 260px */
  .left-sidebar:not(.collapsed) ~ .collapse-btn.left {
    transform: translateX(260px) translateY(-50%);
  }

  /* 右侧按钮：默认在右边缘，跟随侧边栏一起移动 */
  .collapse-btn.right {
    right: 0;
    border-radius: 8px 0 0 8px;
    border-right: none;
    transform: translateX(0) translateY(-50%);
    transition: transform 0.3s ease, background 0.2s ease;
  }

  /* 右侧栏展开时（按钮没有 collapsed 类），按钮跟随移动 -260px */
  .collapse-btn.right:not(.collapsed) {
    transform: translateX(-260px) translateY(-50%);
  }

  /* 主内容区域占满屏幕 */
  .main-content {
    width: 100%;
    max-width: 100vw;
    margin: 0;
    padding: 0;
    overflow-x: hidden;
    word-wrap: break-word;
    overflow-wrap: break-word;
    box-sizing: border-box;
  }

  .game-content {
    gap: 0;
    margin-top: 0;
    max-width: 100vw;
    overflow-x: hidden;
    box-sizing: border-box;
  }

  .game-view {
    max-width: 100vw;
    overflow-x: hidden;
  }

  /* 移动端面板全屏优化 */
  .panel-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 999;
    overflow: hidden;
  }

  /* 面板头部移动端优化 */
  .panel-header {
    padding: 4px 8px;
    min-height: 36px;
    flex-wrap: nowrap;
    -webkit-tap-highlight-color: transparent;
    touch-action: manipulation;
  }

  .panel-header.compact {
    padding: 4px 8px;
  }

  .panel-title-compact .title-text {
    font-size: 0.85rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* 头部按钮触摸优化 */
  .back-btn,
  .action-btn-compact {
    -webkit-tap-highlight-color: transparent;
    touch-action: manipulation;
    min-width: 32px;
    min-height: 32px;
  }

  /* 面板内容移动端优化 - 确保文本区域能够收缩 */
  .panel-content {
    padding: 8px;
    overflow-y: auto;
    overflow-x: hidden;
    word-wrap: break-word;
    overflow-wrap: break-word;
  }

  .panel-content.compact {
    padding: 6px 8px 8px 8px;
  }

  .panel-shell {
    border-radius: 14px;
    box-shadow: 0 12px 28px rgba(0, 0, 0, 0.08);
    overflow: auto;
  }

  /* 确保面板内所有文本元素自动换行 */
  .panel-content *,
  .panel-overlay * {
    word-wrap: break-word;
    overflow-wrap: break-word;
    max-width: 100%;
  }

  /* 数据加载提示移动端优化 */
  .data-loading {
    padding: 8px;
  }

  .loading-content {
    padding: 40px 20px;
    max-width: 100%;
  }

  .loading-title {
    font-size: 1.2rem;
    white-space: normal;
    word-wrap: break-word;
  }

  .loading-message {
    font-size: 0.9rem;
    white-space: normal;
    word-wrap: break-word;
  }

  .loading-steps {
    gap: 8px;
  }

  .loading-step {
    padding: 8px 12px;
  }

  .step-text {
    font-size: 0.85rem;
    white-space: normal;
    word-wrap: break-word;
  }

  .loading-hint {
    font-size: 0.8rem;
    white-space: normal;
    word-wrap: break-word;
  }
}

/* ========== 深色玻璃拟态风格适配 ========== */
[data-theme="dark"] .game-view {
  background: rgb(30, 34, 40);
}

[data-theme="dark"] .game-content {
  background: rgb(30, 34, 40);
}

[data-theme="dark"] .left-sidebar,
[data-theme="dark"] .right-panel-area {
  background: rgba(30, 34, 40, 0.95);
  border-color: rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(12px);
}

[data-theme="dark"] .main-content {
  background: rgb(30, 34, 40);
}

[data-theme="dark"] .collapse-btn {
  background: rgba(30, 34, 40, 0.9);
  border-color: rgba(255, 255, 255, 0.1);
  color: #a09a8d;
}

[data-theme="dark"] .collapse-btn:hover {
  background: rgba(61, 58, 53, 0.95);
  color: #ece7dc;
  border-color: rgba(166, 198, 218, 0.3);
}

[data-theme="dark"] .panel-overlay {
  background: var(--color-background);
  backdrop-filter: blur(20px);
}

[data-theme="dark"] .panel-header {
  background: rgba(30, 34, 40, 0.8);
}

[data-theme="dark"] .panel-header::after {
  background: linear-gradient(90deg, transparent, rgba(166, 198, 218, 0.4), transparent);
}

[data-theme="dark"] .back-btn {
  color: #a09a8d;
}

[data-theme="dark"] .back-btn:hover {
  background: rgba(61, 58, 53, 0.8);
  color: #ece7dc;
}

[data-theme="dark"] .panel-title-compact .title-text {
  color: #ece7dc;
}

[data-theme="dark"] .panel-title-icon {
  color: #a6c6da;
}

[data-theme="dark"] .action-btn-compact {
  color: #a09a8d;
}

[data-theme="dark"] .action-btn-compact:hover {
  background: rgba(61, 58, 53, 0.8);
  color: #ece7dc;
}

[data-theme="dark"] .data-loading {
  background: rgba(30, 34, 40, 0.95);
}

[data-theme="dark"] .data-loading::before {
  background: radial-gradient(circle at 50% 50%, rgba(166, 198, 218, 0.08) 0%, transparent 70%);
}

[data-theme="dark"] .loading-title {
  background: linear-gradient(135deg, #a6c6da 0%, #c0caf5 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

[data-theme="dark"] .loading-message {
  color: #a09a8d;
}

[data-theme="dark"] .loading-step {
  background: rgba(30, 34, 40, 0.6);
  border-color: rgba(255, 255, 255, 0.08);
}

[data-theme="dark"] .loading-step.active {
  background: rgba(76, 135, 173, 0.15);
  border-color: rgba(166, 198, 218, 0.4);
}

[data-theme="dark"] .step-icon {
  color: #8fae72;
}

[data-theme="dark"] .loading-step.active .step-icon {
  color: #a6c6da;
}

[data-theme="dark"] .step-text {
  color: #ddd7c9;
}

[data-theme="dark"] .loading-hint {
  background: rgba(30, 34, 40, 0.6);
  border-left-color: #a6c6da;
  color: #a09a8d;
}

[data-theme="dark"] .spinner-glow {
  background: radial-gradient(circle, rgba(166, 198, 218, 0.4) 0%, transparent 70%);
}

[data-theme="dark"] .loading-spinner {
  border-top-color: #a6c6da;
  border-right-color: #a6c6da;
}

/* 超小屏幕适配 */
@media (max-width: 480px) {
  .game-view {
    font-size: 12px;
  }

  .left-sidebar {
    width: 260px;
  }

  /* 左侧栏展开时，按钮跟随移动 260px（匹配侧边栏宽度） */
  .left-sidebar:not(.collapsed) ~ .collapse-btn.left {
    transform: translateX(260px) translateY(-50%);
  }

  .right-panel-area {
    width: 220px;
  }

  /* 右侧栏展开时，按钮跟随移动 -220px（匹配侧边栏宽度） */
  .collapse-btn.right:not(.collapsed) {
    transform: translateX(-220px) translateY(-50%);
  }

  /* 小屏幕上面板全屏显示 */
  .panel-overlay {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 999;
  }

  .panel-header {
    padding: 3px 6px;
    min-height: 32px;
  }

  .panel-title-compact .title-text {
    font-size: 0.8rem;
  }

  .panel-content {
    padding: 6px;
    font-size: 0.9em;
  }

  .panel-shell {
    border-radius: 12px;
    box-shadow: 0 10px 22px rgba(0, 0, 0, 0.08);
  }

  .loading-title {
    font-size: 1rem;
  }

  .loading-message {
    font-size: 0.85rem;
  }

  .step-text {
    font-size: 0.8rem;
  }

  .loading-hint {
    font-size: 0.75rem;
  }
}
</style>
