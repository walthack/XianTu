// A2 缺失男性补全(数据驱动)：对候选男性，在其缺失的窄关卡建 canon 角色(id=拼音/复用) + role + 外貌(extra) + 关系。
// 仅 ADD；备份 stages-pre-addmale-backup。
import { readFile, readdir, writeFile, cp, rm } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const gen = join(root, 'mod-kit', 'generated', 'deepseek-v4-flash');
const scratch = '/private/tmp/claude-501/-Users-clawbot-Projects-XianTu/4539c391-d7a9-44e3-89ed-752e9edc2f05/scratchpad';
const pinyin = JSON.parse(readFileSync(join(scratch, 'malepinyin.json'), 'utf8'));
const books = ['yunlong', 'yange'];
const PLAYER = 'liuchao.character.cheng_zongyang';
const BLANK = v => !v || /原文未明确|未检索|抽取失败/.test(v);
const deParen = s => s.replace(/[（(][^）)]*[）)]/g, '').split(/[·•・]/)[0].trim();
async function readJson(p) { return JSON.parse(await readFile(p, 'utf8')); }
function affinity(rel) { if (/仇|敌|杀/.test(rel)) return -40; if (/夫妻|情人|挚友|兄弟/.test(rel)) return 55; if (/主|奴|仆/.test(rel)) return 10; return 20; }

async function run() {
  let added = 0;
  for (const book of books) {
    const pfx = book === 'yunlong' ? 'lyl.' : 'lyg.';
    const extra = existsSync(join(gen, 'character-canon', `${book}.appearance-extra.json`)) ? await readJson(join(gen, 'character-canon', `${book}.appearance-extra.json`)) : { characters: [] };
    const appByName = new Map(extra.characters.filter(c => !BLANK(c.appearance)).map(c => [c.name, c.appearance]));
    const sp = await readJson(join(gen, book, 'stage-plan.json')); const spArr = Array.isArray(sp) ? sp : (sp.stages || []);
    const stageDir = join(gen, book, 'stages');
    const files = (await readdir(stageDir)).filter(n => n.endsWith('.json') && !n.endsWith('.uncertainties.json'));
    const rosterByStage = {}; const allRoster = new Set();
    for (const f of files) { const m = await readJson(join(stageDir, f)); rosterByStage[m.manifest.id] = new Set((m.canon?.characters || []).map(c => c.name)); for (const c of m.canon?.characters || []) allRoster.add(deParen(c.name)); }
    // extraction: role + 关系 + 区间
    const ex = join(gen, book, 'extraction'); const role = {}, rel = {}, iv = {};
    for (const f of (await readdir(ex)).filter(n => /^batch-\d+\.json$/.test(n))) { const d = await readJson(join(ex, f)); for (const c of d.characterStates || []) { if (!c.name) continue; (iv[c.name] = iv[c.name] || []).push([c.firstSeenSourceIndex, c.lastSeenSourceIndex]); if (c.role && !role[c.name]) role[c.name] = c.role; for (const r of c.relationships || []) (rel[c.name] = rel[c.name] || []).push(r); } }

    if (!existsSync(join(gen, book, 'stages-pre-addmale-backup'))) await cp(stageDir, join(gen, book, 'stages-pre-addmale-backup'), { recursive: true });

    for (const f of files) {
      const m = await readJson(join(stageDir, f));
      const stageId = m.manifest?.id;
      const planStage = spArr.find(s => s.id === stageId); if (!planStage) continue;
      const lo = planStage.sourceStartIndex, hi = planStage.sourceEndIndex; if (hi - lo > 40) continue;
      const have = rosterByStage[stageId];
      const chars = m.canon.characters = m.canon.characters || [];
      const idByName = new Map(chars.map(c => [c.name, c.id]));
      const rels = m.canon.relationships = m.canon.relationships || [];
      const pRels = m.canon.playerRelationships = m.canon.playerRelationships || [];
      let changed = false;
      for (const name of Object.keys(pinyin)) {
        if (have.has(name) || allRoster.has(deParen(name))) continue;
        if (!(iv[name] || []).some(([a, b]) => !(b < lo || a > hi))) continue;
        const id = `liuchao.character.${pinyin[name]}`;
        if (idByName.has(name) || chars.some(c => c.id === id)) continue;
        const entry = { id, name, gender: '男', role: role[name] || '', description: role[name] || '' };
        if (appByName.has(name)) entry.profile = { appearance: appByName.get(name) };
        chars.push(entry); idByName.set(name, id);
        // 关系
        const seenOther = new Set();
        for (const r of rel[name] || []) {
          if (r.other === '程宗扬') { if (!pRels.some(x => x.characterId === id)) pRels.push({ characterId: id, relation: r.relation, favorability: affinity(r.relation) }); continue; }
          const oid = idByName.get(r.other); if (!oid || seenOther.has(oid)) continue; seenOther.add(oid);
          rels.push({ fromCharacterId: id, toCharacterId: oid, relation: r.relation, score: affinity(r.relation), direction: 'bidirectional' });
        }
        added++; changed = true;
        console.log(`  ${stageId}: +${name}(${id})${entry.profile ? ' +外貌' : ''}`);
      }
      if (changed) await writeFile(join(stageDir, f), `${JSON.stringify(m, null, 2)}\n`);
    }
  }
  console.log(`共补入男性 ${added} 处。备份 stages-pre-addmale-backup。`);
}
run().catch(e => { console.error(e); process.exit(1); });
