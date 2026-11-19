<template>
  <UiNewTitle v-if="uiNewActive" />
  <ModeSelection v-else />
</template>

<script setup lang="ts">
// 首页路由：带 ?ui=new 且窗口够宽时用新标题页，否则原样渲染老首页（不多包一层元素；App.vue 传来的事件监听原样落到渲染的那一个上）。
// 说明写在这里而不是模板里：模板注释会进 DOM，老首页要与主分支逐字一致。
import { uiNewActive } from '@/composables/uiNew';
import ModeSelection from '@/views/ModeSelection.vue';
import UiNewTitle from '@/components/uiNew/UiNewTitle.vue';
</script>
