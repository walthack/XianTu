import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { compileScript, compileTemplate, parse } from '@vue/compiler-sfc';

const root = process.cwd();
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('single-player shell removes every public account and travel route', () => {
  const router = read('src/router/index.ts');
  for (const route of ['/login', '/account', '/workshop', "path: 'travel'"]) {
    assert.doesNotMatch(router, new RegExp(route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.doesNotMatch(router, /LoginView|AccountCenter|WorkshopView|OnlineTravelPanel/);
  assert.match(router, /path:\s*'\/:pathMatch\(\.\*\)\*'/);
});

test('new sessions are single-player and legacy online profiles stay read-only', () => {
  const modeSelection = read('src/views/ModeSelection.vue');
  const app = read('src/App.vue');
  const characters = read('src/components/character-creation/CharacterManagement.vue');

  assert.match(modeSelection, /emit\('start-creation', 'single'\)/);
  assert.doesNotMatch(modeSelection, /联机共修|verifyStoredToken|backendReady|go-to-login/);
  assert.doesNotMatch(app, /creationStore\.setMode|startCloudCreation/);
  assert.match(app, /mode:\s*'单机' as const/);
  assert.match(app, /const slotKey = '存档1'/);
  assert.doesNotMatch(app, /heartbeatPresence|endTravelBeacon|openWorkshop|openAccountCenter/);

  assert.match(characters, /旧联机角色已只读保留/);
  assert.match(characters, /profile\?\.模式 === '联机'/);
  assert.match(characters, /if \(profile\?\.模式 === '联机'\) continue/);
  assert.match(characters, /selectedCharacter\.value\.模式 !== '单机'/);
  assert.doesNotMatch(characters, /verifyStoredToken|isBackendConfigured|router\.push\('\/login'\)/);
});

test('character creation has one local session mode while explicit cloud material sync remains', () => {
  const view = read('src/views/CharacterCreation.vue');
  const store = read('src/stores/characterCreationStore.ts');
  const preview = read('src/components/character-creation/Step7_Preview.vue');

  assert.match(view, /mode:\s*'单机' as const/);
  assert.match(view, /<CloudDataSync/);
  assert.doesNotMatch(view, /联机模式|RedemptionCodeModal|verifyStoredToken|executeCloudAiGeneration|isLocalCreation/);

  assert.match(store, /async function fetchAllCloudData\(\)/);
  assert.match(store, /fetchWorlds\(\)[\s\S]*fetchTalentTiers\(\)[\s\S]*fetchOrigins\(\)/);
  assert.doesNotMatch(store, /startCloudCreation|toggleLocalCreation|currentMode:\s*'single'\s*\|\s*'cloud'|联机模式 token/);
  assert.doesNotMatch(preview, /isLocalCreation|联机模式下/);
});

test('gameplay surfaces no longer expose travel state or network side effects', () => {
  const sidebar = read('src/components/dashboard/LeftSidebar.vue');
  const worldMap = read('src/components/dashboard/WorldMapRoute.vue');
  const mainPanel = read('src/components/dashboard/MainGamePanel.vue');
  const bidirectional = read('src/utils/AIBidirectionalSystem.ts');
  const main = read('src/main.ts');

  assert.doesNotMatch(sidebar, /\/game\/travel|handleOnlinePlay|isOnlineMode|仙官后台/);
  assert.doesNotMatch(worldMap, /OnlineTravelMapPanel|isOnlineTraveling|is-online/);
  assert.doesNotMatch(mainPanel, /isOnlineTraveling|travelingTooltip|穿越中/);
  assert.doesNotMatch(main, /flushPendingTravelNotes|onlineLogQueue/);
  assert.doesNotMatch(bidirectional, /@\/services\/onlineLogQueue|tryPostTravelNoteWithQueue/);
  assert.match(bidirectional, /单机版忽略旧 prompt 或旧存档残留的联机日志命令/);

  assert.equal(fs.existsSync(path.join(root, 'src/utils/cloudDataSync.ts')), true);
});

test('retired online leaves and prompt injection are absent while compatibility storage remains', () => {
  const retiredFiles = [
    'src/views/LoginView.vue',
    'src/views/AccountCenter.vue',
    'src/views/WorkshopView.vue',
    'src/components/dashboard/OnlineTravelPanel.vue',
    'src/components/dashboard/OnlineTravelMapPanel.vue',
    'src/services/onlineTravel.ts',
    'src/services/presence.ts',
    'src/services/onlineLogQueue.ts',
    'src/services/online/travelNoteQueue.ts',
    'src/services/workshop.ts',
    'src/services/api/onlineTravel.ts',
    'src/services/api/presence.ts',
    'src/services/api/workshop.ts',
  ];
  for (const relative of retiredFiles) {
    assert.equal(fs.existsSync(path.join(root, relative)), false, `${relative} should stay deleted`);
  }

  const defaults = read('src/services/prompts/defaultPrompts.ts');
  const assembler = read('src/utils/prompts/promptAssembler.ts');
  const bidirectional = read('src/utils/AIBidirectionalSystem.ts');
  const gameState = read('src/stores/gameStateStore.ts');
  const apiIndex = read('src/services/api/index.ts');

  assert.doesNotMatch(defaults, /onlineModeRules|onlineTravelContext|onlineWorldSync|onlineServerLogCommand|category: 'online'/);
  assert.doesNotMatch(assembler, /onlineModeRules|onlineTravelContext|onlineWorldSync|onlineServerLogCommand|isTraveling/);
  assert.doesNotMatch(bidirectional, /联机穿越 - 入侵者身份|离线玩家代理|travelStatusPrompt|onlineSessionId/);
  assert.match(bidirectional, /单机版忽略旧 prompt 或旧存档残留的联机日志命令/);
  assert.match(gameState, /this\.onlineState = buildSinglePlayerRuntimeState\(\)/);
  assert.doesNotMatch(apiIndex, /onlineTravel|presence|workshop/);

  assert.equal(fs.existsSync(path.join(root, 'src/utils/indexedDBManager.ts')), true);
  assert.equal(fs.existsSync(path.join(root, 'src/utils/cloudDataSync.ts')), true);
  assert.equal(fs.existsSync(path.join(root, 'src/services/api/cloudData.ts')), true);
});

test('edited Vue single-player surfaces compile as SFCs', () => {
  const files = [
    'src/App.vue',
    'src/views/ModeSelection.vue',
    'src/components/character-creation/CharacterManagement.vue',
    'src/views/CharacterCreation.vue',
    'src/components/character-creation/Step1_WorldSelection.vue',
    'src/components/character-creation/Step2_TalentTierSelection.vue',
    'src/components/character-creation/Step3_OriginSelection.vue',
    'src/components/character-creation/Step4_SpiritRootSelection.vue',
    'src/components/character-creation/Step5_TalentSelection.vue',
    'src/components/character-creation/Step7_Preview.vue',
    'src/components/dashboard/LeftSidebar.vue',
    'src/components/dashboard/WorldMapRoute.vue',
    'src/components/dashboard/GameMapPanel.vue',
    'src/components/dashboard/MainGamePanel.vue',
    'src/components/dashboard/PromptManagementPanel.vue',
  ];

  for (const relative of files) {
    const source = read(relative);
    const { descriptor, errors } = parse(source, { filename: relative });
    assert.deepEqual(errors, [], `${relative} should parse`);
    if (descriptor.scriptSetup) compileScript(descriptor, { id: relative });
    if (descriptor.template) {
      const compiled = compileTemplate({
        id: relative,
        filename: relative,
        source: descriptor.template.content,
      });
      assert.deepEqual(compiled.errors, [], `${relative} template should compile`);
    }
  }
});
