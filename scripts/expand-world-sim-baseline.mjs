#!/usr/bin/env node

/**
 * 为缺少 worldSimulation 合同的 stage 生成保守的可玩底座。
 *
 * 这是“运行时可用”层，不是承重剧情裁定：它只把已有 critical event 的
 * 完成条件投影成当前局势和未知结果的剧情内征兆，后续由 Claude 按书逐关复核。
 * 已有 worldSimulation 永远跳过，避免覆盖人工裁定的纵切。
 */

import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const generatedRoot = join(root, 'mod-kit', 'generated', 'deepseek-v4-flash');
const books = ['qingyu', 'yunlong', 'yange'];

function stageEventKey(eventId) {
  const explicit = String(eventId || '').split('.event.')[1];
  if (explicit) return explicit;
  return String(eventId || '').split('.').at(-1);
}

function flagCondition(path) {
  return { path, operator: 'eq', value: true };
}

function eventSettledWhenAny(event) {
  const groups = [];
  const completion = Array.isArray(event.completion) ? event.completion : [];
  const completionFlags = completion.filter(item => item && typeof item.path === 'string' && item.path.startsWith('flags.'));
  if (completionFlags.length) groups.push(completionFlags.map(item => ({
    path: item.path,
    operator: item.operator,
    ...(Object.prototype.hasOwnProperty.call(item, 'value') ? { value: item.value } : {}),
  })));
  const localKey = stageEventKey(event.id);
  if (!groups.length && localKey) groups.push([flagCondition(`flags.event.${localKey}.done`)]);
  const offscreen = event.offscreenResolution;
  if (offscreen?.flagKey) groups.push([flagCondition(`flags.${offscreen.flagKey}`)]);
  return groups.length ? groups : [[flagCondition(`flags.event.${localKey}.done`)]];
}

function omenAfterTurns(event) {
  const limits = [event.timeline?.deadlineTurns, event.offscreenResolution?.afterStallTurns]
    .filter(value => Number.isInteger(value) && value >= 0);
  if (!limits.length) return 1;
  return Math.max(0, Math.min(1, Math.min(...limits) - 1));
}

function buildBaselineSituation(mod, event, characterIds) {
  const eventId = String(event.id);
  const name = String(event.name || event.description || eventId).replace(/[“”"\n]/g, '').slice(0, 42);
  const related = (Array.isArray(event.relatedCharacterIds) ? event.relatedCharacterIds : [])
    .filter(id => characterIds.has(id))
    .slice(0, 2)
    .map(characterId => ({ kind: 'related_npc', characterId }));
  const transmitters = [...related, { kind: 'messenger' }, { kind: 'environment' }];
  const omenId = `omen.baseline.${mod.manifest.id}.${eventId}`;
  return {
    id: `world-sim.baseline.${mod.manifest.id}.${eventId}`,
    title: `局势中的${name}`,
    summary: `围绕“${name}”的局势尚未定局；玩家可以介入，也可以继续当前行动。`,
    sourceEventId: eventId,
    settledWhenAny: eventSettledWhenAny(event),
    anchorIds: [],
    outcomeIds: [],
    omen: {
      id: omenId,
      afterTurns: omenAfterTurns(event),
      observableFacts: [
        `围绕“${name}”的安排正在被重新核对`,
        '相关人物、口信或行路次序出现了细小变化',
      ],
      transmitters,
      environmentFallback: '远处传来点名、换岗或整理行装的动静，暂时没有人能说清缘由。',
      presentation: {
        title: '风声有变',
        text: `有人低声提到“${name}”一带的安排正在重新核对，相关人物、口信或行路次序似乎有些变化。还看不出事情会往哪边走。`,
      },
    },
  };
}

async function main() {
  let updated = 0;
  let skipped = 0;
  let situations = 0;
  for (const book of books) {
    const stageDir = join(generatedRoot, book, 'stages');
    const files = (await readdir(stageDir)).filter(name => name.endsWith('.json') && !name.endsWith('.uncertainties.json')).sort();
    for (const file of files) {
      const path = join(stageDir, file);
      const mod = JSON.parse(await readFile(path, 'utf8'));
      if (mod.scenario?.worldSimulation) {
        skipped += 1;
        continue;
      }
      const characters = Array.isArray(mod.scenario?.canon?.characters) ? mod.scenario.canon.characters : [];
      const characterIds = new Set(characters.map(character => character?.id).filter(Boolean));
      const events = (Array.isArray(mod.scenario?.events) ? mod.scenario.events : [])
        .filter(event => event?.critical !== false && event?.id);
      mod.scenario.worldSimulation = {
        version: 1,
        situations: events.map(event => buildBaselineSituation(mod, event, characterIds)),
        structuralAnchors: [],
        forkableOutcomes: [],
        referenceBeats: [],
      };
      situations += events.length;
      await writeFile(path, `${JSON.stringify(mod, null, 2)}\n`);
      updated += 1;
    }
  }
  console.log(JSON.stringify({ updated, skipped, situations }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
