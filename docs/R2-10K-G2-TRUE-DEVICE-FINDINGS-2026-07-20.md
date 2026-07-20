# R2-10K G2 真机首轮发现与修复交接

- 日期：2026-07-20
- 执行：Claude（真机 Playwright + 真实模型）
- ⚠️ 更正（2026-07-20 晚，见 `docs/R2-10M-G2-REVERIFY-2026-07-20.md` §4）：本轮主叙事模型实为 OpenRouter 上的 `deepseek/deepseek-v3.2`，**不是** MiniMax-M2.7。驱动器经 localStorage 注入的 MiniMax 配置被后端权威配置覆盖，只生效在次级功能位。状态层结论不受影响。
- 上游门禁定义：`docs/R2-10B-NPC-DECISION-CORE-TRUE-DEVICE-ACCEPTANCE-2026-07-19.md`
- 范围：`lyg.dingtao_beijing` / `lyg.event.s01_05` 三路线（用户裁定，不含 s01_06–08 与跨书）
- 代码状态：**本轮未改任何生产代码**。修复交由 Codex 认领。

## 0. 一句话

**状态层三路线全部通过；文本层没有发现真实正典泄漏，真正的缺陷方向相反——门禁过严，在主角最自然的商贸语域里持续误杀正文并降级成罐头。**

---

## 1. 状态层结果（PASS）

同源基准记录 `inputHash=397471a3`，三条路线各自从该记录恢复。

| 路线 | worldTurn | s01_05 | 场外 | 权限 | 回执 |
|---|---:|---|---|---|---|
| R1 诏令 | 11 | 亲历 done | — | `permission.lyg.jia_wenhe.exchange_judgement` ×1 | `first_edict:participated` ×1 |
| R2 入宫 | 7 | 亲历 done | — | `permission.lyg.huo_zimeng.trusted_intelligence` ×1 | `court_entry:participated` ×1 |
| R3 不介入 | 11 | 未 done | `s01_05` | **0** | `offscreen` ×1 |

权限 key 与 R2-10B §3 逐字吻合，全程幂等未重复授予。R3 场外回执明写「未伪记为玩家亲历」。

附带验到 R2-10G 合同：首次跑偏时机会卡在 `trackedAtTurn=1 → resolvedAtTurn=7` 精确按六回合上限 `expired`，世界改走场外结算——引擎行为正确。

---

## 2. 缺陷 1（主修）：数量门禁误杀商贸语言

**归因证据**（真机 console，非推读）：

```
[叙事硬门禁] 非分步重试仍违规，已丢弃正文与伴随指令：
  [硬门禁：正文补造了具体兵力数字、军事距离或比例]
```

触发输入是无害日常动作「出门在市集上转转，打听些无关朝局的闲事」，连退两稿后降级为 71 字罐头。

**离线复现**：7 句普通市集/商贸句子，4 句被误杀。

| 句子 | 现状 |
|---|---|
| 市集上摊贩喊价，程宗扬还到**抽两成**利便成交 | ✖ 误杀 |
| 这批绢帛按市价**折了三成**，掌柜的仍不肯松口 | ✖ 误杀 |
| 东市往西**三坊**便是米行，**路线**程宗扬还算熟 | ✖ 误杀 |
| 粮价较上月**增了三成**，米行门前排起长队 | ✖ 误杀 |
| 沿着长街走了百步，两侧尽是叫卖的摊子 | ✔ |
| 茶肆里坐了十几人，说的都是些市井闲话 | ✔ |
| 他在城里转了半日，买了两匹布 | ✔ |

**根因**：`src/modules/scenarioMods/narrativePerformanceGuard.ts:23-26`

```ts
const DISTANCE_QUANTITY = new RegExp(`${QUANTITY_NUMBER}\\s*(?:步|尺|里|坊)`);
const RATIO_QUANTITY    = new RegExp(`${QUANTITY_NUMBER}\\s*成`);
const DISTANCE_CONTEXT  = /距离|相隔|开外|以内|界碑|宫门|布置|驻扎|列阵|行军|路线|要道/;
const RATIO_CONTEXT     = /增|减|税|比例|折|抽|征|份额/;
```

- `RATIO_CONTEXT` 想抓的是 R2-10B §5 的真实泄漏样本「增税三成」，但 `增|减|折|抽|份额` 与**商贸讨价还价完全同形**。主角是程氏商会当家，做生意是这个角色最自然的语域，门禁等于在主场持续误杀。
- `坊` 是**市集坊市单位**，却被放进军事距离表；配上 `路线` 即触发。

**建议修法**（Codex 自行裁量）：
- `RATIO_CONTEXT` 收紧到治理/军事语境，如 `税|赋|军饷|征发|徭役|军需`，移除裸的 `增|减|折|抽|份额`
- `坊` 从 `DISTANCE_QUANTITY` 移除

**验收**：先写失败测试再改代码。
- 应放行：上表 4 句商贸误杀样本
- 仍须拦截：`增税三成`、`三百甲士`、`宫门三十步`、`八校尉`、`两队人马驻守宫门`

---

## 3. 缺陷 2：`有无` 不在疑问词表

`CONTEXTUAL_FORBIDDEN_TERMS = {暗道, 伏兵, 暗桩, 魂丹}` 的设计意图是「提及不算泄漏，坐实才算」，由 `HYPOTHETICAL_CONTEXT` 放行疑问式。但该表缺 `有无`：

| 句子 | 现状 |
|---|---|
| 探查宫道两侧**是否有**伏兵 | ✔ 放行 |
| 探查宫道两侧**有无**伏兵 | ✖ 误杀 |
| 探查宫中**是否有**暗道 | ✔ 放行 |
| 探查宫中**有无**暗道 | ✖ 误杀 |
| 查明宫道两侧**确有**伏兵 | ✖ 拦截（正确） |

**修法**：`HYPOTHETICAL_CONTEXT`（同文件 :30）补 `有无|有没有`。

**注意**：本条与第 2 节的降级**无关**，是独立的第二处误杀面，别混为一谈。

---

## 4. 缺陷 3（数据层）：`黑魔海` 在 s01_05 禁名单设错

`lyg.event.s01_05` 的 `decisionCore.narrativeGuard.forbiddenTerms` 把 `黑魔海` 列为绝对禁词。但本关数据本身证明程宗扬此时早已知情：

- 程宗扬 `canon.characters[].profile.memories` 两条直接点名黑魔海（鸦人尸体推出黑魔海与鬼王峒勾结；分析黑魔海经林娘子渗透禁军）
- `lyg.event.debut_qiyuxian`（该事件在开局 `activeEventIds` 中）写明漆雨仙「初始身份：黑魔海剑玉姬麾下得力干将，**程宗扬旧识**」
- `lyg.event.debut_chengguang`：程宗扬赴过黑魔海请柬之宴
- 黑魔海是本关 `canon.factions` 的正式势力

真正的秘密是 s01_08 的「**盛姬是黑魔海御姬奴**」这一关联，不是组织名本身。

**修法**：`黑魔海` 移出 `forbiddenTerms`，改为 `forbiddenAssociations` 规则（该机制已存在且已执法，参考同事件的郭解/董卓死亡规则）：

```json
{ "subjects": ["盛姬"], "predicates": ["黑魔海", "御姬奴", "乳母"], "maxDistance": 48 }
```

`盛姬` 本身**保持绝对禁词**——见第 6 节，她的名字即线索。

---

## 5. 撤回项：行动选项不过 narrativeGuard

真机首轮曾判定「行动选项完全不过正典门禁」为 P0，**现撤回该定性**。

结构事实成立：`sanitizeActionOptionsForDisplay`（`src/utils/AIBidirectionalSystem.ts:406`）只做通用显示清洗 + POV 守卫（裁定 #14），不调用 `forbiddenTerms` / `forbiddenAssociations` / `rejectConcreteQuantities`；两处门禁调用点（:1129 分步、:1325 非分步）入参都只是正文。选项仅在正文硬违规时被连带丢弃，从不被单独检查。

但**三条「泄漏」实例经查全部是上述误报**：
- 「探查……有无伏兵」→ 缺陷 2
- 「试探黑魔海下一步动作」「以防黑魔海中途作梗」→ 缺陷 3

**结论：本项无已证实危害，且在缺陷 1/2/3 修复前不得给选项加门禁**——现在把这套规则套上去只会把误杀面从正文扩大到选项。修完后再评估是否补，并需先有真实泄漏样本作依据。

---

## 6. 待用户裁定：盛姬无正典档

`lyg.event.s01_08`（R2-10C 的 `emergent` 知识事件）全部围绕盛姬构建——事件名、描述、axisBeat、议程目标、`knowledgeFacts`、机会卡、`canonPolicy.invariant`。但：

- `canon.characters` 命中 **0**；全 character-canon 库、别名注册表（`alias-registry-v2.json` / `character-alias-registry.json`）均无她的角色记录
- 她只以名字形式存在于 beat 字符串中

她**不是 LLM 捏造**，有原著锚点，且抽取层已有足够素材建档：

| 来源 | 内容 |
|---|---|
| 云龙吟 `extraction/batch-037.json`（#263） | 关系字段直写「盛姬，relation=乳母，evidence=盛姬乳养定陶王」；参与「程宗扬郊迎定陶王入京」 |
| 云龙吟 #313「玉牒」 | 小紫将盛姬投入光柱（结局） |
| 燕歌行 `extraction/batch-003.json`（#8「抑君」） | 「程宗扬惊觉盛姬是黑魔海御姬奴」；factions=黑魔海/程氏商会/汉朝廷 |
| **MiniMax 重抽草稿** `minimax-m2.7/trilogy-reextract-2026-07-16/yange.reextract.DRAFT.json`（#9「作嫁」） | 最完整：「定陶王刘欣自幼被黑魔海御姬奴盛姬抚养，剑玉姬通过盛姬暗中控制这位未来的天子，程宗扬愤怒却未下手，决定自己抚养定陶王以抵消黑魔海影响」 |

拼合画像：**盛姬 —— 黑魔海御姬奴，定陶王刘欣的乳母，自幼抚养他；剑玉姬安插她作为黑魔海操控未来天子的暗线。**关系：刘欣（乳母）、剑玉姬（上线）、阮香凝（揭破者）、赵飞燕（同为养育者）。

**未决**：最完整那份在 `*.DRAFT.json`（MiniMax 重抽，尚未合并进正典）。用它建档等于把该批草稿的一部分转正，属正典裁定，需用户拍板后再动，并同 commit 追加 `CANON-DECISIONS.md` 条目。

---

## 7. 复现与工具

真机基建（scratchpad，未入库；如需长期保留请移入 `scripts/`）：

- `g2-route.mjs` — 从基准恢复 → 走一条路线 → 逐轮抓正文/行动选项/console → 落结果快照
  `node g2-route.mjs --route R1|R2|R3 --turns 8 [--headed]`
- `g2-scan.mjs` — 用**生产门禁函数** `validateNarrativePerformance` 分别扫正文与每条行动选项
- 基准记录：`.xiantu-server/save-storage/g2-base-char-1784520123354.json`
- 结果快照：`g2-{r1,r2,r3}-result-char_1784520123354.json`
- 后端原始状态备份：`.xiantu-server/g2-backup-20260720-115645/`

两个踩坑（写新驱动时注意）：
1. **回合落定判据必须等输入框恢复**（R2-10B §1 已写明）。只看后端存档叙事增长会早触发——后端先落盘，UI 还在跑记忆总结/对账等二次 LLM，此时 `textarea` 仍 `disabled`，下一轮 `fill` 直接超时。
2. **R1/R2 首轮输入必须用机会卡自带的 `actionText`**。泛泛的「去见某人」不会触发完成命令，机会卡会在六回合上限到点 `expired`，路线静默退化成场外结算。

---

## 8. Codex 修复状态（2026-07-20）

- 缺陷 1 已修：比例语境收紧为税赋／军需，`坊` 仅在军事语境下按距离拦截；四句商贸样本放行，军事反例继续拦截。
- 缺陷 2 已修：补 `有无(?!数)|有没有`，既放行疑问，也避免把“有无数伏兵”误当疑问。
- 缺陷 3 已修：`s01_05` 移除 `黑魔海` 绝对禁词；`盛姬` 与既有 `forbiddenAssociations` 仍保持未揭露关系门禁。
- 缺卡问题已扩为三书结构化审计：发现并补回萨安／朱诺／弥骨三张硬缺卡，另列 19 名高置信抽取层候选。报告=`docs/R2-10L-MISSING-LOAD-BEARING-CHARACTER-AUDIT-2026-07-20.md`。

## 9. 门禁状态

- R2-10B 总项**保持 `[~]`**。三处缺陷已修，但仍须按第 7 节重跑三路线后才可放行。
- 缺陷 1/2 属生产代码，缺陷 3 属模组数据，第 6 节属正典裁定——建议分三个 commit。
- 修复后需重跑本文件第 7 节的三路线，确认降级率下降且状态层结果不变。
