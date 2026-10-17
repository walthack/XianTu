# 功法效果标签与加成统一（2026-10-17）

依据：`_newbot_tmp/claude_1016q_answer.md`（调研），用户 2026-10-17 的裁定（见 CANON-DECISIONS #229）。
标「已查」的是读代码/数据得到的，标「推断」的是判断。

## 落地内容

| 项 | 位置 |
|---|---|
| 效果标签词表（每个标签标 activation） | `mod-kit/entity-catalog/effect-tags.json` |
| 共用校验规则（目录脚本与 mod 校验器共用） | `src/modules/scenarioMods/effectTags.ts` |
| 目录校验 | `scripts/validate-entity-catalog.mjs`：`auditEffectVocabulary`（词表与状态目录/配置对账）、`auditItemEffects(errors, table, kind)`（kind=`item`/`technique`） |
| 类型 | `schema/content.ts`：`activation`、`effectTags`、`bonus`、`allowMultiEquip`；`techniqueEffects` 与 `ScenarioModTechniqueEffects` 已删 |
| 数据 | `techniques.json` 67 条（含 5 条关卡变体）`techniqueEffects → bonus`，加 `activation: "active"`；数值未动 |
| 配置 | `game-numbers.qingyu.json` 新增 `techniques`（`allowMultiEquipDefault`、`applyBonusToAttributes`、`cultivationSpeedBonus.semantics`） |
| 运行时 | `utils/attributeCalculation.ts`：新增 `calculateEquippedBonuses`，`calculateFinalAttributes` 改读它 |
| 测试 | 新增 `tests/techniqueEffectTags.test.mjs`；改 `tests/statusEffects.test.mjs` |

### activation 三值

- `consumable`：使用即生效。道具 `type=consumable` 推出此值。
- `equipped`：装备期间生效。道具 `type=weapon/armor` 推出此值。
- `active`：功法运行期间生效。功法目录必填此值。存档里 `已装备=true` 即视为修炼中（`修炼中` 是旧字段）。
- 道具的 `activation` 字段可省，填了必须与类型一致；`material/other` 没有生效方式，不能带 `effectTags`。

### 词表

10 个标签：`heal hemostatic splint antidote sober unseal repair detox poison sedative`，**全部只适用 `consumable`**。
- 调研文档写的是 9 个，漏了 `detox`：它来自内容包 `qingyu` 的 `addiction` 状态（`src/modules/contentPacks/packs/qingyu/statuses.json` 的 `remove` 规则，已查）。旧校验器把内容包状态也算进词表，所以这是文档漏记，不是新增。
- 词表里没有适用 `equipped`/`active` 的标签：状态目录没有 buff 类状态，现有标签都是「解除某状态」。所以**没有任何功法被打标签**，这是现状决定的，不是遗漏。
- 对账：状态目录 `remove` 规则引用的 item 标签、`status.itemTags` 必须在词表里；适用 `consumable` 的标签必须被它们引用，否则 canon:build 报错。

### 带「双修」「采补」「鼎炉」「夺元」的功法

用户已拍板：按普通功法处理。`validation.config.json` 的 `techniqueTags.complianceUntaggedWords`、校验器里的 C02 检查与 `complianceMarkedTechniques` 都已删除；不改这 6 条功法正文（名称+描述命中的 id：`liuchao.technique.tai_yi_jing`、`lyg.technique.np050`、`lyl.technique.np056`、`np059`、`np060`、`np063`）。它们目前和其余功法一样没有效果标签（词表里没有适用 `active` 的标签），校验通过，无需补标签。

### allowMultiEquip

- 目录字段，缺省取 `game-numbers.techniques.allowMultiEquipDefault`（初值 `false`）。目录里没有任何功法写它。
- 目录→存档：`relationships.ts` 把有效值为 true 的功法写成存档字段 `允许多部装备: true`；`calculateTechniqueBonuses` 仍只取第一部已装备功法，带此标记的可叠加。
- **装备动作本身还是「装新卸旧」**（`stores/characterStore.ts` 的装备逻辑，没动），所以这个开关目前只影响加成读取，不影响能不能同时装两部。

## 修炼速度加成：口径冲突

同一个字段名 `修炼速度加成`，代码里至少三种读法（已查，逐处读过）：

| 位置 | 读法 | 0.56 显示/计算为 |
|---|---|---|
| `components/dashboard/SkillsPanel.vue:359-360` | 乘数：`基础 × 品质 × (加成 \|\| 1)` | ×0.56（变慢） |
| `components/dashboard/CharacterDetailsPanel.vue:279` | 增量比例：`加成 × 100%` | +56% |
| `components/common/DeepCultivationModal.vue:41` | 乘数：`(加成 − 1) × 100%` | −44% |

另有同名但不是同一个字段：`types/game.d.ts:1302` 的 `SixSiBonus.修炼速度加成`（百分比 0–100，六司推算结果）和 `utils/sixSiManager.ts:281` 的 `InternalSixSiBonus.修炼速度加成`，与功法效果无关，只是撞名。

**选定：增量比例**（0.56 = 修炼速度 +56%），写在 `game-numbers.techniques.cultivationSpeedBonus.semantics = "fraction_increment"`。理由（推断）：目录里 67 条数值是 0.08–0.56，由 `fill-content-mechanics.mjs` 按 `Math.round(r*8)/100` 生成，只有当增量讲得通；`CharacterDetailsPanel` 也是这个读法。
**没改运行时**：上面 `SkillsPanel`、`DeepCultivationModal` 两处仍是乘数读法，与选定口径不一致，要改请用户确认。不改的原因：存档里还有 AI 生成的功法（提示词只说「包含修炼速度加成」，没写口径），它们的数值口径无法确定。

## 运行时读取入口

- 已查：`calculateTechniqueBonuses` 原来**没有任何调用方**（全仓 grep），功法的属性加成从未进入最终六司。
- 现在：`calculateEquippedBonuses(saveData)` = 装备槽装备 + 已装备功法，`calculateFinalAttributes` 改读它。功法部分由 `game-numbers.techniques.applyBonusToAttributes` 控制，**默认 `false`**：关闭时已装备功法不影响面板（与改动前一致）；打开后才计入后天六司，数值是占位值（九阳神功 悟性 +7、灵性 +4）。代码只读配置。
- 没动 `runtime.ts`、`AIBidirectionalSystem.ts`，也不需要动。
- 没动 `equipmentBonusApplier.ts`（装备/卸下时往存档写气血上限与六司）。推断（未验证）：它写入存档的六司与 `calculateEquipmentBonuses` 实时计算可能重复计入装备六司，这是原有问题，本次没查。
- 功法 `bonus` 里的气血/灵气/神识上限、修炼速度加成：目前运行时没有消费方，只有六司被读取。

## 没做

- `scripts/fill-content-mechanics.mjs`、`generate-content-codex.mjs`、`fix-chengzongyang-jiuyang.mjs` 仍用 `techniqueEffects`：它们读写的是 `mod-kit/generated/**/stages/*.json` 里的内联副本，发布关卡已改为只引用总表（`stage-access.json`），这些副本是惰性的，没有改。
- 生成的关卡 JSON 里内联的 `techniqueEffects` 没动。
- 功法 `grade` 13 种写法没规范化（用户未要求）。
- 反向索引（功法被谁持有、哪关出现）没做。
- 旧存档不兼容、不做映射（用户已定）：旧档里的 `功法效果` 字段保持原样可读，新增的 `允许多部装备` 缺省即 false。

## 验证（2026-10-17）

- `tsc --noEmit` 通过；`content-packs --check` 通过；`validate-entity-catalog` 0 错误。
- `node --test --test-concurrency=1 tests/[!_]*.test.mjs`：1998 项，通过 1992，失败 0，跳过 6（跳过的 6 项是原有的 R3-10 冻结断言，不是本次）。
- `npm run canon:build` 全绿：2001 项（该管线连 `tests/_*.test.mjs` 一起跑），通过 1995，失败 0，跳过 6。
- 中途一次全量跑出 21 项失败，原因是我改名后 `mod-kit/generated/**/stages` 里的内联 `techniqueEffects` 没跟着改（`validator.ts` 报「已改名 bonus」，外加一次 Node IPC 反序列化偶发错误）；同步改名后复跑为 0 失败。
- `character-registry.json` 的 `generatedAt` 已手工恢复为 HEAD 值 `2026-10-16T07:33:57.127Z`；`mod-kit/entity-catalog/index.json` 多了一行 `free.fact.gate.goodwill_below_min`，是 canon:build 按工作区里别人已改的内容包 `catalog.json` 重建出来的，不是本次改动。
