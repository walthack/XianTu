// 生成档的去处（宋线 S4）：内容包 manifest.rails 里文件名以 .generated.json 结尾的文件「认领」其中各档的 modId，
// build-canon-rail-profiles.mjs 生成的档按认领写回那个包文件，其余照旧写进 canonRailProfiles.generated.json。
// 认领方是手写 rails 文件（如秦 rails.json）、两个文件认领同一关、认领了却没生成出来的关，一律报错（fail closed）。
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const GENERATED_SUFFIX = '.generated.json';

/** 读各包 manifest 的 rails 文件：[{file（相对 root 的 posix 路径）, generated, modIds}]，按包目录名、manifest 列表顺序。 */
export async function readPackRailClaims(packsDir, root) {
  const claims = [];
  for (const dir of (await readdir(packsDir, { withFileTypes: true })).filter(x => x.isDirectory()).map(x => x.name).sort()) {
    const manifest = JSON.parse(await readFile(join(packsDir, dir, 'manifest.json'), 'utf8'));
    for (const name of manifest.rails || []) {
      const path = join(packsDir, dir, name);
      const rails = JSON.parse(await readFile(path, 'utf8'));
      if (!Array.isArray(rails)) throw new Error(`${relative(root, path)}: expected array`);
      claims.push({ file: relative(root, path).split('\\').join('/'), generated: name.endsWith(GENERATED_SUFFIX), modIds: rails.map(r => r?.modId) });
    }
  }
  return claims;
}

/**
 * 纯函数：profiles 是生成器的输出（顺序即写出顺序）。返回 { core: 写进 canonRailProfiles.generated.json 的档, packs: Map(file → 该文件的档) }，
 * 各自保持 profiles 里的相对顺序。
 */
export function routeRailProfiles(profiles, claims) {
  const owner = new Map();
  for (const claim of claims) for (const modId of claim.modIds) {
    if (owner.has(modId)) throw new Error(`canon rail ${modId}: claimed by both ${owner.get(modId).file} and ${claim.file}`);
    owner.set(modId, claim);
  }
  const core = [], packs = new Map(claims.filter(c => c.generated).map(c => [c.file, []]));
  for (const profile of profiles) {
    const claim = owner.get(profile.modId);
    if (!claim) { core.push(profile); continue; }
    if (!claim.generated) throw new Error(`canon rail ${profile.modId}: generated, but ${claim.file} is a hand-written pack rail; remove one of them before regenerating`);
    packs.get(claim.file).push(profile);
  }
  const produced = new Set(profiles.map(p => p.modId));
  for (const claim of claims.filter(c => c.generated)) for (const modId of claim.modIds) {
    if (!produced.has(modId)) throw new Error(`canon rail ${modId}: claimed by ${claim.file} but not generated (quarantined or lost its anchors?); update that pack file by hand`);
  }
  return { core, packs };
}
