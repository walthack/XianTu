#!/usr/bin/env node
/**
 * Generate UI-importable, disposable Chrome acceptance saves for the three
 * R2-0V Xieyi outcomes.  The source must be a real post-stage_06 save: it is
 * never modified.  These are downstream acceptance seeds; the upstream
 * `void + characterStates` activation remains covered by automated tests.
 *
 * Usage:
 *   node scripts/build-r2-0v-xieyi-fixtures.mjs \
 *     --source .xiantu-server/save-storage/savedata_..._存档1.json \
 *     --out /tmp/r2-0v-xieyi-routes.json
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const args = process.argv.slice(2);
const valueOf = (name) => args[args.indexOf(name) + 1];
const source = valueOf('--source');
const out = valueOf('--out');
if (!source || !out) throw new Error('需要 --source <真实存档包装 JSON> 与 --out <导入包 JSON>');

const wrapped = JSON.parse(await readFile(resolve(source), 'utf8'));
const base = structuredClone(wrapped.data || wrapped);
const runtime = (save) => save?.世界?.状态?.剧本模组;
if (runtime(base)?.modId !== 'lcq.stage_07_qingyuan_jiankang') {
  throw new Error('source 必须是已进入 lcq.stage_07_qingyuan_jiankang 的谢艺纵切存档');
}

function seed(name, mutate) {
  const data = structuredClone(base);
  const rt = runtime(data);
  mutate(data, rt);
  data.元数据.存档名 = name;
  data.元数据.存档ID = `r2-0v-fixture-${name}`;
  return { 存档名: name, 保存时间: new Date().toISOString(), 角色名字: data.角色?.身份?.名字, 存档数据: data };
}

const canonical = seed('R2-0V-谢艺-正典', (data, rt) => {
  delete rt.flags['event.s06_03.void'];
  delete rt.flags['branch.lcq.if_xieyi_longrest.unlocked'];
  delete rt.flags['branch.lcq.if_xieyi_longrest.active'];
  delete rt.flags['character.xie_yi.status'];
  delete rt.flags['world.xieyi_absence.active'];
  rt.divergences = (rt.divergences || []).filter(item => item.eventId !== 'lcq.event.s06_03');
  data.社交.记忆.短期记忆 = ['【验收种子】谢艺已按原著战死；不得出现生还、失踪或接应叙事。'];
});

const survival = seed('R2-0V-谢艺-生还', () => {});

const missing = seed('R2-0V-谢艺-失踪失败', (data, rt) => {
  delete rt.flags['branch.lcq.if_xieyi_longrest.unlocked'];
  delete rt.flags['branch.lcq.if_xieyi_longrest.active'];
  rt.flags['event.s06_03.void'] = true;
  rt.flags['character.xie_yi.status'] = 'missing';
  rt.flags['world.xieyi_absence.active'] = true;
  rt.divergences = (rt.divergences || []).filter(item => item.eventId !== 'lcq.event.s06_03');
  rt.divergences.push({
    id: 'divergence.lcq.event.s06_03.fixture-missing', eventId: 'lcq.event.s06_03',
    worldDelta: '围猎后的水道被毁，谢艺下落不明，星月湖须同时展开搜寻并守住联络线。',
    characterStates: [{ characterId: 'liuchao.character.xie_yi', status: 'missing' }],
    evidence: '洪水冲毁水道，谢艺去向不明。', sequence: rt.divergences.length + 1,
  });
  data.社交.记忆.短期记忆 = ['【验收种子】谢艺下落不明；不得确认其死亡、获救或安全。'];
});

await mkdir(dirname(resolve(out)), { recursive: true });
await writeFile(resolve(out), `${JSON.stringify({ type: 'saves', saves: [canonical, survival, missing] }, null, 2)}\n`);
console.log(`已生成 3 条 R2-0V 谢艺验收存档：${resolve(out)}`);
