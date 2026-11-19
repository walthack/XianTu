<template>
  <!-- 新界面存档页（照设计稿 pc-10）：大框＝一行一个存档；字框＝选中存档的概要和能做的事。
       存档逻辑一律借下面挂着的老存档面板（同一个组件实例的同一批函数／确认弹窗／提示），这里只换摆法。 -->
  <section class="un-panel un-framed un-inv un-sav" :class="{ legacy }" data-testid="ui-new-saves">
    <i class="un-orn-c tl"></i><i class="un-orn-c tr"></i><i class="un-orn-c bl"></i><i class="un-orn-c br"></i><i class="un-orn-m mt"></i><i class="un-orn-m mb"></i>
    <div class="un-panel-ttl">
      <span class="pq on" style="width:auto;min-width:calc(150 * var(--u));height:calc(48 * var(--u));font-size:calc(26 * var(--u))">{{ t('存档') }}</span>
    </div>
    <div class="un-panel-acts">
      <span v-if="p && !legacy" class="un-sav-count">{{ p.isOnlineMode ? '☁️ 云端存档' : `${p.manualSavesCount} 张存档` }}</span>
      <button v-if="p && !legacy && !p.isOnlineMode" class="pq xs" type="button" data-testid="ui-new-sav-new" :disabled="p.loading" title="新建存档" @click="p.createNewSave()">{{ t('新建存档') }}</button>
      <button v-for="btn in panelActions" :key="btn.key" class="pq xs" type="button" :title="btn.title" @click="btn.run">{{ t(btn.title) }}</button>
      <button class="pq xs" type="button" data-testid="ui-new-sav-legacy" @click="legacy = !legacy">{{ legacy ? t('新版存档') : t('旧版存档') }}</button>
      <button v-if="legacy" class="pq xs on" type="button" data-testid="ui-new-panel-close" @click="emit('close')">{{ t('收起') }}</button>
    </div>
    <div class="un-pane">
      <div v-if="!legacy && p" class="un-inv-main un-sav-main">
        <!-- 读档失败横幅：同老面板，常驻到下次成功读档或手动关闭 -->
        <div v-if="p.loadError" class="un-sav-error" role="alert">
          <span>{{ p.loadError }}</span>
          <button type="button" title="关闭" @click="p.loadError = ''">×</button>
        </div>
        <div class="un-sav-list" data-testid="ui-new-sav-list">
          <div v-if="p.loading" class="un-inv-empty"><p>{{ t('正在加载存档...') }}</p></div>
          <div v-else-if="!p.savesList.length" class="un-inv-empty">
            <p>{{ t('修仙路上尚未留存，创建存档记录道途') }}</p>
            <small>{{ t('开始游戏后可以创建存档') }}</small>
          </div>
          <template v-else>
            <button
              v-for="(save, index) in p.savesList"
              :key="save.id"
              type="button"
              class="un-sav-row"
              :class="{ on: rowKey(save) === selectedId, empty: isEmptySaveSlot(save) }"
              :data-save-name="save.存档名"
              data-testid="ui-new-sav-row"
              @click="selectedId = rowKey(save)"
            >
              <span class="g">{{ isEmptySaveSlot(save) ? '' : (save.角色名字?.[0] || '道') }}</span>
              <span class="nm">{{ saveRowName(save, index) }}<em v-if="isCurrentRow(save)">{{ t('当前进度') }}</em></span>
              <span class="loc">{{ saveSlotDetail(save, '位置') }}</span>
              <span class="lv">{{ saveSlotDetail(save, '境界') }}</span>
              <span class="who">{{ saveSlotCharacterName(save) }}</span>
              <span class="tm">{{ isEmptySaveSlot(save) ? EMPTY_SLOT_LABEL : p.formatTime(saveSlotModifiedAt(save)) }}</span>
            </button>
          </template>
        </div>
      </div>
      <!-- 老存档面板：新版时只挂着不显示（借它的状态、函数；确认弹窗走 uiStore 全局弹窗）；点「旧版存档」整块显示，所有老功能都在这里 -->
      <div class="un-inv-legacy" :class="{ headless: !legacy }"><div class="un-panel-body"><SavePanel ref="panelRef" /></div></div>
    </div>
  </section>

  <!-- 字框：选中存档的名字、概要、老卡片上的其余信息，右边是这一份在老面板里能做的事＋「收起」 -->
  <div v-if="!legacy" class="un-box un-inv-box un-sav-box" data-testid="ui-new-sav-box">
    <div v-if="current" class="un-who">{{ currentName }}</div>
    <div class="un-say un-inv-say" :class="{ n: !current }">
      <template v-if="current">
        <p data-testid="ui-new-sav-summary">{{ summary }}</p>
        <small v-for="(line, i) in detailLines" :key="i">{{ line }}</small>
      </template>
      <p v-else>{{ t('选择一份存档查看') }}</p>
    </div>
    <div class="un-inv-side">
      <button
        v-for="act in actions"
        :key="act.key"
        type="button"
        class="pq"
        :class="{ on: act.key === 'load' }"
        :disabled="act.disabled"
        :title="act.title"
        :data-act="act.key"
        data-testid="ui-new-sav-act"
        @click="runAction(act.key)"
      >{{ t(act.label) }}</button>
      <button type="button" class="pq" data-testid="ui-new-panel-close" @click="emit('close')">{{ t('收起') }}</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from '@/i18n';
import SavePanel from '@/components/dashboard/SavePanel.vue';
import type { SaveSlot } from '@/types/game';
import { lastConversationMatchesActive } from '@/utils/lastConversationGuard';
import {
  EMPTY_SLOT_LABEL, emptySaveSlotHint, isEmptySaveSlot, saveSlotCharacterName, saveSlotCreatedAt, saveSlotDetail, saveSlotModifiedAt,
} from '@/utils/saveSlotDisplay';
import { saveActions, saveRowName, type SaveActionKey } from './savesView';

const emit = defineEmits<{ close: [] }>();
const { t } = useI18n();

const panelRef = ref<InstanceType<typeof SavePanel> | null>(null);
const p = computed(() => panelRef.value);
const legacy = ref(false);

// 顶栏「刷新」「快速存档」：老界面经 panelBus 叫老面板的 refreshSaves／quickSave，这里直接叫挂着的这个实例（免得重复挂载留下的旧监听再跑一遍）
const panelActions = computed(() => {
  const panel = p.value;
  if (!panel) return [];
  return [
    { key: 'refresh', title: '刷新', run: () => void panel.refreshSaves() },
    { key: 'save', title: '快速存档', run: () => void panel.quickSave() },
  ];
});

// 选中态只在新页里（老面板 selectSave 只打日志）；列表里没有了（删掉了）就清空
const selectedId = ref<string>('');
// 老列表的过滤口径是「存档名 || id」有一个就算，选中键同样取这两个
const rowKey = (s: SaveSlot) => String(s.id || s.存档名 || '');
const currentIndex = computed(() => (p.value?.savesList ?? []).findIndex((s: SaveSlot) => rowKey(s) === selectedId.value));
const current = computed<SaveSlot | null>(() => (currentIndex.value >= 0 ? p.value!.savesList[currentIndex.value] : null));
watch(current, (now) => { if (!now && selectedId.value) selectedId.value = ''; });
// 「当前进度」标记（只管显示）：老面板顶上「当前进度 - 存档名」那一块读的是 currentSave，这里按存档名认出是哪一行。
// 按钮条件仍照老卡片用 save.id === currentSave.id（老面板的 currentSave 取自存档列表原条目，常常没有 id，这时老卡片也不认它是当前，按钮照老样）。
const isCurrentRow = (s: SaveSlot) => !!p.value?.currentSave && s.存档名 === p.value.currentSave.存档名;
const currentName = computed(() => (current.value ? saveRowName(current.value, currentIndex.value) : ''));

// 正文：一句概要（位置，境界）；小字：老卡片上其余的（角色、修改时间、当前进度的创建时间、空槽说明、自动槽说明）
const summary = computed(() => {
  const s = current.value;
  if (!s) return '';
  if (isEmptySaveSlot(s)) return EMPTY_SLOT_LABEL;
  return `${saveSlotDetail(s, '位置')}，${saveSlotDetail(s, '境界')}。`;
});
const detailLines = computed(() => {
  const s = current.value;
  const panel = p.value;
  if (!s || !panel) return [] as string[];
  const lines: string[] = [];
  const empty = isEmptySaveSlot(s);
  if (!empty) lines.push(`${saveSlotCharacterName(s)}　修改: ${panel.formatTime(saveSlotModifiedAt(s))}`);
  if (isCurrentRow(s)) {
    lines.push(`当前进度　${t('创建时间')} ${panel.formatTime(saveSlotCreatedAt(s))}　${t('最后保存')} ${panel.formatTime(saveSlotModifiedAt(s))}`);
  }
  if (s.存档名 === '上次对话') lines.push('每次对话前自动备份，可用于回退到上次对话前的状态');
  else if (s.存档名 === '时间点存档') lines.push('按设定时间间隔自动覆盖保存，防止长时间游玩数据丢失');
  const hint = emptySaveSlotHint(s, panel.timeBasedSaveEnabled);
  if (hint) lines.push(hint);
  return lines;
});

const actions = computed(() => {
  const s = current.value;
  const panel = p.value;
  if (!s || !panel) return [];
  return saveActions(s.存档名, {
    isCurrent: s.id === panel.currentSave?.id,
    loading: panel.loading,
    hasCurrent: !!panel.currentSave,
    isOnlineMode: panel.isOnlineMode,
    rollbackMatches: lastConversationMatchesActive(s, panel.activeSlotKey),
    undeletable: panel.isUndeletableSave(s),
    deleteTooltip: panel.getDeleteTooltip(s),
    empty: isEmptySaveSlot(s),
  });
});

// 和老卡片按钮一样：把这一份交给老面板的同名函数（确认弹窗、提示都由老面板弹）
const runAction = async (key: SaveActionKey) => {
  const panel = p.value;
  const s = current.value;
  if (!panel || !s) return;
  if (key === 'load') {
    await panel.loadSave(s);
    // 读档成功（老面板把横幅清空）后回到正文；失败留在存档页，横幅照老面板显示
    if (!panel.loadError) emit('close');
  } else if (key === 'rollback') void panel.rollbackFromLastConversation(s);
  else if (key === 'export') void panel.exportSingleSave(s);
  else if (key === 'overwrite') void panel.overwriteSave(s);
  else void panel.deleteSave(s);
};
</script>
