// 外观主表对人物总表：补 characterId／出生年、每套服饰补场景标签（scripts/link-portrait-visual-master.mjs）。
// 主表不入库，这里用合成数据测纯函数；入库的场景标签文件单独验格式。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { linkPortraitMaster, REGISTRY, SCENE_TAGS } from '../scripts/link-portrait-visual-master.mjs';

const registry = { characters: [
  { id: 'x.character.a', canonicalName: '甲', aliases: ['阿甲'], staticProfile: { birthYear: 201 }, birthYearBasis: '原著' },
  { id: 'x.character.b', canonicalName: '乙', staticProfile: {} },
  { id: 'x.character.c1', canonicalName: '丙', staticProfile: { birthYear: 190 } },
  { id: 'x.character.c2', canonicalName: '丙', staticProfile: { birthYear: 191 } },
] };
const outfit = (id, scope = 'default') => ({ id, label: '', scope, outfit: '布衣' });
const master = () => ({ schema: 'v2', characters: [
  { name: '甲', identity: {}, outfits: [outfit('default'), outfit('variant-1', 'unassigned')] },
  { name: '乙', identity: {}, outfits: [outfit('default')] },
  { name: '丙', identity: {}, outfits: [] },
  { name: '阿甲', identity: {}, outfits: [] },
  { name: '路人', identity: {}, outfits: [outfit('default')] },
] });
const tags = () => ({ vocabulary: { daily: '日常', battle: '战斗' }, outfits: {
  'x.character.a/default': { tags: ['daily'] }, 'x.character.a/variant-1': { tags: ['battle', 'daily'] },
  'x.character.b/default': { tags: [], untagged: '没有信息' }, 'name:路人/default': { tags: ['daily'] },
} });

test('对号：唯一同名才对上，id／出生年／依据原样取自总表；别名、重名、查无此人都不猜', () => {
  const { master: out, report } = linkPortraitMaster(master(), registry, tags());
  const by = Object.fromEntries(out.characters.map(c => [c.name, c]));
  assert.deepEqual([by.甲.characterId, by.甲.birthYear, by.甲.birthYearBasis], ['x.character.a', 201, '原著']);
  assert.deepEqual([by.乙.characterId, by.乙.birthYear, by.乙.birthYearBasis], ['x.character.b', null, null]);
  for (const name of ['丙', '阿甲', '路人']) assert.deepEqual([by[name].characterId, by[name].birthYear], [null, null], name);
  assert.equal(report.linked, 2);
  assert.deepEqual(report.unmatched, ['阿甲', '路人']);
  assert.deepEqual(report.ambiguous, ['丙：x.character.c1、x.character.c2']);
  assert.deepEqual(report.noBirthYear, ['乙']);
});

test('场景标签：按「角色 id/服饰 id」取，没有卡的人按名字；scope 等原有字段一个不动；输入不被改写', () => {
  const input = master(), frozen = JSON.stringify(input);
  const { master: out, report } = linkPortraitMaster(input, registry, tags());
  assert.equal(JSON.stringify(input), frozen);
  const by = Object.fromEntries(out.characters.map(c => [c.name, c]));
  assert.deepEqual(by.甲.outfits.map(o => o.sceneTags), [['daily'], ['battle', 'daily']]);
  assert.deepEqual(by.甲.outfits.map(o => o.scope), ['default', 'unassigned']);
  assert.deepEqual(by.乙.outfits[0].sceneTags, []);
  assert.deepEqual(by.路人.outfits[0].sceneTags, ['daily']);
  assert.deepEqual([report.outfits, report.tagged, report.untagged.length, report.problems.length], [4, 3, 1, 0]);
  const strip = m => ({ ...m, characters: m.characters.map(({ characterId, birthYear, birthYearBasis, ...c }) => ({ ...c, outfits: c.outfits.map(({ sceneTags, ...o }) => o) })) });
  assert.deepEqual(strip(out), input);
  // 幂等：对结果再跑一次不变
  assert.deepEqual(linkPortraitMaster(out, registry, tags()).master, out);
});

test('反例：缺条目、词表外的标签、留空不写原因、标签文件里有主表没有的服饰，都报问题', () => {
  const run = edit => { const t = tags(); edit(t); return linkPortraitMaster(master(), registry, t).report.problems; };
  assert.match(run(t => { delete t.outfits['x.character.a/default']; })[0], /没有条目/);
  assert.match(run(t => { t.outfits['x.character.a/default'].tags = ['picnic']; })[0], /不在词表里/);
  assert.match(run(t => { delete t.outfits['x.character.b/default'].untagged; })[0], /没有写留空原因/);
  assert.match(run(t => { t.outfits['x.character.z/default'] = { tags: ['daily'] }; })[0], /找不到对应服饰/);
});

test('入库的场景标签文件：键都指向总表里的人或写明 name:，标签都在词表里，留空的都写了原因', () => {
  const doc = JSON.parse(readFileSync(SCENE_TAGS, 'utf8'));
  const ids = new Set(JSON.parse(readFileSync(REGISTRY, 'utf8')).characters.map(c => c.id));
  const vocabulary = new Set(Object.keys(doc.vocabulary));
  const entries = Object.entries(doc.outfits);
  assert.equal(entries.length, 112);
  for (const [key, value] of entries) {
    const owner = key.slice(0, key.lastIndexOf('/'));
    assert.ok(owner.startsWith('name:') || ids.has(owner), `${key}: 总表里没有这个人`);
    for (const tag of value.tags) assert.ok(vocabulary.has(tag), `${key}: ${tag}`);
    assert.ok(value.tags.length || value.untagged, `${key}: 留空要写原因`);
  }
});
