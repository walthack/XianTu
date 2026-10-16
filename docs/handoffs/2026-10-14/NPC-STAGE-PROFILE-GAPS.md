# NPC 阶段画像缺口调查（乐明珠 / 凝羽 / 其他南荒角色）

只读调查，2026-10-14。未改任何代码/数据，未构建，未跑游戏。
方法：读源码 + `jq` 读 `character-registry.json` 与 `builtins/data/lcq.stage_*.json`。
标记：【查】= 已读代码/数据核实；【推】= 由代码推断，未跑存档验证。

## 结论速览

| 缺口 | 根因 | 分类 |
|---|---|---|
| 乐明珠 03b/04 性格、谈吐为空 | 有意设计：未揭身份「封口」+ 时间门排除 + 画像显式空值 | 非 bug（04 内揭身份后有一个小窗口，见 G1b） |
| 乐明珠 04b/05b 谈吐来自注册表 | 卡层有意补位（`npcCardLayer.ts:98`）；阶段画像 `speechStyle` 本就是空 | 非 bug；阶段谈吐未写 = 数据缺口，但回落已兜底 |
| 乐明珠所有南荒关无底线 | 画像带键空值 + 南荒关回落守卫；卡层不读注册表底线 | 数据缺口（剧情策划，= 审计 O10） |
| 凝羽 03b 起无底线 | 同上；stage_01/02/03 靠「无键→回落静态卡」才有底线 | 数据缺口（剧情策划，= O10） |
| 其他南荒角色 | 全员南荒关 `principles` 为空；少数小角色注册表无任何档案 | 数据缺口；另有 1 处潜伏代码不一致（G4，当前无影响） |

## 1. 位置与 schema【查】

- 基础角色注册表：`src/modules/scenarioMods/builtins/character-registry.json`（`characters[]`）。
  - 乐明珠 `liuchao.character.le_mingzhu`：行 19725；`staticProfile` 19736–19820；`phaseIdentities` 自 19821（03b 19823、04 19852、04b 19881、05 19918、05b 19947）。
  - 凝羽 `liuchao.character.ning_yu`：行 25079；`staticProfile` 25092–25181；stage_01 25184、03b 25247、04 25281、04b 25315、05 25350、05b 25376。
- schema：`characterResolver.ts:22–99`（`RegistryPhase` / `RegistryStaticProfile` / `RegistryEntry`）。
- 阶段画像（运行时 `canon.characters[].profile`）的来源：
  - 阶段文件 `builtins/data/lcq.stage_*.json` 只存动态字段 + 少量内联 profile（乐明珠：03b `:1855`、04 `:1622`、04b `:1870`、05b `:1737`）。
  - 物化时 `builtins/index.ts:18` → `resolveScenarioCharacters`（`characterResolver.ts:382`）→ `resolveOne`（`:328`）按 stageId 取注册表 `stage-projection` 相位，覆盖 `personality`（`:353–354`），并重建派生 notes（`buildNotes :167`；谈吐 `:219`、底线 `:220`）。
- 南荒关定义：`ledger/naming.ts:89` `isSouthernStage` = `overrides.json:1169–1177` 的开篇章号落在 37–124：03b(37)、04(46)、04b(56)、05(74)、05b(87)、06(112)。

## 2. 为什么 03b/04 没有回落、04b/05b 有【查】

**性格从不「回落」**：卡层不做性格回落（`npcCardLayer.ts` 头注「性格沿用演员卡原有 traits」；`legacyNarratorPacket.ts:224–227`）。04b/05b 的 7 条性格来自注册表相位（`personality` 7 项，registry 19898 / 19964）经 `resolveOne` 写入画像，不是回落。

**谈吐回落只有一处**：`npcCardLayer.ts:98`（`getRegistrySpeechStyle` 读 `staticProfile.speechStyle`，无阶段门）→ `legacyNarratorPacket.ts:254–259`，仅当演员自身 `speechStyle` 为空时补位。乐明珠所有阶段文件都没有 `speechStyle`，注册表相位的 `speechStyle` 也是 `[]`（19841 / 19870 / 19907 / 19973），所以 04b/05b 走回落。

**03b/04 没有，是三层有意门，不是 bug**：
1. 封口：`storyContext.ts:543–546` —— 当前名字 == `namingFor(le_mingzhu,0)`（「花苗新娘」，`overrides.json:79–81`）即封口；`npcCardLayer.ts:61–62` 遇封口直接 `return { card:[sealed] }`，在 `:98` 之前返回，所以不带谈吐。设计依据：交付文档 12.1。
2. 时间门排除：`characterResolver.ts:276–279` 03b/04 排除乐明珠；`resolveOne :329` 直接 `return false`，不还原任何档案（注释 `:274–275` 写明目的：未揭示称谓不得补出未来身份）。
3. 相位显式空值：registry 03b/04 的 `personality/speechStyle/principles` 全是 `[]`；`phaseProfileValue :141–149` 对「相位里带了键」直接取该值（空），不回落静态卡。
4. 身份展示：`characterResolver.ts:637–644` 未揭示时把 profile 重置为只有 `origin + appearance`。

**G1b（小窗口，【推】）**：stage 04 内揭身份后（`s04_03` 完成或章号 ≥47，`:638`）名字变「乐明珠」，不再封口，但 profile 仍是 `{origin, appearance}`（`:642` `...character.profile` 展开的是空壳，因为 `:329` 已排除），所以：性格仍空，谈吐走 `:98` 的静态回落。静态谈吐含成人向表述（registry 19748）→ 合规只标记。
- 分类：代码/设计问题（可选，模块规划者 + 用户确认后再动）。
- 最小修法：`:642` 揭示分支里，用注册表现有的 04b 相位 `personality`（7 条，已有数据，不写新文本）填 `profile.personality`。是否要做取决于「04 揭身份后到 04b 之前，性格是否应提前出现」——这是剧情口径，不是明显错误，默认不改。

## 3. 底线【查】

- 注册表级数据**存在**：乐明珠 `staticProfile.principles` 3 条（registry 19749–19753）；凝羽 3 条（25101–25105）。并且 `runtime.ts:3449–3463` `projectBottomLinesToNpcs` 在好感 ≥40 / 自己人关系时已把静态底线投影进存档 `社交.关系.人格底线`。
- 但南荒各相位都是带键空值 `principles: []`：乐明珠 03b/04/04b/05/05b/06 全空；凝羽 03b/04/04b/05/05b/06 全空（registry 25270、25304、25339、25365、25397、25423）。叠加 `characterResolver.ts:148`：南荒关相位无键也返回 `undefined`，**删键也不会回落**。
- 凝羽 stage_01/02/03 的相位没有 `principles` 键 → 非南荒关 → `:148` 落到静态卡 → 有 3 条底线。这就是「只有 stage_01/02 有」的原因（stage_03 同理，但不在试玩路径）。
- 卡层有意不读这两处：`npcCardLayer.ts:12–13` 头注、`:88–89` 只取画像 notes 里的【底线】（交付文档 12.1）。已有记录：`NPC-DESIGN-AUDIT.md:108、377`（O10：有意防剧透，是否补「当期适用」版本待定）。
- 分类：**数据缺口**（剧情策划依据原著决定各关底线）。**不建议改代码**：卡层去读静态底线 = 推翻防剧透决策。若策划确认某关适用，纯数据路径：给该相位 `principles` 填值 → `buildNotes :220` 自动出【底线】→ `npcCardLayer.ts:88` 取走，好感门控 `shouldRevealBottomLine` 仍生效。

## 4. 其他重要南荒角色（03b/04/04b/05b，数字 = 条数）【查】

注册表相位值（`P`=性格 `S`=谈吐 `B`=底线；`·`=字段缺，`—`=空数组）：

| 角色 | P | S | B（相位 / 静态卡） | 说明 |
|---|---|---|---|---|
| 谢艺 | 3/3/3/3 | 有/有/有/— | 0 / 2 | 05b 谈吐靠回落 |
| 武二郎 | 3/3/3/4 | 有/有/有/— | 0 / 3 | 同上 |
| 祁远 | 4/4/4/4 | 有/有/有/— | 0 / 3 | 同上 |
| 云苍峰 | 6/6/6/6 | 有/有/有/— | 0 / 2 | 同上 |
| 苏荔 | 3/3/3/3 | 有/有/有/— | 0 / 1 | 同上 |
| 阿夕 | 3/3/3/5 | 有/有/有/— | 0 / 0 | 静态卡本身无底线 → 注册表无数据 |
| 小紫 | 代码硬写 3 条 | 03b `·`，其余— | 0 / 0 | 性格由 `characterResolver.ts:603–613` 在南荒四关强制写入；谈吐靠回落；注册表无底线 |
| 殇侯(朱八八) | 封口 | 封口 | 0 / 2 | 03b/04/04b/05b 全封口（`characterResolver.ts:626–633`、`storyContext.ts:543`），有意设计 |
| 阁罗(np006) | 5/5（04b、05b） | —/— | 0 / 2 | 谈吐回落；03b 有相位但无这些键，南荒守卫下为空 |
| 易彪(np004) | 4/4/4/4 | —/—/—/— | 0 / 2 | 谈吐回落 |
| 碧姬 | 05b: 4 | — | 0 / 3 | 只有 05/05b/06 相位 |
| 樨夫人 | — | — | — | **注册表无档案**（静态 P/S/B 全空，无相位）；04b 阶段文件仅 `origin:"白夷族夫人"` |
| 小魏、石刚、卡瓦、蛇傀、黑舌、达古、娄蒙 | — | — | — | 注册表有条目但静态/相位均无性格谈吐底线 |

规律：
- **所有**南荒关、所有角色的 `principles` 都是空 → 底线是整体缺口，不只是乐明珠/凝羽（同 O10）。
- 05/05b/06 相位的 `speechStyle` 全部为 `[]` → 这些关的谈吐靠 `:98` 回落补位，全员一致。
- 注册表**完全无档案**的角色（樨夫人及 7 个小角色）：性格/谈吐/底线均无，**数据缺口**（剧情策划，原著依据由其定）。
- 潜伏代码不一致（【推】，当前无影响）：`phaseProfileValue :148` 用 `currentPhase?.stageId` 判南荒，而同函数族的 `trajectory :215` 用 `stageId` 参数。若某角色在南荒关有静态档案却没有该关相位，谈吐/底线/目标会从静态卡漏出。我用 `jq` 核对了 6 个南荒关的全部画像：没有这样的角色（无相位者静态档案全空），所以现在不触发。分类：代码问题（潜伏）。最小修法：给 `phaseProfileValue` 传入 `stageId`，把 `currentPhase?.stageId && isSouthernStage(currentPhase.stageId)` 改为 `isSouthernStage(stageId)`。不改也无现行影响，仅防将来加人时漏。

## 5. 合规（只标记，不展开）

- 乐明珠静态性格/谈吐含成人向表述（registry 19745、19748），在 G1b 窗口与 04b/05b 的谈吐回落会进入卡片。
- 凝羽 05b 性格「外冷内媚(冰火交融)」「以冷酷伪装情感与欲望」（registry 25391、25394）。
- 凝羽 05/05b/06 相位 notes 的【关系】成人向文字（registry 25359 等）；其来源字段 `notes` 未被 `buildNotes` 读取，是否进画像未核对。
- 乐明珠外貌口径 Q17 待确认（交付文档 12.5）。
- 均按 CLAUDE.md 与 `docs/COMPLIANCE-REQUIREMENTS.md` 不处理、不软化。

## 6. 未验证项

- 没有跑存档或浏览器，G1b 与各卡层输出是由代码推断。
- 阶段文件里内联 profile 只核对了乐明珠（03b/04/04b）和 `speechStyle` 字段计数（03b/04/04b 各 7 条，05b 为 0）；其余角色的内联 personality 未逐一核对，上表以注册表相位为准。
