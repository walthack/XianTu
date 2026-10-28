// fix5939-4：右栏「世界线偏离：中偏（N/100）」属内部诊断，与停滞预警一样只在调试模式显示；斩线回轨按钮不受影响。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

test('右栏偏离评分句只在调试模式显示，斩线回轨按钮仍在（fix5939-4）', () => {
  const vue = fs.readFileSync('src/components/dashboard/RightSidebar.vue', 'utf8');
  assert.ok(vue.includes("divergenceDebug: (signal?.level === 'medium' || signal?.level === 'high') && debugLogger.isDebugMode()"));
  const at = vue.indexOf('世界线偏离：');
  assert.ok(at > 0);
  const divOpen = vue.lastIndexOf('<div', at);
  assert.match(vue.slice(divOpen, at), /^<div v-if="questMain\.divergenceDebug"/);
  assert.equal(vue.includes(`v-if="questMain.signal?.level === 'medium'`), false);
  assert.match(vue, /<button v-if="questMain\.canReturn[^"]*"[^>]*@click="cutBackToCanon"/);
});
