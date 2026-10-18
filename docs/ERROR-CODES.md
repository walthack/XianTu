# 错误码总表（LCQ-*）

诊断/错误码日志系统的权威说明。代码侧登记在 `src/modules/diagnostics/codes.ts`，两边由 `tests/errorCodeGuard.test.mjs` 互相校验：码、级别、模块、含义、是否进玩家提示必须一致，且每行都要有“常见原因”和“排查办法”。

## 规则

- 格式：`LCQ-<CFG|NUM|FA|SAV|NET|PCK|UI|SYS>-三位序号`。CFG 配置 / NUM 数值配置 / FA 自由行动 / SAV 存档与 IndexedDB / NET 网络与 AI 请求 / PCK 内容包与剧情模组 / UI 页面 / SYS 日志系统自身。
- 序号只增不复用：新增码取该族下一个未用序号；作废的码移到文末“已作废”，不再发出也不得被新码占用。
- **LCQ-FA 与 freeAction 的 `GATE_REASONS` 一一对应**：每个闸门原因一个码，含义栏里括号内是原因 id。新增闸门原因必须同时在 `codes.ts` 的 `FA_GATE_CODES` 与本表登记（漏了编译和守卫测试都会失败）。
- 兜底码 `LCQ-SYS-000`「未登记」：console.error / console.warn 捕获，以及调用方传了没登记的码，都落到这里。
- 级别列是码的默认级别；个别接入点会按场景调整（如后台 AI 请求超时降为 warn、tuning.json 404 级别取配置 `diagnostics.tuning404Level`）。
- 日志不记玩家原文、不记请求头/URL/正文/密钥：detail 经脱敏（`diagnostics.redactKeys / redactPatterns / textKeys / textChars`），textChars 默认 0。这是有意的，不要为了排查把原文加进 detail。
- 数值全部在 `mod-kit/game-numbers.qingyu.json` 的 `diagnostics` 段（可经 tuning.json 热改，体检登记在 numbers.ts）。
- 新代码的 catch 必须含 logError/logEvent，或写 `// lcq-allow: 原因`；存量 catch 记在 `tests/errorCodeGuard.baseline.json`，只拦新增。

## 日志字段

`ts`、`level`、`code`、`module`、`sessionId`、`turnId`、`requestId?`、`msg`、`detail`（已脱敏）、`stack?`。落在独立 IndexedDB 库 `lcq-log`（环形，不碰存档库）；IndexedDB 不可用时降级 localStorage 小缓存。调试模式下页面左下角出现错误角标，点开可看最近条目并导出 JSON。

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
| LCQ-NUM-001 | error | numbers | 数值配置对象无效 | tuning.json numbers 段里某处应为对象却写成了别的类型 | 按消息里的路径修正为对象 | 否 |
| LCQ-NUM-002 | error | numbers | 数值配置含未知键 | numbers 段含 game-numbers.qingyu.json 里不存在的键（拼写错误或已删除的键） | 按消息里的路径核对键名；只能改已有键，不能新增 | 否 |
| LCQ-NUM-003 | error | numbers | 数值配置类型无效 | numbers 段某个值的类型与默认值不同（数字写成字符串等）或为非有限数 | 按消息里的路径改成与默认值相同类型 | 否 |
| LCQ-NUM-004 | error | numbers | 数值配置范围无效 | 等级差、胜率区间、训练进度、货币等数值超出允许范围 | 对照 game-numbers.qingyu.json 的默认值调整 | 否 |
| LCQ-NUM-005 | error | numbers | 目标修正配置无效 | goalModifiers 缺 default，或引用了不存在的权重表 / 缺布尔字段 | 补全 goalModifiers 的 default 与每项的 factorProfile、levelGap | 否 |
| LCQ-NUM-006 | error | numbers | 数值体检未通过，合并已退回 | 各模块登记的数值体检（freeAction、judgement、diagnostics 等）未通过，合并已整份退回 | 消息里列出每条体检错误，逐条修；体检在 numbers.ts 的 registerNumbersValidator 登记 | 否 |
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
| LCQ-SYS-000 | warn | diagnostics | 未登记 | console.error / console.warn 被日志捕获；或调用方传了没登记的码（原码在 detail.originalCode） | 看 msg 与 stack 定位调用点；若是业务上要长期保留的错误，给它登记专属码并改成 logError | 否 |
| LCQ-SYS-001 | warn | diagnostics | 日志持久化降级：IndexedDB 不可用，改用 localStorage 小缓存 | 浏览器禁用或不支持 IndexedDB（隐私模式、存储被清理策略禁用），或 lcq-log 库打开失败 | 日志仍在内存环形缓冲里，可照常导出；换普通窗口或检查浏览器站点存储设置 | 否 |
| LCQ-UI-001 | error | window | 页面未捕获异常（window error） | 页面脚本抛出未捕获异常（组件渲染、事件回调） | 看 stack 与 detail.file/line；复现步骤 + 导出日志提交 | 否 |
| LCQ-UI-002 | error | window | 未处理的 Promise 拒绝（unhandledrejection） | 某个 Promise 失败且无人处理 | 看 stack 找到未 await/未 catch 的调用；业务上应补 catch 并改用专属码 | 否 |
| LCQ-UI-003 | warn | diagnostics | 导出日志失败 | 导出日志时浏览器拒绝创建下载（沙箱、权限） | 换浏览器或重试；不影响游戏 | 否 |
| LCQ-UI-004 | error | vue | Vue 组件未捕获异常（app.config.errorHandler） | 组件渲染、生命周期钩子、事件处理器或 watcher 抛出未捕获异常（Vue 已接管，不会再触发 window error） | 看 stack 与 detail.info（Vue 给出的出错位置，如 render function / mounted hook）、detail.component；玩家提示按码 30 秒去重，不会刷屏；复现步骤 + 导出日志提交 | 是 |
| LCQ-UI-005 | error | startup | 启动阶段失败，已显示兜底界面 | 挂载前的启动步骤抛错（目前是 migrateData 存档迁移检查），或挂载 Vue 应用时抛错；此时页面显示原生兜底界面（导出日志 / 重新载入） | 看 detail.stage（migrateData / mount）与 cause；先导出日志，再重新载入；migrateData 失败多为浏览器存储不可用，按 LCQ-SAV-001 / LCQ-SAV-005 排查 | 否 |

## 已作废

暂无。
