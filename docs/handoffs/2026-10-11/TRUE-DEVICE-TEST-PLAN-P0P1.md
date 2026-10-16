# 六朝仙途 · P0/P1 合包真机测试文档（2026-10-11，Claude 起草）

## 固定开测步骤 · 1012TESTCFG（用户2026-10-12 22:16裁定）

后续执行本文真机/复测前，先只读正式 `.xiantu-server/save-storage/user_config_api_management_v1.json` 的实际配置，注入本轮**测试私有浏览器profile**，不改原文件、不上传正式后台、密钥不外露；加载/刷新前在测试驱动中隔离API配置同步读取与写回，避免正式后台覆盖私有副本。私有副本main固定「minimax high speed」：`MiniMax-M2.7-highspeed`，`api_1782316385574_8wsfb6ors`；Jev/Deepseek按需付费，测试一律不用，所有指向它们的功能/模块/继承分配均在私有profile改到此ID，并禁用被禁连接以防回退。首个请求前核对页面实际路由与发送前payload.model，先把实际apiId/model写进报告；配置不可读、目标连接不可用、仍指向禁用模型或回退`gpt-4o`默认时，拦截请求、停下报告，不得用默认值开测。

本条优先于下文旧模型选择/“沿用后台main”说明，只约束新轮测试，不改写历史结果；原环境与存档守卫继续有效。组织者在开测前完成配置，测试者不接触密钥。完整注入、继承检查与安全报告字段见[统一开测规则](../../TRUE-DEVICE-TEST-API-PREFLIGHT-1012TESTCFG.md)。


被测对象：8097 当前包 `combat-trial.js` SHA-256 `9d9e13336e5e2c6522c2c7a33c85805909393109072c62942345701c0d3a48ae`，对应源码 `ea202e78`（`feat/fast-no-legacy`，未推送）。覆盖 P0 三处机制修复（`99fdb3ee`）与 P1 六项内容包交付（`ea202e78`）。

本文只定**测什么、怎么判、何时停**。执行书的环境守卫、记录字段、判定词汇沿用 `docs/handoffs/2026-10-10/P0-EXECUTION-PLAN.md` §P0-A 与 `docs/handoffs/2026-10-07/ACCEPTANCE-EXECUTION-GPT6-LUNA.md`，冲突以本文为准。

## 0. 定位与边界

- **这是合包后的真机行为验收，不是重跑已收口的固定组。** P0 的 V03/V07/V02 固定组、P1 的 16 组合合同不变性、2000 局模拟都已在隔离包过，本文只各抽一条做"合包未回退"回归，重点放在**还没有真机证据的部分**：F06–F09/F14 的败局与条件分支、框架迁移后的旧档兼容与入口、第 87 章条件盘问的自然触发。
- **只测不修。** 发现缺陷按"候选生成／语义识别／前置验证／结算路由／内容包数据／范围外"归类，给最小复现；内容包数据类缺陷（JSON 合同字段错）是本轮新增类别，归剧情/模块策划，不改 TS。
- **不碰 8097（PID 65144）、正式存档、API 配置。** 被测包用 `dev/combat-trial/dist/` 字节副本在独占端口起静态服务，复制后哈希必须等于上值。
- 执行方必须在能启动 Chromium 的**非沙箱**环境；复用 `_newbot_tmp/acceptance-20261007-luna-a1/driver.mjs`（改 run 目录/profile/默认 URL 三处），API 配置经 `addInitScript` 注入 `localStorage.api_management_config`（combat-trial 无后端，这是唯一来源），save-storage 与非 GET 写请求全部 501。报告里的模型名**只能来自** `logs/*-events.json` 的 `chat-start.model`。
- 本轮专属目录：`_newbot_tmp/truedevice-p0p1-20261011-<后缀>/`，守卫比对沿用 b1 的 `guard-pre.json` 15 项正式文件。

## 1. 检查点与前置

| 用途 | 来源 | 说明 |
|---|---|---|
| F01–F05/F10/F13/F06–F09/F14 战前 | `node scripts/generate-scene-combat-checkpoints.mjs <本轮目录>/checkpoints` | 生成器 targets 已含 12 场（Claude 核实）。控骰回放只作前置，**不作证据**；进入被测场后不得有 `forced` |
| 第 87 章条件盘问前置 | 需从 **F07 败局**（`lcq.f07.escaped=true`）继续生产回放到 `lcq.stage_05b` 的 `lcq.event.blank_letter_and_dagu` | 现生成器无此 target；执行方可在本轮目录写**只读生成器的派生脚本**（加 target、从 F07-lose 存档起跑），不改 `scripts/` 原件。生成不了记 BLOCKED 并写清卡在哪个事件 |
| 旧档兼容 | `_newbot_tmp/p0-fixes-20261011-final/` 的清羽 20 次路线终档、`acceptance-20261007-luna-a1/checkpoints/F10-before.json`、`F13-before.json` | 这些是 `aef6963f`/`d75af9d6` 时期的生产存档，内嵌旧 `scenario.events` 快照，正好测迁移后读旧档 |
| V03/V07 回归 | `acceptance-20261007-luna-a1/v0304/after-fix/V03-step1-before.json`、`v0304/checkpoints/V04-insertion-before.json` | 各只跑 1 条新句（见 §3） |

独立槽一律经存档面板"导入"载入（bundle `{type:'saves',saves:[{存档名,存档数据}]}`），再回 `/game`；"继续上次"固定回 `char_combat_trial_v1 / 战斗试玩` 是入口设计，不记缺陷。

## 2. A 层 · 部署与入口冒烟（10 分钟，先做）

| ID | 操作 | 预期 | 失败归类 |
|---|---|---|---|
| A1 | 本机与 LAN 两个 origin 各新开 context 载入 `/` | 无 pageerror；默认进山涧雾战；served JS 哈希 = 上值 | 部署 |
| A2 | 首页"历史试玩／开发测试"展开 | 三个入口按 `entries.json` 渲染：`星月湖任务线试玩`(primary)、`六朝世界试玩`(legacy)、`清羽记开局`(legacy)；`data-testid` 分别为 `open-xingyuehu-quest-playtest / open-world-sim-playtest / open-qingyu-opening-playtest` | 内容包数据 |
| A3 | 手改 URL 查询 `?pack=不存在的id` 进通用路由 `/qingyu-opening-playtest` | 显示可恢复错误、启动按钮禁用；同页切回有效 pack 后恢复可建档 | 结算路由 |
| A4 | 从"清羽记开局"新建档 | `系统.扩展.清羽记开局.kind === 'qingyu-demo-v1'`、`startModId lcq.stage_01`、开场正文与 `texts.json` 的 `qingyu.opening` **逐字相等**（`/eval` 取 `gameState.getCurrentSaveData()` 比对） | 内容包数据 |

## 3. B 层 · P0 修复合包未回退（每项 1 条，不扩组）

| ID | 前置 | 输入（新句，未参与修复） | 预期 | 停机 |
|---|---|---|---|---|
| B1 V03 | 第一步前 | `凝羽，你到底想让我替你办什么？` | 只推进第一步一次，不提前完成事件；正文不含第二步固定条件 | 过即停 |
| B2 V03 负向 | 第一步前 | `今晚先歇着吧，别的明天再说。` | 不推进、不写尝试、不泄露任何固定条件文本 | 过即停 |
| B3 V07 | V04 插入拍存档新分支 | `我一口气把半坛子酒灌了下去，眼前直打转。` | 角色`效果`与 `sceneLedger` 各恰一条 `drunk`，360 分钟，无 `dizzy`；保存→刷新→同槽读回 `activeRef.slot` 一致且剩余时长不重置 | 过即停 |
| B4 V02 重试 | F05 检查点 | 若首包 30 秒中止：同句重发一次 | 第二次有 chat 请求（不是缓存空转），映射到动作并落骰 | 只在自然出现中止时测，不制造 |

任一项失败 → PARTIAL 并归类，**不**回头跑整组。

## 4. C 层 · P1 新战真机（核心，自然骰，每场胜/败各至少 1 次收束）

通用规则：每场从检查点进入，模型出方案、UI 确认、自然骰；**每个结果分支最多 3 次重开**，取不到记 NOT_REACHED。每次收束后用 `/eval` 读 `场面模块`、`sceneLedger`、相关 flag、`角色.背包`、人物状态，截图正文。正文检查项来自作者 31 号原件（`mod-kit/source-documents/31-南荒全部固定战斗合同草案.md` §F06–F09）与合同 JSON 的 `completionSceneByOutcome`。

### C-F06 海神殿鲛人（`lcq.event.haishen_hall_merfolk`，04b）

| 分支 | 必须成立 | 不得出现 |
|---|---|---|
| 交涉 | 朱狐冠未暴露前，一次"说服/表明不是碧鲮族"类输入能降低敌意（`parley` 生效，骰面或 DC 可见变化） | — |
| 冠暴露 | 任一动作后 `crest` tag 落下 → 固定文"朱狐冠暴露…转为死斗"出现一次，之后交涉无效 | 第二次再出现该固定文 |
| win | 乐明珠在场且活着；`lcq.item` 珊瑚匕首入背包；收束正文含"珊瑚匕首" | 解释"二十年了…"旧仇所指；鲛人身份猜测 |
| lose | 主角小腹伤/呛水类状态写回；乐明珠受伤但**活着**；**匕首仍到手**（W-19） | 乐明珠死亡；匕首缺失 |
| 放走 | 玩家明确"放他走"收束为 win（W-20） | 强制鲛人死亡文本 |

### C-F07 碧鲮湾焚村（`lcq.event.biling_bay_stance`，04b）

| 分支 | 必须成立 | 不得出现 |
|---|---|---|
| win | `exit` 黑舌/蛇傀 `dead`；`lcq.f07.escaped` 不为 true；正文"无人逃出"；黑舌只写"已经死了" | 黑舌死因/凶手；小紫与黑舌之死的关联 |
| lose | `lcq.f07.escaped === true`；小津烧伤、凝羽旧伤加重写回；正文含"有随从逃走" | 蛇傀被写成死亡（败支不猜命运） |
| 阻止滥杀 | 玩家输入阻止碧鲮人杀奴 → 只改叙事口径，不改胜负（W-23） | 因此判负 |
| **87 章条件盘问** | 用 F07-lose 存档续到 `lcq.event.blank_letter_and_dagu`：第二动作 `face_xiaozi_dagu_reveal` 进入 `encounter.f07.geluo_suspicion` 合同；收束后 `lcq.f07.geluo_checked=true`；用 F07-win 存档续到同事件**不**插入该合同 | 盘问改变大走向（W-21）；win 路径被插入 |

87 章这一项是本轮**唯一一条"自然逃兵→条件盘问"链路证据**，P1 报告明确未验收。生成不到前置记 BLOCKED，不手改 flag。

### C-F08 古道废墟·达古（`lcq.event.wuerlang_slays_dagu`，04b）

| 分支 | 必须成立 | 不得出现 |
|---|---|---|
| 援军触发 | 阵形 `collapse` 到 final **或** 主角 `wound.severe` 后，固定事件 `reinforce` 落一次：苏荔/武二郎 `arrive`、`formation` `depart` | 按拍数触发；触发两次 |
| win | 达古 `exit dead`；商队无人死亡；谁杀达古不锁定（主角自杀达古也算） | 强制"武二郎斩达古" |
| lose | **达古仍死**（W-26）；易伟腹伤、小魏臂伤、卡瓦/主角外伤写回 | 达古退走未死 |
| 指挥 | 不交给易彪、主角自指也能进行（W-25） | 强制交权 |

### C-F09 一阳逼退阴煞（`lcq.event.yiyang_repels_yinsha`，04b）

| 分支 | 必须成立 | 不得出现 |
|---|---|---|
| win | `ledgerEffects.jiuyang='一阳'` 写回；阴煞**退**不灭；苏荔在场活着 | 阴煞被杀死/消灭；刀兵判定 |
| lose | **同样**写回一阳（W-31）；主角阴寒入体、苏荔惊惧状态 | 一阳缺失 |
| 花苗女子 | 救下 → `woman.safe='已获救'`；未救 → 收束 `atClose` 固定文"没能救下…小魏…"、`xiaowei wound.fright` | 两种都没写 |
| 合规 | 露骨段按原著默认，**不软化不删改**也**不新增**；只记录观察，非 blocker | — |

### C-F14 龙神决战（`lcq.event.slay_dragon`，05b）

| 分支 | 必须成立 |
|---|---|
| 可选中 | 从 F14 检查点进入时 `场面模块.active.contractId === 'combat.f14.dragon_god'`（JSON 清单启用，非 draft） |
| win / lose | 武二郎/谢艺伤势按合同写回；lose 走既定 E08 映射（P0-04 口径）；两分支各取 1 次收束 |

### C 层附加记录（给模块策划调参用，不判 PASS/FAIL）

每场记录：模型方案实际用了哪些 `elements`/`levers`、每拍骰面与 DC、拍数、收束用时。P1 模拟显示新场最优策略胜率 85%–100% 偏易，真机要回答的是**模型和自然输入是否会用到那些元素**。

## 5. D 层 · 框架迁移回归（旧档、正文、范围）

| ID | 操作 | 预期 | 归类 |
|---|---|---|---|
| D1 旧档读入 | 导入 `p0-fixes-20261011-final` 的清羽 20 次路线终档，继续 3 次真实提交 | 读入无报错；`modId/worldTurn/completedEventIds` 与导入前一致；能继续推进 | 结算路由 |
| D2 旧动作门禁 | 导入旧 `F10-before.json`，用旧存档内的最终动作 id 直接触发（经 `/eval` 调生产入口，不手改状态） | 直接结算被**拒绝**，准备动作正常；进入场面后按新合同走 | 结算路由 |
| D3 固定结局逐字 | 任取一条可达结局（最近：F13 lose→`lcq.ending.death.dragon_well`，F05 lose） | 结局正文与 `texts.json` 对应键**逐字相等**；与 `git show ea202e78^:src/modules/scenarioMods/fixedEndingNarratives.ts` 中原文逐字相等 | 内容包数据 |
| D4 第二关开场 | 清羽档过渡到 `lcq.stage_02` | 开场正文 = `texts.json` 的 `qingyu.stage02.opening`；非隔离试玩标记的普通模组开场**不**被替换 | 内容包数据 |
| D5 试玩范围 | 清羽档内 18 个范围事件中任取 2 个事件的自然输入；范围外事件（如 `lcq.event.s03_01`）1 个 | 范围内走模块链路（回执 `path=modular/local`）；范围外不被 `isScopedPlaytestSave` 误判；`DEMO_LEGACY_BLOCKED` 不触发 | 结算路由 |
| D6 南荒声明 | 由 `nanhuang-1` 入口（若首页暴露）或 `?pack=` 查询建档 | 终点 `lcq.stage_04b` / `lcq.event.enter_dong_with_migu`；`extends qingyu` 后 kind/extensionKey 与清羽一致 | 内容包数据 |

## 6. 判定、停机、交付

- 判定词：PASS / FAIL / PARTIAL / NOT_TESTED / NOT_REACHED / BLOCKED。无法核实不得 PASS。
- 总结论上限 `ISOLATED_CANDIDATE_PASS`（针对包 `9d9e1333…`）；不得写 8097 正式通过、READY_FOR_RELEASE。
- 停机：A 层任一 FAIL → 先报不继续；C 层单场高影响 FAIL 保存样本停该场、继续其他场；连续 5 次传输层失败暂停。30 秒首包中止统一记传输层事件，单独计数。
- 每项完成写 `progress.json`；每条冻结输入最多提交一次，传输失败允许原句重发一次，两次入分母。
- 交付：报告 `../playtest-2026-09-28/REPORT-2026-10-11-truedevice-p0p1.md`（逐项结果表 + 每场骰面表 + 守卫前后比对 + 性能全分母）；`docs/PLANNING-ROUNDS.md` 追加一节；**不改 PROJECT-STATUS**，由 Claude 复核后落入。
- 复核：Claude 只读报告与 `logs/*-events.json`、`evidence/*.json`，不复跑；重点核 C-F07 87 章链路、C-F09 双分支一阳、D3 逐字比对三项。

## 7. 本轮不测（已在其他地方有结论或明确范围外）

F05 血虎制伏（三次上限已耗）、V02 存活投降（合同无此目标，范围外）、V04 两正例好感差异（观察项）、完整回合 30 秒 SLA（已知未达，只报数不判）、真人理解度（由 P0-C 台账承担）、其他 API 提供商矩阵。
