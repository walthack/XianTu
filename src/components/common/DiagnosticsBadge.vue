<template>
  <div v-if="visible" class="diag-badge">
    <button class="diag-pill" type="button" :title="'诊断日志：' + errorCount + ' 条错误'" @click="open = !open">
      错误 {{ errorCount }}
    </button>
    <div v-if="open" class="diag-panel">
      <div class="diag-head">
        <span>最近错误（{{ rows.length }}）</span>
        <span>
          <button type="button" @click="exportLogs">导出日志</button>
          <button type="button" @click="open = false">关闭</button>
        </span>
      </div>
      <ul class="diag-list">
        <li v-for="row in rows" :key="row.seq">
          <code>{{ row.code }}</code> <time>{{ row.ts.slice(11, 19) }}</time>
          <div class="diag-msg">{{ row.msg }}</div>
          <div v-if="row.requestId || row.turnId" class="diag-ids">{{ row.turnId }} {{ row.requestId }}</div>
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
// 诊断角标：先只在调试模式显示，只数 error 级；点开看最近条目，可导出整份日志（含旧会话）。数据来自 src/modules/diagnostics 的环形缓冲。
import { onMounted, onUnmounted, ref } from 'vue';
import { debugLogger } from '@/utils/debug';
import { diagnosticsConfig } from '@/modules/diagnostics/config';
import { downloadLogs } from '@/modules/diagnostics/export';
import { logStore, type StoredEntry } from '@/modules/diagnostics/store';

const visible = ref(false);
const open = ref(false);
const errorCount = ref(0);
const rows = ref<StoredEntry[]>([]);

function refresh() {
  const cfg = diagnosticsConfig();
  errorCount.value = logStore.recent(cfg.ringMax, 'error').length;
  rows.value = logStore.recent(cfg.panel.recent, 'error');
  visible.value = debugLogger.isDebugMode() && errorCount.value > 0;
}

const exportLogs = () => { void downloadLogs(); };

let unsubscribe: (() => void) | undefined;
onMounted(() => {
  unsubscribe = logStore.subscribe(refresh);
  void logStore.all().then(refresh);
  refresh();
});
onUnmounted(() => unsubscribe?.());
</script>

<style scoped>
.diag-badge { position: fixed; left: 12px; bottom: 12px; z-index: 19999; font-size: 12px; }
.diag-pill { background: #b3261e; color: #fff; border: 0; border-radius: 12px; padding: 4px 10px; cursor: pointer; }
.diag-panel { margin-bottom: 6px; width: 360px; max-height: 50vh; overflow: auto; background: var(--color-surface, #222); color: var(--color-text, #eee); border: 1px solid var(--color-border, #555); border-radius: 8px; padding: 8px; position: absolute; bottom: 30px; left: 0; }
.diag-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
.diag-head button { margin-left: 6px; cursor: pointer; }
.diag-list { list-style: none; margin: 0; padding: 0; }
.diag-list li { padding: 4px 0; border-top: 1px solid var(--color-border, #555); }
.diag-msg { word-break: break-all; opacity: 0.9; }
.diag-ids { opacity: 0.6; font-size: 11px; }
</style>
