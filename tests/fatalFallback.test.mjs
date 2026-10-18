// 全局异常兜底：原生 DOM 兜底界面（假 DOM）、导出 / 重新载入回调、重复触发不重复渲染、
// app.config.errorHandler 与启动失败记诊断日志（LCQ-UI-004 / LCQ-UI-005）、main.ts 接线。
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { loadTs } from './loadTs.mjs';

const fb = await loadTs('../src/utils/fatalFallback.ts');
const log = await loadTs('../src/modules/diagnostics/log.ts');
const store = await loadTs('../src/modules/diagnostics/store.ts');

const quiet = async fn => {
  const saved = {};
  for (const k of ['log', 'info', 'warn', 'debug', 'error']) { saved[k] = console[k]; console[k] = () => {}; }
  try { return await fn(); } finally { Object.assign(console, saved); }
};

/** 最小假 DOM：只实现兜底界面用到的 createElement / getElementById / body.appendChild。 */
function fakeDoc() {
  const mk = tag => ({ tag, id: '', textContent: null, style: { cssText: '' }, onclick: null, children: [], appendChild(child) { this.children.push(child); } });
  const body = mk('body');
  const walk = (node, fn) => { fn(node); node.children.forEach(child => walk(child, fn)); };
  return {
    body, createElement: mk,
    getElementById: id => { let hit = null; walk(body, node => { if (node.id === id) hit = node; }); return hit; },
    all: tag => { const out = []; walk(body, node => { if (node.tag === tag) out.push(node); }); return out; },
  };
}
const buttonOf = (doc, text) => doc.all('button').find(button => button.textContent === text);

test('showFatalFallback：渲染中文提示、错误码与「导出日志」「重新载入」两个按钮，样式全是内联', () => {
  const doc = fakeDoc();
  assert.equal(fb.showFatalFallback({ doc, code: 'LCQ-UI-005' }), true);
  assert.ok(doc.getElementById(fb.FATAL_FALLBACK_ID));
  assert.ok(buttonOf(doc, '导出日志') && buttonOf(doc, '重新载入'));
  const texts = doc.all('div').map(div => div.textContent ?? '');
  assert.ok(texts.some(text => text.includes('出错了')));
  assert.ok(texts.some(text => text.includes('存档') && text.includes('导出日志')), '说明存档不受影响并建议导出日志');
  assert.ok(texts.some(text => text.includes('LCQ-UI-005')));
  assert.ok(doc.all('div').every(div => div.style.cssText.length > 0), '每个节点都有内联样式');
});

test('点「导出日志」调用 exportLogs，并按结果提示；导出抛错也不外泄', async () => {
  const doc = fakeDoc();
  let calls = 0, result = true;
  fb.showFatalFallback({ doc, exportLogs: async () => { calls++; if (result === 'throw') throw new Error('x'); return result; } });
  const button = buttonOf(doc, '导出日志');
  const status = () => doc.all('div').at(-1).textContent;
  await button.onclick();
  assert.equal(calls, 1);
  assert.match(status(), /已导出/);
  result = false; await button.onclick();
  assert.match(status(), /失败/);
  result = 'throw'; await button.onclick();
  assert.equal(calls, 3);
  assert.match(status(), /失败/);
  assert.notEqual(button.disabled, true, '导出结束后按钮恢复可点');
});

test('点「重新载入」调用 reload', () => {
  const doc = fakeDoc();
  let reloads = 0;
  fb.showFatalFallback({ doc, reload: () => { reloads++; } });
  buttonOf(doc, '重新载入').onclick();
  assert.equal(reloads, 1);
});

test('重复触发不重复渲染；没有 body 时不渲染', () => {
  const doc = fakeDoc();
  assert.equal(fb.showFatalFallback({ doc }), true);
  assert.equal(fb.showFatalFallback({ doc }), false);
  assert.equal(fb.showFatalFallback({ doc, code: 'LCQ-UI-005' }), false);
  assert.equal(doc.body.children.length, 1);
  assert.equal(doc.all('button').length, 2);
  assert.equal(fb.showFatalFallback({ doc: { body: null, getElementById: () => null, createElement: () => ({}) } }), false);
});

test('handleVueError 记 LCQ-UI-004（带 info 与组件名），不抛错', async () => {
  await log.resetLogState();
  await quiet(() => fb.handleVueError(new Error('组件炸了'), { $options: { name: 'BadPanel' } }, 'render function'));
  const entry = store.logStore.recent(10).find(item => item.code === 'LCQ-UI-004');
  assert.ok(entry);
  assert.equal(entry.level, 'error');
  assert.equal(entry.detail.info, 'render function');
  assert.equal(entry.detail.component, 'BadPanel');
  assert.match(entry.msg, /组件炸了/);
  await quiet(() => assert.doesNotThrow(() => fb.handleVueError('字符串异常', null, undefined)));
  await log.resetLogState();
});

test('handleVueError：开发期控制台不丢——日志照常往 console.error 打；日志被去重压下时补打一条', async () => {
  await log.resetLogState();
  const seen = [];
  const saved = { error: console.error, warn: console.warn };
  console.error = (...args) => { seen.push(args); }; console.warn = () => {};
  try {
    const error = new Error('同一个错');
    fb.handleVueError(error, null, 'mounted hook');
    assert.ok(seen.some(args => String(args[0]).includes('LCQ-UI-004')), '首次由日志往控制台打');
    seen.length = 0;
    fb.handleVueError(error, null, 'mounted hook'); // repeatMs 内完全相同 → 日志去重返回 null
    assert.ok(seen.length >= 1 && seen.some(args => args.includes(error)), '被去重时仍有 console.error 输出');
  } finally { Object.assign(console, saved); }
  await log.resetLogState();
});

test('failStartup 记 LCQ-UI-005（detail.stage）并显示兜底界面，重复调用只渲染一次', async () => {
  await log.resetLogState();
  const doc = fakeDoc();
  await quiet(() => { fb.failStartup('migrateData', new Error('迁移炸了'), { doc }); fb.failStartup('mount', new Error('又炸'), { doc }); });
  const entries = store.logStore.recent(10).filter(item => item.code === 'LCQ-UI-005');
  assert.deepEqual(entries.map(item => item.detail.stage).sort(), ['migrateData', 'mount']);
  assert.equal(doc.all('button').length, 2, '界面只渲染一份');
  assert.ok(doc.all('div').some(div => (div.textContent ?? '').includes('LCQ-UI-005')));
  await log.resetLogState();
});

test('main.ts 接线：errorHandler 指向 handleVueError；migrateData 抛错走 failStartup 且 return，不挂载', async () => {
  const src = await readFile(fileURLToPath(new URL('../src/main.ts', import.meta.url)), 'utf8');
  assert.match(src, /app\.config\.errorHandler\s*=\s*handleVueError/);
  assert.match(src, /try\s*\{\s*await migrateData\(\);\s*\}\s*catch\s*\(error\)\s*\{(?:\s*\/\/[^\n]*)*\s*failStartup\('migrateData',\s*error\);\s*return;\s*\}/);
  assert.ok(src.indexOf("failStartup('migrateData'") < src.indexOf('createApp(App)'), 'migrateData 失败处理在挂载之前');
  assert.match(src, /failStartup\('mount',\s*error\)/);
});
