/**
 * 错误码总表（代码侧）。权威说明在 docs/ERROR-CODES.md（含常见原因、排查办法），两边由 tests/errorCodeGuard.test.mjs 互相校验。
 * 格式 LCQ-<CFG|NUM|FA|SAV|NET|PCK|NAR|UI|SYS>-三位序号；码一经发出不复用、不改义，作废的码挪进 RETIRED_CODES 并在文档“已作废”一节登记。
 * FA 族与 freeAction 的 GATE_REASONS 一一对应（FA_GATE_CODES 的键类型是 GateReason，漏一个编译不过）。
 */
import type { GateReason } from '../scenarioMods/freeAction/facts';
import type { LogLevel } from './config';

export interface CodeSpec {
  level: LogLevel;
  module: string;
  meaning: string;
  /** 是否在玩家界面弹提示（还要过 diagnostics.toast 的开关与级别线）。 */
  toast: boolean;
}

const spec = (level: LogLevel, module: string, meaning: string, toast = false): CodeSpec => ({ level, module, meaning, toast });

/** 兜底码：没登记的码、console.error / console.warn 捕获、写日志时传错码，都落到这里。 */
export const UNREGISTERED_CODE = 'LCQ-SYS-000';

/**
 * 冻结文件里沿用 console.error/warn 的已知日志：consolePatch 捕获时按首个字符串前缀改记登记码，不再落 SYS-000。
 * 冻结文件不迁 console（tests/debugLogMigration 门禁），只在这里认领。
 */
export const CONSOLE_PREFIX_CODES: Readonly<Record<string, string>> = {
  '[AI双向系统] AI生成失败': 'LCQ-NET-016',
};

export const ERROR_CODES = {
  'LCQ-SAV-040': spec('warn', 'calendarMigration', '旧历法时间戳迁移失败'),
  'LCQ-SAV-039': spec('error', 'actionTime', '时间来源或回执冲突'),
  'LCQ-SAV-038': spec('warn', 'mapTravel', '跨国移动需要有效地图选择'),
  'LCQ-SAV-037': spec('warn', 'actionTime', '模型时间写入已拒绝'),
  'LCQ-SAV-036': spec('warn', 'actionTime', '模型数日超过配置上限，已截断'),
  'LCQ-SAV-035': spec('warn', 'actionTime', '动作耗时档位缺失或非法'),
  [UNREGISTERED_CODE]: spec('warn', 'diagnostics', '未登记'),
  'LCQ-SYS-001': spec('warn', 'diagnostics', '日志持久化降级：IndexedDB 不可用，改用 localStorage 小缓存'),
  'LCQ-SYS-002': spec('info', 'diagnostics', '持久日志轮转：按保留天数、条数或总大小删除了旧记录'),

  'LCQ-CFG-001': spec('info', 'runtimeTuning', 'tuning.json 不存在（HTTP 404），使用打包内默认值'),
  'LCQ-CFG-002': spec('warn', 'runtimeTuning', 'tuning.json 请求失败（网络错误），使用打包内默认值'),
  'LCQ-CFG-003': spec('warn', 'runtimeTuning', 'tuning.json 请求超时，使用打包内默认值'),
  'LCQ-CFG-004': spec('error', 'runtimeTuning', 'tuning.json 不是合法 JSON，整份未应用'),
  'LCQ-CFG-005': spec('error', 'runtimeTuning', 'tuning.json 校验未通过，整份拒绝'),
  'LCQ-CFG-006': spec('warn', 'runtimeTuning', 'tuning.json 返回了非 404 的错误状态，使用打包内默认值'),
  'LCQ-CFG-007': spec('warn', 'aiService', 'AI 服务配置读取失败，沿用默认配置'),

  'LCQ-NUM-001': spec('error', 'numbers', '数值配置对象无效'),
  'LCQ-NUM-002': spec('error', 'numbers', '数值配置含未知键'),
  'LCQ-NUM-003': spec('error', 'numbers', '数值配置类型无效'),
  'LCQ-NUM-004': spec('error', 'numbers', '数值配置范围无效'),
  'LCQ-NUM-005': spec('error', 'numbers', '目标修正配置无效'),
  'LCQ-NUM-006': spec('error', 'numbers', '数值体检未通过，合并已退回'),
  'LCQ-NUM-007': spec('error', 'numbers', '默认数值包缺段或字段表失败（冷启动）'),
  'LCQ-NUM-008': spec('error', 'numbers', '数值 registry 范围或类型无效'),
  'LCQ-NUM-009': spec('error', 'numbers', '挂伤规则配置项不存在'),

  'LCQ-FA-001': spec('info', 'freeAction', '闸门拒绝（not_present）：目标不在场'),
  'LCQ-FA-002': spec('info', 'freeAction', '闸门拒绝（scene_active）：身处场面交锋，顾不上这件事'),
  'LCQ-FA-003': spec('info', 'freeAction', '闸门拒绝（low_goodwill）：好感太低，对方不接受'),
  'LCQ-FA-004': spec('info', 'freeAction', '闸门拒绝（goodwill_below_min）：好感未到该动作的最低门槛'),
  'LCQ-FA-005': spec('info', 'freeAction', '闸门拒绝（no_item）：手边没有合用的物品'),
  'LCQ-FA-006': spec('info', 'freeAction', '闸门拒绝（item_mismatch）：物品对不上这个动作'),
  'LCQ-FA-007': spec('info', 'freeAction', '闸门拒绝（equipped_or_story）：物品已装备或为剧情物品，不能送出'),
  'LCQ-FA-008': spec('info', 'freeAction', '闸门拒绝（nothing_to_treat）：对方身上没有可治的伤病'),
  'LCQ-FA-009': spec('info', 'freeAction', '闸门拒绝（level_too_low）：对方功力高出一截，传功被婉拒'),
  'LCQ-FA-010': spec('warn', 'freeAction', '闸门拒绝（level_unknown）：对方功力级数不明，不敢传功'),
  'LCQ-FA-011': spec('info', 'freeAction', '闸门拒绝（no_resource）：玩家真气不足'),
  'LCQ-FA-012': spec('info', 'freeAction', '闸门拒绝（cooldown）：冷却中'),
  'LCQ-FA-013': spec('info', 'freeAction', '闸门拒绝（budget_full）：对方已受不住更多传功'),
  'LCQ-FA-014': spec('info', 'freeAction', '闸门拒绝（protected）：对方受保护，不容这样处置'),
  'LCQ-FA-015': spec('info', 'freeAction', '闸门拒绝（guard_up）：对方有防备，夺元需其昏迷、被制或重伤'),
  'LCQ-FA-016': spec('info', 'freeAction', '闸门拒绝（drain_empty）：对方灵气气血皆竭，无可夺之元'),
  'LCQ-FA-017': spec('info', 'freeAction', '闸门拒绝（drain_resisted）：对方功力深厚，夺不动'),
  'LCQ-FA-018': spec('info', 'freeAction', '闸门拒绝（hp_too_low）：玩家气血不足以施术'),
  'LCQ-FA-019': spec('info', 'freeAction', '闸门拒绝（drain_survivor）：夺元会致必须活着的角色死亡'),
  'LCQ-FA-020': spec('warn', 'freeAction', '闸门拒绝（target_unavailable）：票上的目标已不可用'),
  'LCQ-FA-021': spec('warn', 'freeAction', '闸门拒绝（item_unavailable）：票上的物品已不可用'),
  'LCQ-FA-022': spec('warn', 'freeAction', '闸门拒绝（state_refused）：结算写入被状态拒绝'),
  'LCQ-FA-023': spec('info', 'freeAction', '闸门拒绝（not_ready）：境界进度未到，自修无从推进'),
  'LCQ-FA-024': spec('info', 'freeAction', '闸门拒绝（dropped）：同目标被挤掉的第二张票未能落实'),
  'LCQ-FA-025': spec('info', 'freeAction', '闸门拒绝（unrecognized）：本地没有识别出可结算的动作'),
  'LCQ-FA-026': spec('info', 'freeAction', '闸门拒绝（realm_capped）：已到练功上限，无关可冲、修炼无进益'),

  'LCQ-SAV-001': spec('error', 'indexedDB', '存档库打开失败'),
  'LCQ-SAV-002': spec('error', 'indexedDB', '存档读取失败，已回落空数据或空值'),
  'LCQ-SAV-003': spec('error', 'indexedDB', '存档写入失败', true),
  'LCQ-SAV-004': spec('error', 'indexedDB', '存档删除或清空失败'),
  'LCQ-SAV-005': spec('error', 'indexedDB', '存档数据迁移失败'),
  'LCQ-SAV-006': spec('warn', 'indexedDB', '远程存档接口不可用，本次会话回退本机 IndexedDB'),
  'LCQ-SAV-007': spec('warn', 'indexedDB', '远程存档请求失败，回退本机 IndexedDB'),
  'LCQ-SAV-008': spec('warn', 'indexedDB', '合并远程与本机根数据失败，回退本机数据'),
  'LCQ-SAV-009': spec('warn', 'indexedDB', '存档库统计信息获取失败'),
  'LCQ-SAV-010': spec('warn', 'characterRag', '角色 RAG 的 IndexedDB 库初始化失败，该功能本次不可用'),
  'LCQ-SAV-011': spec('warn', 'indexedDB', '存档滚动备份写入失败，主存档写入不受影响'),
  'LCQ-SAV-012': spec('warn', 'indexedDB', '存档损坏或读取失败，已回退到滚动备份', true),
  'LCQ-SAV-013': spec('error', 'indexedDB', '存档损坏或读取失败，且没有可用的滚动备份', true),
  'LCQ-SAV-014': spec('warn', 'saveMigration', '存档版本高于当前游戏，已拒绝加载', true),
  'LCQ-SAV-015': spec('warn', 'saveValidation', '读档校验发现非致命问题（缺字段或类型不对），已照常加载'),
  'LCQ-SAV-016': spec('warn', 'saveValidation', '读档校验发现存档结构损坏，已回退到滚动备份', true),
  'LCQ-SAV-017': spec('warn', 'saveValidation', '读档校验发现存档结构损坏，且没有可用的滚动备份，已拒绝加载', true),
  'LCQ-SAV-018': spec('warn', 'feedbackPack', '反馈包读取当前存档失败，已不带存档导出'),
  'LCQ-SAV-019': spec('warn', 'strictInitializer', '开局无法对齐出生年：缺年龄或当前年'),
  'LCQ-SAV-020': spec('error', 'sceneModule', '场面战斗拍数超过上限仍未分出胜负'),
  'LCQ-SAV-021': spec('warn', 'sceneModule', '开战前存档失败，已照常开战（判负回档点可能缺失）'),
  'LCQ-SAV-022': spec('warn', 'sceneModule', '场面骰存档外游标读写 localStorage 失败，已退回真随机种子'),
  'LCQ-SAV-023': spec('warn', 'identityLedger', '身份账/收束档同步失败，本拍未入账（不阻断回合，下回合或读档重试）'),
  'LCQ-SAV-024': spec('warn', 'lineOutcomes', '国家线收束档拒写：线不在 story.lineOutcome.judgedLines（非判档线），或档位不在 story.lineOutcome.tiers，或已收束且 writeOnce 不覆盖'),
  'LCQ-SAV-025': spec('warn', 'itemProvenance', '道具来路去重没能按规则执行（判断出错时按原逻辑发放；改发的物品不在本关物品表时只跳过；读档回填失败）'),
  'LCQ-SAV-026': spec('warn', 'partyLedger', '在队账推导失败，本次按“不在队”处理（偏保守，倾向锁节点）'),
  'LCQ-SAV-027': spec('warn', 'progressDeadlines', '进度期限同步或锁存失败、锁存值非法、或现算与锁存冲突（以锁存为准）'),
  'LCQ-SAV-028': spec('warn', 'ledgerPrompt', '账本结论块生成失败，本轮不注入；或持有未登记身份，已跳过'),
  'LCQ-SAV-029': spec('warn', 'lineUnlock', '整线解锁判定读数异常（境界读不出、缺配置或判定出错时按锁住处理；期限 id 不在规则表时按通过；说法判定出错退回王哲版）'),
  'LCQ-SAV-030': spec('warn', 'loadRepairs', '读档迁移旧档练功上限（canon / canon+1 → none）失败，本次照常加载，下次读档重试'),
  'LCQ-SAV-031': spec('warn', 'characterStore', '「上次对话」回合备份不属于当前存档：拒绝回滚，或读档/新开局时清理旧备份失败'),
  'LCQ-SAV-032': spec('warn', 'randomEncounter', '随机遇敌回合检查失败，本回合不检，不影响剧情'),
  'LCQ-SAV-033': spec('warn', 'randomEncounter', '随机遇敌敌池或地点条目无效，已跳过该条'),
  'LCQ-SAV-034': spec('warn', 'randomContract', '随机遇敌合同实例化失败，本次不开战，遇敌已作废'),
  'LCQ-SAV-041': spec('error', 'aiBidirectional', '单条模型指令执行失败，已记入变更明细（是否整回合回滚看指令应用模式）'),
  'LCQ-SAV-042': spec('error', 'aiBidirectional', '回合处理模型响应（执行指令、提交事务）阶段抛错'),
  'LCQ-SAV-043': spec('warn', 'scenarioMods', '剧本事件声望或共历好感结算失败，本拍不发放（不阻断回合）'),
  'LCQ-SAV-044': spec('warn', 'scenarioMods', '剧本运行时账目同步失败（相识账本、关系姿态、正典 registry 对齐及其依赖加载），不阻断回合'),
  'LCQ-SAV-045': spec('warn', 'aiBidirectional', '进度审计、事件对账等辅助环节失败或跳过（含读取审计记录、读取指令应用模式），主事务继续'),
  'LCQ-SAV-046': spec('warn', 'mainGamePanel', '发送前「上次对话」备份失败，本回合照常发送'),
  'LCQ-SAV-047': spec('warn', 'savePanel', '导出存档时迁移到新结构失败，已导出原始存档数据'),
  'LCQ-SAV-048': spec('error', 'savePanel', '导出存档或角色失败'),
  'LCQ-SAV-049': spec('warn', 'inventoryPanel', '背包面板操作失败：装备切换失败，或货币字段规范化失败（沿用原数据）'),
  'LCQ-SAV-050': spec('warn', 'sceneModule', '随机遇敌难度加级读取失败，按不加级定级'),
  'LCQ-SAV-051': spec('warn', 'memorySettings', '记忆配置（memory-settings）读取失败，使用默认值'),
  'LCQ-SAV-052': spec('warn', 'aiBidirectional', '回合附属维护失败（世界事件调度、宗门自动初始化、后台记忆调度、长期检索索引），不影响回合'),
  'LCQ-SAV-053': spec('info', 'beatProgress', '节拍结算记录（beat.resolve）：本回合输入方式、命中动作、停滞回合、关是否已就绪'),
  'LCQ-SAV-054': spec('info', 'beatProgress', '节拍手打未命中（beat.resolve miss）：不推进，已弹提示列出本拍可做的动作'),
  'LCQ-SAV-055': spec('warn', 'sceneModule', '战斗拍缺败局分支，判负结束游戏'),
  'LCQ-SAV-056': spec('info', 'sceneModule', '战斗统一写回（combat.writeback）'),
  'LCQ-SAV-057': spec('info', 'beatProgress', '任务日志缺目标文案：作者没写 quest.objective，日志回落到拍自带 objective'),
  'LCQ-SAV-058': spec('info', 'beatProgress', '任务引导：本拍空转满回合数，作者写的 NPC 主动来找（approach）已触发'),
  'LCQ-SAV-059': spec('error', 'memorySettings', '记忆中心「最近短期记忆换成摘要」写回存档失败'),
  'LCQ-SAV-060': spec('warn', 'loadRepairs', '读档迁移叙事正文到本地全文副本写入失败，该条保留原文、不打标记，下次读档重试'),
  'LCQ-SAV-061': spec('warn', 'aiBidirectional', '新回合叙事正文写本地全文副本失败，存档照常只留概要，回看该回合退回概要'),
  'LCQ-SAV-062': spec('info', 'beatProgress', '任务模式拍子判定小请求（beat.judge）：关键拍、结果、实际输入／输出 token 与耗时'),
  'LCQ-SAV-063': spec('info', 'timelineInserts', '读档或逐回合对账时静默补拨已过了的时间线插入事件年数（不重播过场）'),
  'LCQ-SAV-064': spec('info', 'loadRepairs', '读档修回旧版切关时往后挪了的主角出生年（一次性）'),

  'LCQ-NET-001': spec('error', 'aiService', 'AI 请求等待首个响应超时（first_byte）'),
  'LCQ-NET-002': spec('error', 'aiService', 'AI 请求总耗时超时（total）'),
  'LCQ-NET-003': spec('error', 'aiService', 'AI 正文流空闲超时（idle）'),
  'LCQ-NET-004': spec('warn', 'aiService', 'AI 请求收到 HTTP 错误响应'),
  'LCQ-NET-005': spec('warn', 'aiService', 'AI 请求失败（网络或传输层错误）'),
  'LCQ-NET-006': spec('warn', 'aiService', 'AI 流式分片解析失败，已跳过该分片'),
  'LCQ-NET-007': spec('warn', 'userCloudStorage', '后端云存储请求失败，回退本地缓存'),
  'LCQ-NET-008': spec('warn', 'aiService', 'AI 请求失败，退避等待后自动重试'),
  'LCQ-NET-009': spec('warn', 'aiService', 'AI 请求自动重试未能成功，已转为玩家可读提示'),
  'LCQ-NET-010': spec('warn', 'turnTelemetry', '回合总耗时超过阈值（perf.turnWarnMs）'),
  'LCQ-NET-011': spec('warn', 'turnTelemetry', '模型调用耗时超过阈值（perf.modelWarnMs）'),
  'LCQ-NET-012': spec('warn', 'aiService', 'AI 请求被内容审核拦截'),
  'LCQ-NET-013': spec('warn', 'aiService', '思考耗尽输出长度'),
  'LCQ-NET-014': spec('error', 'aiBidirectional', '回合正文生成失败，未本地结算'),
  'LCQ-NET-016': spec('error', 'aiBidirectional', 'AI双向系统生成失败'),
  'LCQ-NET-017': spec('error', 'aiBidirectional', '回合正文生成失败，已用本地安全正文结算'),
  'LCQ-NET-015': spec('warn', 'aiService', 'AI 接口不支持流式传输，已自动降级为非流式请求'),
  'LCQ-NET-018': spec('warn', 'aiService', '审核拦截后以降级上下文重发'),
  'LCQ-NET-019': spec('warn', 'aiService', '200 但正文为空（疑似输出阶段审核）'),
  'LCQ-NET-020': spec('warn', 'consistencyBackground', '双模型后端一致性结果已丢弃或降级（不提示玩家）'),
  'LCQ-NET-021': spec('warn', 'beatProgress', '任务模式拍子判定小请求（beat_judge）单次超时，已中止（按 beatJudge.timeoutRetries 重发或停下保留输入）'),

  'LCQ-PCK-001': spec('error', 'scenarioMods', '剧情模组库内容无效（mods 不是数组），按空库处理'),
  'LCQ-PCK-002': spec('warn', 'scenarioMods', '剧情模组文件不是有效 JSON'),
  'LCQ-PCK-003': spec('warn', 'scenarioMods', '剧情模组校验未通过'),
  'LCQ-PCK-004': spec('warn', 'scenarioMods', '固定结局的来路分支句缺失，本次只显示通用正文'),
  'LCQ-PCK-005': spec('warn', 'scenarioMods', '线入口／当前线卡文案键缺失，本次用兜底或不出该句'),
  'LCQ-PCK-006': spec('warn', 'scenarioMods', '创角链接指定的剧本模组不存在（?mod=），留在第 1 步正常创角'),

  'LCQ-NAR-001': spec('info', 'narrativeSource', '叙事来源：模型生成了一段玩家可见正文（记来源与全文）'),
  'LCQ-NAR-002': spec('warn', 'narrativeSource', '叙事正文中文里夹拉丁单词（只记录，不改写正文）'),
  'LCQ-NAR-003': spec('warn', 'narrativeSource', '叙事正文提前写出主角尚不自知的设定或相关功法词（只记录，不改写正文）'),
  'LCQ-NAR-004': spec('warn', 'mainGamePanel', '回合 AI 响应结构校验未通过（随后自动重试或保留输入）'),
  'LCQ-NAR-005': spec('warn', 'aiBidirectional', '回合模型响应解析失败，转入容错提取'),
  'LCQ-NAR-006': spec('warn', 'aiBidirectional', '分步生成第 2 步（指令）单次失败，重试或按空指令继续'),
  'LCQ-NAR-007': spec('warn', 'aiBidirectional', '开局消息解析失败，转入容错提取'),
  'LCQ-NAR-008': spec('warn', 'aiBidirectional', '文本优化失败，沿用原文'),
  'LCQ-NAR-009': spec('warn', 'promptLayers', '私密层因角色现算年龄不满 18 未开'),
  'LCQ-NAR-010': spec('info', 'characterResolver', '角色总表缺出生年，私密门按已满 18 处理'),

  'LCQ-UI-001': spec('error', 'window', '页面未捕获异常（window error）'),
  'LCQ-UI-002': spec('error', 'window', '未处理的 Promise 拒绝（unhandledrejection）'),
  'LCQ-UI-003': spec('warn', 'diagnostics', '导出日志失败'),
  'LCQ-UI-004': spec('error', 'vue', 'Vue 组件未捕获异常（app.config.errorHandler）', true),
  'LCQ-UI-005': spec('error', 'startup', '启动阶段失败，已显示兜底界面'),
  'LCQ-UI-006': spec('warn', 'diagnostics', '导出反馈包失败'),
  'LCQ-UI-007': spec('warn', 'vue', '开启黑魔海大祭失败'),
  'LCQ-UI-008': spec('error', 'mainGamePanel', '主游戏面板处理回合失败（总兜底，已提示请求失败）'),
  'LCQ-UI-009': spec('warn', 'gameMapPanel', '地图数据加载失败（单个大陆、势力或地点已跳过，或整份加载失败）'),
  'LCQ-UI-010': spec('warn', 'gameMapManager', '地图渲染初始化降级：Pixi 初始化失败改用保守配置，或世界地图背景加载失败'),
} as const satisfies Record<string, CodeSpec>;

export type ErrorCode = keyof typeof ERROR_CODES;
/** 作废的码：不再发出，也不得被新码复用。 */
export const RETIRED_CODES: readonly string[] = [];

export const CODE_PATTERN = /^LCQ-(CFG|NUM|FA|SAV|NET|PCK|NAR|UI|SYS)-\d{3}$/;
export const isRegisteredCode = (code: string): code is ErrorCode => Object.prototype.hasOwnProperty.call(ERROR_CODES, code);
export const specOf = (code: string): CodeSpec => ERROR_CODES[isRegisteredCode(code) ? code : UNREGISTERED_CODE];

/** 自由行动闸门原因 → 错误码；键类型是 GateReason，GATE_REASONS 新增原因而这里漏登记会编译失败。 */
export const FA_GATE_CODES: Record<GateReason, string> = {
  not_present: 'LCQ-FA-001', scene_active: 'LCQ-FA-002', low_goodwill: 'LCQ-FA-003', goodwill_below_min: 'LCQ-FA-004',
  no_item: 'LCQ-FA-005', item_mismatch: 'LCQ-FA-006', equipped_or_story: 'LCQ-FA-007', nothing_to_treat: 'LCQ-FA-008',
  level_too_low: 'LCQ-FA-009', level_unknown: 'LCQ-FA-010', no_resource: 'LCQ-FA-011', cooldown: 'LCQ-FA-012',
  budget_full: 'LCQ-FA-013', protected: 'LCQ-FA-014', guard_up: 'LCQ-FA-015', drain_empty: 'LCQ-FA-016',
  drain_resisted: 'LCQ-FA-017', hp_too_low: 'LCQ-FA-018', drain_survivor: 'LCQ-FA-019', target_unavailable: 'LCQ-FA-020',
  item_unavailable: 'LCQ-FA-021', state_refused: 'LCQ-FA-022', not_ready: 'LCQ-FA-023', dropped: 'LCQ-FA-024', unrecognized: 'LCQ-FA-025',
  realm_capped: 'LCQ-FA-026',
};

/** AiRequestTimeoutError 的 phase → 错误码。 */
export const NET_TIMEOUT_CODES = { first_byte: 'LCQ-NET-001', total: 'LCQ-NET-002', idle: 'LCQ-NET-003' } as const;
