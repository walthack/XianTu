#!/usr/bin/env node

// 把"落在关卡范围内却没进阵容"的缺失女性，建为完整 canon 角色：
// id(canonical liuchao) + gender=女 + role + description + profile.appearance(epub extra) +
// profile.notes(约束 draft) + 关系边(canon.relationships / playerRelationships)。
// 关系是关键：没有关系边，NPC 无法回答"谁是谁的母亲"之类问题。只连该关卡阵容内能解析的对象。
// 仅 ADD，不动既有条目。备份 stages-pre-addfemale-backup。
//
// Usage: node scripts/add-missing-female-characters.mjs [--dry-run]

import { readFile, readdir, writeFile, cp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const gen = join(root, 'mod-kit', 'generated', 'deepseek-v4-flash');
const dryRun = process.argv.includes('--dry-run');
const PLAYER = 'liuchao.character.cheng_zongyang';

// 任务8：yunlong luoyang_cloud_secret(及邻关)覆盖盲区缺失女性。
const PLAN = [
  { book: 'yunlong', name: '尹馥兰', slug: 'yin_fulan', stages: ['lyl.luoyang_cloud_secret'], role: '娼妓',
    desc: '被诅咒后沦为娼妓，娇艳风情；与何漪莲敌对。', npc: [{ other: '何漪莲', relation: '敌对', score: -50 }], player: { relation: '被控制', favorability: 5 } },
  { book: 'yunlong', name: '王蕙', slug: 'wang_hui', stages: ['lyl.taiquan_core_conflict', 'lyl.luoyang_cloud_secret', 'lyl.luoyang_coup'], role: '秦桧之妻',
    desc: '秦桧之妻，常带笑容、眼神灵动；与程宗扬合作。', npc: [{ other: '秦桧', relation: '夫妻', score: 55 }], player: { relation: '盟友', favorability: 30 } },
  { book: 'yunlong', name: '何漪莲', slug: 'he_yilian', stages: ['lyl.luoyang_cloud_secret', 'lyl.luoyang_coup'], role: '帮主',
    desc: '帮主，面容娇艳、玉脸艳光；与尹馥兰敌对。', npc: [{ other: '尹馥兰', relation: '敌对', score: -50 }, { other: '小紫', relation: '主仆', score: -20 }], player: { relation: '被救', favorability: 25 } },
  { book: 'yunlong', name: '惊理', slug: 'jing_li', stages: ['lyl.luoyang_cloud_secret', 'lyl.luoyang_coup'], role: '侍奴',
    desc: '妖艳侍奴，丰腴雪肤；受孙寿胁迫。', npc: [{ other: '孙寿', relation: '胁迫', score: -20 }], player: { relation: '侍奴', favorability: 15 } },
];

async function readJson(p) { return JSON.parse(await readFile(p, 'utf8')); }
function noteOf(c) {
  const head = `【${c.category || '设定约束'}】${c.rule || ''}`.trim();
  return c.consequence && c.consequence !== '未知' ? `${head}（破坏后果：${c.consequence}）` : head;
}

async function run() {
  // 预读外貌(extra+draft)与约束
  const appByBookName = new Map();
  const noteByBookName = new Map();
  for (const book of [...new Set(PLAN.map(p => p.book))]) {
    for (const suffix of ['appearance-extra', 'appearance-draft']) {
      const p = join(gen, 'character-canon', `${book}.${suffix}.json`);
      if (!existsSync(p)) continue;
      for (const c of (await readJson(p)).characters || []) {
        const key = `${book}|${c.name}`;
        if (!appByBookName.has(key) && c.appearance && !/原文未明确|未检索|抽取失败/.test(c.appearance)) appByBookName.set(key, c.appearance);
      }
    }
    const cp2 = join(gen, 'character-canon', `${book}.character-constraints-draft.json`);
    if (existsSync(cp2)) for (const c of (await readJson(cp2)).characters || []) {
      const notes = (c.constraints || []).map(noteOf).filter(Boolean);
      if (notes.length) noteByBookName.set(`${book}|${c.name}`, notes);
    }
  }

  const byBook = {};
  for (const p of PLAN) (byBook[p.book] = byBook[p.book] || []).push(p);

  for (const [book, plans] of Object.entries(byBook)) {
    const stageDir = join(gen, book, 'stages');
    if (!dryRun) {
      const backup = join(gen, book, 'stages-pre-addfemale-backup');
      if (existsSync(backup)) await rm(backup, { recursive: true });
      await cp(stageDir, backup, { recursive: true });
    }
    for (const stageFile of (await readdir(stageDir)).filter(n => n.endsWith('.json') && !n.endsWith('.uncertainties.json'))) {
      const mod = await readJson(join(stageDir, stageFile));
      const stageId = mod.manifest?.id;
      const here = plans.filter(p => p.stages.includes(stageId));
      if (!here.length) continue;
      mod.canon = mod.canon || {};
      const chars = mod.canon.characters = mod.canon.characters || [];
      const idByName = new Map(chars.map(c => [c.name, c.id]));
      const rels = mod.canon.relationships = mod.canon.relationships || [];
      const pRels = mod.canon.playerRelationships = mod.canon.playerRelationships || [];

      for (const p of here) {
        const id = `liuchao.character.${p.slug}`;
        if (idByName.has(p.name)) { console.log(`  ${stageId}: ${p.name} 已存在，跳过`); continue; }
        const profile = {};
        const app = appByBookName.get(`${book}|${p.name}`); if (app) profile.appearance = app;
        const notes = noteByBookName.get(`${book}|${p.name}`); if (notes) profile.notes = notes;
        const entry = { id, name: p.name, gender: '女', role: p.role, description: p.desc };
        if (Object.keys(profile).length) entry.profile = profile;
        chars.push(entry);
        idByName.set(p.name, id);
        // 关系边（仅连该关卡阵容内能解析的对象）
        let addedRels = 0;
        for (const r of p.npc) {
          const otherId = idByName.get(r.other);
          if (!otherId) { console.log(`  ${stageId}: ${p.name}↔${r.other} 跳过(对象不在阵容)`); continue; }
          rels.push({ fromCharacterId: id, toCharacterId: otherId, relation: r.relation, score: r.score, direction: 'bidirectional' });
          addedRels += 1;
        }
        if (p.player) pRels.push({ characterId: id, relation: p.player.relation, favorability: p.player.favorability });
        console.log(`  ${stageId}: +${p.name}(${id})${app ? ' +外貌' : ''}${notes ? ' +约束' : ''} +关系${addedRels}${p.player ? ' +player' : ''}`);
      }
      if (!dryRun) await writeFile(join(stageDir, stageFile), `${JSON.stringify(mod, null, 2)}\n`);
    }
  }
  console.log(dryRun ? 'DRY RUN — 未写文件。' : '缺失女性已补入阵容。');
}

run().catch(err => { console.error(err); process.exit(1); });
