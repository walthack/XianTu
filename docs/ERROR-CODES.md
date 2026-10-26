# 错误码总表（LCQ-*）

诊断/错误码日志系统的权威说明。代码侧登记在 `src/modules/diagnostics/codes.ts`，两边由 `tests/errorCodeGuard.test.mjs` 互相校验：码、级别、模块、含义、是否进玩家提示必须一致，且每行都要有“常见原因”和“排查办法”。

## 规则

- 格式：`LCQ-<CFG|NUM|FA|SAV|NET|PCK|UI|SYS>-三位序号`。CFG 配置 / NUM 数值配置 / FA 自由行动 / SAV 存档与 IndexedDB / NET 网络与 AI 请求 / PCK 内容包与剧情模组 / UI 页面 / SYS 日志系统自身。
- 序号只增不复用：新增码取该族下一个未用序号；作废的码移到文末“已作废”，不再发出也不得被新码占用。
- **LCQ-FA 与 freeAction 的 `GATE_REASONS` 一一对应**：每个闸门原因一个码，含义栏里括号内是原因 id。新增闸门原因必须同时在 `codes.ts` 的 `FA_GATE_CODES` 与本表登记（漏了编译和守卫测试都会失败）。
- 兜底码 `LCQ-SYS-000`「未登记」：console.error / console.warn 捕获，以及调用方传了没登记的码，都落到这里。
- 级别列是码的默认级别；个别接入点会按场景调整（如后台 AI 请求超时降为 warn、tuning.json 404 级别取配置 `diagnostics.tuning404Level`）。
- 日志不记玩家原文、不记请求头/URL/正文/密钥：detail 经脱敏（`diagnostics.redactKeys / redactPatterns / textKeys / textChars`），textChars 默认 0。这是有意的，不要为了排查把原文加进 detail。
- 数值全部在 game-numbers（权威三分包 `mod-kit/numbers-*.json`，合并视图 `game-numbers.qingyu.json`）的 `diagnostics` 段（可经 tuning.json 热改，体检登记在 numbers.ts）；反馈包的存档脱敏配置在同文件 `feedback` 段（体检登记在 feedback.ts）。
- 新代码的 catch 必须含 logError/logEvent，或写 `// lcq-allow: 原因`；存量 catch 记在 `tests/errorCodeGuard.baseline.json`，只拦新增。

## 日志字段

`ts`、`level`、`code`、`module`、`sessionId`、`turnId`、`requestId?`、`msg`、`detail`（已脱敏）、`stack?`。落在独立 IndexedDB 库 `lcq-log`（环形，不碰存档库）；IndexedDB 不可用时降级 localStorage 小缓存。调试模式下页面左下角出现错误角标，点开可看最近条目并导出 JSON。

**反馈包**：设置页「高级设置 → 导出反馈包」与启动失败兜底界面（均非仅调试模式可见）可导出单个 zip（`lcq-feedback-<时间>.zip`，store 模式）：`manifest.json`、`version.json`（游戏版本/构建号/GIT_SHA/内容包版本）、`logs.json`、`model-config.json`（模型连接摘要，只记“是否填了密钥”，URL 去掉账号与查询串）；勾选“附带存档”才多一个 `save.json`（当前激活存档）。存档里的叙事原文是否脱敏由 `game-numbers` 的 `feedback.redactSaveNarrative` 决定（默认脱敏，范围 `feedback.narrativePaths`）；密钥无论如何都脱敏。

## 码表

| code | 级别 | 模块 | 含义 | 常见原因 | 排查办法 | 是否进玩家提示 |
|---|---|---|---|---|---|---|
| LCQ-CFG-001 | info | runtimeTuning | tuning.json 不存在（HTTP 404），使用打包内默认值 | 没有部署 tuning.json（绝大多数部署如此） | 正常，无需处理；要热改数值时在 index.html 同级放 tuning.json | 否 |
| LCQ-CFG-002 | warn | runtimeTuning | tuning.json 请求失败（网络错误），使用打包内默认值 | 网络不通、跨域或服务器断开 | 检查 tuning.json 地址能否在浏览器直接打开；本次已回落打包内默认值 | 否 |
| LCQ-CFG-003 | warn | runtimeTuning | tuning.json 请求超时，使用打包内默认值 | tuning.json 请求超过 tuning.timeoutMs | 检查网络与服务器响应；必要时在 game-numbers.qingyu.json 调大 tuning.timeoutMs | 否 |
| LCQ-CFG-004 | error | runtimeTuning | tuning.json 不是合法 JSON，整份未应用 | tuning.json 语法错误（多余逗号、缺引号、被服务器返回成 HTML） | 用 JSON 校验器检查文件；看 detail/msg 里的解析位置；整份未应用 | 否 |
| LCQ-CFG-005 | error | runtimeTuning | tuning.json 校验未通过，整份拒绝 | tuning.json 内容有未知键、类型不对或数值体检不过 | 看 detail.errors 逐条修；整份被拒，已合并的数值已退回 | 否 |
| LCQ-CFG-006 | warn | runtimeTuning | tuning.json 返回了非 404 的错误状态，使用打包内默认值 | 服务器对 tuning.json 返回 403/500 等非 404 状态 | 看 detail.status；检查静态服务器配置与权限 | 否 |
| LCQ-FA-001 | info | freeAction | 闸门拒绝（not_present）：目标不在场 | 目标人物不在当前在场名单（已离场、名字对不上、模型报错人） | 核对在场名单与票上的 targetId；见 detail.targetId | 否 |
| LCQ-FA-002 | info | freeAction | 闸门拒绝（scene_active）：身处场面交锋，顾不上这件事 | 场面（战斗/对峙）进行中，自由行动被挡 | 正常；场面结束后再做 | 否 |
| LCQ-FA-003 | info | freeAction | 闸门拒绝（low_goodwill）：好感太低，对方不接受 | 对方对玩家好感低于该动作允许的下限 | 正常的玩法拒绝；核对 freeAction 好感门槛配置 | 否 |
| LCQ-FA-004 | info | freeAction | 闸门拒绝（goodwill_below_min）：好感未到该动作的最低门槛 | 传功/合练要求的最低好感未到 | 正常；核对该变体的最低好感配置 | 否 |
| LCQ-FA-005 | info | freeAction | 闸门拒绝（no_item）：手边没有合用的物品 | 该动作需要物品而背包里没有合用物 | 核对 detail.itemId 与背包；正常的玩法拒绝 | 否 |
| LCQ-FA-006 | info | freeAction | 闸门拒绝（item_mismatch）：物品对不上这个动作 | 背包物品的效果与动作不符 | 核对物品效果标签（effect-tags）与变体要求 | 否 |
| LCQ-FA-007 | info | freeAction | 闸门拒绝（equipped_or_story）：物品已装备或为剧情物品，不能送出 | 物品是已装备物或剧情物品，不可送出 | 正常；剧情物品标记见物品目录 | 否 |
| LCQ-FA-008 | info | freeAction | 闸门拒绝（nothing_to_treat）：对方身上没有可治的伤病 | 对方身上没有可疗的伤病或状态 | 正常；核对对方状态 | 否 |
| LCQ-FA-009 | info | freeAction | 闸门拒绝（level_too_low）：对方功力高出一截，传功被婉拒 | 对方功力级数比玩家高出一截，传功被婉拒 | 正常；级数比较见 sceneModule levels 与 freeAction 级差配置 | 否 |
| LCQ-FA-010 | warn | freeAction | 闸门拒绝（level_unknown）：对方功力级数不明，不敢传功 | 对方功力级数缺失，无法比较，保守拒绝 | 给该人物补功力级数（character levels 数据）；见 detail.targetId | 否 |
| LCQ-FA-011 | info | freeAction | 闸门拒绝（no_resource）：玩家真气不足 | 玩家真气（灵气）不足传功消耗 | 正常；核对传功消耗配置 | 否 |
| LCQ-FA-012 | info | freeAction | 闸门拒绝（cooldown）：冷却中 | 传功冷却未满 | 正常；冷却回合数在 freeAction 配置 | 否 |
| LCQ-FA-013 | info | freeAction | 闸门拒绝（budget_full）：对方已受不住更多传功 | 对方短期内承受的传功量已满（预算耗尽） | 正常；核对 freeAction 传功预算配置 | 否 |
| LCQ-FA-014 | info | freeAction | 闸门拒绝（protected）：对方受保护，不容这样处置 | 对方被保护规则覆盖（必须活着等），不容这样处置 | 正常；保护规则见 freeAction/protect.ts 与裁定簿 | 否 |
| LCQ-FA-015 | info | freeAction | 闸门拒绝（guard_up）：对方有防备，夺元需其昏迷、被制或重伤 | 夺元需对方失去防备（昏迷、被制、重伤） | 正常；核对对方状态 | 否 |
| LCQ-FA-016 | info | freeAction | 闸门拒绝（drain_empty）：对方灵气气血皆竭，无可夺之元 | 对方灵气与气血都已吸空 | 正常；夺元口径见裁定簿 #234 | 否 |
| LCQ-FA-017 | info | freeAction | 闸门拒绝（drain_resisted）：对方功力深厚，夺不动 | 对方功力过深，夺元量算出为 0 | 正常；夺元公式与差值配置在 freeAction 配置的 drain 段 | 否 |
| LCQ-FA-018 | info | freeAction | 闸门拒绝（hp_too_low）：玩家气血不足以施术 | 玩家气血低于施术所需 | 正常；核对气血门槛配置 | 否 |
| LCQ-FA-019 | info | freeAction | 闸门拒绝（drain_survivor）：夺元会致必须活着的角色死亡 | 夺元会让必须活着的角色死亡（裁定簿 #235） | 正常；保护名单见 protect.ts | 否 |
| LCQ-FA-020 | warn | freeAction | 闸门拒绝（target_unavailable）：票上的目标已不可用 | 票校验阶段目标不在名单或无关系记录；模型报了不存在的人 | 看 detail.discard（target_not_present / target_no_record）；多为模型误报，已丢弃该票 | 否 |
| LCQ-FA-021 | warn | freeAction | 闸门拒绝（item_unavailable）：票上的物品已不可用 | 票上的 itemId 不在背包（模型编造物品 id） | 看 detail.discard=bad_item_id；多为模型误报，已丢弃该票 | 否 |
| LCQ-FA-022 | warn | freeAction | 闸门拒绝（state_refused）：结算写入被状态拒绝 | 结算写入时被状态机拒绝（状态已变、重复写入） | 看 detail.actionClass/variant；复现时检查结算前后存档状态，可能是并发回合 | 否 |
| LCQ-FA-023 | info | freeAction | 闸门拒绝（not_ready）：境界进度未到，自修无从推进 | 自修的境界进度试算无变化（时机未到或已满） | 正常；核对修炼进度配置 | 否 |
| LCQ-FA-024 | info | freeAction | 闸门拒绝（dropped）：同目标被挤掉的第二张票未能落实 | 同一目标/同一类被报了多张票，较轻的一张被挤掉 | 正常；每个目标每回合最多一张票，配置 ticket.maxPerTurn | 否 |
| LCQ-FA-025 | info | freeAction | 闸门拒绝（unrecognized）：本地没有识别出可结算的动作 | 玩家这句话本地没识别出可结算动作（识别降级或传功语义无票） | 正常；若频繁出现检查意图识别模型是否超时，见 LCQ-NET 码 | 否 |
| LCQ-NET-001 | error | aiService | AI 请求等待首个响应超时（first_byte） | 请求发出后迟迟没有首个响应字节（网络慢、服务端排队、API 地址错） | 看 requestId/turnId 对应的请求；检查 API 地址与网络；可手动重试 | 否 |
| LCQ-NET-002 | error | aiService | AI 请求总耗时超时（total） | 整次请求超过总耗时上限（含回合预算耗尽） | 看 detail.stage；检查模型响应速度或调大超时；后台任务超时降为 warn | 否 |
| LCQ-NET-003 | error | aiService | AI 正文流空闲超时（idle） | 流式正文开始后长时间没有新内容 | 多为服务端卡住或网络中断；手动重试，必要时换模型/代理 | 否 |
| LCQ-NET-004 | warn | aiService | AI 请求收到 HTTP 错误响应 | API 返回 4xx/5xx（密钥无效、限流、模型不存在、服务故障） | 看 detail.httpStatus；401/403 查密钥，429 限流，5xx 服务端故障 | 否 |
| LCQ-NET-005 | warn | aiService | AI 请求失败（网络或传输层错误） | 网络断开、DNS/证书失败、CORS 拦截或连接被重置 | 看 cause；检查网络与 API 地址、浏览器控制台的 CORS 报错 | 否 |
| LCQ-NET-006 | warn | aiService | AI 流式分片解析失败，已跳过该分片 | 流式某一分片不是合法 JSON，已跳过 | 偶发可忽略；频繁出现说明中转服务返回格式异常 | 否 |
| LCQ-NET-007 | warn | userCloudStorage | 后端云存储请求失败，回退本地缓存 | 后端云存储不可达或返回异常，已使用本地缓存（每会话只记一次） | 检查后端地址与登录状态；仅影响云同步 | 否 |
| LCQ-NET-008 | warn | aiService | AI 请求失败，退避等待后自动重试 | 请求收到 aiRetry.retryStatuses 内的 HTTP 状态（如 429/503）或网络错误，且重试次数未用完；detail 含 delayMs、source（backoff 指数退避 / retry-after 服务端要求）、status | 偶发正常；频繁出现说明服务商不稳或在限流，可调 game-numbers 的 aiRetry 段（退避、次数） | 否 |
| LCQ-NET-009 | warn | aiService | AI 请求自动重试未能成功，已转为玩家可读提示 | 可重试的失败（限流、5xx、网络）重试次数用完，或本回合剩余时间不够再等一轮（detail.why = retries_exhausted / turn_time_short）；玩家看到的是“已自动重试 N 次仍失败”类提示 | 看 detail.status 与同一请求的 LCQ-NET-004/005；限流就降频或换提供商；持续 5xx 查服务商状态 | 否 |
| LCQ-NET-010 | warn | turnTelemetry | 回合总耗时超过阈值（perf.turnWarnMs） | 一个回合从开始到结束的耗时（detail.turnMs）超过 game-numbers `perf.turnWarnMs`；常见于模型慢、重试、召回/辅助等待久；只记日志，不弹玩家提示、不改回合行为 | 看 detail.path / modelMs / retryCount / provider / model 判断慢在哪；对照同一回合的 LCQ-NET-004/005/008；诊断导出与反馈包里的 perf 统计可看 p50/p95 趋势；阈值可在 tuning.json 的 numbers.perf 热改 | 否 |
| LCQ-NET-011 | warn | turnTelemetry | 模型调用耗时超过阈值（perf.modelWarnMs） | 一次回合里模型从发请求到收完响应的耗时（detail.modelMs）超过 game-numbers `perf.modelWarnMs`；只记日志，不弹玩家提示、不改回合行为 | 看 detail.provider / model / retryCount / promptBytes；提示词过大或服务商限流/慢时出现，换更快的模型或服务商、缩小提示词；阈值可在 tuning.json 的 numbers.perf 热改 | 否 |
| LCQ-NUM-001 | error | numbers | 数值配置对象无效 | tuning.json numbers 段里某处应为对象却写成了别的类型 | 按消息里的路径修正为对象 | 否 |
| LCQ-NUM-002 | error | numbers | 数值配置含未知键 | numbers 段含 game-numbers.qingyu.json 里不存在的键（拼写错误或已删除的键） | 按消息里的路径核对键名；只能改已有键，不能新增 | 否 |
| LCQ-NUM-003 | error | numbers | 数值配置类型无效 | numbers 段某个值的类型与默认值不同（数字写成字符串等）或为非有限数 | 按消息里的路径改成与默认值相同类型 | 否 |
| LCQ-NUM-004 | error | numbers | 数值配置范围无效 | 等级差、胜率区间、训练进度、货币等数值超出允许范围 | 对照 game-numbers.qingyu.json 的默认值调整 | 否 |
| LCQ-NUM-005 | error | numbers | 目标修正配置无效 | goalModifiers 缺 default，或引用了不存在的权重表 / 缺布尔字段 | 补全 goalModifiers 的 default 与每项的 factorProfile、levelGap | 否 |
| LCQ-NUM-006 | error | numbers | 数值体检未通过，合并已退回 | 各模块登记的数值体检（freeAction、judgement、diagnostics 等）未通过，合并已整份退回 | 消息里列出每条体检错误，逐条修；体检在 numbers.ts 的 registerNumbersValidator 登记 | 否 |
| LCQ-NUM-007 | error | numbers | 默认数值包缺段或字段表失败（冷启动） | 三分包合并后的默认树缺顶层段／必填字段，或 registry 字段表类型／范围失败 | 核对 mod-kit/numbers-{combat,progress,runtime}.json 与 numbersRegistry.ts；合并视图见 game-numbers.qingyu.json（生成物） | 否 |
| LCQ-NUM-008 | error | numbers | 数值 registry 范围或类型无效 | tuning 合并后的树未通过 registry 已登记叶子的类型／范围／交叉约束（好感两端等） | 按消息路径修正；与 LCQ-NUM-004 内建范围检查并列，业务跨字段仍走 LCQ-NUM-006 | 否 |
| LCQ-NUM-009 | error | numbers | 挂伤规则配置项不存在 | 合同 enemyActions[].woundRule 引用了 combat.woundRules.profiles 里没有的配置项名 | 改成已有配置项名，或在 numbers-combat.json 的 combat.woundRules.profiles 里补上该项；合同体检（lint）会先报出 | 否 |
| LCQ-PCK-001 | error | scenarioMods | 剧情模组库内容无效（mods 不是数组），按空库处理 | 已存的剧情模组库 mods 字段被写成了非数组（数据损坏或旧版本遗留） | 按空库处理，内置模板会在下次播种时重建；必要时清理 scenario_mod_library_v1 | 否 |
| LCQ-PCK-002 | warn | scenarioMods | 剧情模组文件不是有效 JSON | 导入的剧情模组文件不是有效 JSON | 用 JSON 校验器检查文件；日志只记字符数，不含文件内容 | 否 |
| LCQ-PCK-003 | warn | scenarioMods | 剧情模组校验未通过 | 剧情模组结构或分析校验有 error 级问题，无法导入 | 看 detail.issues 的 path 与 code，按 mod:validate 脚本输出修正 | 否 |
| LCQ-SAV-001 | error | indexedDB | 存档库打开失败 | 浏览器禁用 IndexedDB、存储配额满或库损坏、被其它标签页阻塞 | 控制台看 cause；清理站点存储或换浏览器；注意先导出存档 | 否 |
| LCQ-SAV-002 | error | indexedDB | 存档读取失败，已回落空数据或空值 | IndexedDB 读事务失败或数据损坏，函数已回落空数据/空值 | 看 detail.op 与 key；若存档“消失”先别写入，检查浏览器存储并导出备份 | 否 |
| LCQ-SAV-003 | error | indexedDB | 存档写入失败 | 配额满、库被关闭或事务中断，写入未落盘 | 看 detail.op；腾出站点存储空间后重试；写入失败期间不要关页面 | 是 |
| LCQ-SAV-004 | error | indexedDB | 存档删除或清空失败 | 删除/清空事务失败 | 看 detail.op；刷新后重试 | 否 |
| LCQ-SAV-005 | error | indexedDB | 存档数据迁移失败 | 旧单体存档迁移到分片结构时失败 | 看 detail.stage；旧数据仍在原处，勿清库，导出日志后联系维护者 | 否 |
| LCQ-SAV-006 | warn | indexedDB | 远程存档接口不可用，本次会话回退本机 IndexedDB | 后端对 save-storage 返回 405/501，本会话不再请求远程 | 确认后端版本是否支持远程存档；仅本机存储仍可用 | 否 |
| LCQ-SAV-007 | warn | indexedDB | 远程存档请求失败，回退本机 IndexedDB | 后端返回非 2xx 或网络异常，已回退本机 IndexedDB（每会话只记一次） | 检查后端是否可达、token 是否有效；看 detail.status | 否 |
| LCQ-SAV-008 | warn | indexedDB | 合并远程与本机根数据失败，回退本机数据 | 远程与本机根数据合并时抛错，已回退本机数据 | 看 cause；检查远程返回的数据结构 | 否 |
| LCQ-SAV-009 | warn | indexedDB | 存档库统计信息获取失败 | 读取库统计信息（条数/大小）失败 | 只影响统计显示，可忽略；反复出现则按 LCQ-SAV-001 排查 | 否 |
| LCQ-SAV-010 | warn | characterRag | 角色 RAG 的 IndexedDB 库初始化失败，该功能本次不可用 | 角色 RAG 用的 IndexedDB 打开失败 | 功能降级为不可用；按 LCQ-SAV-001 思路排查浏览器存储 | 否 |
| LCQ-SAV-011 | warn | indexedDB | 存档滚动备份写入失败，主存档写入不受影响 | 覆盖写前把旧值挪进 `__rot__<槽>_N` 备份槽的事务失败（配额紧张、库被关闭） | 看 detail.op / slotId；主存档仍会照常写入，只是这次没有新备份；腾出站点存储空间 | 否 |
| LCQ-SAV-012 | warn | indexedDB | 存档损坏或读取失败，已回退到滚动备份 | 槽位读出来不是对象、过不了 V3 致命校验或读取抛错，已改用最近一份可用的 `__rot__<槽>_N` | 看 detail.backupIndex（回退到第几份）与 detail.problem；提示只在同一会话同一槽弹一次（由读档处直接弹，不走日志 toast 的 error 级别线）；回退的是较早的进度，建议核对后手动存档 | 是 |
| LCQ-SAV-013 | error | indexedDB | 存档损坏或读取失败，且没有可用的滚动备份 | 主槽损坏/读不出，`__rot__<槽>_1..N` 也都不存在或同样损坏 | 勿覆盖该槽；导出日志与浏览器存储留证，用手动导出的存档文件恢复 | 是 |
| LCQ-SAV-014 | warn | saveMigration | 存档版本高于当前游戏，已拒绝加载 | 存档的 `元数据.版本号` 大于游戏支持的 `CURRENT_SAVE_SCHEMA_VERSION`（存档由更新版本的游戏写出，或玩家回退了游戏版本） | 看 detail.saveVersion / currentVersion；升级游戏后再读取，不要用旧版本覆盖该槽；该槽数据未被改动（不迁移、不回退到滚动备份）；提示由读档处直接弹（不走日志 toast 的 error 级别线） | 是 |
| LCQ-SAV-015 | warn | saveValidation | 读档校验发现非致命问题（缺字段或类型不对），已照常加载 | 迁移之后的 `validateSaveDataV3` 报了 errors / warnings（常见于旧档缺新字段、装备引用了不存在的物品），但结构仍是 V3 | 看 detail.problems 与 count；仅告警，存档照常加载、不拒绝；同一问题反复出现再考虑补迁移步骤 | 否 |
| LCQ-SAV-016 | warn | saveValidation | 读档校验发现存档结构损坏，已回退到滚动备份 | 迁移之后的存档不是 V3 结构（`validateSaveDataV3` 的 criticalErrors），改用最近一份可用的 `__rot__<槽>_N`（旧结构的备份会在内存里迁移，不写回） | 看 detail.backupIndex 与 detail.problems；回退的是较早的进度；原槽未被改写，下次存档才覆盖；提示只在同一会话同一槽弹一次（由读档处直接弹，不走日志 toast 的 error 级别线） | 是 |
| LCQ-SAV-017 | warn | saveValidation | 读档校验发现存档结构损坏，且没有可用的滚动备份，已拒绝加载 | 存档过不了致命校验，`__rot__<槽>_1..N` 也都不存在、同样损坏或来自更新版本 | 勿覆盖该槽；看 detail.problems；导出日志与浏览器存储留证，用手动导出的存档文件恢复；提示由读档处直接弹（不走日志 toast 的 error 级别线） | 是 |
| LCQ-SAV-018 | warn | feedbackPack | 反馈包读取当前存档失败，已不带存档导出 | 玩家勾选了“附带存档”，但读本机 IndexedDB 的当前激活存档时抛错（存储库不可用、存档记录损坏） | 看 stack 与 cause；反馈包里的 manifest.json 会写明“读取存档失败，反馈包未带存档”，其余日志/版本/模型配置照常；按 LCQ-SAV-001 / LCQ-SAV-002 排查存储库，必要时让玩家走存档页的存档导出 | 否 |
| LCQ-SAV-019 | warn | strictInitializer | 开局无法对齐出生年：缺年龄或当前年 | 严格剧本开局要按“当前年 − 年龄”写出生年，但存档缺 角色.身份，或 元数据.时间.年 不是数，或 角色.属性.寿命.当前 与开局预设 age 都没有 | 看 detail 里的 year / life / presetAge；补全开局预设的 age 或角色寿命；出生日期保持原样，年龄显示可能不对 | 否 |
| LCQ-SAV-020 | error | sceneModule | 场面战斗拍数超过上限仍未分出胜负 | 一场场面战斗已打完的拍数超过 numbers-combat.json combat.beatLimit.max 仍是交战中：合同没有拍数时钟，玩家方赢不了（加值过低、没用要素）又走不到败局（专门后果不升级、不扣血） | 看 detail 里的 contractId / beat / tracks / statuses；对照合同的 objective.win、defeat、clock 与 enemyActions 的后果能否走到倒下；到上限后怎么判尚待拍板，代码只记录不改判 | 否 |
| LCQ-SAV-021 | warn | sceneModule | 开战前存档失败，已照常开战（判负回档点可能缺失） | 进场面战斗前写「开战前」存档槽（host/preBattleSlot.ts）时抛错：存储库不可用、配额满、槽名冲突 | 看 cause 与 detail.contractId；按 LCQ-SAV-001 / LCQ-SAV-005 排查存储库；本场判负后可能回不到开战前，只能回「上次对话」 | 否 |
| LCQ-SAV-022 | warn | sceneModule | 场面骰存档外游标读写 localStorage 失败，已退回真随机种子 | host/rngSalt.ts 读或写 localStorage 键 lcq.sceneRngSalt 抛错（隐私模式、存储被禁用、配额满）；detail.op 标明 read / write / access，detail.fallback 标明退回的随机源（crypto.getRandomValues 或 Math.random） | 读档换种子照常生效，只是计数没有延续；检查浏览器站点存储设置 | 否 |
| LCQ-SAV-023 | warn | identityLedger | 身份账/收束档同步失败，本拍未入账（不阻断回合，下回合或读档重试） | identityLedger.ts 的 syncPlayerLedgers（每回合 advanceScenarioRuntime、切关前、读档回填）里身份或收束档同步抛错：规则表结构坏（mod-kit/player-ledger-rules.json）、存档里 playerIdentities / flags 被写成非对象 | 看 cause 与 stack；跑 tests/playerLedgerRules.test.mjs 查规则表；同步幂等，修好后下一回合或读档会补记 | 否 |
| LCQ-SAV-024 | warn | lineOutcomes | 国家线收束档拒写：线不在 story.lineOutcome.judgedLines（非判档线），或档位不在 story.lineOutcome.tiers，或已收束且 writeOnce 不覆盖 | lineOutcomes.ts 的 writeLineOutcome：要写的线不在 story.lineOutcome.judgedLines（detail.reason=notJudged，如太泉——用户 2026-10-26 定太泉不判档；规则表校验同样拒绝这类规则，多见于测试夹具或替换过的规则表），或规则表里的 outcome 不在 story.lineOutcome.tiers（detail.reason=tier，常见于档位从三档改两档后规则表没跟着改），或同一条线已收束、writeOnce=true 时又有收束事件给了不同档位（detail.reason=writeOnce，detail.prior 为已存档位） | 看 detail.lineId / outcome / eventId；notJudged 类删掉该线的收束规则，确需判档先经用户拍板再改 judgedLines 配置；tier 类改规则表或 tiers 配置；writeOnce 类确认是否该允许改写（设计稿 §11 Q3），否则删掉冲突规则 | 否 |
| LCQ-SAV-025 | warn | itemProvenance | 道具来路去重没能按规则执行（判断出错时按原逻辑发放；改发的物品不在本关物品表时只跳过；读档回填失败） | itemProvenance.ts 按唯一道具组（mod-kit/player-ledger-rules.json itemGroups，口径 story.itemProvenance.dedupeBy）判断发放时出错：detail.reason=check_failed 为判断抛错（规则表结构坏、存档回执或背包被写成非预期结构），本次按原逻辑照发不拦截；detail.reason=redirect_missing 为本组 whenHeld=redirect 但 redirectItemId 不在本关 canon.items，本次只跳过不改发；detail.reason=backfill_failed 为读档回填回执失败（T6 接入） | 看 detail.itemId / groupId / transferId / sourceEventId 与 cause；check_failed 跑 tests/playerLedgerRules.test.mjs 查规则表，再查存档 inventoryTransferReceipts 与 角色.背包.物品；redirect_missing 把改发物品补进该关物品表或改组的 redirectItemId；去重按回执幂等，修好后后续发放即按规则执行 | 否 |
| LCQ-SYS-000 | warn | diagnostics | 未登记 | console.error / console.warn 被日志捕获；或调用方传了没登记的码（原码在 detail.originalCode） | 看 msg 与 stack 定位调用点；若是业务上要长期保留的错误，给它登记专属码并改成 logError | 否 |
| LCQ-SYS-001 | warn | diagnostics | 日志持久化降级：IndexedDB 不可用，改用 localStorage 小缓存 | 浏览器禁用或不支持 IndexedDB（隐私模式、存储被清理策略禁用），或 lcq-log 库打开失败 | 日志仍在内存环形缓冲里，可照常导出；换普通窗口或检查浏览器站点存储设置 | 否 |
| LCQ-UI-001 | error | window | 页面未捕获异常（window error） | 页面脚本抛出未捕获异常（组件渲染、事件回调） | 看 stack 与 detail.file/line；复现步骤 + 导出日志提交 | 否 |
| LCQ-UI-002 | error | window | 未处理的 Promise 拒绝（unhandledrejection） | 某个 Promise 失败且无人处理 | 看 stack 找到未 await/未 catch 的调用；业务上应补 catch 并改用专属码 | 否 |
| LCQ-UI-003 | warn | diagnostics | 导出日志失败 | 导出日志时浏览器拒绝创建下载（沙箱、权限） | 换浏览器或重试；不影响游戏 | 否 |
| LCQ-UI-004 | error | vue | Vue 组件未捕获异常（app.config.errorHandler） | 组件渲染、生命周期钩子、事件处理器或 watcher 抛出未捕获异常（Vue 已接管，不会再触发 window error） | 看 stack 与 detail.info（Vue 给出的出错位置，如 render function / mounted hook）、detail.component；玩家提示按码 30 秒去重，不会刷屏；复现步骤 + 导出日志提交 | 是 |
| LCQ-UI-005 | error | startup | 启动阶段失败，已显示兜底界面 | 挂载前的启动步骤抛错（目前是 migrateData 存档迁移检查），或挂载 Vue 应用时抛错；此时页面显示原生兜底界面（导出日志 / 重新载入） | 看 detail.stage（migrateData / mount）与 cause；先导出日志，再重新载入；migrateData 失败多为浏览器存储不可用，按 LCQ-SAV-001 / LCQ-SAV-005 排查 | 否 |
| LCQ-UI-006 | warn | diagnostics | 导出反馈包失败 | 组包或触发下载时抛错：浏览器拒绝创建下载（沙箱、权限），或内存不足以容纳带存档的大包 | 看 cause；换浏览器或重试；先不勾选“附带存档”再导出（只含日志/版本/模型配置摘要，体积很小）；不影响游戏 | 否 |

## 已作废

暂无。
