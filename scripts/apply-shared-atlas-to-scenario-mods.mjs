#!/usr/bin/env node

import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const generatedRoot = join(root, 'mod-kit', 'generated', 'deepseek-v4-flash');
const atlasPath = join(generatedRoot, 'shared-atlas', 'liuchao.shared-atlas.v1.json');
const nasRoot = '/Volumes/botsvault/06_material/XianTu-Mod-Kit/DeepSeek-V4-Flash';

const atlas = JSON.parse(await readFile(atlasPath, 'utf8'));
const atlasByLocationId = new Map((atlas.atlas?.locations || []).map(location => [location.id, location]));
const atlasByFactionId = new Map((atlas.atlas?.factions || []).map(faction => [faction.id, faction]));
const atlasByContinentId = new Map((atlas.atlas?.continents || []).map(continent => [continent.id, continent]));
const bindingsByModId = new Map((atlas.stageBindings || []).map(binding => [binding.modId, binding]));

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function localStageFiles(book) {
  const dir = join(generatedRoot, book, 'stages');
  if (!existsSync(dir)) return [];
  return { dir };
}

function mapType(type, fallback) {
  const raw = String(type || fallback || '').trim();
  if (!raw) return '城池';
  if (['城池', '宗门', '秘境', '险地', '商会', '坊市', '洞府'].includes(raw)) return raw;
  const rules = [
    [/^(?:capital|city|town|settlement|城|城池|都城|京城|城市|县城|港口|关隘)$/i, '城池'],
    [/(?:城|都|京|港|关|寨|堡|镇|村|庄|宫|府|驿|营地|军营|战场|battlefield|camp|palace|court)/i, '城池'],
    [/^(?:sect|school|temple|monastery|宗门|门派|山门|道观|寺庙|修行宗门|宗门驻地)$/i, '宗门'],
    [/(?:宗|门派|山门|道观|寺|庵|观堂|教派|教团)/i, '宗门'],
    [/^(?:realm|secret_realm|ancient_ruin|ruin|ruins|秘境|遗迹|古阵|洞天|福地)$/i, '秘境'],
    [/(?:秘境|古阵|遗迹|洞天|福地|幻境|结界|陵|墓|ruin)/i, '秘境'],
    [/^(?:danger|wilderness|forbidden|险地|禁地|荒野|绝地)$/i, '险地'],
    [/(?:险|禁地|荒|岭|谷|林|海域|沙漠|雪原|深渊|绝地|地域|region)/i, '险地'],
    [/^(?:guild|company|trade|merchant|商会|商馆|镖局|行会|钱庄)$/i, '商会'],
    [/(?:商会|商馆|镖局|钱庄|商行|会馆|guild|company)/i, '商会'],
    [/^(?:market|bazaar|坊市|集市|市集|黑市)$/i, '坊市'],
    [/(?:坊市|集市|市集|黑市|市场|market|bazaar)/i, '坊市'],
    [/^(?:cave|residence|manor|洞府|宅邸|居所|府邸|别院|客栈)$/i, '洞府'],
    [/(?:洞府|宅|府邸|别院|客栈|居所|院|楼|阁|cave|residence)/i, '洞府'],
  ];
  return rules.find(([pattern]) => pattern.test(raw))?.[1] || '城池';
}

function buildContinent(continent, mod) {
  const localContinent = (mod.world.continents || []).find(item => item.id === continent.id || item.name === continent.name);
  return {
    id: continent.id,
    name: continent.name,
    description: localContinent?.description || continent.description || '',
    bounds: clone(continent.bounds || localContinent?.bounds),
  };
}

function normalizeLocation(local, atlasLocation) {
  return {
    ...local,
    continentId: atlasLocation?.continentId || local.continentId,
    type: mapType(atlasLocation?.type, local.type),
    description: local.description || atlasLocation?.description || '',
    coordinates: clone(atlasLocation?.coordinates || local.coordinates),
    features: local.features || [],
  };
}

function normalizeFaction(local, atlasFaction) {
  return {
    ...local,
    headquartersLocationId: atlasFaction?.headquartersLocationId || local.headquartersLocationId,
    type: local.type || atlasFaction?.type || '中立势力',
    description: local.description || atlasFaction?.description || '',
    territory: clone(atlasFaction?.territory || local.territory),
    features: local.features || [],
  };
}

function applyAtlas(mod) {
  if (mod?.schema !== 'xiantu.scenario-mod' || !mod?.manifest?.id) {
    return { mod, changed: false, reason: 'not a scenario mod' };
  }
  // 新增关卡（05b/扩展关）无 binding 文件——用空 binding 继续：
  // 全量地点注入（下方"凡带坐标一律注入"）不依赖 binding，跳过会导致地图缺点位（太泉古阵bug）。
  const binding = bindingsByModId.get(mod.manifest.id) || { visibleLocationIds: [], activeFactionIds: [], locationBindings: {}, factionBindings: {} };

  const visibleAtlasLocations = (binding.visibleLocationIds || [])
    .map(id => atlasByLocationId.get(id))
    .filter(Boolean);
  const activeAtlasFactions = (binding.activeFactionIds || [])
    .map(id => atlasByFactionId.get(id))
    .filter(Boolean);
  const requiredAtlasLocations = new Map(visibleAtlasLocations.map(location => [location.id, location]));
  // 世界地图铺满：凡带坐标的 atlas 地点一律注入（此前只按 binding.visibleLocationIds 白名单，
  // 漏了不在任何白名单的 太泉古阵/苍澜镇 → 地图缺点位）。同名去重护栏在下方注入处已有。
  for (const location of atlas.atlas?.locations || []) {
    if (location.coordinates && !requiredAtlasLocations.has(location.id)) requiredAtlasLocations.set(location.id, location);
  }
  for (const faction of activeAtlasFactions) {
    const headquarters = atlasByLocationId.get(faction.headquartersLocationId);
    if (headquarters) requiredAtlasLocations.set(headquarters.id, headquarters);
  }
  const continentIds = new Set([
    ...[...requiredAtlasLocations.values()].map(location => location.continentId).filter(Boolean),
    ...activeAtlasFactions.flatMap(faction => {
      const headquarters = atlasByLocationId.get(faction.headquartersLocationId);
      return headquarters?.continentId ? [headquarters.continentId] : [];
    }),
  ]);

  // 全大陆铺满：把该 stage 所属大陆的全部 atlas 地点(各自真实坐标)注入世界地图，
  // 而不止 visibleLocationIds，否则世界地图只剩一两个点、其余共坐标，看起来像空的。
  for (const atlasLocation of atlasByLocationId.values()) {
    if (atlasLocation.continentId && continentIds.has(atlasLocation.continentId)) {
      requiredAtlasLocations.set(atlasLocation.id, atlasLocation);
    }
  }

  mod.world.map = {
    atlasId: atlas.atlas.id,
    locked: true,
    mapConfig: clone(atlas.atlas.mapConfig),
    backgroundImage: 'shared-atlas/source-maps/liuchao-world.jpg',
  };
  mod.world.continents = Array.from(continentIds)
    .map(id => atlasByContinentId.get(id))
    .filter(Boolean)
    .map(continent => buildContinent(continent, mod));

  const locationsById = new Map((mod.canon?.locations || []).map(location => [location.id, normalizeLocation(location, undefined)]));
  for (const [localId, atlasId] of Object.entries(binding.locationBindings || {})) {
    const local = locationsById.get(localId);
    const atlasLocation = atlasByLocationId.get(atlasId);
    if (local && atlasLocation) locationsById.set(localId, normalizeLocation(local, atlasLocation));
  }
  for (const atlasLocation of requiredAtlasLocations.values()) {
    if (![...locationsById.values()].some(location => location.name === atlasLocation.name)) {
      locationsById.set(atlasLocation.id, normalizeLocation({
        id: atlasLocation.id,
        name: atlasLocation.name,
      }, atlasLocation));
    }
  }
  mod.canon = mod.canon || {};
  mod.canon.locations = [...locationsById.values()];

  const factionsById = new Map((mod.canon?.factions || []).map(faction => [faction.id, faction]));
  for (const [localId, atlasId] of Object.entries(binding.factionBindings || {})) {
    const local = factionsById.get(localId);
    const atlasFaction = atlasByFactionId.get(atlasId);
    if (local && atlasFaction) factionsById.set(localId, normalizeFaction(local, atlasFaction));
  }
  for (const atlasFaction of activeAtlasFactions) {
    if (![...factionsById.values()].some(faction => faction.name === atlasFaction.name)) {
      factionsById.set(atlasFaction.id, normalizeFaction({
        id: atlasFaction.id,
        name: atlasFaction.name,
      }, atlasFaction));
    }
  }
  const firstLocationId = mod.canon.locations[0]?.id;
  for (const faction of factionsById.values()) {
    if (faction.headquartersLocationId && !locationsById.has(faction.headquartersLocationId) && firstLocationId) {
      faction.headquartersLocationId = firstLocationId;
    }
  }
  mod.canon.factions = [...factionsById.values()];

  mod.world.specialRules = Array.from(new Set([
    ...(mod.world.specialRules || []),
    '使用六朝共享正典地图，禁止随机生成势力或地点覆盖已导入内容',
  ]));

  return { mod, changed: true };
}

async function copyToNas(localPath) {
  const relative = localPath.slice(generatedRoot.length + 1);
  const target = join(nasRoot, relative);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(localPath, target);
}

const books = ['qingyu', 'yunlong', 'yange'];
let changed = 0;
for (const book of books) {
  const stageInfo = localStageFiles(book);
  if (!stageInfo.dir) continue;
  const files = (await readdir(stageInfo.dir)).filter(name => name.endsWith('.json')).sort();
  for (const name of files) {
    const path = join(stageInfo.dir, name);
    const original = JSON.parse(await readFile(path, 'utf8'));
    const result = applyAtlas(original);
    if (!result.changed) {
      console.log(`SKIP ${name}: ${result.reason}`);
      continue;
    }
    await writeFile(path, JSON.stringify(result.mod, null, 2));
    await copyToNas(path);
    changed += 1;
    console.log(`UPDATED ${path}`);
  }
}

console.log(`Applied shared atlas to ${changed} scenario mods.`);
