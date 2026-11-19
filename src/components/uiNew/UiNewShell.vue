<template>
  <div class="ui-new ui-new-shell" :class="uiNewPhone ? { 'un-phone': true, 'un-kb': uiNewKeyboard, 'un-paneled': panelOpen || questOpen || uiStore.showCharacterManagement } : undefined" data-testid="ui-new-shell">
    <!-- 主区：游戏主面板（MainGamePanel 新摆法）或功能页 -->
    <div class="un-stage-slot">
      <template v-if="!dataReady">
        <section class="un-panel un-framed" style="grid-column: 1">
          <i class="un-orn-c tl"></i><i class="un-orn-c tr"></i><i class="un-orn-c bl"></i><i class="un-orn-c br"></i><i class="un-orn-m mt"></i><i class="un-orn-m mb"></i>
          <div class="un-pane" style="display:flex;align-items:center;justify-content:center;flex-direction:column;gap:12px;color:var(--un-sub)">
            <div class="un-ft" style="font-size:calc(34 * var(--u));color:var(--un-ink)">{{ t('道法自然，天地初开') }}</div>
            <div>{{ t('正在加载修仙世界...') }}</div>
          </div>
        </section>
      </template>
      <template v-else>
        <!-- 功能页：盖住场景框、立绘区和字框，右列不动；功能内容仍用现有面板 -->
        <!-- 背包：新摆法（大框＋字框），老背包面板挂在里面借逻辑；不走下面的通用功能页框 -->
        <UiNewInventory v-if="panelOpen && route.name === 'Inventory'" @close="backToGame" />
        <!-- 存档：同背包页的办法（大框＋字框），老存档面板挂在里面借逻辑 -->
        <UiNewSaves v-else-if="panelOpen && route.name === 'Save'" @close="backToGame" />
        <!-- 地图：大框放老地图面板本体，点地点的弹窗内容换到字框 -->
        <UiNewMap v-else-if="panelOpen && route.name === 'WorldMap'" @close="backToGame" />
        <section v-else-if="panelOpen" class="un-panel un-framed" data-testid="ui-new-panel">
          <i class="un-orn-c tl"></i><i class="un-orn-c tr"></i><i class="un-orn-c bl"></i><i class="un-orn-c br"></i><i class="un-orn-m mb"></i>
          <div class="un-panel-ttl">
            <span class="pq on" style="width:auto;min-width:calc(150 * var(--u));height:calc(48 * var(--u));font-size:calc(26 * var(--u))">{{ panelTitle }}</span>
          </div>
          <div class="un-panel-acts">
            <button v-for="btn in panelActions" :key="btn.key" class="pq xs" type="button" :title="btn.title" @click="btn.onClick">{{ btn.title }}</button>
            <button class="pq xs on" type="button" data-testid="ui-new-panel-close" @click="backToGame">{{ t('收起') }}</button>
          </div>
          <div class="un-pane"><div class="un-panel-body"><slot />
            <!-- 「人物」：老右栏里人物页没有的三块（状态效果、玩家认知与路径、战役编年史）。复用老右栏组件（同一份数据和逻辑），样式里只留这三块 -->
            <div v-if="route.name === 'CharacterDetails'" class="un-char-extra" data-testid="ui-new-char-extra"><ErrorBoundary><RightSidebar /></ErrorBoundary></div>
          </div></div>
        </section>
        <slot v-else />
        <!-- 「任务」：任务目标／任务日志只在老右栏里。复用老右栏组件（同一份数据和逻辑），样式里只留任务那几块，其余（数值、境界、状态等）藏起 -->
        <section v-if="questOpen && !panelOpen" class="un-panel un-framed" data-testid="ui-new-quest">
          <i class="un-orn-c tl"></i><i class="un-orn-c tr"></i><i class="un-orn-c bl"></i><i class="un-orn-c br"></i><i class="un-orn-m mb"></i>
          <div class="un-panel-ttl">
            <span class="pq on" style="width:auto;min-width:calc(150 * var(--u));height:calc(48 * var(--u));font-size:calc(26 * var(--u))">{{ t('任务') }}</span>
          </div>
          <div class="un-panel-acts">
            <button class="pq xs on" type="button" @click="questOpen = false">{{ t('收起') }}</button>
          </div>
          <div class="un-pane"><div class="un-panel-body un-quest-body"><p class="un-quest-empty" data-testid="ui-new-quest-empty">{{ t('眼下没有记下的事') }}</p><ErrorBoundary><RightSidebar /></ErrorBoundary></div></div>
        </section>
        <slot name="extra" />
      </template>
    </div>

    <!-- 右列：三个动词 + 七项菜单 + 更多 -->
    <nav class="un-cmd" aria-label="新界面菜单">
      <button
        v-for="verb in VERBS"
        :key="verb"
        type="button"
        class="pq"
        data-testid="ui-new-verb"
        :disabled="!dataReady"
        @click="fillVerb(verb)"
      >{{ verb }}</button>
      <div class="un-rule"></div>
      <button
        v-for="item in MENU"
        :key="item.label"
        type="button"
        class="mi"
        :class="{ on: isMenuOn(item) }"
        data-testid="ui-new-menu"
        :disabled="item.needsCharacter && !activeCharacter"
        @click="clickMenu(item)"
      ><i></i>{{ item.label }}</button>
      <button type="button" class="mi more" :class="{ on: moreOpen }" data-testid="ui-new-more" @click="moreOpen = !moreOpen"><i></i>{{ t('更多') }}</button>
    </nav>

    <!-- 「更多」：老左栏里七项之外的入口（老左栏没有显示条件，全部列出） -->
    <div v-if="moreOpen" class="un-more" data-testid="ui-new-more-list">
      <template v-if="uiNewPhone">
        <button v-for="item in MENU" :key="item.label" type="button" class="mi" :class="{ on: isMenuOn(item) }" :disabled="item.needsCharacter && !activeCharacter" @click="clickMenu(item)"><i></i>{{ item.label }}</button>
        <div class="un-rule" style="width:100%"></div>
      </template>
      <button v-for="item in MORE" :key="item.label" type="button" class="mi" :class="{ on: isMenuOn(item) }" @click="clickMore(item)"><i></i>{{ t(item.label) }}</button>
      <div class="un-rule" style="width:100%"></div>
      <button type="button" class="mi" @click="moreOpen = false; handleBackToMenu()"><i></i>{{ t('返回道途') }}</button>
      <button v-if="uiNewPhone" type="button" class="pq xs on un-more-close" data-testid="ui-new-more-close" @click="moreOpen = false">{{ t('收起') }}</button>
    </div>

    <!-- 底行：地点、日期时辰、在场、三条数值（与老顶栏／老右栏同一份来源） -->
    <footer v-if="dataReady" class="un-bar" data-testid="ui-new-bar">
      <b>{{ currentLocation }}</b>
      <span :title="uiNewPhone ? gameTime : undefined">{{ uiNewPhone ? shortGameTime(gameTime) : gameTime }}</span>
      <span v-if="presentLine && !uiNewPhone" class="who-here">{{ t('在场') }}　{{ presentLine }}</span>
      <button v-if="presentLine && uiNewPhone" type="button" class="un-here-btn" :class="{ on: hereOpen }" data-testid="ui-new-here" @click="hereOpen = !hereOpen">{{ t('在场') }}</button>
      <span class="sp"></span>
      <span v-for="v in VITALS" :key="v" class="st">{{ uiNewPhone ? t(v).slice(0, 1) : t(v) }}<u><i :style="{ width: vitalPercent(v) + '%' }"></i></u>{{ vitalValue(v) }}</span>
    </footer>
    <div v-if="uiNewPhone && hereOpen && presentLine && dataReady" class="un-here" data-testid="ui-new-here-strip" @click="hereOpen = false">{{ t('在场') }}　{{ presentLine }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useGameStateStore } from '@/stores/gameStateStore';
import { useCharacterStore } from '@/stores/characterStore';
import { useUIStore } from '@/stores/uiStore';
import { useI18n } from '@/i18n';
import { toast } from '@/utils/toast';
import { chatBus } from '@/utils/chatBus';
import { locationDescriptionWithCountry } from '@/modules/scenarioMods/travel/locationIds';
import { computeScenarioPresence } from '@/modules/scenarioMods/storyContext';
import { uiNewLead } from '@/composables/uiNewLead';
import { uiNewPhone, uiNewKeyboard } from '@/composables/uiNew';
import { shortGameTime } from '@/components/uiNew/phoneLayout';
import RightSidebar from '@/components/dashboard/RightSidebar.vue';
import UiNewInventory from '@/components/uiNew/UiNewInventory.vue';
import UiNewSaves from '@/components/uiNew/UiNewSaves.vue';
import UiNewMap from '@/components/uiNew/UiNewMap.vue';
import ErrorBoundary from '@/components/common/ErrorBoundary.vue';
import '@/styles/ui-new.css';

defineProps<{
  dataReady: boolean;
  panelOpen: boolean;
  panelTitle: string;
  panelActions: Array<{ key: string; title: string; onClick: () => void }>;
}>();

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const gameStateStore = useGameStateStore();
const characterStore = useCharacterStore();
const uiStore = useUIStore();

type MenuItem = { label: string; path?: string; routeNames?: string[]; quest?: boolean; needsCharacter?: boolean };

const VERBS = ['调查', '观察', '探索'] as const;
const MENU: MenuItem[] = [
  { label: '人物', path: '/game/character-details', routeNames: ['CharacterDetails'] },
  { label: '背包', path: '/game/inventory', routeNames: ['Inventory'] },
  { label: '关系', path: '/game/relationships', routeNames: ['Relationships'] },
  { label: '地图', path: '/game/world-map', routeNames: ['WorldMap'] },
  { label: '任务', quest: true },
  { label: '存档', path: '/game/save', routeNames: ['Save'], needsCharacter: true },
  { label: '设置', path: '/game/settings', routeNames: ['Settings'] },
];
// 老左栏（LeftSidebar.vue）里七项之外的入口，顺序照老左栏
const MORE: MenuItem[] = [
  { label: '功法技能', path: '/game/techniques', routeNames: ['Techniques'] },
  { label: '大道感悟', path: '/game/thousand-dao', routeNames: ['ThousandDao'] },
  { label: '炼制工坊', path: '/game/crafting', routeNames: ['Crafting'] },
  { label: '世界事件', path: '/game/events', routeNames: ['Events'] },
  { label: '宗门', path: '/game/sect', routeNames: ['Sect', 'SectOverview', 'SectMembers', 'SectManagement', 'SectLibrary', 'SectTasks', 'SectContribution', 'SectWar'] },
  { label: '记忆', path: '/game/memory', routeNames: ['Memory'] },
  { label: '游戏变量', path: '/game/game-variables', routeNames: ['GameVariables'] },
  { label: '提示词管理', path: '/game/prompts', routeNames: ['Prompts'] },
  { label: 'API管理', path: '/game/api-management', routeNames: ['APIManagement'] },
];
const VITALS = ['气血', '灵气', '神识'] as const;

const questOpen = ref(false);
const moreOpen = ref(false);
// 窄屏：底行「在场」收成一个小按钮，点一下在底行上方展开一条；右列的七项菜单收进「更多」排在最前（模板里不写注释：开发构建会把注释留进 DOM）
const hereOpen = ref(false);
const activeCharacter = computed(() => characterStore.activeCharacterProfile);

const isMenuOn = (item: MenuItem) => item.quest ? questOpen.value : !!item.routeNames?.includes(String(route.name));

const backToGame = () => {
  if (route.name !== 'GameMain') router.push('/game');
};

const clickMenu = (item: MenuItem) => {
  moreOpen.value = false;
  if (item.quest) {
    const opening = !questOpen.value;
    backToGame();
    questOpen.value = opening;
    return;
  }
  questOpen.value = false;
  // 再点一次同一项 = 收起回到游戏
  if (isMenuOn(item)) backToGame();
  else if (item.path) router.push(item.path);
};

const clickMore = (item: MenuItem) => {
  moreOpen.value = false;
  questOpen.value = false;
  if (isMenuOn(item)) backToGame();
  else if (item.path) router.push(item.path);
};

// 打开功能页时收起「任务」
watch(() => route.name, () => { if (route.name !== 'GameMain') questOpen.value = false; });

// 临时做法（第①步）：三个动词只把词填进自由输入框并聚焦，不发送。以后换成真正的动词交互。
const fillVerb = async (verb: string) => {
  questOpen.value = false;
  moreOpen.value = false;
  if (route.name !== 'GameMain') await router.push('/game');
  // 等主面板激活并挂上 chatBus 监听
  setTimeout(() => { void chatBus.emit('prefill', { text: verb, focus: true }); }, 0);
};

// ---- 底行数据：与 TopBar.vue / RightSidebar.vue 同一份来源 ----
const currentLocation = computed(() => {
  try {
    return locationDescriptionWithCountry(gameStateStore.location) || t('初始地');
  } catch {
    // lcq-allow: 与 TopBar 同口径，地点读不出时显示「初始地」
    return t('初始地');
  }
});
const gameTime = computed(() => {
  // 格式照 TopBar.vue 的 gameTime
  const time = gameStateStore.gameTime as any;
  if (!time) return `${t('仙道')}${t('元年')}1${t('月')}1${t('日')} 00:00`;
  const minutes = String(Number(time.分钟 ?? 0)).padStart(2, '0');
  const hours = String(time.小时 ?? 0).padStart(2, '0');
  if (time.相对日) return `${t(time.相对日)} ${hours}:${minutes}`;
  return `${t('仙道')}${time.年}${t('年')}${time.月}${t('月')}${time.日}${t('日')} ${hours}:${minutes}`;
});
// 在场：老界面没有这一栏；取主叙事提示词用的同一个在场口径 computeScenarioPresence（只读）。非剧本存档没有在场口径，不显示。
const presentLine = computed(() => {
  void gameStateStore.narrativeHistory?.length;
  void gameStateStore.location;
  try {
    const save = gameStateStore.toSaveData();
    if (!save) return '';
    const presence = computeScenarioPresence(save);
    if (!presence) return '';
    const playerName = String(gameStateStore.character?.名字 || '');
    const names = [...presence.presentNames].filter(name => name && name !== playerName);
    // 立绘区的主要角色排第一个（其余保持原顺序）
    const lead = uiNewLead.value?.name;
    if (lead && names.includes(lead)) names.sort((a, b) => Number(b === lead) - Number(a === lead));
    return names.length ? names.join(' · ') : t('只有你');
  } catch {
    // lcq-allow: 在场只是底行显示，算不出就不显示，不影响游戏
    return '';
  }
});
const vitalOf = (k: typeof VITALS[number]) => (gameStateStore.attributes as any)?.[k] as { 当前?: number; 上限?: number } | undefined;
const vitalPercent = (k: typeof VITALS[number]) => {
  const v = vitalOf(k);
  if (!v?.当前 || !v?.上限) return 0;
  return Math.round((v.当前 / v.上限) * 100);
};
const vitalValue = (k: typeof VITALS[number]) => vitalOf(k)?.当前 ?? '—';

// 「返回道途」：照 LeftSidebar.vue 的 handleBackToMenu／exitToMenu 原样
const exitToMenu = async () => {
  const exitingIsolated = characterStore.activeCharacterProfile?.隔离试玩信息?.localOnly === true;
  characterStore.rootState.当前激活存档 = null;
  await characterStore.commitMetadataToStorage({ localOnly: exitingIsolated });
  uiStore.stopLoading();
  await router.push('/');
};
const handleBackToMenu = () => {
  uiStore.showRetryDialog({
    title: t('返回道途'),
    message: t('您想如何退出当前游戏？'),
    confirmText: t('保存并退出'),
    cancelText: t('取消'),
    neutralText: t('不保存直接退出'),
    onConfirm: async () => {
      try {
        await gameStateStore.saveBeforeExit();
        toast.success(t('游戏已保存'));
      } catch {
        // lcq-allow: 照 LeftSidebar 原样，保存失败给提示后仍退出
        toast.error(t('游戏保存失败，但仍会继续退出。'));
      }
      await exitToMenu();
    },
    onNeutral: async () => {
      toast.info(t('游戏进度未保存'));
      await exitToMenu();
    },
    onCancel: () => {},
  });
};
</script>
