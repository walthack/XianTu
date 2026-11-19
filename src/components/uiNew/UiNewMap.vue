<template>
  <!-- 新界面地图页（照设计稿 pc-09 的摆法；不画新地图）：大框里就是老地图面板本体（画布、标记、拖动缩放、图例、境界栏、区域地图……原样），
       只把它点地点后弹出的小窗换到下面字框里；字和按钮照老弹窗，按钮调的是同一个老面板实例的同一个函数。 -->
  <section class="un-panel un-framed un-inv un-map" :class="{ legacy }" data-testid="ui-new-map">
    <i class="un-orn-c tl"></i><i class="un-orn-c tr"></i><i class="un-orn-c bl"></i><i class="un-orn-c br"></i><i class="un-orn-m mt"></i><i class="un-orn-m mb"></i>
    <div class="un-panel-ttl">
      <span class="pq on" style="width:auto;min-width:calc(150 * var(--u));height:calc(48 * var(--u));font-size:calc(26 * var(--u))">{{ t('地图') }}</span>
    </div>
    <div class="un-panel-acts">
      <button class="pq xs" type="button" data-testid="ui-new-map-legacy" @click="toggleLegacy">{{ legacy ? t('新版地图') : t('旧版地图') }}</button>
      <button v-if="legacy" class="pq xs on" type="button" data-testid="ui-new-panel-close" @click="emit('close')">{{ t('收起') }}</button>
    </div>
    <div class="un-pane">
      <div class="un-map-body" :class="{ 'no-popup': !legacy }" @touchstart.passive="onTapStart" @touchend.passive="onTapEnd"><GameMapPanel ref="panelRef" /></div>
    </div>
  </section>

  <!-- 字框：选中的地点／势力／大陆（老弹窗的内容）；右边是老弹窗里的按钮＋「收起」 -->
  <div v-if="!legacy" class="un-box un-inv-box un-map-box" data-testid="ui-new-map-box">
    <div v-if="detail" class="un-who">{{ detail.name }}</div>
    <div class="un-say un-inv-say" :class="{ n: !detail }">
      <template v-if="detail">
        <small class="un-map-head" data-testid="ui-new-map-head">{{ detail.head.join('　') }}</small>
        <p data-testid="ui-new-map-body">{{ detail.body }}</p>
        <small v-for="(line, i) in detail.lines" :key="i">{{ line }}</small>
      </template>
      <template v-else>
        <p data-testid="ui-new-map-here">{{ t('当前所在') }}：{{ hereName }}</p>
        <small>{{ t('点地图上的地点，在这里看详情') }}</small>
      </template>
    </div>
    <div class="un-inv-side">
      <button
        v-for="act in detail?.actions ?? []"
        :key="act.key"
        type="button"
        class="pq"
        :class="{ on: act.key === 'travel' }"
        :disabled="act.disabled"
        :data-act="act.key"
        data-testid="ui-new-map-act"
        @click="runAction(act.key)"
      >{{ act.label }}</button>
      <button type="button" class="pq" data-testid="ui-new-panel-close" @click="emit('close')">{{ t('收起') }}</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue';
import { useI18n } from '@/i18n';
import { useGameStateStore } from '@/stores/gameStateStore';
import { locationDescriptionWithCountry } from '@/modules/scenarioMods/travel/locationIds';
import GameMapPanel from '@/components/dashboard/GameMapPanel.vue';
import { mapDetail, type MapActionKey } from './mapView';
import { uiNewPhone } from '@/composables/uiNew';

const emit = defineEmits<{ close: [] }>();
const { t } = useI18n();
const gameStateStore = useGameStateStore();

const panelRef = ref<InstanceType<typeof GameMapPanel> | null>(null);
const m = computed(() => panelRef.value?.uiNewMap());
const legacy = ref(false);

// 窄屏：图例默认收起（老面板默认展开、没有对外的开关；在它挂好后点一下它自己的图例标题，玩家照样能点开）
onMounted(() => {
  if (!uiNewPhone.value) return;
  let tries = 0;
  const fold = () => {
    const header = document.querySelector<HTMLElement>('[data-testid="ui-new-map"] .map-legend:not(.collapsed) .legend-header');
    if (header) header.click();
    else if (document.querySelector('[data-testid="ui-new-map"] .map-legend.collapsed') == null && ++tries < 15) setTimeout(fold, 200);
  };
  void nextTick(fold);
});

// 窄屏：老地图的触摸只管拖动／双指缩放，点地点只认鼠标（touchstart 里 preventDefault，浏览器不再补发鼠标事件）。
// 这里把「一指轻点（移动 <10px、<500ms）」在画布上补发成一次鼠标按下＋松开，走老面板同一个点选判定。电脑宽不挂。
let tapFrom: { x: number; y: number; t: number } | null = null;
const onTapStart = (e: TouchEvent) => {
  tapFrom = uiNewPhone.value && e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() } : null;
};
const onTapEnd = (e: TouchEvent) => {
  const from = tapFrom; tapFrom = null;
  const touch = e.changedTouches[0];
  if (!from || !touch || e.touches.length || Date.now() - from.t > 500 || Math.hypot(touch.clientX - from.x, touch.clientY - from.y) > 10) return;
  const canvas = e.target instanceof HTMLCanvasElement ? e.target : null;
  if (!canvas) return;
  const init = { clientX: touch.clientX, clientY: touch.clientY, button: 0, bubbles: true };
  canvas.dispatchEvent(new MouseEvent('mousedown', init));
  canvas.dispatchEvent(new MouseEvent('mouseup', init));
};

const toggleLegacy = async () => {
  legacy.value = !legacy.value;
  // 大框尺寸变了（旧版连字框那块也占上），老面板只在窗口 resize 时重算画布，这里叫它同一个函数
  await nextTick();
  m.value?.handleResize();
};

const detail = computed(() => {
  const s = m.value;
  if (!s) return null;
  return mapDetail({
    selectedLocation: s.selectedLocation.value,
    selectedContinent: s.selectedContinent.value,
    travelPlayback: s.travelPlayback.value,
    isFactionLocation: s.isFactionLocation,
    getLocationTypeName: s.getLocationTypeName,
    mapTravelNotice: s.mapTravelNotice.value,
    selectedTravelRestriction: s.selectedTravelRestriction.value,
    selectedTravelPreview: s.selectedTravelPreview.value,
    travelConfirmation: s.travelConfirmation.value,
    mapTravelBusy: s.mapTravelBusy.value,
    isAIProcessing: s.mapTravelUi.isAIProcessing,
    isLoadingRegion: s.isLoadingRegion.value,
  });
});

// 没选中时：当前所在地（与底行／老顶栏同一口径）
const hereName = computed(() => {
  try {
    return locationDescriptionWithCountry(gameStateStore.location) || t('初始地');
  } catch {
    // lcq-allow: 与 TopBar 同口径，地点读不出时显示「初始地」
    return t('初始地');
  }
});

// 和老弹窗按钮一样：取消＝清掉确认态；前往＝travelToSelectedLocation；区域地图＝enterRegionMap(选中地点)
const runAction = (key: MapActionKey) => {
  const s = m.value;
  if (!s) return;
  if (key === 'cancel') s.travelConfirmation.value = null;
  else if (key === 'travel') void s.travelToSelectedLocation();
  else if (s.selectedLocation.value) void s.enterRegionMap(s.selectedLocation.value);
};
</script>
