/**
 * 调试日志大类总表（debugLog 的大类 id）。人读版 docs/DEBUG-LOG.md，两边由 tests/debugLog.test.mjs 互相校验。
 * - 增删大类须用户拍板；新功能挂到所在目录对应的大类，跨目录以入口文件为准，不再单开功能开关。
 * - paths 相对 src/：以 / 结尾的是目录前缀，其余是文件模式（* 只匹配同一层的任意字符）。
 * - categoryOfFile 取最长前缀：模式里非通配字符最多的那条胜出（目录里个别文件另归别类时，单独写出该文件即可）。
 * - 大类只管控制台调试输出；错误码 / 持久日志（logEvent、logError）不受影响，始终开启。
 */

export interface DebugCategorySpec { id: string; label: string; paths: readonly string[] }

const SM = 'modules/scenarioMods/';
const sm = (...names: string[]): string[] => names.map(name => SM + name);
const at = (dir: string, ...names: string[]): string[] => names.map(name => dir + name);

export const DEBUG_CATEGORIES = [
  {
    id: 'identity', label: '身份账与玩家账本',
    paths: [...sm('identityLedger.ts', 'ledgerConditions.ts', 'lineOutcomes.ts', 'playerIdentity.ts', 'playerLedgerRules.ts', 'acquaintanceLedger.ts', 'reputationLedger.ts', 'itemProvenance.ts', 'partyLedger.ts', 'progressDeadlines.ts', 'ledgerPrompt.ts', 'ledger/')],
  },
  {
    id: 'story', label: '剧情推进',
    paths: [
      ...sm('runtime.ts', 'questLine*.ts', 'mainQuestAxis.ts', 'secondaryLines.ts', 'characterQuests.ts', 'fixedQuestObjectives.ts', 'branchDecision.ts', 'milestoneRewards.ts',
        'phaseContinue.ts', 'settledStepScene.ts', 'keyBeatCards.ts', 'endingPresentation.ts', 'fixedEndingNarratives.ts', 'eventNarrativeView.ts', 'canonRail*.ts', 'divergence*.ts',
        'storyTrades.ts', 'shiweimoRescue.ts', '*Playtest*.ts', 'baihuGambleRefusal.ts', 'effectTags.ts', 'r2AcceptanceFixtures.ts', 'playtestNarrativeScope.ts', 'lineUnlock.ts', 'secondaryLineEntry.ts', 'sidebarLineEntries.ts', 'lineCompass.ts'),
      'assets/endings/',
    ],
  },
  {
    id: 'narrative', label: '叙事与提示词',
    paths: [
      ...sm('storyContext.ts', 'undisclosedSelfFacts.ts', 'legacy*.ts', 'narrative*.ts', '*Guard.ts', 'voiceCards.ts', 'qingyuOpening*.ts', 'qingyuOpportunityNarrative.ts', 'playerActionPresentation.ts'),
      'utils/prompts/', 'services/prompts/', 'services/defaultPrompts.ts', 'utils/narrative*.ts', 'utils/textSanitizer.ts', 'types/textRules.ts',
    ],
  },
  {
    id: 'freeAction', label: '自由行动',
    paths: [...sm('freeAction/', 'naturalIntentRouter.ts'), 'utils/actionGate.ts', 'utils/enhancedActionQueue.ts', 'stores/actionQueueStore.ts'],
  },
  {
    id: 'combat', label: '战斗与场面',
    paths: ['modules/sceneModule/', 'utils/judgement*.ts', 'utils/diceRoller.ts', 'utils/narratedDamage.ts', 'utils/playerVitalGuard.ts', 'dev/combatTrial/', ...sm('randomEncounter.ts')],
  },
  {
    id: 'npc', label: '人物与关系',
    paths: [
      ...sm('actor*.ts', 'affinity*.ts', 'characterLevels.ts', 'characterResolver.ts', 'characterStats*.ts', 'relation*.ts', 'stanceProfiles.ts', 'npc*.ts', 'presence.ts', 'intimacyProfiles.ts', 'deferredReconcileMerge.ts'),
      'systems/', 'data/specialNpcs.ts',
    ],
  },
  {
    id: 'growth', label: '养成与物品',
    paths: [
      ...sm('levelProgression.ts', 'inventoryTransactions.ts', 'fixedInventoryContracts.ts', 'itemGrades.ts', 'shopStock.ts', 'locationLoot.ts', 'seededRng.ts'),
      ...at('utils/', 'attributeCalculation.ts', 'cultivationSpeedCalculator.ts', 'realmUtils.ts', 'lifespanCalculator.ts', 'statusEffectManager.ts', 'masteredSkillsCalculator.ts',
        'equipmentBonusApplier.ts', 'craftingSystem.ts', 'currencySystem.ts', 'narratedInventory.ts', 'sixSiManager.ts'),
      'data/',
    ],
  },
  {
    id: 'world', label: '世界与地图',
    paths: [...sm('travel/', 'mapEntries.ts', 'heimohaiFestival.ts', 'locationTypes.ts', '*openWorldSlice.ts', '*OpenWorldSlice.ts'), 'utils/gameMapManager.ts', 'utils/coordinateConverter.ts', 'utils/sect*.ts', 'utils/worldGeneration/',
      'utils/generators/', 'utils/time.ts', 'utils/calendarMigration.ts', 'utils/timeCommandGuard.ts', ...sm('actionTime.ts'), 'types/gameMap.ts', 'types/location.ts', 'types/worldMap.ts'],
  },
  {
    id: 'init', label: '开局与角色创建',
    paths: [
      'services/initialization/', 'services/characterInitialization.ts', 'services/offlineInitialization.ts', ...sm('strictInitializer.ts', 'expandInitializer.ts', 'genericWorldEntry.ts', 'liuchaoEntry.ts'),
      'utils/initialGenerationPolicy.ts', 'components/character-creation/', 'views/CharacterCreation.vue', 'stores/characterCreationStore.ts',
    ],
  },
  {
    id: 'ai', label: '模型请求与响应解析',
    paths: [
      ...at('services/', 'ai*', 'request*', 'httpClient.ts', 'openAIEndpoint.ts', 'apiErrorMessage.ts', 'optionalReasoningParams.ts', 'moduleModelRuntime.ts', 'gameModelModules.ts',
        'modularTurnBackground.ts', 'qingyuTurnLongRequests.ts', 'requestLifecycleDiagnostics.ts', 'backgroundAudit*', 'progressAuditService.ts', 'eventReconcileService.ts',
        'narrativeResponseSalvage.ts', 'turnstile*'),
      ...sm('modularTurn.ts', 'backgroundAuditCore.ts'),
      ...at('utils/', 'AIBidirectionalSystem.ts', 'modelCommandPipeline.ts', 'repairCommandPipeline.ts', 'command*Validator.ts', 'processedAIResponseValidation.ts', 'jsonExtract.ts',
        'boundedAuxiliaryTask.ts', 'tavern*.ts', 'actionOptionsPovGuard.ts'),
      'services/security/', 'services/diagnosticTransport.ts', 'stores/apiManagementStore.ts', 'types/AIGameMaster.d.ts',
    ],
  },
  {
    id: 'memory', label: '记忆与检索',
    paths: [
      ...at('services/', 'characterRagService.ts', 'narrativeRagService.ts', 'vectorMemoryService.ts', 'embeddingService.ts'),
      'utils/memory*.ts', 'utils/backgroundMemory*.ts', 'utils/legacyForegroundRecall.ts', 'utils/regex.ts', 'types/memory.ts',
    ],
  },
  {
    id: 'save', label: '存档',
    paths: [
      ...at('utils/', 'indexedDBManager.ts', 'save*.ts', 'snapshotManager.ts', 'dataRepair.ts', 'dataValidation.ts', 'legacyOnlineSaveMigration.ts', 'isolatedPlaytestPersist.ts', 'lastConversationGuard.ts',
        'latestWriteQueue.ts', 'cloudDataSync.ts', 'dadBundle.ts', 'machineCode.ts'),
      'services/userCloudStorage.ts', 'services/api/', 'types/', ...sm('entitySave*.ts', 'loadRepairs.ts'), 'stores/characterStore.ts', 'stores/gameStateStore.ts',
      'components/dashboard/SavePanel.vue', 'components/character-creation/LegacySaveMigrationModal.vue',
    ],
  },
  {
    id: 'content', label: '内容包、模组与数值配置',
    paths: [
      'modules/contentPacks/', ...sm('manager.ts', 'validator.ts', 'analyzer.ts', 'builtins/', 'schema/', 'entityCatalog.ts', 'namedEntities.ts', 'canonGuard.ts'),
      'modules/sceneModule/numbers*.ts', 'modules/sceneModule/runtimeTuning.ts', 'utils/presetManager.ts',
      ...at('services/', 'promptConfig.ts', 'promptStorage.ts', 'backendConfig.ts'),
    ],
  },
  {
    id: 'ui', label: '界面',
    paths: [
      'components/', 'views/', 'App.vue', 'main.ts', 'env.d.ts', 'router/', 'i18n/', 'composables/', 'stores/uiStore.ts',
      ...at('utils/', 'panelBus.ts', 'toast.ts', 'fullscreen.ts', 'music*.ts', 'videoCache.ts', 'chatBus.ts', 'fatalFallback.ts', 'nsfw.ts', 'stateChangeFormatter.ts'),
      ...at('modules/diagnostics/', 'feedback.ts', 'export.ts', 'zip.ts', 'buildInfo.ts'),
    ],
  },
  {
    id: 'perf', label: '性能与遥测',
    paths: ['utils/turnTelemetry.ts', 'modules/diagnostics/', 'utils/consolePatch.ts', 'utils/debug.ts'],
  },
] as const satisfies readonly DebugCategorySpec[];

export type DebugCategory = typeof DEBUG_CATEGORIES[number]['id'];
export const DEBUG_CATEGORY_IDS: readonly DebugCategory[] = DEBUG_CATEGORIES.map(c => c.id);

const literalChars = (pattern: string): number => pattern.replace(/\*/g, '').length;
const escapeRe = (text: string): string => text.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
const patternRe = (pattern: string): RegExp => new RegExp(`^${escapeRe(pattern).replace(/\*/g, '[^/]*')}${pattern.endsWith('/') ? '' : '$'}`);

const MATCHERS = DEBUG_CATEGORIES.flatMap(c => c.paths.map(pattern => ({ id: c.id as DebugCategory, pattern, re: patternRe(pattern), weight: literalChars(pattern) })));

/** 把 'src/x/y.ts'、'./src/x\\y.ts'、'x/y.ts' 统一成相对 src/ 的正斜杠路径。 */
export const normalizeSrcPath = (file: string): string => file.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^src\//, '');

/** 命中该文件的全部模式（按权重从大到小）；守卫用它检查有没有并列最长。 */
export function categoryMatches(file: string): Array<{ id: DebugCategory; pattern: string; weight: number }> {
  const rel = normalizeSrcPath(file);
  return MATCHERS.filter(m => m.re.test(rel)).map(({ id, pattern, weight }) => ({ id, pattern, weight })).sort((a, b) => b.weight - a.weight);
}

/** 文件所属大类（最长前缀）；路径表没覆盖到时返回 null。 */
export function categoryOfFile(file: string): DebugCategory | null {
  return categoryMatches(file)[0]?.id ?? null;
}
