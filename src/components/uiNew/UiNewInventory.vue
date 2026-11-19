<template>
  <!-- 新界面背包页（照设计稿 pc-07）：大框＝分类牌子＋物品格子；字框＝选中物品的说明和能做的事。
       物品逻辑一律借下面挂着的老背包面板（同一个组件实例的同一批函数／确认弹窗／数量选择），这里只换摆法。 -->
  <section class="un-panel un-framed un-inv" :class="{ legacy }" data-testid="ui-new-inventory">
    <i class="un-orn-c tl"></i><i class="un-orn-c tr"></i><i class="un-orn-c bl"></i><i class="un-orn-c br"></i><i class="un-orn-m mt"></i><i class="un-orn-m mb"></i>
    <div class="un-panel-ttl">
      <span class="pq on" style="width:auto;min-width:calc(150 * var(--u));height:calc(48 * var(--u));font-size:calc(26 * var(--u))">{{ t('背包') }}</span>
    </div>
    <div class="un-panel-acts">
      <button class="pq xs" type="button" data-testid="ui-new-inv-legacy" @click="toggleLegacy">{{ legacy ? t('新版背包') : t('旧版背包') }}</button>
      <button v-if="legacy" class="pq xs on" type="button" data-testid="ui-new-panel-close" @click="emit('close')">{{ t('收起') }}</button>
    </div>
    <div class="un-pane">
      <div v-if="!legacy && p" class="un-inv-main">
        <div class="un-inv-top">
          <div class="un-inv-tabs">
            <button
              v-for="tab in tabs"
              :key="tab.id"
              type="button"
              class="pq sm"
              :class="{ on: p.selectedCategory === tab.id }"
              data-testid="ui-new-inv-tab"
              @click="p.selectedCategory = tab.id"
            >{{ t(tab.label) }}</button>
          </div>
          <div class="un-inv-tools">
            <input v-model="p.searchQuery" class="un-inv-search" type="text" :placeholder="t('搜索物品...')" />
            <select v-model="p.sortBy" class="un-inv-sort">
              <option value="default">{{ t('默认排序') }}</option>
              <option value="quality">{{ t('品质排序') }}</option>
              <option value="name">{{ t('名称排序') }}</option>
            </select>
            <button type="button" class="un-inv-link" data-testid="ui-new-inv-equipment" @click="openLegacy('equipment')">{{ t('法宝装备') }}</button>
            <button type="button" class="un-inv-link" data-testid="ui-new-inv-currency" :title="t('财产管理')" @click="openLegacy('currency')">{{ t('总价值') }} {{ money }} {{ p.baseCurrencyLabel }}</button>
          </div>
        </div>
        <div class="un-inv-grid" data-testid="ui-new-inv-grid">
          <div v-if="!p.filteredItems.length" class="un-inv-empty" data-testid="ui-new-inv-empty">
            <p>{{ emptyLine.text }}</p>
            <small v-if="emptyLine.tip">{{ t(emptyLine.tip) }}</small>
          </div>
          <button
            v-for="item in p.filteredItems"
            v-else
            :key="item.物品ID"
            type="button"
            class="un-inv-cell"
            :class="{ on: item.物品ID === selectedId }"
            :data-item-id="item.物品ID"
            data-testid="ui-new-inv-cell"
            @click="pickItem(item)"
          >
            <span class="g" :style="{ borderColor: tierColor(item) }">{{ itemGlyph(item.名称) }}</span>
            <span class="nm">{{ item.名称 }}</span>
            <span v-if="item.数量 > 1" class="n">×{{ item.数量 }}</span>
            <span v-if="p.isEquipped(item)" class="eq">{{ t('已装备') }}</span>
            <span v-else-if="p.isCultivating(item)" class="eq">{{ t('修炼中') }}</span>
          </button>
        </div>
      </div>
      <!-- 老背包面板：新版时只挂着不显示（借它的状态、函数和弹窗）；点「旧版背包」整块显示，所有老功能都在这里 -->
      <div class="un-inv-legacy" :class="{ headless: !legacy }"><div class="un-panel-body"><InventoryPanel ref="panelRef" /></div></div>
    </div>
  </section>

  <!-- 字框：选中物品的名字、说明、详情，右边是这件物品在老面板里能做的事＋「收起」 -->
  <div v-if="!legacy" class="un-box un-inv-box" data-testid="ui-new-inv-box">
    <div v-if="current" class="un-who">{{ current.名称 }}</div>
    <div class="un-say un-inv-say" :class="{ n: !current }">
      <template v-if="current">
        <p class="un-inv-desc">{{ current.描述 }}</p>
        <small class="un-inv-meta" data-testid="ui-new-inv-meta">{{ metaLine }}</small>
        <small v-for="(line, i) in extraLines" :key="i" class="un-inv-extra">{{ line }}</small>
      </template>
      <p v-else>{{ t('选择物品查看详情') }}</p>
    </div>
    <div class="un-inv-side">
      <button
        v-for="act in actions"
        :key="act.key"
        type="button"
        class="pq"
        :class="{ on: act.key !== 'discard' }"
        :disabled="act.disabled"
        :data-act="act.key"
        data-testid="ui-new-inv-act"
        @click="runAction(act.key)"
      >{{ t(act.label) }}</button>
      <button type="button" class="pq" data-testid="ui-new-panel-close" @click="emit('close')">{{ t('收起') }}</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from '@/i18n';
import InventoryPanel from '@/components/dashboard/InventoryPanel.vue';
import { itemTierColor } from '@/data/itemQuality';
import { formatTechniqueEffects } from '@/utils/cultivationSpeedCalculator';
import type { Item } from '@/types/game';
import { uiNewPhone } from '@/composables/uiNew';
import { itemGlyph, itemActions, categoryTabs, emptyInventoryText, type InventoryActionKey } from './inventoryView';

const emit = defineEmits<{ close: [] }>();
const { t } = useI18n();

const panelRef = ref<InstanceType<typeof InventoryPanel> | null>(null);
const p = computed(() => panelRef.value);
const legacy = ref(false);

// 新版只用「背包物品」这一页（确认弹窗挂在这一页下面，别的页打开时弹不出来）
watch([legacy, panelRef], () => { if (!legacy.value && panelRef.value) panelRef.value.activeTab = 'items'; });
const toggleLegacy = () => { legacy.value = !legacy.value; };
const openLegacy = (tab: 'equipment' | 'currency') => {
  legacy.value = true;
  if (panelRef.value) panelRef.value.activeTab = tab;
};

// 窄屏：老面板的 selectItem 在窗口 ≤768 时会弹它自己的手机详情窗；新版只记下选中，说明和按钮在字框里
const pickItem = (item: Item) => {
  if (!p.value) return;
  if (uiNewPhone.value) p.value.selectedItem = item;
  else p.value.selectItem(item);
};
const tabs = computed(() => categoryTabs(p.value?.itemCategories ?? []));
const tierColor = (item: Item) => itemTierColor(item.品质);
const money = computed(() => {
  const n = Number(p.value?.totalValueInBase) || 0;
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
});

const emptyLine = computed(() => {
  const e = emptyInventoryText(String(p.value?.selectedCategory ?? 'all'));
  return { text: e.arg ? t(e.key).replace('{0}', t(e.arg)) : t(e.key), tip: e.tip };
});

// 选中态就是老面板的 selectedItem（老面板使用／丢弃后会自己清掉）；显示时取列表里的最新一份，列表里没有了就当没选中
const selectedId = computed(() => p.value?.selectedItem?.物品ID ?? '');
const current = computed<Item | null>(() => {
  const id = selectedId.value;
  if (!id || !p.value) return null;
  return p.value.itemList.find(i => i.物品ID === id) ?? null;
});

const metaLine = computed(() => {
  const item = current.value;
  if (!item || !p.value) return '';
  const parts = [t(item.类型), item.品质?.quality ? t(p.value.qualityText(item)) : t('未知')];
  if (item.数量 > 1) parts.push(`×${item.数量}`);
  if (p.value.isEquipped(item)) parts.push(t('已装备'));
  if (p.value.isCultivating(item)) parts.push(t('修炼中'));
  return parts.join('　');
});

// 老面板详情侧栏里另外几块：功法效果、功法技能、装备增幅、特殊效果
const extraLines = computed(() => {
  const item = current.value as any;
  const panel = p.value;
  if (!item || !panel) return [] as string[];
  const lines: string[] = [];
  const fmt = (v: unknown) => (typeof v === 'string' ? v : panel.formatItemAttributes(v as Record<string, unknown>));
  if (item.类型 === '功法') {
    if (item.功法效果) lines.push(`${t('功法效果:')} ${formatTechniqueEffects(item.功法效果)}`);
    if (Array.isArray(item.功法技能)) {
      for (const s of item.功法技能) {
        const need = s?.解锁需要熟练度 ? `（${t('需要:')} ${s.解锁需要熟练度}%）` : '';
        const cost = s?.消耗 ? `　${t('消耗:')} ${s.消耗}` : '';
        lines.push(`${t('功法技能:')} ${s?.技能名称 ?? ''}${need}　${s?.技能描述 ?? ''}${cost}`);
      }
    }
  }
  if (item.类型 === '装备' && item.装备增幅) lines.push(`${t('装备增幅:')} ${fmt(item.装备增幅)}`);
  if (item.类型 === '装备' && item.特殊效果) lines.push(`${t('特殊效果:')} ${fmt(item.特殊效果)}`);
  return lines;
});

const actions = computed(() => {
  const item = current.value;
  const panel = p.value;
  if (!item || !panel) return [];
  return itemActions(item.类型, {
    equipped: panel.isEquipped(item),
    cultivating: panel.isCultivating(item),
    equipBusy: panel.equipBusy,
    cultivateBusy: panel.cultivateBusy,
  });
});

// 和老面板详情按钮一样：把老面板的 selectedItem 交给老面板的同名函数
const runAction = (key: InventoryActionKey) => {
  const panel = p.value;
  const item = panel?.selectedItem;
  if (!panel || !item) return;
  if (key === 'equip') void panel.toggleEquip(item);
  else if (key === 'cultivate') void panel.toggleCultivate(item);
  else if (key === 'use') void panel.useItem(item);
  else void panel.discardItem(item);
};
</script>
