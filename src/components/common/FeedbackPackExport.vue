<template>
  <div class="feedback-pack">
    <label class="feedback-save-option">
      <input type="checkbox" v-model="includeSave" :disabled="busy" />
      <span>附带当前存档</span>
    </label>
    <button class="feedback-btn" type="button" :disabled="busy" @click="exportPack">导出反馈包</button>
    <p v-if="includeSave" class="feedback-warn">
      存档中含你的叙事原文（剧情文本、记忆）。{{ redactNarrative ? '当前配置会把叙事原文脱敏为字数，其余存档内容原样带出。' : '当前配置不脱敏叙事原文，会原样带出，请确认愿意分享后再发送。' }}密钥始终会被抹掉。
    </p>
  </div>
</template>

<script setup lang="ts">
// 一键反馈包入口（设置页用）：日志 + 版本信息 + 模型连接配置摘要，勾选才附带存档。组包逻辑在 src/modules/diagnostics/feedback.ts。
import { computed, ref } from 'vue';
import { toast } from '@/utils/toast';
import { downloadFeedbackPack, feedbackConfig } from '@/modules/diagnostics/feedback';

const includeSave = ref(false);
const busy = ref(false);
const redactNarrative = computed(() => feedbackConfig().redactSaveNarrative);

async function exportPack() {
  busy.value = true;
  try {
    const result = await downloadFeedbackPack({ includeSave: includeSave.value });
    if (!result.ok) toast.error('反馈包导出失败，可改用「导出日志」或换个浏览器再试');
    else if (includeSave.value && !result.saveIncluded) toast.warning(`反馈包已导出，但没能带上存档（${result.saveNote ?? '原因未知'}）`);
    else toast.success('反馈包已导出，反馈问题时请附上该文件');
  } finally {
    busy.value = false;
  }
}
</script>

<style scoped>
.feedback-pack { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; justify-content: flex-end; }
.feedback-save-option { display: inline-flex; align-items: center; gap: 4px; font-size: 13px; cursor: pointer; }
.feedback-btn { padding: 6px 12px; cursor: pointer; border-radius: 6px; border: 1px solid var(--color-border, #888); background: transparent; color: inherit; }
.feedback-btn:disabled { opacity: 0.6; cursor: default; }
.feedback-warn { flex-basis: 100%; margin: 0; font-size: 12px; opacity: 0.75; text-align: right; }
</style>
