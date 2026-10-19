/**
 * 错误码总表（代码侧）。权威说明在 docs/ERROR-CODES.md（含常见原因、排查办法），两边由 tests/errorCodeGuard.test.mjs 互相校验。
 * 格式 LCQ-<CFG|NUM|FA|SAV|NET|PCK|UI|SYS>-三位序号；码一经发出不复用、不改义，作废的码挪进 RETIRED_CODES 并在文档“已作废”一节登记。
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

export const ERROR_CODES = {
  [UNREGISTERED_CODE]: spec('warn', 'diagnostics', '未登记'),
  'LCQ-SYS-001': spec('warn', 'diagnostics', '日志持久化降级：IndexedDB 不可用，改用 localStorage 小缓存'),

  'LCQ-CFG-001': spec('info', 'runtimeTuning', 'tuning.json 不存在（HTTP 404），使用打包内默认值'),
  'LCQ-CFG-002': spec('warn', 'runtimeTuning', 'tuning.json 请求失败（网络错误），使用打包内默认值'),
  'LCQ-CFG-003': spec('warn', 'runtimeTuning', 'tuning.json 请求超时，使用打包内默认值'),
  'LCQ-CFG-004': spec('error', 'runtimeTuning', 'tuning.json 不是合法 JSON，整份未应用'),
  'LCQ-CFG-005': spec('error', 'runtimeTuning', 'tuning.json 校验未通过，整份拒绝'),
  'LCQ-CFG-006': spec('warn', 'runtimeTuning', 'tuning.json 返回了非 404 的错误状态，使用打包内默认值'),

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

  'LCQ-PCK-001': spec('error', 'scenarioMods', '剧情模组库内容无效（mods 不是数组），按空库处理'),
  'LCQ-PCK-002': spec('warn', 'scenarioMods', '剧情模组文件不是有效 JSON'),
  'LCQ-PCK-003': spec('warn', 'scenarioMods', '剧情模组校验未通过'),

  'LCQ-UI-001': spec('error', 'window', '页面未捕获异常（window error）'),
  'LCQ-UI-002': spec('error', 'window', '未处理的 Promise 拒绝（unhandledrejection）'),
  'LCQ-UI-003': spec('warn', 'diagnostics', '导出日志失败'),
  'LCQ-UI-004': spec('error', 'vue', 'Vue 组件未捕获异常（app.config.errorHandler）', true),
  'LCQ-UI-005': spec('error', 'startup', '启动阶段失败，已显示兜底界面'),
  'LCQ-UI-006': spec('warn', 'diagnostics', '导出反馈包失败'),
} as const satisfies Record<string, CodeSpec>;

export type ErrorCode = keyof typeof ERROR_CODES;
/** 作废的码：不再发出，也不得被新码复用。 */
export const RETIRED_CODES: readonly string[] = [];

export const CODE_PATTERN = /^LCQ-(CFG|NUM|FA|SAV|NET|PCK|UI|SYS)-\d{3}$/;
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
};

/** AiRequestTimeoutError 的 phase → 错误码。 */
export const NET_TIMEOUT_CODES = { first_byte: 'LCQ-NET-001', total: 'LCQ-NET-002', idle: 'LCQ-NET-003' } as const;
