#!/usr/bin/env node
// C01 年龄口径体检（docs/COMPLIANCE-REQUIREMENTS.md A 节；设计稿 C01 v5 §3.3）。canon:build 调用。
//   缺出生年报告（敌人种类、生物、notPersons 不算人物）——运行时按满 18 处理，只报不挡；
//   下限抬升清单（口径甲）：原著出生年在首登时不满 18、由运行时下限抬到 18 的人，只报不挡；
//   现算仍不满 18 警告（口径乙）：下限之后首登仍不满 18，正常数据不会出现；
//   无首登记录、在开局年（原著当下年）被提到会现算不满 18 的人：没有下限可兜，只报不挡；
//   剧情小孩（出生年表 storyChild，用户逐人定）：不套下限，首登现算不满 18 时私密层由年龄门关着，单列只报不挡，不进抬升与警告清单；
//   原著岁数越界：总表档案与关卡人物档案里写着的岁数（不该进卡与提示词），只报不挡；
//   总表派生字段：有效出生年、首登年、现算年龄等派生值写回了总表即失败（派生值只在运行时现算）。
// 用法：node scripts/audit-c01-ages.mjs [--json]；测试经 auditC01Ages(inputs) 换入改过的时间线或总表。
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '..');
const read = p => JSON.parse(readFileSync(join(root, p), 'utf8'));

/** 读仓库现有产物作输入；测试可替换其中任一项（改年数、删插入事件、删出生年）。 */
export function c01AuditInputs() {
  const stageDir = join(root, 'src/modules/scenarioMods/builtins/data');
  return {
    registry: read('src/modules/scenarioMods/builtins/character-registry.json').characters,
    table: read('mod-kit/character-birth-years.json'),
    timeline: read('src/modules/contentPacks/generated/catalog.json').timeline,
    minAdult: read('mod-kit/prompt-layers.json').private.minAdultAge,
    stages: readdirSync(stageDir).filter(x => x.endsWith('.json')).map(f => JSON.parse(readFileSync(join(stageDir, f), 'utf8'))),
  };
}

export function auditC01Ages({ registry, table, timeline, minAdult, stages } = c01AuditInputs()) {
  const { canonPresentYear, inserts, characterDebuts } = timeline;
  const NON_PERSON_TYPES = new Set(['enemy_kind', 'creature']);
  const notPersons = new Set((table.notPersons || []).map(x => x.id));
  const persons = registry.filter(e => !NON_PERSON_TYPES.has(e.entityType) && !notPersons.has(e.id));
  const byId = new Map();
  for (const e of registry) { byId.set(e.id, e); for (const a of e.idAliases || []) byId.set(a, e); }

  const shiftAt = seq => inserts.filter(x => x.anchor.beforeAxisSeq <= seq).reduce((s, x) => s + x.years, 0);
  const debut = new Map();
  for (const [id, seq] of Object.entries(characterDebuts)) {
    const key = byId.get(id)?.id || id;
    if (!debut.has(key) || seq < debut.get(key)) debut.set(key, seq);
  }

  const missing = [], lifted = [], under18 = [], noDebutMinor = [], storyChildren = [];
  for (const e of persons) {
    const birth = e.staticProfile?.birthYear;
    if (typeof birth !== 'number') { missing.push(`${e.id} ${e.canonicalName}`); continue; }
    const seq = debut.get(e.id);
    if (seq === undefined) {
      if (canonPresentYear - birth < minAdult) noDebutMinor.push(`${e.canonicalName}（${e.id}）出生 ${birth}，${canonPresentYear} 年现算 ${canonPresentYear - birth} 岁`);
      continue;
    }
    const debutYear = canonPresentYear + shiftAt(seq);
    if (e.storyChild) {
      storyChildren.push(`${e.canonicalName}（${e.id}）出生 ${birth}，首登 ${debutYear} 年现算 ${debutYear - birth} 岁${debutYear - birth < minAdult ? '，私密层由年龄门关着' : ''}`);
      continue;
    }
    const effective = Math.min(birth, debutYear - minAdult);
    if (debutYear - birth < minAdult) lifted.push(`${e.canonicalName}（${e.id}）出生 ${birth}，首登 ${debutYear} 年原著口径 ${debutYear - birth} 岁 → 按 ${minAdult} 岁`);
    if (debutYear - effective < minAdult) under18.push(`${e.canonicalName}（${e.id}）首登 ${debutYear} 年现算 ${debutYear - effective} 岁`);
  }

  const DERIVED_KEYS = ['effectiveBirthYear', 'debutYear', 'debutAxisSeq', 'ageNow', 'currentAge', 'timelineShift'];
  const derived = [];
  for (const e of registry) for (const k of DERIVED_KEYS) if (k in e || k in (e.staticProfile || {})) derived.push(`${e.id}.${k}`);

  const AGE_RE = /[一二三四五六七八九十两廿\d]+[多余来]?岁/;
  const SKIP_PROFILE_KEYS = new Set(['storyAge', 'birthYear']);
  const ageHits = [];
  const scanText = (where, value) => {
    if (typeof value === 'string') { const m = value.match(AGE_RE); if (m) ageHits.push(`${where}：「${m[0]}」`); return; }
    if (Array.isArray(value)) value.forEach((v, i) => scanText(`${where}[${i}]`, v));
    else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) scanText(`${where}.${k}`, v);
  };
  for (const e of registry) for (const [k, v] of Object.entries(e.staticProfile || {})) if (!SKIP_PROFILE_KEYS.has(k)) scanText(`总表 ${e.id}.${k}`, v);
  const seenStageText = new Set();
  for (const stage of stages) {
    for (const c of stage.canon?.characters || []) for (const k of ['memories', 'appearance', 'notes']) {
      const before = ageHits.length;
      scanText(`关卡 ${c.id}.profile.${k}`, c.profile?.[k]);
      for (const hit of ageHits.splice(before)) if (!seenStageText.has(hit)) { seenStageText.add(hit); ageHits.push(hit); }
    }
  }
  return { persons: persons.length, missing, lifted, under18, noDebutMinor, storyChildren, ageHits, derived };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = auditC01Ages();
  const { missing, lifted, under18, noDebutMinor, storyChildren, ageHits, derived } = report;
  const minAdult = c01AuditInputs().minAdult;
  if (process.argv.includes('--json')) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(`C01 年龄体检：人物 ${report.persons}，缺出生年 ${missing.length}，下限抬升 ${lifted.length}，剧情小孩 ${storyChildren.length}，现算不满 ${minAdult} ${under18.length}，无首登且开局年不满 ${minAdult} ${noDebutMinor.length}，档案岁数 ${ageHits.length}，派生字段 ${derived.length}`);
    for (const x of missing) console.log(`  [缺出生年·运行时按满 ${minAdult}] ${x}`);
    for (const x of lifted) console.log(`  [下限抬升·信息] ${x}`);
    for (const x of storyChildren) console.log(`  [剧情小孩·不套下限·信息] ${x}`);
    for (const x of under18) console.log(`  [警告·现算不满 ${minAdult}] ${x}`);
    for (const x of noDebutMinor) console.log(`  [无首登·开局年现算不满 ${minAdult}·信息] ${x}`);
    for (const x of ageHits) console.log(`  [档案岁数·待清] ${x}`);
    for (const x of derived) console.log(`  [失败·派生字段写回总表] ${x}`);
  }
  if (derived.length) process.exit(1);
}
