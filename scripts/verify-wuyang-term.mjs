#!/usr/bin/env node
// 一次性核实：小说里「舞阳侯国」是否作为封国/政权实体存在，还是只有 舞阳侯(爵位)/舞阳侯府(府邸)。
// 交 MiniMax 依据原文片段判断，不脑补。产物打印到 stdout。
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const material = '/Volumes/botsvault/06_material';
const epub = 'C-六朝燕歌行.epub';
const tmp = mkdtempSync(join(tmpdir(), 'xt-wy-'));
execFileSync('unzip', ['-o', '-q', join(material, epub), '-d', tmp]);
const base = ['OPS/Text', 'OEBPS/Text', 'OPS', 'OEBPS'].map(p => join(tmp, p)).find(existsSync);
const chapters = readdirSync(base).filter(f => /\.x?html?$/i.test(f)).sort()
  .map(f => readFileSync(join(base, f), 'utf8').replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim());
const text = chapters.join(' ');

// 关键词命中统计
const count = (kw) => (text.split(kw).length - 1);
const stats = ['舞阳侯国', '舞阳侯府', '舞阳侯', '封舞阳', '就国', '侯国'].map(k => `${k}:${count(k)}`).join('  ');

// 收集 舞阳侯国 / 封国 相关窗口
function windows(kw, span = 300, maxN = 8) {
  const out = []; let pos = 0, n = 0;
  while (n < maxN) { const i = text.indexOf(kw, pos); if (i < 0) break; out.push(text.slice(Math.max(0, i - span), i + kw.length + span)); pos = i + kw.length; n++; }
  return out;
}
let ev = [...windows('舞阳侯国'), ...windows('封舞阳', 200, 4), ...windows('就国', 200, 4)].join('\n---\n');
if (ev.length > 12000) ev = ev.slice(0, 12000);

const SYS = '你是严谨的文本考据员，只依据提供的原文片段回答，不脑补、不复述露骨内容。';
const user = `问题：本小说里「舞阳侯国」是否作为一个**封国/政权实体**存在（有封地、就国、治理机构）？还是只有「舞阳侯」这个**爵位**、以及「舞阳侯府」这个**府邸/家族**？程宗扬受封舞阳侯后，其领地/政权在原文里叫什么？\n\n关键词命中次数：${stats}\n\n原文片段：\n${ev || '（未命中"舞阳侯国"）'}\n\n只输出 JSON：{"舞阳侯国_是否实体": true|false, "原文依据": "引一两句原文或说明未命中", "正确称谓": "程宗扬封地/政权在原文的实际叫法", "建议": "是否应把 faction「舞阳侯国」合并进「舞阳侯府」，还是保留/改名"}`;

const msgs = [{ role: 'system', content: SYS }, { role: 'user', content: user }];
const mf = join(tmp, 'msgs.json');
writeFileSync(mf, JSON.stringify(msgs, null, 2));
const stdout = execFileSync('mmx', ['text', 'chat', '--messages-file', mf, '--model', 'MiniMax-M2.7', '--temperature', '0.1', '--max-tokens', '2048', '--non-interactive', '--quiet', '--output', 'json'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
let content; try { const o = JSON.parse(stdout); content = o?.choices?.[0]?.message?.content || o?.output || stdout; } catch { content = stdout; }
console.log('命中统计:', stats);
console.log('\nMiniMax 判定:\n', content);
