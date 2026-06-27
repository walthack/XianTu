#!/usr/bin/env node

// 关系随事件变化 —— 首例：小紫 ↔ 碧奴(碧姬) 母女关系弧，按"关卡状态快照"建模(不改 schema)。
// stage_05：碧奴在世，母女关系=积怨(被弃养)，负向。
// stage_06：碧奴在此被杀 → 加碧奴入阵容 + 弑母事件(接事件链尾) + 关系=生母(被小紫所弑)。
// 碧姬=碧奴 同一人(原文 chapter144 "她就是小紫的娘亲"，奴/姬 名字变体)，统一 id liuchao.character.bi_nu，碧姬作 aka。
//
// Usage: node scripts/model-xiaozi-mother-arc.mjs [--dry-run]

import { readFile, writeFile, cp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const gen = join(root, 'mod-kit', 'generated', 'deepseek-v4-flash');
const stageDir = join(gen, 'qingyu', 'stages');
const dryRun = process.argv.includes('--dry-run');
const BI_NU = 'liuchao.character.bi_nu';
const XIAO_ZI = 'liuchao.character.xiao_zi';

async function readJson(p) { return JSON.parse(await readFile(p, 'utf8')); }

async function run() {
  if (!dryRun) {
    const backup = join(gen, 'qingyu', 'stages-pre-motherarc-backup');
    if (existsSync(backup)) await rm(backup, { recursive: true });
    await cp(stageDir, backup, { recursive: true });
  }

  // 取碧奴外貌(extra)+约束(draft)备用
  const extra = await readJson(join(gen, 'character-canon', 'qingyu.appearance-extra.json'));
  const biApp = extra.characters.find(c => c.name === '碧奴')?.appearance;
  const con = await readJson(join(gen, 'character-canon', 'qingyu.character-constraints-draft.json'));
  const biCon = con.characters.find(c => c.name === '碧奴')?.constraints || [];
  const biNotes = biCon.map(k => `【${k.category}】${k.rule}${k.consequence && k.consequence !== '未知' ? `（破坏后果：${k.consequence}）` : ''}`);

  // --- stage_05：母女在世，关系=积怨 ---
  {
    const f = join(stageDir, 'lcq.stage_05.json');
    const m = await readJson(f);
    const bi = m.canon.characters.find(c => c.id === BI_NU);
    if (bi) bi.description = '鬼王峒舞姬（又名碧姬），小紫的生母，自幼将小紫弃养，妖艳放浪，母女积怨甚深。';
    const edge = (m.canon.relationships || []).find(r =>
      (r.fromCharacterId === BI_NU && r.toCharacterId === XIAO_ZI) || (r.fromCharacterId === XIAO_ZI && r.toCharacterId === BI_NU));
    if (edge) { edge.relation = '母女（积怨/被弃养）'; edge.score = -25; }
    if (!dryRun) await writeFile(f, `${JSON.stringify(m, null, 2)}\n`);
    console.log(`stage_05: 碧奴描述更新 + 母女边改为积怨(score -25)`);
  }

  // --- stage_06：碧奴在此被弑 → 加角色 + 弑母事件 + 关系=生母(被弑) ---
  {
    const f = join(stageDir, 'lcq.stage_06.json');
    const m = await readJson(f);
    const chars = m.canon.characters;
    if (!chars.find(c => c.id === BI_NU)) {
      const profile = {};
      if (biApp && !/原文未明确|未检索/.test(biApp)) profile.appearance = biApp;
      if (biNotes.length) profile.notes = biNotes;
      const entry = { id: BI_NU, name: '碧奴', gender: '女', role: '舞姬', description: '鬼王峒舞姬（又名碧姬），小紫的生母。本关中于鬼王峒废墟被积怨已久的小紫亲手杀死。' };
      if (Object.keys(profile).length) entry.profile = profile;
      chars.push(entry);
    }
    // 关系：小紫 → 碧奴 生母(被小紫所弑)
    const rels = m.canon.relationships = m.canon.relationships || [];
    if (!rels.find(r => (r.fromCharacterId === XIAO_ZI && r.toCharacterId === BI_NU) || (r.fromCharacterId === BI_NU && r.toCharacterId === XIAO_ZI))) {
      rels.push({ fromCharacterId: XIAO_ZI, toCharacterId: BI_NU, relation: '生母（被小紫亲手弑杀）', score: -90, direction: 'bidirectional' });
    }
    // 弑母事件已存在(s06_04 小紫弑母，由 strengthen-stage-events 从 extraction 建)；
    // 不新建，改为把碧奴挂进它的 relatedCharacterIds 并点名生母。
    const ev = m.scenario.events || [];
    const kill = ev.find(e => e.name && e.name.includes('弑母'));
    if (kill) {
      kill.relatedCharacterIds = [...new Set([...(kill.relatedCharacterIds || []), XIAO_ZI, BI_NU])];
      if (!/碧奴|碧姬/.test(kill.description || '')) kill.description = `${kill.description || ''}（生母即碧奴/碧姬，多年弃养积怨，被小紫亲手杀死）`;
    }
    if (!dryRun) await writeFile(f, `${JSON.stringify(m, null, 2)}\n`);
    console.log(`stage_06: +碧奴(${BI_NU}) + 关系"生母(被弑)" + 挂入已有弑母事件 ${kill ? kill.id : '(未找到)'}`);
  }
  console.log(dryRun ? 'DRY RUN — 未写。' : '小紫弑母关系弧已建模。');
}

run().catch(err => { console.error(err); process.exit(1); });
