# 场面模块 · 随机遇敌 + 连续战斗 · 设计草案

**日期**：2026-10-19（Asia/Singapore）  
**范围**：只定规则与边界，**不改游戏代码**。  
**已定前提**：逃跑玩法先不做（因尚无随机遇敌）；场面要补 (1) 危险地更高几率随机敌人 (2) 特殊剧情连续战斗。**用户已定（2026-10-19）**：随机遇敌体验三步——(1) LLM 先写危区让玩家有意识选下一步 (2) 再按几率检遇敌 (3) 命中后 LLM 再写「碰到敌人」才进战；**禁止检中直接开战／无铺垫突然开战**。  
**现状一句话**：战斗几乎全是剧本事件挂死的 F 场合同；`dangerTier` 只抬自由行动难度；敌人总表有条目但无随机池。

---

## 1. 现状对照（对照后才能拍）

| 层 | 现在有什么 | 和本草案的关系 |
|---|---|---|
| **sceneModule** | `beginScene` → 预览/确认/敌方拍 → `closing`；合同经 `meta.hook.eventId/actionId` 挂剧情事件；`sceneCandidate` 只看**当前故事事件动作** | 负责**场内**结算；不负责「何时在大地图抽一场」 |
| **F 场合同** | `f01`…`f05`/`f10`/`f13`（+ `f03-entry`/`f14` 草稿）写死 `parties` + `enemyActions` + 胜负收束 | 今日全部是强制剧情战；连续战只有 F03「逃走 flag → entry 拦路」这种**旗标硬接** |
| **freeAction** | `dangerTiers = safe/guarded/hostile/fortress`，缺省 `safe`；`field.dangerTierShift` 给「逃跑潜行探索」加 DC（0/2/4/6）；`encounter.ts` 是**正典人物初识懒登记**，不是遇敌 | 危险档已落地，但**未驱动遇敌率**；`field` 类默认 kind=`escape` 是潜行/探索票，≠ 战斗逃跑 |
| **locations** | 总表 138 条，仅 **6** 条标了档（fortress×4、hostile×2），其余按默认 safe | 随机遇敌若挂钩档，多数地点仍是「安全」行为，除非补标或另挂区域池 |
| **敌人账 / enemies.json** | 约 25 条，多带 `encounters[{combat, combatId, contract…}]` 指向具体 F 场；无 `dangerTier` / `region` / `randomPool` 字段 | **能当总表抽卡源**，但缺「可随机」元数据；强度仍主要在合同里（dc/轨），种类 id 与合同 party 尚未一一解耦 |
| **UI** | `SceneEncounterCard` = 场内交锋拍，不是世界遇敌提示 | 随机遇敌若要确认窗，属新宿主 UI，不复用该卡语义 |

**缺口摘要**：没有遇敌调度器；没有按档概率配置；敌人总表不能按地池抽；没有一等公民的多场链式合同（只有 flag 接力）；战斗逃跑接口未产品化（用户已搁置实现）。

---

## 2. 目标拆成两块

1. **随机遇敌**：危险地更高几率抽到敌人，进场面模块打一场（生成或选用轻量合同），打完回开世界。  
2. **连续战斗**：剧情特殊节点声明多场链式战，胜负与中间休息可配置，复用现有单场 F 合同能力。

二者都经场面宿主开战；**剧情强制战永远优先于随机遇敌**。

---

## 3. 随机遇敌


### 3.0 遇敌体验三步（必选，用户已定）

**裁定**：随机遇敌是「危区意识 → 掷骰 → 遇敌叙事 → 开战」四拍感觉，**不是**检中瞬间切战斗。玩家必须先看见危区描述并有机会选下一步；检中后还必须先看见「碰到敌人」的叙事，**禁止检中直接 `beginScene`**。

**必选三步**（调度器硬门闩，顺序不可跳；中间可插可选催离）：

| 步 | 谁做 | 内容 | 玩家侧 |
|---|---|---|---|
| **① 危区叙事** | LLM（宿主先发「危区／到地气息」包） | 入非 `safe` 档后，先描述此地危险（气味、声息、尸骸、警戒等；可附可选催离句） | **有意识**选：留下继续／离开／另择他径。未完成①本拍**不检**遇敌 |
| **② 几率检** | 本地调度（§3.2 配置） | 玩家选择留下（或逗留／探索等触发）且①已记账后，才按档 `chance` 掷独立骰流 | 未命中：只保留危区事实，不开战、不写假遇敌 |
| **③ 遇敌叙事 → 开战** | LLM 先写「碰到敌人」→ 场面宿主 | **命中后不得立刻开战**；先出遇敌叙述（何人／何物拦路、距离、杀气），玩家看见后再 `beginScene` | 遇敌叙述可极短，但必须存在且在进战前落定 |

**与先前「危险铺垫」口径的关系**：①＝到地气息／催离（铺垫）；②＝检遇敌；③＝命中后的第二段 LLM 叙述。铺垫仍在检定**之前**；③是检定**之后、开战之前**的硬门闩。

**禁止**：

- 无①危区叙事标记时直接掷②或开战。
- **检中（②命中）直接 `beginScene`**，跳过③遇敌叙事。
- 把①或③折叠进战斗开场白／敌方第一拍（两段叙事都必须在开战前、玩家看得见）。
- 用 toast 一闪代替①／③持久叙事包。
- 剧情强制战绕过本条——强制战仍按 §3.4 优先；**随机路径**一律走本三步。

**状态建议**（设计字段，未实施）：

```text
runtime.encounter:
  foreshadowedAt[{locationId|regionKey}]: { tier, turn }   # ①已完成
  pendingReveal?: { enemyIds[], contractId?, turn }        # ②命中、③未播完；播完才 beginScene
```

### 3.1 触发时机（建议默认集合）

只在**无进行中场面**、且**本拍没有可挂的 required 剧情合同**、且**已完成 §3.0 ①危区叙事**时检查（②）；命中后走③再开战：

| 时机 | 钩在哪 | 说明 |
|---|---|---|
| **移动** | 行旅账位置真正落定之后（`travelLedger` 结算成功） | 换地点一次检一次 |
| **逗留** | 推进游戏钟 / 原地耗时成功之后 | 同一地点多次逗留可反复检（受冷却约束） |
| **探索** | 自由行动 `field` / `scene_act`（探索向）结算成功或「尝试探索」之后 | 与现有「场面」票同路；是否含失败探索要拍板 |

**不做**（首版）：纯对话、给物、亲密等无位移行动；战斗拍内；已在 `engaged` 场面中。

### 3.2 概率与冷却 → 配置，不硬编码

新建配置段（建议挂 `game-numbers` / runtimeTuning 可热改），示意：

```text
encounter:
  enabled: false          # 落地前默认关，拍板数值后再开
  triggers: [travel, linger, explore]
  byTier:
    safe:     { chance: 0.00, cooldownSteps: 0 }
    guarded:  { chance: 0.08, cooldownSteps: 3 }
    hostile:  { chance: 0.22, cooldownSteps: 2 }
    fortress: { chance: 0.35, cooldownSteps: 1 }
  exploreChanceMul: 1.25  # 探索触发相对移动的倍率（可选）
  rngStream: encounter    # 独立骰流，不挪用场面行动/防御骰
```

- 档取自现有 `dangerTierOf(save)`（与 freeAction 同一词表与默认档）。  
- `chance` / `cooldownSteps`（或分钟）**只进配置**；代码只读表。  
- 上表示意为草案数量级，**待拍板**，勿当已定数值。

### 3.3 敌人池：从敌人总表抽

- **唯一种类源**：`mod-kit/entity-catalog/enemies.json`（+ 角色库里标成敌人种类的 id）。  
- 总表需补元数据（设计字段，未实施）：

```text
definition.random:
  eligible: true|false          # 默认可 false：现有剧情专用怪不进池
  dangerTiers: [hostile, …]     # 可出现的地点档
  regions: [nanhuang, …]        # 可选区域/大陆
  weight: number                # 权重
  contractTemplate: id?         # 可选：轻量随机战合同模板
  partyBlueprint: …             # 或：生成单场合同时的 party/dc 蓝图
```

- 抽卡：`eligible && tier∈dangerTiers && region 匹配` → 按 weight 抽 1～N。  
- **禁止**再把敌人名硬写进调度器；合同 `ref` 必须是总表 id。  
- 现状缺口：现行条目几乎都是 F 场挂点、`random` 块不存在；首版要么先标一小撮杂兵可随机，要么随机战暂只用「模板 + 总表 id」生成一次性合同。

### 3.4 与剧情强制战的优先级

严格顺序（高 → 低）：

1. 已有 `activeScene`（继续打，不插随机）。  
2. `sceneCandidate`：当前事件 `required` 合同（含 `requiredFlag` / `consumedFlag` 门闩）— **强制战**。  
3. 其它剧情可选战（若有）。  
4. 随机遇敌检定。  

随机战开出的场面 `meta.scene.kind` 建议标 `random`（或 hook 无 eventId），收束后**不**写剧情事件完成，只写行旅/伤势/战利品账。

### 3.5 失败 / 逃跑接口预留（实现仍搁置）

场面收束 outcome 预留扩展（类型与宿主分支先留洞，**本阶段不实装逃跑键**）：

| outcome / 标志 | 含义 | 本阶段 |
|---|---|---|
| `win` / `lose` / `timeout` | 现有 | 照旧 |
| `flee`（预留） | 战斗中成功脱离 | **不实现 UI/规则**；合同与宿主勿接逃跑按钮 |
| 随机战 `lose` | 建议：重伤回最近安全点 / 或游戏结束 — **待拍** | 可先只接现有 `closing.lose` |

说明：freeAction 的 `field`「逃跑潜行探索」是**战外**票，与战内 `flee` 不是同一条路；用户已定战内逃跑先不做，文档只留接口名，避免日后再拆宿主。

---

## 4. 连续战斗（剧情链式）

### 4.1 合同如何声明

**推荐形态（与现有单场 F 兼容）**：外层「链描述」+ 多份已有/新建单场合同。

```text
chain: {
  id: "combat.chain.xxx",
  battles: [
    { contractId: "combat.fA…", rest?: RestSpec },
    { contractId: "combat.fB…", rest?: RestSpec },
    { contractId: "combat.fC…" }
  ],
  onBattleLose: "abort_chain" | "skip_to_end" | "force_lose_chain",
  onChainWin / onChainLose: 写回剧情 flag / closing（同现 hook.completionSceneByOutcome 口径）
}
```

- 每一场仍是完整 `Contract`（parties、enemyActions、goals、closing），场面模块**不改场内状态机**。  
- 链由宿主编排：`closeScene(win)` → 可选 rest → `beginScene(下一场)`。  
- 剧情挂点：链挂在事件上（`hook.eventId` 指向链 id，或事件动作启动链）；单场合同可继续只被链引用、不直接挂事件。

**对照现状**：`f03` 的 `escapeFlag` + `f03-entry.requiredFlag` 是「逃出后另场」的特例，可视为链的雏形；正式链应用显式 `battles[]`，避免再复制 flag 命名约定。

### 4.2 胜负与中间休息

| 节点 | 建议默认 |
|---|---|
| 单场胜 | 进入 rest（若有）再下一场 |
| 单场负 | 默认整链失败（`abort_chain`）；特殊剧情可 `skip_to_end` |
| 整链胜/负 | 只在最后写剧情 completion / 固定收束叙事 |
| **RestSpec** | 可选：短叙述、清/留状态、部分回轨、禁止开背包等；**数值进配置** |

Rest **不是**新场面合同，只是宿主插一层「链间 UI/账本」；若某段要可操作恢复，再另挂自由行动或短合同（待拍）。

### 4.3 与现有 F 场兼容

- 现有 F01–F05/F10/F13 **原样可打**；链只**引用**其 `meta.id`。  
- 不要求把旧合同改成链节点；新连续战（如突围多波）新建链描述 + 可选新建子合同。  
- `f03`→`f03-entry`：文档建议远期收编为链，**非本草案实施项**。  
- lint：链上每个 `contractId` 必须在注册表；环与空 battles 拒绝。

---

## 5. 和场面模块的边界

| 职责 | 归属 |
|---|---|
| 场内拍、骰、敌方出手、状态、单场 closing | **sceneModule**（现有） |
| 合同 JSON / 注册 / lint | **sceneModule/contracts** |
| 何时检随机、抽池、冷却、优先级门闩、§3.0 ①②③门闩 | **新：遇敌调度**（建议 `scenarioMods/encounter` 或 `sceneModule/host` 旁路，勿塞进 `enemy.ts`）；①／③叙事包由宿主调 LLM，②纯本地 |
| 链编排（多场 begin/close + rest） | **场面宿主**（controller 一层），链描述可读配置/内容包 |
| 地点危险档读写 | **freeAction/dangerTier** + 地点总表（已有） |
| 敌人种类权威 | **enemies.json / 角色库敌人种类** |
| 战内逃跑 | **搁置**；只留 outcome 名 |

**明确不做进 sceneModule 核心**：大地图游荡 AI、无合同的即时结算伤害、把随机逻辑写进 `resolveEnemyPhase`。

---

## 6. 建议落地顺序（供排期，非代码）

1. 拍板 §7 → 定配置键与链 JSON 形。  
2. 敌人总表补 `random` 元数据 + 标一小撮可随机杂兵。  
3. 遇敌调度（关默认）+ **§3.0 三步门闩（危区叙事→检→遇敌叙事→开战）** + 优先级测试。  
4. 随机战合同模板（或生成器）接场面宿主。  
5. 链式宿主 + 一篇样板链（可用现有两场合同串）。  
6. （更后）战内逃跑、地点档大面积补标。

---

## 7. 待拍板清单

1. **触发集合**：首版是否三者都开（移动 / 逗留 / 探索）？探索是「成功才检」还是「出票就检」？  
1b. **三步体验细节**（主流程已定，仅细化）：①催离是否默认开？①冷却／同地重入是否重铺？①／③文案按档还是按地点／敌种？③最短长度与是否可跳过二次确认？  
2. **四档 chance / 冷却默认值**（上表只是量级）以及 `enabled` 默认是否保持 false 直到数值拍定。  
3. **敌人池字段**：是否采纳 `definition.random.{eligible,dangerTiers,regions,weight}`？随机战用「固定模板合同填 party」还是「按蓝图生成一次性合同」？  
4. **随机战失败后果**：回最近 `safe` 点 / 重伤就地 / 走现有败战结尾 — 选哪条？  
5. **链式声明形态**：外层 `chain.battles[]`（推荐）vs 仅在合同 `hook` 上写 `nextContractId`？单场失败默认整链失败是否成立？  
6. **地点标档策略**：随机遇敌上线前，是否要求南荒危险区补齐 `dangerTier`，还是允许「未标=safe=零遇敌」过渡？

---

## 8. 非目标（本草案明确排除）

- 实现战斗逃跑与逃跑成功率。  
- 改现有 F 场数值或重写 F03 flag 接力。  
- 把 `freeAction/encounter.ts`（人物初识）改成遇敌模块。  
- 本文件之外的代码/配置提交。
