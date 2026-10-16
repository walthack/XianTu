import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadTs} from './loadTs.mjs';

const root = new URL('../', import.meta.url);
const json = async path => JSON.parse(await readFile(new URL(path, root), 'utf8'));
const STAGE = 'lcq.stage_04b_lingfei_baiyi_crisis';
const SHEKUI = 'lcq.character.nanhuang_shekui';
const HEISHE = 'lcq.character.nanhuang_heishe';
// 用户 2026-10-15 第三轮批准：79章起保留旧限定语（措辞取自旧 role／描述原文，仅「随从」→「生意伙伴」）。
const BEFORE_79 = {[SHEKUI]: {description: '阁罗的随从，长得像蛇', role: '鬼王峒使者阁罗的随从'}, [HEISHE]: {description: '阁罗的随从', role: '阁罗的随从，鬼王峒的人'}};
const FROM_79 = {[SHEKUI]: {description: '阁罗的生意伙伴，长得像蛇', role: '鬼王峒使者阁罗的生意伙伴'}, [HEISHE]: {description: '阁罗的生意伙伴', role: '阁罗的生意伙伴，鬼王峒的人'}};

/** 在第 chapter 章的 04b 关存档：以已完成事件的章锚点推出章号（与 namingChapter 同源）。 */
async function runtimeAt(chapter) {
  const {resolveScenarioCharacters, syncNanhuangIdentityDisplay} = await loadTs('../src/modules/scenarioMods/characterResolver.ts');
  const mod = await json(`src/modules/scenarioMods/builtins/data/${STAGE}.json`);
  const characters = structuredClone(mod.canon.characters);
  resolveScenarioCharacters(characters, STAGE);
  const runtime = {modId: STAGE, canon: {characters}, events: [{id: 'fixture.chapter', axisAnchor: `第${chapter}章`}], completedEventIds: ['fixture.chapter']};
  syncNanhuangIdentityDisplay(runtime);
  return runtime;
}
const pick = (runtime, id) => runtime.canon.characters.find(c => c.id === id);
const phase04b = async id => (await json('src/modules/scenarioMods/builtins/character-registry.json')).characters
  .find(e => e.id === id).phaseIdentities.find(p => p.scope === 'stage-projection' && p.stageId === STAGE);

test('chapter switch: 蛇傀／黑舌 at ch78 keep the master 04b identity (阁罗的随从)', async () => {
  const at78 = await runtimeAt(78);
  for (const id of [SHEKUI, HEISHE]) {
    const master = await phase04b(id);
    const c = pick(at78, id);
    assert.equal(c.description, master.description);
    assert.equal(c.profile.origin, master.identity);
    assert.match(c.profile.origin, /阁罗的随从/);
    assert.equal(c.description, BEFORE_79[id].description);
    assert.equal(c.role, BEFORE_79[id].role);
    assert.deepEqual(c.profile.notes.filter(n => n.startsWith('【阶段身份】')), [`【阶段身份】${master.identity}`]);
  }
});

test('chapter switch: 蛇傀／黑舌 from ch79 are 阁罗的生意伙伴 in description, origin, 【阶段身份】 and role, keeping the old qualifiers', async () => {
  for (const chapter of [79, 80]) {
    const rt = await runtimeAt(chapter);
    for (const id of [SHEKUI, HEISHE]) {
      const c = pick(rt, id);
      assert.equal(c.description, FROM_79[id].description);
      assert.equal(c.profile.origin, FROM_79[id].description);
      assert.equal(c.role, FROM_79[id].role);
      assert.deepEqual(c.profile.notes.filter(n => n.startsWith('【阶段身份】')), [`【阶段身份】${FROM_79[id].description}`]);
      assert.doesNotMatch(JSON.stringify(c), /阁罗的随从/);
    }
  }
});

test('chapter switch: the 78→79 boundary only touches characters named in the ledger', async () => {
  const [at78, at79] = [await runtimeAt(78), await runtimeAt(79)];
  const ledger = await json('mod-kit/entity-ledger/overrides.json');
  const switched = new Set(Object.keys(ledger.chapterIdentities));
  assert.deepEqual([...switched].sort(), [HEISHE, SHEKUI].sort());
  for (const c of at78.canon.characters) {
    if (switched.has(c.id)) continue;
    assert.deepEqual(pick(at79, c.id), c, `${c.id} must not change between ch78 and ch79`);
  }
});

test('chapter switch: the mechanism is ledger-driven — every step switches exactly at its fromChapter, no per-character code', async () => {
  const {identityFor} = await loadTs('../src/modules/scenarioMods/ledger/naming.ts');
  const ledger = await json('mod-kit/entity-ledger/overrides.json');
  const registryIds = new Set((await json('src/modules/scenarioMods/builtins/character-registry.json')).characters.map(e => e.id));
  for (const [id, entry] of Object.entries(ledger.chapterIdentities)) {
    assert.ok(registryIds.has(id), `${id} must be a master id`);
    for (const step of entry.steps) {
      assert.ok(step.identity, `${id}@${step.fromChapter} needs identity text`);
      assert.deepEqual(identityFor(id, step.fromChapter), entry.steps.filter(s => s.fromChapter <= step.fromChapter).at(-1));
      const before = identityFor(id, step.fromChapter - 1);
      assert.notEqual(before?.identity === step.identity && before?.fromChapter === step.fromChapter, true);
    }
  }
  assert.equal(identityFor(SHEKUI, 78), undefined);
  assert.equal(identityFor(SHEKUI, 79).identity, FROM_79[SHEKUI].description);
  assert.equal(identityFor(HEISHE, 79).role, FROM_79[HEISHE].role);
  assert.equal(identityFor('liuchao.character.cheng_zongyang', 200), undefined);
  for (const file of ['src/modules/scenarioMods/ledger/naming.ts', 'src/modules/scenarioMods/characterResolver.ts']) {
    assert.doesNotMatch(await readFile(new URL(file, root), 'utf8'), /nanhuang_shekui|nanhuang_heishe|蛇傀|黑舌/, `${file} must not special-case 蛇傀／黑舌`);
  }
});

test('chapter plumbing: 阁罗改名章与乐明珠揭示章直接读账本（78／47，用户 2026-10-15 01:11 按原著核实），代码不另存章号', async () => {
  const {ledgerChapterGates} = await loadTs('../src/modules/scenarioMods/ledger/naming.ts');
  const ledger = await json('mod-kit/entity-ledger/overrides.json');
  assert.equal(ledger.effectiveChapterGates, undefined, '不再有第二份“有效章号”');
  const geluoRename = ledger.entities.find(e => e.id === 'lcq.character.np006').naming.panel.find(s => s.kind === 'name');
  assert.equal(geluoRename.text, '阁罗');
  assert.equal(geluoRename.fromChapter, 78);
  assert.equal(ledger.namingMilestones['lcq.event.s04_03'], 47);
  assert.equal(ledgerChapterGates.geluoRenameFrom, geluoRename.fromChapter);
  assert.equal(ledgerChapterGates.lemingzhuRevealFrom, ledger.namingMilestones['lcq.event.s04_03']);
});

test('chapter plumbing: 乐明珠身份揭示——第46章仍是隐藏身份，第47章起揭示（读账本章门）', async () => {
  const {resolveScenarioCharacters, syncNanhuangIdentityDisplay} = await loadTs('../src/modules/scenarioMods/characterResolver.ts');
  const ledger = await json('mod-kit/entity-ledger/overrides.json');
  const display = ledger.identityDisplays['liuchao.character.le_mingzhu'];
  const stage = 'lcq.stage_04';
  const mod = await json(`src/modules/scenarioMods/builtins/data/${stage}.json`);
  const roleAt = chapter => {
    const characters = structuredClone(mod.canon.characters);
    resolveScenarioCharacters(characters, stage);
    const runtime = {modId: stage, canon: {characters}, events: [{id: 'fixture.chapter', axisAnchor: `第${chapter}章`}], completedEventIds: ['fixture.chapter']};
    syncNanhuangIdentityDisplay(runtime);
    return runtime.canon.characters.find(c => c.id === 'liuchao.character.le_mingzhu').role;
  };
  assert.equal(roleAt(46), display.hidden.role);
  assert.equal(roleAt(47), display.revealed.role);
  assert.notEqual(display.hidden.role, display.revealed.role);
  // 揭示事件本身就按第47章记：关内事件章锚点、界面章标题、命名里程碑三处一致。
  const reveal = mod.scenario.events.find(e => e.id === 'lcq.event.s04_03');
  assert.match(reveal.axisAnchor, /第47章/);
  const {storyChapterTitle} = await loadTs('../src/modules/scenarioMods/eventNarrativeView.ts');
  assert.match(storyChapterTitle(stage, 'lcq.event.s04_03', ''), /^第47章/);
});

test('chapter plumbing: 阁罗改名——第77章仍是「鬼王峒使者」，第78章起别名放开（读账本章门）', async () => {
  const {readLocalMemoryCapsule} = await loadTs('../src/modules/scenarioMods/legacyNarratorPacket.ts');
  const mod = await json(`src/modules/scenarioMods/builtins/data/${STAGE}.json`);
  const actorAt = chapter => {
    const runtime = {modId: STAGE, canon: {characters: structuredClone(mod.canon.characters)}, completedEventIds: [],
      events: [{id: 'fixture', name: 'fixture', description: 'fixture', axisAnchor: `第${chapter}章`, playerCompletionContract: {actions: [{id: 'show', cast: {present: ['鬼王峒使者']}}]}}]};
    const capsule = readLocalMemoryCapsule({世界: {状态: {剧本模组: runtime}}, 角色: {身份: {名字: '程宗扬'}}}, {eventId: 'fixture', actionId: 'show', actionText: '观察', outcomeText: '观察'});
    return capsule.presentActors.find(a => a.role === '鬼王峒使者，尚未报名' || a.characterId === 'lcq.character.np006');
  };
  assert.equal(actorAt(77).characterId, undefined);
  assert.equal(actorAt(78).characterId, 'lcq.character.np006');
});
