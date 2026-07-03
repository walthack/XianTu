#!/usr/bin/env node
// 扫主角(程宗扬)全三本的 加封/官位/爵位/身份 获得落点 → 供 MILESTONE_REWARDS 表补行。
// 按本独立扫(每本满额证据)，MiniMax-M2.7 抽取，产物人工裁定。
// 产物：character-canon/milestone-grants-scan/{book}.json + REPORT.md
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const outDir = join(root, 'mod-kit/generated/deepseek-v4-flash/character-canon/milestone-grants-scan');
const material = '/Volumes/botsvault/06_material';
const BOOKS = { qingyu: { t: '六朝清羽记', ep: 'A-六朝清羽记.epub' }, yunlong: { t: '六朝云龙吟', ep: 'B- 六朝云龙吟.epub' }, yange: { t: '六朝燕歌行', ep: 'C-六朝燕歌行.epub' } };
// 受封/授职动词钓饵（主角名共现才收）
const GRANT_KWS = ['加封', '封为', '受封', '册封', '拜为', '官拜', '擢升', '晋爵', '赐爵', '敕封', '任命', '授了', '封了', '封赏', '爵位', '官职', '委任', '拜将'];

function bookText(id) {
  const tmp = mkdtempSync(join(tmpdir(), `xt-mg-${id}-`));
  execFileSync('unzip', ['-o', '-q', join(material, BOOKS[id].ep), '-d', tmp]);
  const base = ['OPS/Text', 'OEBPS/Text', 'OPS', 'OEBPS'].map(p => join(tmp, p)).find(existsSync);
  return readdirSync(base).filter(f => /\.x?html?$/i.test(f)).sort().map(f => ({
    f, text: readFileSync(join(base, f), 'utf8').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '),
  }));
}
function windows(id) {
  const out = []; const seen = new Set();
  for (const { f, text } of bookText(id)) {
    for (const kw of GRANT_KWS) {
      let pos = 0;
      while (true) {
        const i = text.indexOf(kw, pos); if (i < 0) break; pos = i + kw.length;
        const win = text.slice(Math.max(0, i - 450), i + 450);
        if (!/程宗扬/.test(win)) continue;
        const key = `${f}:${Math.floor(i / 800)}`; if (seen.has(key)) continue; seen.add(key);
        out.push(`【${f}/kw=${kw}】${win}`);
      }
    }
  }
  let used = 0; const sel = [];
  const step = Math.max(1, Math.ceil(out.length / Math.ceil(14000 / 960)));
  for (let i = 0; i < out.length; i += (sel.length === 0 ? 1 : step)) {
    const w = out[i]; if (used + w.length > 14000) break; sel.push(w); used += w.length;
  }
  return sel.join('\n\n');
}
function ask(bookTitle, ev) {
  const msgs = [
    { role: 'system', content: '你是严谨的小说设定整理员。只依据提供的原文片段判断，不脑补，不复述露骨细节。输出严格 JSON。' },
    { role: 'user', content: `以下证据来自《${bookTitle}》。列出**程宗扬本人**在本书中获得的每一个 爵位/官职/称号/正式身份（受封/册封/拜官/任命/认亲得名分 等），逐条输出：\n{"grants":[{"title":"获得的称号或官职","grantedBy":"谁授予","occasion":"什么事件/场合","locationHint":"文件/章","evidence":"一小段佐证原文"}],"needsHuman":bool}\n只列原文明确的**主角本人**所得（别人受封不算，虚指/戏称注明）。\n\n片段：\n${ev || '（未命中）'}` },
  ];
  const mf = join(outDir, `msgs.json`);
  writeFileSync(mf, JSON.stringify(msgs));
  const out = execFileSync('mmx', ['text', 'chat', '--messages-file', mf, '--model', 'MiniMax-M2.7', '--temperature', '0.1', '--max-tokens', '4096', '--non-interactive', '--quiet', '--output', 'json'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  try { const o = JSON.parse(out); return o?.choices?.[0]?.message?.content || out; } catch { return out; }
}
const parse = t => { try { const j = String(t).match(/```(?:json)?\s*([\s\S]*?)```/)?.[1] || String(t).slice(String(t).indexOf('{'), String(t).lastIndexOf('}') + 1); return JSON.parse(j); } catch { return { parse_failed: true, raw: String(t).slice(0, 3000) }; } };

mkdirSync(outDir, { recursive: true });
const md = ['# 程宗扬 加封/官位 原文落点扫描（供 MILESTONE_REWARDS 补行，人工裁定）', '', `生成：${new Date().toISOString()}`, ''];
for (const [id, { t }] of Object.entries(BOOKS)) {
  const ev = windows(id);
  writeFileSync(join(outDir, `${id}.evidence.md`), ev);
  console.error(`[${t}] 证据 ${ev.length} 字 → MiniMax...`);
  const r = parse(ask(t, ev));
  writeFileSync(join(outDir, `${id}.json`), JSON.stringify(r, null, 2) + '\n');
  md.push(`## ${t}`);
  if (r.parse_failed) md.push('- ⚠ 解析失败');
  for (const g of r.grants || []) md.push(`- **${g.title}** ← ${g.grantedBy || '?'}｜${g.occasion || ''}（${g.locationHint || ''}）\n  > ${(g.evidence || '').slice(0, 100)}`);
  md.push('');
}
writeFileSync(join(outDir, 'REPORT.md'), md.join('\n'));
console.error('完成 → ' + outDir);
