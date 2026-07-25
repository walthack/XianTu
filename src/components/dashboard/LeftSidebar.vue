<template>
  <div class="left-sidebar" :class="{ 'lang-en': currentLanguage === 'en' }">
    <div class="sidebar-header">
      <h3 class="sidebar-title">
        <LayoutGrid :size="20" class="title-icon" />
        {{ t('游戏功能') }}
      </h3>
      <div class="real-time">
        <Clock :size="14" class="time-icon" />
        <span>{{ currentRealTime }}</span>
      </div>
    </div>

    <div class="sidebar-content">
      <!-- 角色信息区 -->
      <div class="function-section">
        <div class="section-title">{{ t('角色信息') }}</div>
        <div class="function-group">
          <button class="function-btn primary" @click="handleCharacterDetails">
            <div class="btn-icon">
              <User :size="18" />
            </div>
            <div class="btn-content">
              <span class="btn-text">{{ t('人物属性') }}</span>
              <span class="btn-desc">{{ t('修为境界状态') }}</span>
            </div>
            <ChevronRight :size="14" class="btn-arrow" />
          </button>

          <button class="function-btn primary" @click="handleInventory">
            <div class="btn-icon">
              <Package :size="18" />
            </div>
            <div class="btn-content">
              <span class="btn-text">{{ t('背包物品') }}</span>
              <span class="btn-desc">{{ t('管理道具装备') }}</span>
            </div>
            <ChevronRight :size="14" class="btn-arrow" />
          </button>
        </div>
      </div>

      <!-- 修炼系统区 -->
      <div class="function-section">
        <div class="section-title">{{ t('修炼系统') }}</div>
        <div class="function-group">
          <button class="function-btn cultivation" @click="handleTechniques">
            <div class="btn-icon">
              <BookOpen :size="18" />
            </div>
            <div class="btn-content">
              <span class="btn-text">{{ t('功法技能') }}</span>
              <span class="btn-desc">{{ t('修炼突破晋级') }}</span>
            </div>
            <ChevronRight :size="14" class="btn-arrow" />
          </button>

          <button class="function-btn cultivation" @click="handleThousandDao">
            <div class="btn-icon">
              <Zap :size="18" />
            </div>
            <div class="btn-content">
              <span class="btn-text">{{ t('大道感悟') }}</span>
              <span class="btn-desc">{{ t('领悟天地法则') }}</span>
            </div>
            <ChevronRight :size="14" class="btn-arrow" />
          </button>

          <button class="function-btn cultivation" @click="handleCrafting">
            <div class="btn-icon">
              <Hammer :size="18" />
            </div>
            <div class="btn-content">
              <span class="btn-text">{{ t('炼制工坊') }}</span>
              <span class="btn-desc">{{ t('炼丹炼器炼天地') }}</span>
            </div>
            <ChevronRight :size="14" class="btn-arrow" />
          </button>
        </div>
      </div>

      <!-- 事件与探索区 -->
      <div class="function-section">
        <div class="section-title">{{ t('事件探索') }}</div>
        <div class="function-group">
          <button class="function-btn quest" @click="handleEvents">
            <div class="btn-icon">
              <Bell :size="18" />
            </div>
            <div class="btn-content">
              <span class="btn-text">{{ t('世界事件') }}</span>
              <span class="btn-desc">{{ t('世界变革与危机') }}</span>
            </div>
            <ChevronRight :size="14" class="btn-arrow" />
          </button>

          <button class="function-btn quest" @click="handleWorldMap">
            <div class="btn-icon">
              <Map :size="18" />
            </div>
            <div class="btn-content">
              <span class="btn-text">{{ t('世界地图') }}</span>
              <span class="btn-desc">{{ t('探索天下各地') }}</span>
            </div>
            <ChevronRight :size="14" class="btn-arrow" />
          </button>

          <button class="function-btn quest" v-if="isOnlineMode" @click="handleOnlinePlay">
            <div class="btn-icon">
              <Globe :size="18" />
            </div>
            <div class="btn-content">
              <span class="btn-text">{{ t('穿越') }}</span>
              <span class="btn-desc">{{ t('进入他人世界') }}</span>
            </div>
            <ChevronRight :size="14" class="btn-arrow" />
          </button>
        </div>
      </div>

      <!-- 社交势力区 -->
      <div class="function-section">
        <div class="section-title">{{ t('社交势力') }}</div>
        <div class="function-group">
          <button class="function-btn secondary" @click="handleRelationships">
            <div class="btn-icon">
              <Users :size="18" />
            </div>
            <div class="btn-content">
              <span class="btn-text">{{ t('人物关系') }}</span>
              <span class="btn-desc">{{ t('人脉交际管理') }}</span>
            </div>
            <ChevronRight :size="14" class="btn-arrow" />
          </button>

          <button class="function-btn secondary" @click="handleSect">
            <div class="btn-icon">
              <Home :size="18" />
            </div>
            <div class="btn-content">
              <span class="btn-text">{{ t('宗门') }}</span>
              <span class="btn-desc">{{ t('门派事务管理') }}</span>
            </div>
            <ChevronRight :size="14" class="btn-arrow" />
          </button>

          <button class="function-btn secondary" @click="handleMemoryCenter">
            <div class="btn-icon">
              <Brain :size="18" />
            </div>
            <div class="btn-content">
              <span class="btn-text">{{ t('记忆') }}</span>
              <span class="btn-desc">{{ t('重要事件回顾') }}</span>
            </div>
            <ChevronRight :size="14" class="btn-arrow" />
          </button>
        </div>
      </div>

      <div class="divider"></div>

      <!-- 系统功能区 -->
      <div class="system-section">
        <div class="section-title">{{ t('系统功能') }}</div>
        <div class="function-group">
          <button class="function-btn system" @click="handleSaveGame" :disabled="!activeCharacter">
            <div class="btn-icon">
              <Save :size="18" />
            </div>
            <div class="btn-content">
              <span class="btn-text">{{ t('保存游戏') }}</span>
              <span class="btn-desc">{{ t('保存当前进度') }}</span>
            </div>
            <ChevronRight :size="14" class="btn-arrow" />
          </button>

          <button class="function-btn system" v-if="!isOnlineMode" @click="handleGameVariables">
            <div class="btn-icon">
              <Database :size="18" />
            </div>
            <div class="btn-content">
              <span class="btn-text">{{ t('游戏变量') }}</span>
              <span class="btn-desc">{{ t('查看游戏数据') }}</span>
            </div>
            <ChevronRight :size="14" class="btn-arrow" />
          </button>

          <button class="function-btn system" @click="handlePrompts">
            <div class="btn-icon">
              <FileText :size="18" />
            </div>
            <div class="btn-content">
              <span class="btn-text">{{ t('提示词管理') }}</span>
              <span class="btn-desc">{{ t('自定义提示词') }}</span>
            </div>
            <ChevronRight :size="14" class="btn-arrow" />
          </button>

          <button class="function-btn system" @click="handleAPIManagement">
            <div class="btn-icon">
              <Plug :size="18" />
            </div>
            <div class="btn-content">
              <span class="btn-text">{{ t('API管理') }}</span>
              <span class="btn-desc">{{ t('多API配置') }}</span>
            </div>
            <ChevronRight :size="14" class="btn-arrow" />
          </button>

          <button class="function-btn system" @click="handleSettings">
            <div class="btn-icon">
              <Settings :size="18" />
            </div>
            <div class="btn-content">
              <span class="btn-text">{{ t('系统设置') }}</span>
              <span class="btn-desc">{{ t('偏好设置') }}</span>
            </div>
            <ChevronRight :size="14" class="btn-arrow" />
          </button>

          <button v-if="isAdmin" class="function-btn admin" @click="handleBackendAdmin">
            <div class="btn-icon">
              <Shield :size="18" />
            </div>
            <div class="btn-content">
              <span class="btn-text">{{ t('仙官后台') }}</span>
              <span class="btn-desc">{{ t('管理员控制台') }}</span>
            </div>
            <ChevronRight :size="14" class="btn-arrow" />
          </button>

          <button class="function-btn exit-btn no-arrow" @click="handleBackToMenu">
            <div class="btn-icon">
              <LogOut :size="18" />
            </div>
            <div class="btn-content">
              <span class="btn-text">{{ t('返回道途') }}</span>
              <span class="btn-desc">{{ t('退出当前游戏') }}</span>
            </div>
          </button>
        </div>
      </div>
    </div>

    <!-- 版本号显示 -->
    <div class="sidebar-footer">
      <span class="app-version">V{{ displayVersion }}</span>
      <div class="footer-links">
        <a href="https://github.com/qianye60/XianTu" target="_blank" class="footer-link github" title="GitHub">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
          </svg>
        </a>
        <button type="button" class="footer-link sponsor" title="赞助支持" @click="showSponsorModal = true">
          <Heart :size="14" />
        </button>
      </div>
    </div>

    <teleport to="body">
      <div v-if="showSponsorModal" class="sponsor-modal-overlay" @click.self="showSponsorModal = false">
        <div class="sponsor-modal">
        <div class="sponsor-modal-header">
          <h3>赞助支持（自愿）</h3>
          <button class="sponsor-close" @click="showSponsorModal = false">&times;</button>
        </div>
          <div class="sponsor-modal-body">
            <div class="sponsor-qr">
              <img src="https://ddct.top/zhifubao.jpg" alt="支付宝赞助二维码" loading="lazy" />
              <span>支付宝</span>
            </div>
            <div class="sponsor-qr">
              <img src="https://ddct.top/weixing.jpg" alt="微信赞助二维码" loading="lazy" />
              <span>微信</span>
            </div>
          </div>
        </div>
      </div>
    </teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { Package, User, Users, BookOpen, Zap, Brain, Map, Globe, Save, Settings, LogOut, Compass, Home, Bell, ChevronRight, Database, Clock, FileText, Plug, LayoutGrid, Heart, Shield, Hammer } from 'lucide-vue-next';
import { useCharacterStore } from '@/stores/characterStore';
import { toast } from '@/utils/toast';
import { useUIStore } from '@/stores/uiStore';
import { useI18n } from '@/i18n';
import { isBackendConfigured, fetchBackendVersion } from '@/services/backendConfig';

const router = useRouter();
const characterStore = useCharacterStore();
const uiStore = useUIStore();
const { t, currentLanguage } = useI18n();

// 版本号相关
const backendReady = ref(false);
const showSponsorModal = ref(false);
const backendVersion = ref<string | null>(null);

const displayVersion = computed(() => (
  backendReady.value ? (backendVersion.value ?? '同步中') : APP_VERSION
));

// 实时北京时间
const currentRealTime = ref('');
let timeInterval: number | null = null;

const updateRealTime = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const day = now.getDate().toString().padStart(2, '0');
  const hours = now.getHours().toString().padStart(2, '0');
  const minutes = now.getMinutes().toString().padStart(2, '0');
  const seconds = now.getSeconds().toString().padStart(2, '0');
  currentRealTime.value = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};

onMounted(async () => {
  updateRealTime();
  timeInterval = window.setInterval(updateRealTime, 1000);

  // 获取后端版本
  if (isBackendConfigured()) {
    const version = await fetchBackendVersion();
    if (version) {
      backendReady.value = true;
      backendVersion.value = version;
    }
  }
});

onUnmounted(() => {
  if (timeInterval) {
    clearInterval(timeInterval);
  }
});

// 使用 store 的 getters 获取数据
const activeCharacter = computed(() => characterStore.activeCharacterProfile);
const isOnlineMode = computed(() => activeCharacter.value?.模式 === '联机');
const isAdmin = computed(() => localStorage.getItem('is_admin') === 'true');

const handleSaveGame = async () => {
  router.push('/game/save');
};

const handleInventory = () => {
  router.push('/game/inventory');
};

const handleCharacterDetails = () => {
  router.push('/game/character-details');
};

const handleEvents = () => {
  router.push('/game/events');
};

const handleSect = () => {
  router.push('/game/sect');
};

const handleRelationships = () => {
  router.push('/game/relationships');
};

const handleTechniques = () => {
  router.push('/game/techniques');
};

const handleThousandDao = () => {
  router.push('/game/thousand-dao');
};

const handleCrafting = () => {
  router.push('/game/crafting');
};

const handleMemoryCenter = () => {
  router.push('/game/memory');
};

const handleWorldMap = () => {
  router.push('/game/world-map');
};

const handleOnlinePlay = () => {
  router.push('/game/travel');
};

const handlePrompts = () => {
  router.push('/game/prompts');
};

const handleSettings = () => {
  router.push('/game/settings');
};

const handleAPIManagement = () => {
  router.push('/game/api-management');
};

const handleGameVariables = () => {
  router.push('/game/game-variables');
};

const handleBackendAdmin = () => {
  router.push('/game/backend-admin');
};

const handleBackToMenu = () => {
  uiStore.showRetryDialog({
    title: t('返回道途'),
    message: t('您想如何退出当前游戏？'),
    confirmText: t('保存并退出'),
    cancelText: t('取消'),
    neutralText: t('不保存直接退出'),
    onConfirm: async () => {
      console.log('[返回道途] 用户选择保存并退出...');
      try {
        // 使用 gameStateStore 的 saveBeforeExit 保存
        const { useGameStateStore } = await import('@/stores/gameStateStore');
        const gameStateStore = useGameStateStore();
        await gameStateStore.saveBeforeExit();
        toast.success(t('游戏已保存'));
      } catch (error) {
        console.error('[返回道途] 保存游戏失败:', error);
        toast.error(t('游戏保存失败，但仍会继续退出。'));
      }
      await exitToMenu();
    },
    onNeutral: async () => {
      console.log('[返回道途] 用户选择不保存直接退出...');
      toast.info(t('游戏进度未保存'));
      await exitToMenu(); // 传入 false 表示不保存
    },
    onCancel: () => {
      console.log('[返回道途] 用户取消操作');
    }
  });
};

// 封装一个统一的退出函数，避免代码重复
const exitToMenu = async () => {
  // 🔥 [新架构] 不再需要清理酒馆上下文，数据已在IndexedDB中管理
  console.log('[返回道途] 准备返回主菜单');

  characterStore.rootState.当前激活存档 = null;
  await characterStore.commitMetadataToStorage();
  console.log('[返回道途] 已重置激活存档状态');

  uiStore.stopLoading();
  await router.push('/');
  console.log('[返回道途] 已跳转至主菜单');
};
</script>

<style scoped>
.left-sidebar {
  --sidebar-card-radius: 10px;
  --sidebar-btn-radius: 8px;
  --sidebar-pill-radius: 6px;
  width: 100%;
  height: 100%;
  padding: 10px 8px;
  box-sizing: border-box;
  font-family: var(--font-family-sans-serif);
  display: flex;
  flex-direction: column;
  background: var(--color-surface);
  border-radius: 0;
  box-shadow: none;
  position: relative;
  isolation: isolate;
  overflow: visible;
}

.left-sidebar::before {
  content: '';
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse 80% 50% at 10% 0%, rgba(var(--color-primary-rgb), 0.08), transparent),
    radial-gradient(ellipse 60% 40% at 95% 5%, rgba(var(--color-accent-rgb), 0.06), transparent);
  pointer-events: none;
  z-index: 0;
}

.sidebar-header,
.sidebar-content,
.sidebar-footer {
  position: relative;
  z-index: 1;
}

.sidebar-header {
  margin: 0 0 10px 0;
  padding: 10px 8px;
  border-bottom: 1px solid rgba(var(--color-border-rgb), 0.3);
  background: transparent;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.sidebar-footer {
  margin-top: auto;
  padding: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  border-top: 1px solid rgba(var(--color-border-rgb), 0.3);
  background: transparent;
  flex-shrink: 0;
}

.footer-links {
  display: flex;
  gap: 6px;
}

.footer-link {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border-radius: 50%;
  color: var(--color-text-secondary);
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  transition: all 0.2s ease;
  cursor: pointer;
}

.footer-link:hover {
  transform: scale(1.1);
}

.footer-link.github {
  color: var(--color-text-secondary);
}

.footer-link.github:hover {
  color: #fff;
  background: #333;
  border-color: #333;
}

.footer-link.sponsor {
  color: #f472b6;
}

.footer-link.sponsor:hover {
  color: #fff;
  background: #ec4899;
  border-color: #ec4899;
}

.sponsor-modal-overlay {
  position: fixed;
  inset: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  z-index: 2000;
}

.sponsor-modal {
  width: min(520px, 100%);
  background: var(--color-surface, #ffffff);
  border-radius: 14px;
  border: 1px solid var(--color-border);
  box-shadow: 0 30px 80px rgba(0, 0, 0, 0.45);
  overflow: hidden;
}

.sponsor-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-surface-light);
  color: var(--color-text);
}

.sponsor-modal-header h3 {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 800;
}

.sponsor-close {
  background: transparent;
  border: 1px solid var(--color-border);
  color: var(--color-text);
  font-size: 1.5rem;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.sponsor-close:hover {
  background: var(--color-surface-hover);
}

.sponsor-modal-body {
  padding: 1rem 1.25rem 1.5rem;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
  justify-items: center;
}

.sponsor-qr {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
}

.sponsor-qr img {
  width: 100%;
  max-width: 240px;
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.2);
  display: block;
}

.sponsor-qr span {
  font-size: 0.9rem;
  color: var(--color-text-secondary);
}

.app-version {
  font-family: monospace;
  font-size: 0.75rem;
  font-weight: 600;
  color: #8cc3d1;
  padding: 0.25rem 0.6rem;
  background: linear-gradient(135deg, rgba(111, 178, 198, 0.12) 0%, rgba(56, 189, 248, 0.08) 100%);
  border: 1px solid rgba(111, 178, 198, 0.35);
  border-radius: 10px;
  display: inline-block;
  letter-spacing: 0.5px;
  text-shadow: 0 0 8px rgba(111, 178, 198, 0.5);
  box-shadow: 0 0 12px rgba(111, 178, 198, 0.15);
  transition: all 0.3s ease;
}

.app-version:hover {
  color: #a5f3fc;
  border-color: rgba(111, 178, 198, 0.5);
  box-shadow: 0 0 16px rgba(111, 178, 198, 0.25);
  text-shadow: 0 0 12px rgba(111, 178, 198, 0.7);
}

.sidebar-title {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
  color: var(--color-text);
  text-align: center;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}


.real-time {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-size: 0.75rem;
  color: var(--color-text-secondary);
  font-family: 'Courier New', monospace;
  padding: 4px 8px;
  background: rgba(var(--color-surface-rgb), 0.7);
  border-radius: var(--sidebar-pill-radius);
  border: 1px solid rgba(var(--color-border-rgb), 0.5);
}

.time-icon {
  color: var(--color-primary);
}

.title-icon {
  color: var(--color-primary);
}

.sidebar-content {
  flex: 1;
  overflow-y: auto;
  overflow-x: visible; /* 改为 visible 防止右边框被截断 */
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;
  padding-bottom: 4px;
  padding-right: 2px; /* 给右边框留出空间 */
  min-width: 0;
}

.sidebar-content::-webkit-scrollbar {
  width: 4px;
}
.sidebar-content::-webkit-scrollbar-track {
  background: transparent;
}
.sidebar-content::-webkit-scrollbar-thumb {
  background: transparent;
  border-radius: 2px;
}
[data-theme="dark"] .sidebar-content::-webkit-scrollbar-thumb {
  background: transparent;
}

/* 功能分区样式 */
.function-section {
  margin: 0 5px 8px 5px;
  padding: 8px;
  border-radius: var(--sidebar-card-radius);
  border: 1px solid rgba(var(--color-border-rgb), 0.3);
  background: rgba(var(--color-surface-rgb), 0.4);
}

.section-title {
  font-size: 0.65rem;
  font-weight: 600;
  color: var(--color-text-secondary);
  margin-bottom: 6px;
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(var(--color-primary-rgb), 0.05);
  display: inline-flex;
  align-items: center;
  letter-spacing: 0.3px;
}

.function-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-right: 2px; /* 防止按钮右边框被截断 */
}

.system-section {
  margin: 0 5px 8px 5px;
  padding: 8px;
  border-radius: var(--sidebar-card-radius);
  border: 1px solid rgba(var(--color-border-rgb), 0.3);
  background: rgba(var(--color-surface-rgb), 0.4);
}

.divider {
  height: 1px;
  background: linear-gradient(90deg, transparent 10%, rgba(var(--color-border-rgb), 0.4) 50%, transparent 90%);
  margin: 8px 0;
}

/* 增强的按钮样式 */
.function-btn {
  display: flex;
  align-items: center;
  padding: 10px 12px;
  background: rgba(var(--color-surface-rgb), 0.6);
  border: 1px solid rgba(var(--color-border-rgb), 0.3);
  border-radius: var(--sidebar-btn-radius);
  cursor: pointer;
  transition: all 0.2s ease;
  font-family: inherit;
  text-align: left;
  width: 100%;
  position: relative;
  overflow: hidden;
}

.function-btn:hover {
  background: rgba(var(--color-surface-rgb), 0.9);
  border-color: rgba(var(--color-primary-rgb), 0.4);
  transform: translateX(2px);
}

.function-btn:active {
  transform: translateX(1px) scale(0.99);
}

/* 按钮图标区域 */
.function-btn .btn-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: var(--sidebar-pill-radius);
  background: var(--color-background);
  margin-right: 10px;
  transition: all 0.2s ease;
  flex-shrink: 0;
}

/* 按钮内容区域 */
.function-btn .btn-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.function-btn .btn-text {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--color-text);
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 英文环境下允许文字换行 */
.lang-en .function-btn .btn-text {
  white-space: normal;
  word-break: break-word;
  font-size: 0.8rem;
}

.function-btn .btn-desc {
  font-size: 0.7rem;
  color: var(--color-text-secondary);
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 英文环境下允许描述换行 */
.lang-en .function-btn .btn-desc {
  white-space: normal;
  word-break: break-word;
  font-size: 0.65rem;
}

/* 按钮箭头 */
.function-btn .btn-arrow {
  color: var(--color-text-muted);
  transition: all 0.2s ease;
  margin-left: 6px;
  opacity: 0.5;
}

.function-btn:hover .btn-arrow {
  color: var(--color-primary);
  transform: translateX(2px);
  opacity: 1;
}

/* 无箭头按钮的右边距补偿 */
.function-btn.no-arrow .btn-content {
  margin-right: 16px; /* 14px (箭头宽度) + 8px (margin-left) */
}

/* 分类颜色主题 */
.function-btn.primary .btn-icon {
  background: rgba(76, 135, 173, 0.08);
  color: rgb(76, 135, 173);
}

.function-btn.primary:hover .btn-icon {
  background: rgba(76, 135, 173, 0.12);
}

.function-btn.secondary .btn-icon {
  background: rgba(79, 155, 126, 0.08);
  color: rgb(79, 155, 126);
}

.function-btn.secondary:hover .btn-icon {
  background: rgba(79, 155, 126, 0.12);
}

/* 修炼系统 - 金色 */
.function-btn.cultivation .btn-icon {
  background: rgba(198, 148, 49, 0.08);
  color: rgb(198, 148, 49);
}

.function-btn.cultivation:hover .btn-icon {
  background: rgba(198, 148, 49, 0.12);
}

/* 任务探索 - 紫色 */
.function-btn.quest .btn-icon {
  background: rgba(138, 111, 168, 0.08);
  color: rgb(138, 111, 168);
}

.function-btn.quest:hover .btn-icon {
  background: rgba(138, 111, 168, 0.12);
}

.function-btn.system .btn-icon {
  background: rgba(107, 114, 128, 0.08);
  color: rgb(107, 114, 128);
}

.function-btn.system:hover .btn-icon {
  background: rgba(107, 114, 128, 0.12);
}

/* 禁用状态样式 */
.function-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  background: var(--color-surface-light);
}

.function-btn:disabled:hover {
  background: var(--color-surface-light);
  transform: none;
  box-shadow: none;
  border-color: var(--color-border);
}

.function-btn:disabled .btn-icon {
  background: var(--color-background);
  border-color: var(--color-border);
}

.function-btn:disabled .btn-arrow {
  opacity: 0.3;
  transform: none;
}

.function-btn.disabled {
  position: relative;
  opacity: 0.6;
}

.disabled-text {
  font-style: italic;
  opacity: 0.7;
}

/* 退出按钮特殊样式 */
.exit-btn {
  border-color: rgba(195, 75, 60, 0.3);
  background: rgba(195, 75, 60, 0.04);
}

.exit-btn:hover {
  background: rgba(195, 75, 60, 0.08);
  border-color: rgba(195, 75, 60, 0.4);
}

.exit-btn .btn-text {
  color: var(--color-error);
}

.exit-btn .btn-desc {
  color: rgba(195, 75, 60, 0.6);
}

.exit-btn .btn-icon {
  background: rgba(195, 75, 60, 0.08);
  color: var(--color-error);
}

.exit-btn:hover .btn-icon {
  background: rgba(195, 75, 60, 0.12);
}

/* 管理员按钮样式 */
.function-btn.admin .btn-icon {
  background: rgba(198, 148, 49, 0.08);
  color: rgb(198, 148, 49);
}

.function-btn.admin:hover .btn-icon {
  background: rgba(198, 148, 49, 0.12);
}

.function-btn.admin .btn-text {
  color: rgb(198, 148, 49);
}

.function-btn.admin .btn-desc {
  color: rgba(198, 148, 49, 0.6);
}

/* 深色主题无需额外适配：已统一使用主题变量 */

/* 响应式适配 */
@media (max-width: 768px) {
  .left-sidebar {
    padding: 12px;
  }

  .function-section,
  .system-section {
    padding: 8px;
  }

  .function-btn {
    padding: 10px 12px;
  }

  .function-btn .btn-icon {
    width: 32px;
    height: 32px;
  }

  .function-btn .btn-text {
    font-size: 0.8rem;
  }

  .function-btn .btn-desc {
    font-size: 0.65rem;
  }
}

/* ========== iframe环境（酒馆端）样式 ========== */
/* 不做特殊放大，使用与网页版相同的样式 */
</style>
