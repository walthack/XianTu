// 关卡 canon.characters[] 里的「内联副本」判定：人物走 id 引用的第一步。
// 总表（character-registry.json）是静态档案的唯一来源，运行时 resolveScenarioCharacters 会按 id 写回。
// 阶段档里仍抄着的同名字段分两种：
//   copy     —— 与运行时还原结果逐项相同：纯副本，总表才是权威，将来可直接删；
//   diverged —— 与还原结果不同：运行时以总表为准，这份内联值是死数据（手写或过期），必须改总表而不是改阶段档。
// 总表不供值的（无条目、被时点闸排除、南荒相位留空）不算副本，内联值是唯一来源。
//
// 判定不复制 resolver 的规则：把内联值换成哨兵，交给 resolver 还原一遍，看哨兵有没有被总表覆盖。
import { readdirSync, readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { fileURLToPath } from 'node:url';
import { createJiti } from 'jiti';

const root = new URL('..', import.meta.url);
export const DATA_DIR = new URL('src/modules/scenarioMods/builtins/data/', root);

const jiti = createJiti(import.meta.url, {
  interopDefault: true,
  alias: { '@': fileURLToPath(new URL('src', root)) },
});
const { resolveScenarioCharacters } = await jiti.import(
  fileURLToPath(new URL('src/modules/scenarioMods/characterResolver.ts', root)),
);

// 第一类字段：总表非空即整体覆盖、不看阶段档原值（characterResolver.ts 的 personality 一段）。
export const COPY_FIELDS = [
  {
    path: 'profile.personality',
    read: c => c.profile?.personality,
    write: (c, v) => { (c.profile ||= {}).personality = v; },
    remove: c => { delete c.profile?.personality; },
  },
];

const SENTINEL = '\u0000inline-copy-probe\u0000';

/** 总表在该关会给这个人什么值；不供值返回 undefined。 */
function registrySupplied(character, stageId, field) {
  const probe = structuredClone(character);
  field.write(probe, [SENTINEL]);
  resolveScenarioCharacters([probe], stageId);
  const value = field.read(probe);
  return Array.isArray(value) && value.length === 1 && value[0] === SENTINEL ? undefined : value;
}

export function classifyInlineCopies(mod) {
  const stageId = mod.manifest?.id;
  const copies = [];
  const diverged = [];
  for (const character of mod.canon?.characters || []) {
    for (const field of COPY_FIELDS) {
      const inline = field.read(character);
      if (!Array.isArray(inline) || !inline.length) continue;
      const supplied = registrySupplied(character, stageId, field);
      if (supplied === undefined) continue;
      const row = { stageId, id: character.id, name: character.name, field: field.path, inline, supplied };
      (isDeepStrictEqual(inline, supplied) ? copies : diverged).push(row);
    }
  }
  return { copies, diverged };
}

export function loadBuiltinStages(dir = DATA_DIR) {
  return readdirSync(dir)
    .filter(file => file.endsWith('.json'))
    .sort()
    .map(file => JSON.parse(readFileSync(new URL(file, dir), 'utf8')));
}

export function auditBuiltinCharacterReferences(mods = loadBuiltinStages()) {
  const total = { stages: mods.length, copies: [], diverged: [] };
  for (const mod of mods) {
    const { copies, diverged } = classifyInlineCopies(mod);
    total.copies.push(...copies);
    total.diverged.push(...diverged);
  }
  return total;
}
