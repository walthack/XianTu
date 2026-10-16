# 物品效果标签候选清单（待用户逐条裁定）

日期 2026-10-16。数据来源：`mod-kit/entity-catalog/items.json`（310 条；`definition.type`：other 136 / material 72 / consumable 54 / weapon 41 / armor 7）。
**这份只是候选清单：没有改 `items.json`，没有批量标。** 勾选后再由人（或另一轮带裁定簿条目的任务）落标。

## 原则（用户 2026-10-16 裁定）

- 自由行动**只读物品的 `effectTags` / `onUse`**；代码里不认具体物品名或 id。没有标签的物品，自由行动一律按「未发生」处理。
- 山草药（`lcq.item.nh_mountain_herb`）**不标疗伤药**。
- 合规相关药物**按原著只标记，不改写**（见下文「合规相关」一节；清单内条目是有意偏离原著或需保留原著的，不当问题报告）。
- 标签落在 `definition`；`poison` 类必须同时有 `onUse`（`scripts/validate-entity-catalog.mjs:28`）；`effectTags` 为非空且不重复的数组，没有效果就整个字段省略。

## 现有标签词汇与消费方

物品标签必须是状态目录 `src/modules/sceneModule/contracts/statuses.json` 里某个状态 `remove` 规则（`kind: item`）引用过的 `ref`，或毒性/镇静标签（`game-numbers.qingyu.json: status.itemTags`）：

| 标签 | 谁用 | 对应状态 / 变体 |
|---|---|---|
| `heal` | 疗伤变体（`itemTag: heal`） | 失血、重伤、神魂受创、濒死（降为重伤）、外伤、单臂乏力、腿脚难行 |
| `hemostatic`、`splint` | 包扎变体（`itemTags`） | 流血、骨折 |
| `antidote` | 疗伤/喂药（解除类） | 昏迷、中毒、麻痹 |
| `sober` / `unseal` / `repair` | 状态目录已有，自由行动暂无对应变体 | 醉酒 / 被点穴 / 刀损、卷刃 |
| `poison` | 喂药/下毒（毒性） | 需 `onUse` 指向 `poisoned` 等 |
| `sedative` | 喂药（镇静） | 需 `onUse` 指向状态 |
| 补益类 | **目前没有这个标签**；状态目录里的虚弱 `weak.body`、疲惫 `fatigue.weary`、心神耗竭 `fatigue.mental` 的 `remove` 规则里都没有引用物品标签 | 要先定标签名与效果（见「需裁定」） |

> 注：用户任务里写的 `bandage` 是**变体名**，物品上对应的标签是 `hemostatic` / `splint`。

## 已有标签的物品（7 条，仅供对照）

| id | 名称 | 类型 | 现有标签 | onUse |
|---|---|---|---|---|
| `lcq.item.np013` | 朱箓蛇丹 | consumable | antidote | — |
| `lcq.item.np016` | 朱箓蛇丹 | consumable | antidote | — |
| `lyg.item.np049` | 驱毒丸（改良版） | consumable | antidote | — |
| `lyg.item.np071` | 六识禁绝丹 | consumable | sedative | 5 项感官状态 + `mind.confused` |
| `lyg.item.np092` | 六拂化清散 | consumable | poison | `poisoned` ×1 |
| `lyl.item.np053` | 假死药 | consumable | sedative | `unconscious` |
| `lyl.item.np056` | 假死药 | consumable | sedative | `unconscious` |

## 候选（按物品类型）

置信度：高 = 名称与描述直指该用途；中 = 描述有提示但原文用途不全；低 = 仅字面联想，**需查原著再定**。

### consumable（54 条里的药物/可入口物）

| id | 名称 | 现有标签 | 候选标签 | 置信 | 依据 / 备注 |
|---|---|---|---|---|---|
| `lyg.item.np117` | 九华丹 | 无 | 补益类（待定名） | 中 | 「强行提升修为」；若标，要有副作用/限制的设定，别直接给进度 |
| `lcq.item.nh_goose_palm_mushroom` | 鹅掌菌 | 无 | poison 或 无 | 低 | 仅「蕈盖狭长、色泽淡红的蘑菇」，是否有毒原文未给；**未核实，别标** |
| `lcq.item.nh_wild_honey` | 竹筒野蜂蜜 | 无 | 补益类（待定名） | 低 | 食物；等补益机制确定后再看 |
| `lcq.item.nh_bean_bun` / `nh_dried_fish` / `nh_huamiao_flatbread` / `nh_orange` / `nh_wild_fruit` / `nh_tea_brick_corner` / `nh_feed_cake` | 豆沙包 / 碧鲮鱼干 / 花苗烙饼 / 橘子 / 野果 / 茶饼一角 / 料饼 | 无 | 不建议标 | — | 纯食物，当前没有饥饿/进食状态；料饼是牲口饲料 |
| `lcq.item.nh_mountain_herb` | 山草药 | 无 | **不标**（裁定） | — | 描述「捣碎了能敷伤口」，但用户裁定不标疗伤药 |
| `lcq.item.nh_candle_stub` / `nh_cattail_smoke` / `nh_torch` | 残烛 / 蒲棒 / 火把 | 无 | 不适用 | — | 照明/烟雾，非药物 |

consumable 里其余条目（紫水晶戒指、电击棒、传送石、遗信、纸符、令箭、阴阳鱼、水晶念珠、魂丹、人物/宠物条目等）不是药物，**不在本清单范围**。

### other（136 条里的药物/毒物/救治相关）

| id | 名称 | 现有标签 | 候选标签 | 置信 | 依据 / 备注 |
|---|---|---|---|---|---|
| `lyg.item.np030`、`lyg.item.np031` | 赤阳圣果 | 无 | heal | 中 | 「卢景拒绝服用以疗伤，称其可救命」；原文没写效果机理。`np031` 在 `lyg.changgan_begins` 变体里叫「摄像机」（见下「id 复用」） |
| `lyl.item.np021` | 赤阳圣果（假货，老萝卜） | 无 | **不标** | — | 描述写明是假货 |
| `liuchao.item.ghost_fang` | 鬼牙 | 无 | poison | 低 | 「与寒毒有关」；状态目录有 `poison.cold`（寒毒）/ `poison.cold.suppressed`，但鬼牙是否能用来下毒、挂哪个，描述不够，需设定 |
| `lcq.item.nh_realgar_sachet` | 雄黄避蛊香囊 | 无 | 无合适标签 | 低 | 防蛊/避蛊，状态目录里没有防蛊类状态 |
| `lcq.item.s05b_spiral_needle` | 螺旋长针 | 无 | 不标 | — | 「解除控制」是剧情节点道具 |

### material（72 条）

| id | 名称 | 现有标签 | 候选标签 | 置信 | 依据 / 备注 |
|---|---|---|---|---|---|
| `lcq.item.nh_ghostface_stinger` | 鬼面蜂尾针 | 无 | poison | 低 | 蜂尾针字面联想；描述只有外形，无毒性说明，**别标** |
| `lcq.item.nh_tube_skirt_cloth` | 筒裙布头 | 无 | hemostatic | 低 | 一截布，字面可作包扎材料；原文没有这种用法，**别标** |

material 里其余条目按关键词（药/丹/散/毒/草/针/布/酒等）扫描后没有命中药物；这是关键词扫描，不是逐条人工审读。other、weapon 同口径。

### weapon（41 条）

| id | 名称 | 现有标签 | 候选标签 | 置信 | 依据 / 备注 |
|---|---|---|---|---|---|
| `lyg.item.np127` | 空心针 | 无 | heal 或 无 | 低 | 「用于输血」；`wound.blood_loss`（失血）可被 heal 解除，但一根针算不算「疗伤物」要设定；类型是 weapon 也不合适，建议先改分类再谈（本清单不改） |
| `lyg.item.np003` | 成光魂丹 | 无 | 不标 | — | 控制生死的剧情物，类型被归为 weapon |

armor（7 条）：无候选。

## 合规相关药物（按原著只标记，不改写，不建议自动打标签）

下列条目的描述涉及成年角色的催情/致幻用药场景。按 `docs/COMPLIANCE-REQUIREMENTS.md` 与 2026-10-04 裁定：**成人内容不做处理、不软化；这里只标记存在，不改描述、不新增标签**。若要给它们挂效果，必须先由用户单独裁定（含对象均为成年、不可玩化强迫内容的硬线）。

| id | 名称 | 类型 |
|---|---|---|
| `lcq.item.np005`、`lcq.item.np006` | 麻古 | consumable |
| `lcq.item.drug` | 摇头丸 | other |
| `lyg.item.np026` | 慎恤胶 | consumable |
| `lyg.item.np065` | 薄荷油伪称催情露 | other |
| `lyl.item.np015` | 药丸（殇侯制） | consumable |
| `lyl.item.np070`、`lyl.item.np085` | 春药 | consumable |
| `lyl.item.np082`、`lyl.item.np097` | 仙草叶片（催情作用） | other |

## 需要用户裁定 / 注意

1. **id 复用（已核实）**：`definition` 与 `stageVariants` 的名称有时不一致——同一个 id 在某些关卡里指另一件东西。已有标签的三条受影响：
   - `lyg.item.np049`（驱毒丸）在 `lyg.changgan_begins` 变体里叫「手提箱」；
   - `lyg.item.np071`（六识禁绝丹）在 `lyg.changgan_begins` 变体里叫「空心针」；
   - `lyl.item.np053`（假死药）在 `lyl.luoyang_coup` 变体里叫「求子仙符（假）」。
   `src/modules/scenarioMods/freeAction/itemUse.ts` 取 `definition`，**不看关卡变体**（注释写「同一件物品在各关卡里的效果标签不变」）。如果玩家在上述关卡里背包里的这个 id 其实是别的物品，会被当成药。是否要让 `itemEffectOf` 带 stageId，或在目录里拆 id，需要你定。本轮没改。
   > **后续（2026-10-16，见 CANON-DECISIONS #225 与 `POLYSEMY-SPLIT-MAP.md`）：已拆 id。** 三处错位引用已分别改指 `lyg.item.np107`（手提箱）、`lyg.item.np127`（空心针）、`lyl.item.np050`（求子仙符（假）），三个带标签 id 不再有变体；校验禁止变体改名／改类型。另有 4 行因改指会扩大标签覆盖而暂缓（含六识禁绝丹同名的 `np016`／`np025`／`np068` 变体——它们在变体里确实叫「六识禁绝丹」，上面第 2 点只看了 `definition`，漏了变体），待裁定。
2. **同名 id 校正**：诊断文档 `_newbot_tmp/claude_1016_answer.md` 的物品表里写「六识禁绝丹的不带标签同名 id：`lyg.item.np016`/`np025`/`np068`」「朱箓蛇丹：`lcq.item.np007`」——**与目录不符**：这四个 id 实际是武穆秘籍 / 同心结（情趣用品）/ 布都御魂 / 龙睛玉，不是同名药。目录里六识禁绝丹只有 `lyg.item.np071` 一条。
3. **补益类**：要不要做、标签叫什么（如 `tonic`）、对应什么状态/效果，目前都没有；没有就没有「补益」可标。
4. **疗伤/包扎物**：目录里没有任何 `heal` / `hemostatic` / `splint` 标签物品。需要的话，得先在原著依据下确定哪些物品算（本清单只找到赤阳圣果一条中置信候选），或新增物品条目（新增须走裁定簿）。
5. 落标流程提醒：改 `items.json` 属于 canon 数据，先读 `CANON-DECISIONS.md`，在同一 commit 追加裁定条目；跑 `npm run canon:build`（`validate-entity-catalog.mjs` 会校验标签词汇与 `onUse`）。
