// 8092 91a0d2c3 真机（2026-11-11 08:47，主模型 MiniMax-M2.7-highspeed）：模型把回包外壳写坏——
// {"text":"…正文…"],"mid_term_memory":"…","tavern_commands":\n,"action_options":[…]}
// parseJsonSmart 只解析出尾部的 action_options 数组，正文为空，narrativeOutsideJson 把剩下的整段原始 JSON 当成叙事显示给玩家并提交了回合。
// 修法：JSON 外剩下的若是坏掉的回包外壳，只取其中已闭合的正文字段；取不出就当没有正文，不把原始 JSON 当叙事。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadTs } from './loadTs.mjs';
const J = await loadTs('../src/utils/jsonExtract.ts');
const body = '【地堑边缘的湿石被夜雾浸得发黑。\n\n“别乱碰。”她只说了这一句。她目光停在湿地上，没有再碰那枚铜片。';
const broken = `{"text":${JSON.stringify(body)}],"mid_term_memory":"程宗扬服下麻古后静立体会药力。","tavern_commands":\n,"action_options":["接过微灯观察铜片","沿划痕继续向前查看"]}`;

test('前提：这段回包整体不是合法 JSON，parseJsonSmart 只拿到尾部数组', () => {
  assert.throws(() => JSON.parse(broken));
  for (const force of [false, true]) {
    const warn = console.warn; console.warn = () => {};
    try { assert.deepEqual(J.parseJsonSmart(broken, force), ['接过微灯观察铜片', '沿划痕继续向前查看']); } finally { console.warn = warn; }
  }
});

test('坏外壳：narrativeOutsideJson 只取已闭合的正文字段，不返回原始 JSON', () => {
  assert.equal(J.narrativeOutsideJson(broken), body);
  assert.equal(J.narrativeOutsideJson(broken.replace('"text"', '"叙事文本"')), body);
});

test('坏外壳里没有正文字段或正文为空：当作没有正文（交上游按空响应处理），不把 JSON 当叙事', () => {
  assert.equal(J.narrativeOutsideJson('{"mid_term_memory":"只有记忆"],"action_options":["继续"]}'), '');
  assert.equal(J.narrativeOutsideJson('{"text":""],"action_options":["继续"]}'), '');
});

test('真跑 AIBS parseAIResponse 方法体：坏外壳解析出干净正文', async () => {
  const ts = (await import('typescript')).default;
  const src = readFileSync(new URL('../src/utils/AIBidirectionalSystem.ts', import.meta.url), 'utf8');
  const method = src.slice(src.indexOf('  private parseAIResponse('), src.indexOf('\n}\n\nexport const AIBidirectionalSystem')).replace('private parseAIResponse', 'parseAIResponse');
  const helper = src.slice(src.indexOf('function itemReferencesFromObject('), src.indexOf('/** 仅模型截断/格式失败可用本地合同收口'));
  const code = ts.transpileModule(`${helper}\nclass H { sanitizeActionOptionsForDisplay(o: any) { return o; }\n${method}\n}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const H = new Function('stripModelThinking', 'parseJsonSmart', 'narrativeOutsideJson', `${code};return H;`)(J.stripModelThinking, J.parseJsonSmart, J.narrativeOutsideJson);
  const keep = ['log', 'warn'].map(k => [k, console[k]]); keep.forEach(([k]) => { console[k] = () => {}; });
  try {
    const r = new H().parseAIResponse(broken);
    assert.equal(r.text, body);
    assert.ok(!/mid_term_memory|tavern_commands|action_options/.test(r.text));
    assert.deepEqual(r.tavern_commands, []);
  } finally { keep.forEach(([k, v]) => { console[k] = v; }); }
});

test('原有行为不变：JSON 外的真叙事照旧保留', () => {
  const outside = '你盘膝坐定，一夜调息，气息渐稳。';
  assert.equal(J.narrativeOutsideJson(`${outside}\n{"action_options":["继续"]}\n船行三日。`), `${outside}\n\n船行三日。`);
  assert.equal(J.narrativeOutsideJson('{"text":"x"}'), '');
});
