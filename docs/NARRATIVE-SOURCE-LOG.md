# 叙事来源日志（LCQ-NAR-*）

总策划 2026-10-28 定。真机叙事偶尔在中文里夹英文（leaps、steady、changes、Decide、feel、manipulated），多在修炼、闭关、冲关叙事里出现。以前的持久日志不记一段正文是哪条路径、哪个提示词模块生成的，查不出来源。现在模型每生成一段玩家可见正文，就用现有持久日志（`logEvent`）记一条来源。正文里夹英文时再记一条错误码。**只记录，不改写正文。**

代码：`src/modules/diagnostics/narrativeSource.ts`。错误码权威表见 [ERROR-CODES.md](ERROR-CODES.md)，调试大类见 [DEBUG-LOG.md](DEBUG-LOG.md)（码表 module `narrativeSource`，路径归 `perf`）。和其他错误码一样，叙事来源日志始终开启，不受调试大类开关影响。

## 错误码

| 码 | 级别 | 什么时候记 |
|---|---|---|
| `LCQ-NAR-001` | info | 模型每生成一段玩家可见正文记一条：来源字段加正文全文 |
| `LCQ-NAR-002` | warn | 同一段正文里有夹在中文之间的拉丁单词：命中词、前后各 20 字，加上同样的来源字段 |
| `LCQ-SYS-002` | info | 持久日志轮转删掉了旧记录（见下文「轮转」） |

NAR 是新增的码族，从 001 起取号，规则同其他族：序号只增不复用，作废的码挪到 ERROR-CODES.md 的「已作废」一节。

## 记录点

| site | 记录位置 | path（生成路径） | 什么时候记 |
|---|---|---|---|
| `turn` | `MainGamePanel.vue` 发送收尾（定下最终正文 `finalText` 之后） | 有模块回执：`modular`；没有回执（旧链路）：取回合埋点的 `legacy` / `legacy_pilot` | 回执 `path=modular`，或旧链路本回合确实发过模型请求。回执是 `local` / `card`（本地合同正文、卡片句、守卫三稿全拒后的固定承接）时没调模型，不记 |
| `scene_beat` | `sceneModule/host/narrate.ts` 的 `narrateBeat` | `sceneModule` | 模型写的拍描写通过了守卫；退回模板拼装的不记 |
| `scene_chat` | `sceneModule/host/controller.ts` 场内闲聊 | `sceneModule` | 模型回话通过了检查；换成固定句的不记 |
| `opening` | `services/initialization/characterInitialization.ts` 开局正文 | `opening` | 开局正文生成成功 |

冻结文件 `src/utils/AIBidirectionalSystem.ts` 与 `src/modules/scenarioMods/runtime.ts` **没有改动**。来源取自它们已有的输出：`processPlayerAction` 返回的 `moduleReceipt`（路径、模型路由、eventId），以及回合埋点 `getLastTurnTelemetry()`（path、模型、本回合有没有发过模型请求）。

## LCQ-NAR-001 字段

日志条目本身的通用字段照旧：`ts`（UTC 的 ISO 串）、`level`、`code`、`module`、`sessionId`、`turnId`（请求生命周期的回合 id）、`msg`（形如「叙事来源：turn/modular，模型 deepseek-chat，356字」）。`detail` 字段如下：

| 字段 | 含义 |
|---|---|
| `site` | 记录点：`turn` / `scene_beat` / `scene_chat` / `opening` |
| `path` | 生成路径：`modular`（模块演出）、`legacy`（旧链路）、`legacy_pilot`（旧链路单幕试验）、`sceneModule`（场面）、`opening`（开局） |
| `triggers` | 触发来源，都是现有 id：`freeAction:<actionClass>.<variant>`（自由行动票，冲关为 `freeAction:solo.breakthrough`，修炼为 `freeAction:solo.train`）、`judgement:<kind>`（判定类型，冲关/修炼为 `judgement:cultivate`）、`event:<eventId>#<actionId>`、`opportunity:<id>`、`openWorld:<kind>`、`gambleRefusal:<actionId>`、`scene:<场面合同 id>` |
| `moduleId` | 模型模块 id（`moduleModelRuntime.ts` 的 `GAME_MODEL_MODULES`）：模块演出与场面都是 `narrative`；旧链路和开局没有模块卡，为 `null` |
| `prompts` | 提示词模块列表 `[{ id, custom }]`。`custom=true` 表示用的是玩家在提示词面板改过的内容（`promptStorage.get` 取用时报告）。模块演出记 `moduleNarrativeSystem`；旧链路与开局记本回合（从发送到收尾）取用过的全部提示词模块；场面的提示词写在代码里、不经提示词面板，记 `sceneModule.narrateBeat` / `sceneModule.chat`，`custom` 恒为 false |
| `model` / `provider` | 模型名与服务商。模块演出取回执里的路由；旧链路取回合埋点；场面取 `narrative` 模块最近一次路由；开局取主流程 API 配置。酒馆宿主承载时为「宿主主流程」/ `tavern` |
| `turn` | 叙事回合序号，即 `系统.历史.叙事` 的条数（场面记录为 null） |
| `beat` | 场面拍序号，即场面状态的 `beat`（非场面记录为 null） |
| `generationId` | 回合的生成 id（`gen_…`，只有 site=turn 才有） |
| `eventId` | 当前事件 id（回执或场面上有才记） |
| `generatedAt` | 正文生成时刻，**本机时区的 ISO 串**，例如 `2026-10-28T09:12:03.456+08:00`。每条日志各带一个 |
| `textChars` | 正文字数（按字计，不按 UTF-16 码元） |
| `text` | **正文全文**。只抹掉密钥形状（`diagnostics.redactPatterns`），不按 `detailChars` 截断，也不按 `textKeys` 省略。这是持久日志「不记原文」规则的唯一例外，通过 `logEvent` 的 `verbatim` 通道写入；玩家原文不得走这个通道 |

## LCQ-NAR-002：夹英文检测

规则（`findMixedLatin`）：

- 拉丁单词按 `[A-Za-z]+` 取，允许词中带 `'`、`’`、`-`（例如 don't、e-mail）。字母数要达到 `minLetters`（默认 3），所以 OK、Hi 这类两字母词不算。
- 「夹在中文里」的判断：命中词前或后 `contextChars`（默认 20）字之内有汉字。
- 白名单不分大小写，按整词匹配：`nameWhitelist`（人名专名）与 `colloquialWhitelist`（程宗扬现代口语）里的词不算命中。
- 每段正文最多记一条：`detail.words` 是去重后的命中词，`detail.hits` 是每次出现的 `{ word, before, after }`（命中词前后各 `contextChars` 字），再加上与 NAR-001 相同的来源字段、`generatedAt` 和 `textChars`。`hits` 超过 `diagnostics.maxKeys`（默认 20）项时截断，尾部注明总数。
- 只记录，正文原样发布。

## 配置（`mod-kit/numbers-runtime.json` 的 `diagnostics` 段）

改完三分包要跑 `node scripts/merge-game-numbers.mjs`，重新生成 `game-numbers.qingyu.json`。也可以写 tuning.json 的 `numbers.diagnostics` 热改，下一次记录即生效。配置体检不通过时，整份热改退回（LCQ-NUM-006）。

```json
"rotation": { "retentionDays": 3, "trimToRatio": 0.8 },
"narrativeSource": {
  "minLetters": 3,
  "contextChars": 20,
  "nameWhitelist": ["DNA", "CEO", "VIP", "KTV", "GPS", "USB", "MBA", "NBA", "iPhone"],
  "colloquialWhitelist": ["okay", "hello", "bye", "sorry", "yes", "wow", "yeah", "oops", "cool", "baby", "honey", "party", "bingo", "show", "boss", "fans", "pass", "kiss", "sexy", "pose", "high", "low", "man", "hold", "out", "god", "damn", "shit", "fuck"]
}
```

| 键 | 体检 |
|---|---|
| `narrativeSource.minLetters`、`contextChars` | 正整数 |
| `narrativeSource.nameWhitelist`、`colloquialWhitelist` | 字符串数组，可以为空，但不能有空串 |
| `rotation.retentionDays` | 正数（天） |
| `rotation.trimToRatio` | 在 0 和 1 之间，不含两端 |

两张白名单的默认内容是起步用的占位，请策划按原著与真机所见增删。真机已见的问题词（leaps、steady、changes、decide、feel、manipulated）有意不进白名单。例如「有 feel」虽是口语，但正是要追查的问题，所以不放进口语白名单。

## 存放位置

- **持久化**：浏览器 IndexedDB 独立库 `lcq-log`，对象仓 `logs`，主键 `seq`（写入时刻 ms × 1000 + 计数）。这个库与存档库 `DAD_SAVES_DB` 无关。
- **降级**：IndexedDB 不可用时，改用 localStorage 键 `lcq-log-fallback`，只留最近 `localFallbackMax`（默认 50）条，并记 `LCQ-SYS-001`。再不可用就只留内存。
- **内存**：环形缓冲同样受 `ringMax` / `maxBytes` 与保留天数限制，面板与导出都读它（含磁盘里旧会话的记录）。
- `persistLevel` 默认 `info`，所以 NAR-001（info）也会落盘；`consoleLevel` 默认 `warn`，所以控制台只打 NAR-002。

## 轮转（`LCQ-SYS-002`）

以前已有按条数和总大小清理（`ringMax` / `maxBytes`，每写一条就删最老的），但没有按天数清理，删除时也不记日志。现在：

1. **定期**：每次落盘（写日志后 `flushMs` 内）检查磁盘，早于 `retentionDays`（默认 **3 天**）的记录删掉；内存里过期的记录也同时丢弃。
2. **定量**：条数超过 `ringMax`（默认 **2000**），或总大小超过 `maxBytes`（默认 **2097152**，按 JSON 字符数计）时，从最老的开始删，一次删到 `trimToRatio`（默认 0.8）倍以下，至少留最新一条。一次删到低水位，留出余量，避免每写一条就轮转一次。
3. 每次轮转记一条 `LCQ-SYS-002`。detail 有：`rotatedAt`（本机时区 ISO）、`dropped`、`byAge`（因过期删的条数）、`byLimit`（因超上限删的条数）、`kept`、`keptBytes`、`oldestDroppedAt` / `newestDroppedAt`，以及当时的 `retentionDays` / `maxEntries` / `maxBytes` / `trimToRatio`。

正文全文会把单条日志撑大，所以 `ringMax` 从 500 提到 2000，`maxBytes` 从 512K 提到 2M 字符，大约够存几百回合的正文。删掉的记录找不回，要留证据请先导出。

## 怎么导出给测试看

1. **反馈包（推荐，不用开调试模式）**：在设置页「高级设置 → 导出反馈包」导出，得到 `lcq-feedback-<时间>.zip`，其中 `logs.json` 是全部日志。启动失败的兜底界面里也能导出。
2. **日志 JSON**：调试模式下，页面左下角有错误角标，点开后可以「导出」，得到 `lcq-log-<时间>.json`。
3. 两种导出的 `stats.narrativeSource` 都有本会话统计：`records`（记了几段）、`flagged`（几段夹英文）、`words`（各命中词出现在几段里）。

用 jq 过滤（文件名按实际替换；反馈包先解压出 `logs.json`）：

```bash
# 所有夹英文命中：时刻、路径、触发、模型、命中词与上下文
jq '.entries[] | select(.code=="LCQ-NAR-002") | {at: .detail.generatedAt, path: .detail.path, triggers: .detail.triggers, prompts: .detail.prompts, model: .detail.model, turn: .detail.turn, beat: .detail.beat, hits: .detail.hits}' logs.json

# 每段正文的来源与全文（按生成时刻）
jq -r '.entries[] | select(.code=="LCQ-NAR-001") | "\(.detail.generatedAt)  \(.detail.site)/\(.detail.path)  \(.detail.triggers|join(","))  \(.detail.model)  \(.detail.textChars)字\n\(.detail.text)\n"' logs.json

# 只看冲关 / 修炼叙事
jq '.entries[] | select(.code=="LCQ-NAR-001" and ((.detail.triggers // []) | any(test("solo\\.(breakthrough|train)|judgement:cultivate"))))' logs.json
```

注意：反馈包的 `feedback.redactSaveNarrative`（默认脱敏）只管 `save.json` 里的叙事。`logs.json` 里 NAR-001 的正文全文**不受它影响**，因为留全文本来就是给测试看的。分享反馈包前请知悉。

## 已知局限

- 旧链路（已标记 @deprecated）的 `prompts` 是本回合窗口内取用过的全部提示词模块。窗口里后台同时取用的提示词也可能混进来。模块演出只记 `moduleNarrativeSystem`，不受影响。
- 场面的 `model` 取 `narrative` 模块最近一次路由（同一回合内就是这次描写所用的路由）。
- 冻结文件里还有英文键名（场景材料的 eventId / location / present 等，见提交 56fb0716）。本功能只负责找出夹英文出自哪条路径，不改那里。
