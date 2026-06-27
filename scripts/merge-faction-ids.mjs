// D6 势力 id 归一：同名多 id 势力按 拼音 canonical 合并；英文 type 中文化。
// 级联 factionId/fromFactionId/toFactionId/relatedFactionIds + canon.factions[].id；去重势力条目与势力关系。
// 备份 stages-pre-facidfix-backup。
import { readFile, readdir, writeFile, cp, rm } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const gen = join(root, 'mod-kit', 'generated', 'deepseek-v4-flash');
const scratch = '/private/tmp/claude-501/-Users-clawbot-Projects-XianTu/4539c391-d7a9-44e3-89ed-752e9edc2f05/scratchpad';
const pinyin = JSON.parse(readFileSync(join(scratch, 'facpinyin.json'), 'utf8'));
const books = ['qingyu', 'yunlong', 'yange'];
const TYPE_ZH = { army: '军队', military: '军事机构', sect: '宗门', tribe: '部族', government: '官府', clan: '家族', state: '诸侯国', organization: '组织', secret_organization: '秘盟' };
async function readJson(p) { return JSON.parse(await readFile(p, 'utf8')); }

const REF1 = new Set(['factionId', 'fromFactionId', 'toFactionId']);
const REFA = new Set(['relatedFactionIds']);
function remapRefs(n, remap) {
  if (Array.isArray(n)) return n.forEach(x => remapRefs(x, remap));
  if (!n || typeof n !== 'object') return;
  for (const [k, v] of Object.entries(n)) {
    if (REF1.has(k) && typeof v === 'string' && remap.has(v)) n[k] = remap.get(v);
    else if (REFA.has(k) && Array.isArray(v)) n[k] = v.map(x => (remap.has(x) ? remap.get(x) : x));
    else remapRefs(v, remap);
  }
}

async function run() {
  // 收集同名多 id → remap
  const byName = new Map();
  for (const b of books) { const d = join(gen, b, 'stages'); for (const f of (await readdir(d)).filter(n => n.endsWith('.json') && !n.endsWith('.uncertainties.json'))) { const m = await readJson(join(d, f)); for (const fa of m.canon?.factions || []) { (byName.get(fa.name) || byName.set(fa.name, new Set()).get(fa.name)).add(fa.id); } } }
  const remap = new Map(); const owner = new Map();
  for (const [name, ids] of byName) {
    if (ids.size < 2 || !pinyin[name]) continue;
    const canonical = `liuchao.faction.${pinyin[name]}`;
    if (owner.has(canonical) && owner.get(canonical) !== name) throw new Error(`canonical 冲突 ${canonical}`); owner.set(canonical, name);
    for (const id of ids) if (id !== canonical) remap.set(id, canonical);
  }
  console.log(`势力合并 ${owner.size} 组，${remap.size} 旧id→canonical。`);

  let typeFix = 0, merged = 0;
  for (const b of books) {
    const d = join(gen, b, 'stages');
    const bk = join(gen, b, 'stages-pre-facidfix-backup'); if (existsSync(bk)) await rm(bk, { recursive: true }); await cp(d, bk, { recursive: true });
    for (const f of (await readdir(d)).filter(n => n.endsWith('.json') && !n.endsWith('.uncertainties.json'))) {
      const m = await readJson(join(d, f));
      for (const fa of m.canon?.factions || []) {
        if (fa.id && remap.has(fa.id)) fa.id = remap.get(fa.id);
        if (fa.type && TYPE_ZH[fa.type]) { fa.type = TYPE_ZH[fa.type]; typeFix++; }
      }
      // 去重势力条目
      const seen = new Map(); const kept = [];
      for (const fa of m.canon?.factions || []) { if (seen.has(fa.id)) { merged++; } else { seen.set(fa.id, fa); kept.push(fa); } }
      if (m.canon) m.canon.factions = kept;
      remapRefs(m, remap);
      // 去重势力关系(自环 + from::to)
      if (Array.isArray(m.canon?.factionRelationships)) { const s = new Set(); m.canon.factionRelationships = m.canon.factionRelationships.filter(r => r.fromFactionId !== r.toFactionId && (s.has(`${r.fromFactionId}::${r.toFactionId}`) ? false : (s.add(`${r.fromFactionId}::${r.toFactionId}`), true))); }
      await writeFile(join(d, f), `${JSON.stringify(m, null, 2)}\n`);
    }
  }
  // id-map 不含势力，跳过
  console.log(`type 中文化 ${typeFix} 处，去重势力条目 ${merged}。备份 stages-pre-facidfix-backup。`);
}
run().catch(e => { console.error(e); process.exit(1); });
