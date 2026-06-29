#!/usr/bin/env node
// 把 character-cards-v2(+xunu-generated) 落地进 mod 各关 canon.characters。
// 映射:种族→profile.race;身份→profile.origin(补空);_manual(权威)者覆盖 personality←性格/appearance←外貌;
// 富字段(与主角关系/称呼/说话风格/人格底线/目标动机/弱点软肋/加入经过/结局/性癖/身体性特征)→ profile.notes 打标行(流入NPC记忆给AI)。
// notes 幂等:先删旧的卡派生标行(【关系】等)再重加。备份 stages-pre-cards-backup。
import { readFile, readdir, writeFile, cp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
const dir = resolve(import.meta.dirname, '..', 'mod-kit/generated/deepseek-v4-flash');
const canon = join(dir, 'character-canon');
const books = ['qingyu', 'yunlong', 'yange'];
const dry = process.argv.includes('--dry-run');
const raceClean = s => (s || '').replace(/（[^）]*）/g, '').trim();
const score = c => Object.values(c).filter(v => v && (!Array.isArray(v) || v.length)).length;
// 富字段 → 标签
const TAGMAP = [['与主角关系', '关系'], ['备注', '备注'], ['称呼', '称呼'], ['说话风格', '谈吐'], ['人格底线', '底线'], ['目标动机', '目标'], ['弱点软肋', '软肋'], ['加入经过', '入伙'], ['结局下场', '结局'], ['性癖', '性癖'], ['身体性特征', '身体']];
const TAGS = TAGMAP.map(t => `【${t[1]}】`);

async function run() {
  // 全局 name->最佳卡(_manual 优先,否则字段多者)
  const byName = new Map();
  const files = [...books.map(b => `${b}.character-cards-v2.json`), 'xunu-generated.json'];
  for (const f of files) {
    if (!existsSync(join(canon, f))) continue;
    for (const c of JSON.parse(await readFile(join(canon, f), 'utf8')).characters) {
      const prev = byName.get(c.name);
      const auth = x => !!(x._manual || x._approved || x._reviewed);
      if (!prev || (auth(c) && !auth(prev)) || (auth(c) === auth(prev) && score(c) > score(prev))) byName.set(c.name, c);
    }
  }
  let proj = 0; const touched = new Set();
  for (const b of books) {
    const sd = join(dir, b, 'stages');
    if (!dry) { const bk = join(dir, b, 'stages-pre-cards-backup'); if (existsSync(bk)) await rm(bk, { recursive: true }); await cp(sd, bk, { recursive: true }); }
    for (const f of (await readdir(sd)).filter(n => n.endsWith('.json') && !n.endsWith('.uncertainties.json'))) {
      const m = JSON.parse(await readFile(join(sd, f), 'utf8'));
      let ch = false;
      for (const c of m.canon?.characters || []) {
        const card = byName.get(c.name); if (!card) continue;
        c.profile = c.profile || {};
        if (card.种族 && raceClean(card.种族)) { c.profile.race = raceClean(card.种族); }
        if (card.身份 && (!c.profile.origin || /原作人物|未知|^$/.test(c.profile.origin))) c.profile.origin = card.身份;
        const auth2 = card._manual || card._approved || card._reviewed;
        // 权威者覆盖；非权威者只填空(配角原本无 personality/appearance)
        if ((card.性格 || []).length && (auth2 || !(c.profile.personality || []).length)) c.profile.personality = [...card.性格];
        if (card.外貌 && (auth2 || !c.profile.appearance || /原文未|未载|未知|^$/.test(c.profile.appearance))) c.profile.appearance = card.外貌;
        // notes 富字段(幂等)
        const kept = (c.profile.notes || []).filter(n => !TAGS.some(t => String(n).startsWith(t)));
        const add = [];
        for (const [fld, tag] of TAGMAP) { const v = card[fld]; const s = Array.isArray(v) ? v.join('；') : (v || ''); if (s) add.push(`【${tag}】${s}`); }
        c.profile.notes = [...kept, ...add];
        ch = true; proj++; touched.add(c.name);
      }
      if (ch && !dry) await writeFile(join(sd, f), `${JSON.stringify(m, null, 2)}\n`);
    }
  }
  console.log(`卡落地:投影 ${proj} 处,涉及 ${touched.size} 角色${dry ? ' [DRY]' : '(备份 stages-pre-cards-backup)'}`);
}
run().catch(e => { console.error(e); process.exit(1); });
