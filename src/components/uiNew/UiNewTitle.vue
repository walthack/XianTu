<template>
  <!-- 新界面标题页（照设计稿 pc-11 的摆法）：夜色底、左边游戏名和一列六角牌、右边一轮月（内联 SVG，程序画的）。
       入口与老首页 ModeSelection.vue 一一对应：同一条路由／同一个事件（交给 App.vue 同一个处理函数），不加不减。 -->
  <div class="ui-new un-title" :class="uiNewPhone ? 'un-phone' : undefined" data-testid="ui-new-title">
    <svg class="un-title-sky" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <radialGradient id="unTitleMoon" cx="50%" cy="45%" r="60%">
          <stop offset="0" stop-color="#26376e" />
          <stop offset="1" stop-color="#16214a" />
        </radialGradient>
        <radialGradient id="unTitleHalo" cx="50%" cy="50%" r="50%">
          <stop offset=".6" stop-color="#1e2d5c" stop-opacity=".55" />
          <stop offset="1" stop-color="#1e2d5c" stop-opacity="0" />
        </radialGradient>
      </defs>
      <circle cx="1040" cy="330" r="340" fill="url(#unTitleHalo)" />
      <circle cx="1040" cy="330" r="250" fill="url(#unTitleMoon)" fill-opacity=".85" stroke="#b6c0de" stroke-opacity=".5" />
      <path d="M1040 80 A250 250 0 0 1 1290 330" fill="none" stroke="#e8d59a" stroke-opacity=".75" stroke-width="2" />
      <path d="M0 90 C 300 70, 600 110, 820 80" fill="none" stroke="#4a5788" stroke-width="3" />
      <path d="M860 560 C 1050 530, 1250 580, 1440 550" fill="none" stroke="#9aa6cc" stroke-opacity=".6" stroke-width="3" />
      <path d="M910 598 C 1100 585, 1280 610, 1440 590" fill="none" stroke="#9aa6cc" stroke-opacity=".45" stroke-width="2" />
      <path d="M620 680 C 900 640, 1200 720, 1440 655" fill="none" stroke="#9aa6cc" stroke-opacity=".55" stroke-width="4" />
      <path d="M0 740 L120 700 L260 735 L420 690 L600 725 L760 680 L900 715 L1060 690 L1200 730 L1440 700 L1440 900 L0 900 Z" fill="#0e1636" />
      <path d="M0 800 L160 770 L320 790 L460 748 L640 825 L820 785 L1000 840 L1180 800 L1440 850 L1440 900 L0 900 Z" fill="#090e24" />
    </svg>

    <div class="un-title-main">
      <h1 class="un-title-name">{{ $t('仙') }}{{ $t('途') }}</h1>
      <p class="un-title-sub">{{ $t('闲时坐看涛生灭，千秋不过酒一壶') }}</p>
      <div class="un-title-rule"><i></i></div>

      <!-- 主要入口：照老首页「操作按钮」区的顺序 -->
      <nav class="un-title-menu">
        <button type="button" class="pq on" data-testid="ui-new-title-liuchao" @click="enterLiuchao">入六朝</button>
        <button v-if="showGenericStart" type="button" class="pq" data-testid="ui-new-title-generic" @click="startNewGame">{{ $t('初入仙途') }}</button>
        <button type="button" class="pq" data-testid="ui-new-title-continue" @click="enterCharacterSelection">{{ $t('续前世因缘') }}</button>
        <button type="button" class="pq" data-testid="ui-new-title-mods" @click="openScenarioMods">剧本模组</button>
      </nav>

      <!-- 次要入口：老首页的内容包试玩入口与「历史试玩／开发测试」，排成一行小字 -->
      <div class="un-title-minor">
        <button v-for="entry in primaryEntries" :key="entry.id" type="button" class="un-title-link" :data-testid="entry.testId" @click="openEntry(entry)">{{ entry.label }}</button>
        <details class="un-title-legacy" data-testid="legacy-playtests">
          <summary>历史试玩／开发测试</summary>
          <button v-for="entry in legacyEntries" :key="entry.id" type="button" class="un-title-link" :data-testid="entry.testId" @click="openEntry(entry)">{{ entry.label }}</button>
        </details>
      </div>
    </div>

    <div class="un-title-foot">
      <span>{{ $t('单机模式') }}</span>
      <span :title="versionDetail">{{ versionLabel }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';
import { CONTENT_PACKS } from '@/modules/contentPacks';
import { getBuildInfo, formatVersionLabel, formatVersionDetail } from '@/modules/diagnostics/buildInfo';
import { LIUCHAO_ENTRY_MOD_ID, showGenericStartEntry } from '@/modules/scenarioMods/liuchaoEntry';
import { uiNewPhone } from '@/composables/uiNew';
import '@/styles/ui-new.css';

// 以下数据与函数逐条照抄 src/views/ModeSelection.vue（同一来源、同一路由、同一事件）
const buildInfo = getBuildInfo();
const versionLabel = formatVersionLabel(buildInfo);
const versionDetail = formatVersionDetail(buildInfo);
const primaryEntries = CONTENT_PACKS.entries.filter(e => e.group === 'primary');
const legacyEntries = CONTENT_PACKS.entries.filter(e => e.group === 'legacy');

const emit = defineEmits<{
  (e: 'start-creation', mode: 'single'): void;
  (e: 'show-character-list'): void;
}>();

const router = useRouter();
const showGenericStart = showGenericStartEntry();

const startNewGame = () => {
  emit('start-creation', 'single');
};
const enterLiuchao = () => {
  router.push({ path: '/creation', query: { mod: LIUCHAO_ENTRY_MOD_ID } });
};
const enterCharacterSelection = () => {
  emit('show-character-list');
};
const openScenarioMods = () => {
  router.push('/scenario-mods');
};
const openEntry = (entry: (typeof CONTENT_PACKS.entries)[number]) => {
  router.push(entry.playtestId ? { path: entry.route, query: { pack: entry.playtestId } } : entry.route);
};
</script>
