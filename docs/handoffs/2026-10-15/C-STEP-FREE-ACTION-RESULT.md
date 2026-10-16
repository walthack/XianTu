# C 步：自由行动票据系统（实施结果）

日期 2026-10-16。设计稿 `FREE-ACTION-TICKET-PLAN.md`；本步实施 P1–P4 的代码部分。裁定见 `CANON-DECISIONS.md` #221。
冻结文件 `runtime.ts`、`AIBidirectionalSystem.ts` 未改（改动前后 sha256 一致）。

## 数据流

```
玩家自由输入（试玩范围存档，非按钮、非场面）
 └ intent 调用（同一次，不加请求）→ tickets[]（naturalIntentRouter）
     校验（freeAction/ticket.ts）：类/变体白名单且启用、目标在 readLocalMemoryCapsule 的在场名单、performed=yes、
     原话连续子串、itemId 在背包名单、每个目标至多一张（留好感基础点绝对值最大者）。只在 kind==='free' 时收票。
 └ 界面 MainGamePanel（两步，逻辑都在 freeAction/turn.ts）
     1. issueFreeActionJudgement：判定类（physical/verbal/cast）先过闸门 → 签发待确认判定，票写进 authorityReceipt
        （kind:'free_action_judgement'），闸门不过 → “未发生”事实块（零写入）
     2. （备份“上次对话”之后）settleFreeActionTurn：判定确认回合从回执取票（不重跑 intent）；不掷骰的票（intimate/give）当场结算
 └ settleFreeAction（freeAction/settle.ts）：闸门 → 算好全部结果 → 一次写：好感（±15、上限只限向上、每人每回合一次）、
     记忆（轻记忆 + |Δ|≥10 的大事 episode）、物品、状态、冷却/预算、玩家可见 grant、幂等键
 └ 事实块拼进 finalUserMessage → 叙事模型只演这些；被作用者排进前 maxCards 张角色卡（legacyNarratorPacket），
     大事 episode 进“相关重大事件”（npcCardLayer）
```

## 6 类 / 变体（全部来自 `game-numbers.qingyu.json: freeAction.classes`，代码不认变体名）

| 类 | 变体 | 路由 | 结算 |
|---|---|---|---|
| physical | attack、grab；bind（`enabled:false`） | judge（战斗，含境界差因子） | NPC 侧事实档 block/graze/wound/subdue；受保护者封顶 wound；grab 一拍压制不留状态 |
| verbal | taunt、threaten、deceive | judge（social / scheme，无境界差） | landed/rebuffed、deceived/seen_through，好感降 |
| intimate | flirt、kiss、invite | table（不掷骰） | 好感档 × 阶段门 × 气质 → 反应 accept…strike_back（`entity-ledger/npc-profiles.json`，现为空，缺省 reserved + 亲厚档门） |
| give | gift、feed_pill（喂药/下毒共用） | table | gift：玩家 −1、NPC `背包.物品` +1；feed_pill：物品效果标签决定（毒性→中毒；sedative→onUse；解除类→解除） |
| cast | transfer_qi、heal、bandage | judge（craft，无境界差） | 传功只涨 `境界.当前进度`；疗伤/包扎按物品标签解除状态（dying→改挂 wound.severe） |
| other | none | — | 不结算 |

## 新增配置键与 id

- `freeAction.*`（`enabled` 缺省 true；`actionClasses`、`degrees`、`ticket`、`affinity`、`degreeFactor`、`lethalAllowed:false`、`memory`、`state`、`judgement.bands`、`outcomeFactors`、`classes`）；`status.itemTags.sedative`。lifeFloor 沿用 `status.lifeFloor.ratio`，freeAction 下不另设。
- 内容包 `texts.json` 新增 110 条：`free.fact.<变体>.<结果>`、`free.fact.gate.<原因>`、`free.fact.protected`、`free.memory.<变体>.<结果>`、`free.why`、`free.stakes.<类>.<档>`。
- 物品：假死药 `lyl.item.np053`/`np056`、六识禁绝丹 `lyg.item.np071` 标 `effectTags:[sedative]` + `onUse`。
- 尸鬼合并：`lcq.enemy.altar_corpse` 为规范 id，`lcq.enemy.male_corpse` 作 `idAliases`（总表、时点表）与 `migratedFrom`（敌人目录）；总表 `baseStats` `level:null`、`combatStrength:3`。
- 判定回执种类 `free_action_judgement`（`judgementEngine.ts`）。

## 真模型小样本（MiniMax-M2.7-highspeed，经 mmx；30 句，标注由实施者自写，非独立标注）

用路由现算的真实 intent 提示。首轮 26/30，暴露四类问题并已修：`itemId:"null"`（字符串）整张作废；“下毒”被误报成欺骗（喂药变体标签改“喂药/下毒”）；多目标证据拼接（提示词要求逐字摘自原话）；同一人报多张时丢了更重的那张（改留分量最重者）。修后重跑 30/30 命中，13 句负例（问句/假设/转述/否定/闲聊/不可能/不在场）零误出票。样本小、单次、模型非确定，不能当放行门槛；原计划的 60 句独立标注仍未做。

## 没做 / 与设计稿的差异

- 没有在浏览器真机跑 `MainGamePanel.vue` 新接线（只做了脚本块类型检查，新增 0 个错误；编排逻辑由 `freeActionTurn`/`freeActionPipeline` 测试覆盖）。
- 区域刷新、动态等级偏移不做（用户裁定）。`bind` 默认关闭、状态目录无“行动受限”。
- 物品里没有任何 `heal`/`hemostatic`/`splint` 标签物品（山草药按裁定不标），疗伤/包扎结构已测（注入物品效果），真实游戏里暂时无物可用。
- 王哲、段强在时点级数表里没有行（表从第 30 章起），打他们的境界差因子为 0 并在判定卡上标“无级数数据，按同级”。
- 配置体检（`validateFreeActionConfig`/`validateFreeActionTexts`）以单测形式随 `canon:build` 跑，没并进 `scripts/content-packs.mjs`。
- 未同步 NAS 镜像（`character-canon/` 的 NAS 路径仓库里没有记载）。
