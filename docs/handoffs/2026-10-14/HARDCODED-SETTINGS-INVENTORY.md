# 模块化违规清单（2026-10-14 只读调查；同日写模式修复轮已在各表末列标注状态，汇总见文末 附录 R）

只读调查：没改任何代码或数据，没运行测试或 `canon:build`，没提交。依据用户给的模块化原则——content packs／ledgers／config 存数据，代码只按 id 读；数值在 `game-numbers`；阶段门在 ledger 里按当前点查找；modular narration 从这些层取数——只标记违反这些原则的位置。与 `HARDCODED-GUARDS-AUDIT.md` 的区别：那份按「时序守卫」读，这份按六类模块化违规读，并补上它没覆盖的数值、角色数据、路径依赖。

## 0. 口径、基线、限制

- **六类**：①角色数据 ②剧情事实 ③数值阈值 ④阶段门 ⑤modular 路径绕过 ledger／依赖旧路径字面量 ⑥用实体名词而非 id。一行只计一类（主类），同时涉及别的类在备注写「同时属 N」。
- **分类标签**：「已列」= 已在 `HARDCODED-GUARDS-AUDIT.md`（带节号，如 `L:B` 指 §2.B）；「新」= 本次新发现；附录 K =「故意且 OK」；附录 C =「合规，仅标记」。有些行审计列了位置、本次补了证据（备注里写明），仍算已列。
- **优先级** 沿用审计：P1 = 落点现成或有重复拷贝，收益大风险小；P2 = 需先扩账本字段；P3 = 建议暂不动。❄ = 冻结文件（`AGENTS.md:52`，只许 bugfix）。⚖ = 与合规相邻，只标记。
- **基线**：HEAD `af7aa6d9`。行号取自 2026-10-14 工作区，并非全部已提交：`eventNarrativeView.ts`、`ledger/naming.ts`、`legacyNarratorPacket.ts`、`storyContext.ts`、`AIBidirectionalSystem.ts`、`wuyuanOpenWorldSlice.ts`、`questLines.ts` 等有别人的未提交改动，`npcCardLayer.ts` 是未跟踪新文件，行号可能漂移。
- **没做**：没运行游戏或测试；`scripts/`、`tests/`、`mod-kit/` 数据 JSON 只在与 src 对照时抽查；`sceneModule/`（战斗宿主）、`components/*.vue` 没有逐行读。「新」不等于已穷举：我是按规则逐类 rg＋读上下文，不保证没有漏项。

### 关于 GUARDS-AUDIT 为什么没提小紫性格（用户问题 B）

`HARDCODED-GUARDS-AUDIT.md` **没提**`characterResolver.ts:598-621` 的小紫性格硬编码。它只两次碰到这块：`§2.E` 把 `:591` 当作又一份 stage 列表，`§2.G` 把 `:602-607` 当合规标记。原因：①口径是时序守卫（开头「某阶段前不要做／说 xxx」，文末 `§5` 自认 A–F「不是穷举」），静态人设重复不在其内；②`§2.G` 只标合规不评估；③同一块里的披露门、身份门部分已列（B／A 类），静态字面量没单列；④棘轮只数 registry 人名，形容词数组看不到（审计 `§1.1`）。同日 `NPC-STAGE-PROFILE-GAPS.md:64` 注意到了，归为数据缺口。详见 `AXI-XIAOZI-BOTTOMLINE.md` §6。本表 1-01、1-02 补上这一项，并发现 `:364` 还有第二条文案不同的字面量。

## 1. 总览

| 类 | 主题 | 已列 | 新 | 合计 | P1 | P2 | P3 |
|---|---|---:|---:|---:|---:|---:|---:|
| 1 | 角色数据（性格／说话／外貌／底线／称呼／关系文）写在代码里 | 3 | 10 | 13 | 3 | 6 | 4 |
| 2 | 剧情事实（名字／章节／称呼／谁死了）写在代码里 | 33 | 3 | 36 | 13 | 22 | 1 |
| 3 | 数值／阈值写在代码里 | 0 | 7 | 7 | 1 | 4 | 2 |
| 4 | 阶段门／事件门散落在代码里 | 17 | 10 | 27 | 15 | 5 | 7 |
| 5 | modular 路径绕过 ledger，或依赖旧路径／TS 字面量 | 2 | 6 | 8 | 2 | 5 | 1 |
| 6 | 用实体名词而不是 id | 0 | 5 | 5 | 2 | 2 | 1 |
| | **合计** | **55** | **41** | **96** | **36** | **44** | **16** |

另：附录 K「故意且 OK」13 组，附录 C「合规，仅标记」9 条，不计入上表。

读数提示：
- 「已列」多集中在 ②④：审计的强项是时序守卫。「新」多集中在 ①③⑤⑥：审计没覆盖数值、角色数据和路径依赖。
- ④ 里「南荒阶段集合」一项占 18 处字面量表达式、11 个文件（`AIBidirectionalSystem.ts`×2、`legacyNarratorPacket.ts`×2、`narrativeBoundaries.ts`、`fixedEndingNarratives.ts`×2、`characterResolver.ts`×4、`storyContext.ts`、`runtime.ts`×2、`presence.ts`、`travel/defs/qingyuNanhuang.ts`、`characterRagService.ts`、`voiceCards.ts`），至少 7 种不同集合：`03b/04/04b/05b`（7 处）、`03b/04/04b`（4 处）、`4b/5b`、`03b/04`、`02/03b/04/04b`、`02/03b/04/04b/05b`、`01–04/03b`。唯一读账本的是 `ledger/naming.ts:89` 的 `isSouthernStage`，但它把 37／124 写成字面量（2-30）。是否有意区分，我没有查证。
- 正面样例（不是违规）：`npcCardLayer.ts:64` 从 `GAME_NUMBERS.npcCard` 取全部条数／字数上限；`intimacyProfiles.ts:31`、`storyContext.ts:453`、`runtime.ts:3442` 都引用 `AFFINITY_THRESHOLDS` 而不是重写数字；`narrativeBoundaries.ts`、`presence.ts` 大部分已用 `entityAliases／entityNamePattern(id)`。人名按 id 的迁移基本完成，剩下的主要是称呼表、人设散文和阶段门。

## 2. 应优先迁出（top）

排序依据：数据或落点是否现成、是否非冻结文件、是否已出现漂移。每项只描述，未实施。

| 序 | 对应行 | 做什么 | 为什么靠前 |
|---:|---|---|---|
| 1 | 1-01、1-02、1-04、1-05 | `characterResolver.ts` 里小紫／殇侯／乐明珠的人设字面量改读 registry 相位 | 数据已在 registry，逐字相同；非冻结文件；改动小。小紫部分见 `AXI-XIAOZI-BOTTOMLINE.md` §5 |
| 2 | 1-08 | NPC 对主角称呼表改读 ledger `npcAddress` | ledger 字段已存在但对云苍峰／祁远／吴战威／谢艺／武二郎是空的，这五人的称呼现在只存在于代码；`:249` 先查 ledger 再回退此表，所以补数据后应可删表〔推〕 |
| 3 | 3-07 | 货币兑换率改读 `game-numbers.currency` | 一行级；值已逐值重复；顺手去掉按显示名判断 |
| 4 | 2-15、2-24、2-26、2-29、2-31、2-05 | 账本里已有的章门值没人读，或代码与账本口径不一致 | `poisonSectName=121`、`shanghou_revealed=120`、`s04_03=48`（代码 47）、115 章、72／105 章文字。以读取为主；122 章在账本里没有，需补一个值 |
| 5 | 4-01 | `CARD_TIME_GATE_EXCLUSIONS` 运行时与构建脚本两份 | 两份已经不一致，是现成的漂移 |
| 6 | 5-01 | 三套「事件已完成」判定合并为一个 | 是代码重复；同一事件在 presence 与 resolver 可能判成不同结果 |
| 7 | 4-02…4-14（及 4-15…4-17） | 「南荒阶段集合」18 处字面量、至少 7 种集合 → 账本一项 | 先请用户确认 7 种集合里哪些是有意区分（审计 §1.2 同一问题） |
| 8 | 4-20 | `presence.ts` 的 58 行出场／离场表 | 单点最大的一块；机制（`presenceWindow`）已存在，缺事件版 |
| 9 | 6-02、6-03 | registry 查询 API 增加按 id 版本 | 让 `runtime.ts:3458`、`npcCardLayer.ts:98` 不再靠显示名 |
| 10 | 5-05、5-06、5-07 | 固定拍正文、结局承接句改读 `CONTENT_PACKS.texts` | 同文件结局正文已迁，这里是半迁移；AIB.ts 另有一份逐字重复 |
| 11 | 2-01…2-07 | `AIBidirectionalSystem.ts` 提示词事实散文换成一次账本调用 | 需用户授权动冻结文件；一次授权后以后只改数据（审计 §4.3 同） |

动 `storyContext.ts`、canon 数据、`narrativeBoundaries.ts` 之前，按 `CLAUDE.md` 要先读 `CANON-DECISIONS.md`，在同一提交追加裁定条目，`npm run canon:build` 全绿。

## 3. 逐条清单

### 类 1　角色数据（性格／说话／外貌／底线／称呼／关系文）写在代码里（13 条）

| # | 状态 | 位置 | 写死了什么 | 迁出落点 | 优 | 备注 | 修复状态（2026-10-14） |
|---|---|---|---|---|---|---|---|
| 1-01 | 新 | `characterResolver.ts:602-603,611-612` | 小紫 role／description／appearance／personality 字面量；与 registry 04b、05b 相位里的值逐字相同（纯重复） | 读 registry 相位（文件内已有 `byId`） | P1 | ⚖ :611「成年少女」属 C01，迁移时原样保留。审计只在 §G 以合规标记提到 :602-607 | **已修**：`syncNanhuangIdentityDisplay` 的 role／description／appearance／personality 改读 registry 04b／05b 相位（按 id）；37 关×6 种揭示状态的快照与改前逐字节一致。⚖ C01「成年少女」措辞随数据原样保留。 |
| 1-02 | 新 | `characterResolver.ts:364` | 小紫 04b 性格另一条字面量「看上去天真灵动…」，文案与 :612 不同 | 同上，删掉 | P1 | 两处硬编码互相不一致；`NPC-DESIGN-AUDIT.md` 提到过，GUARDS-AUDIT 没有 | **已修**：已删除。该字面量在同一次 `resolveScenarioCharacters` 里被 `syncNanhuangIdentityDisplay` 整体覆盖，是死代码；删除后快照一致。 |
| 1-03 | 新 | `characterResolver.ts:615-617` | 小紫【已知身世】三句备注字面量 | ledger `reveals` 文本 | P2 | 与 B 类披露门（2-27）同改 | **已修**：三句【已知身世】迁入 ledger `identityDisplays.liuchao.character.xiao_zi.knownFacts`，代码按键取；披露判定仍在代码（见 2-27）。 |
| 1-04 | 新 | `characterResolver.ts:628-631` | 殇侯／朱八八 role／description／origin／appearance 字面量（审计 A 只列了名字切换） | registry 相位 + ledger 称呼档 | P2 |  | **部分**：role／description／appearance 迁入 ledger `identityDisplays.liuchao.character.shang_zhen_yu`（hidden／revealed 两档，逐字）；选档判定（事件 `shanghou_revealed` 是否完成）仍在代码。死代码 `character.name=` 已删（名字由账本 naming 覆盖）。**数据冲突**：registry 04b 相位 role 是「老向导」，代码字面量是「云氏雇用的老向导」，两者不同，故没并入 registry，以哪个为准待用户定。 |
| 1-05 | 新 | `characterResolver.ts:639-642` | 乐明珠（花苗新娘）role／description／origin／appearance 字面量 | 同上 | P2 | ⚖ 「成年花苗新娘」C01 措辞原样保留 | **部分**：role／description／appearance 迁入 ledger `identityDisplays.liuchao.character.le_mingzhu`（hidden／revealed 两档，逐字）；选档判定（s04_03 事件或第47章）仍在代码。⚖ C01「成年花苗新娘」措辞原样。 |
| 1-06 | 新 | `storyContext.ts:540,548` | 谢艺「昏迷伤员」「隐藏身手」两张人物卡全文，含称呼「程兄」 | registry 相位 + ledger | P2 | 核心 prompt 文件，动前先读 CANON-DECISIONS；`:537-539` 另读 `branch.lcq.if_xieyi_longrest.active` 等裸 flag 字符串 | **剩余·未做**：storyContext.ts 是核心 prompt 文件，迁出需先扩 registry 相位／账本字段（P2）、按 CLAUDE.md 先读裁定簿并同提交追加条目；本轮不动。 |
| 1-07 | 新 | `storyContext.ts:512-514,624` | 阮香凝内部机密边界全文；键为中文名，`CHARACTER_SECRET_KNOWLEDGE_BOUNDARIES[character.name]` | 私有知情 ledger（按 id） | P2 | 同时属 6 | **剩余·未做**：需要新建「私有知情」账本结构（P2），本轮不动；storyContext.ts 动前须读裁定簿。 |
| 1-08 | 新 | `legacyNarratorPacket.ts:235（使用处 :249）` | 七个 NPC 对主角的称呼表（云苍峰／祁远／吴战威／谢艺／武二郎／朱八八／樨夫人），按名字键控；:249 的取值顺序是 ledger `npcAddress` → 此表 → 画像【称呼】备注 →「你」 | 把值补进 ledger `naming.npcAddress`，删表 | P1 | ledger 里云苍峰、祁远、吴战威、谢艺、武二郎的 npcAddress 为空，所以这五人的称呼实际只来自此表；樨夫人无 ledger 实体；朱八八 ledger 已有「小程子@0、程公子@122」，此表同值冗余。同时属 5、6 | **已修**：七个称呼迁入 ledger `naming.npcAddress`：云苍峰／祁远／吴战威／谢艺／武二郎补 `fromChapter:0` 档；樨夫人新增账本实体 `lcq.character.nanhuang_xi_furen`（仅 npcAddress，其余通道留空，不改显示名）；朱八八账本已有，表内冗余项随表一起删。代码表 `addresses` 已删，值逐字不变。**行为差异**：原表按显示名键控，现按 id，同一人以别名出现时也取到同一称呼（原先别名下回落到画像备注或「你」）。 |
| 1-09 | 新 | `legacyNarratorPacket.ts:245` | 「鬼王峒使者，尚未报名」role 字面量 | ledger `recognitionLabels` | P3 |  | **剩余·未做**：P3，本轮不动。 |
| 1-10 | 已列 D | `narrativeStateReconciler.ts:129-212` | 11 个 NPC 的状态抽取规则，键为 `npc:'小紫'` 等中文名；`:516` 用名建 Map | 状态抽取表转配置，按 id | P2 | 同时属 6 | **剩余·未做**：P2，需把状态抽取表转配置，本轮不动。 |
| 1-11 | 已列 H | `stanceProfiles.ts:52-709` | 49 条人物姿态散文（经 `entityAliases(id)`，id 键控） | 内容包 | P3 | 数据表在 TS，非逻辑；迁 JSON 属另一件事 | **剩余·未做**：P3，数据表在 TS，非逻辑；迁 JSON 属另一件事。 |
| 1-12 | 新 | `voiceCards.ts:12-45` | 小紫、贾文和两张表演卡（审计 H 未列） | 内容包 | P3 | 只被旧路径 `storyContext.ts:27` 使用 | **剩余·未做**：P3，只被旧路径使用。 |
| 1-13 | 已列 H | `affinityCaps.ts:40-143` | 13 条好感上限及理由（id 键控；数值取阶梯档上界，不是字面数字） | 内容包／ledger | P3 |  | **剩余·未做**：P3。 |

### 类 2　剧情事实（名字／章节／称呼／谁死了）写在代码里（36 条）

| # | 状态 | 位置 | 写死了什么 | 迁出落点 | 优 | 备注 | 修复状态（2026-10-14） |
|---|---|---|---|---|---|---|---|
| 2-01 | 已列 D | `AIBidirectionalSystem.ts:842` | 黑魔海是宗派；苏荔是花苗族长、不是小紫母亲；血虎由易虎改造；不编死老头遗物。无 nanhuang 门，所有模块回合都发 | ledger `sceneNotes`，按在场人物／地点注入 | P1 | ❄ 需授权 | **剩余·冻结**：冻结文件 `AIBidirectionalSystem.ts:842`（:844 的 C01 句须原样保留）。**需用户批准**后才能迁入 ledger `sceneNotes`。 |
| 2-02 | 已列 C | `AIBidirectionalSystem.ts:825,848` | 王哲、段强已故：事件 s02_02 或 stage 号 >2；已故名单字面量 | 「已故」ledger（实体 + 生效条件） | P1 | ❄ 同时属 4 | **剩余·冻结**：冻结文件 `AIBidirectionalSystem.ts:825,848`（`wangZheDead` 另见 :907）。**需用户批准**；落点「已故」账本尚不存在。 |
| 2-03 | 已列 C | `AIBidirectionalSystem.ts:826,829-830` | 南荒缺席孟非卿／「孟老大」；阁罗缺席凭事件 regroup_caravan_envoy／weapon_deal_with_geluo；s04_07 必到白夷两人 | `cast` 合同字段 | P2 | ❄ | **剩余·冻结**：冻结文件 `AIBidirectionalSystem.ts:826,829-830`。**需用户批准**（:830 另含旧 id `canon.character.15b71fd1c8`，应改主 id `lcq.character.nanhuang_xi_furen`，二者解析结果相同）。 |
| 2-04 | 已列 B | `AIBidirectionalSystem.ts:851` | 鬼巫王死否凭事件 ghost_king_swallowed | ledger | P1 | ❄ | **剩余·冻结**：冻结文件 `AIBidirectionalSystem.ts:851`。**需用户批准**。 |
| 2-05 | 已列 B | `AIBidirectionalSystem.ts:855` | 「毒宗名号 121 章书信、122 章对白」；岳帅性别；孟非卿不在队伍；易虎失踪；阿葭；苏荔外貌 | ledger `sceneNotes` + `chapterGates` | P1 | ❄ 121 与 `chapterGates.poisonSectName` 重复，122 账本里没有 | **剩余·冻结**：冻结文件 `AIBidirectionalSystem.ts:855`（121章与 `chapterGates.poisonSectName` 重复；122章账本里没有）。**需用户批准**。 |
| 2-06 | 已列 D | `AIBidirectionalSystem.ts:856` | 蛇彝村已是空村（按地点门，文案字面量） | `sceneNotes` | P2 | ❄ | **剩余·冻结**：冻结文件 `AIBidirectionalSystem.ts:856`。**需用户批准**。 |
| 2-07 | 已列 D | `AIBidirectionalSystem.ts:828,905,2984-2987` | 冰蛊压力提示；退稿重复提醒；三个事件首个成功动作后追加固定「冰蛊身体信号」正文 | `GuardRule` + 内容包固定文本 | P2 | ❄ | **剩余·冻结**：冻结文件 `AIBidirectionalSystem.ts:828（:847 引用）,905,2982-2986`。**需用户批准**。 |
| 2-08 | 新 | `AIBidirectionalSystem.ts:761,2723` | 王哲留下结局 `sourceEventId:'lcq.event.s02_02'` 字面量（审计只列了 runtime.ts:3769-3773） | 结局合同字段 | P3 | ❄ | **剩余·冻结**：冻结文件 `AIBidirectionalSystem.ts:761,2723`。**需用户批准**（P3）。 |
| 2-09 | 已列 B | `narrativeBoundaries.ts:72` | 岳帅须为男性、无「丈夫」 | `GuardRule` + ledger | P2 |  | **剩余·未做**：问题在 `throw new Error` 里内嵌事实判定，迁出需 `GuardRule` 化（P2）并在裁定簿追加条目；本轮只迁了其中的章号数字（2-15）。 |
| 2-10 | 已列 B | `narrativeBoundaries.ts:73` | 蛇彝村空村，老彝婆／蛇祖不现身 | 同上 | P2 |  | **剩余·未做**：问题在 `throw new Error` 里内嵌事实判定，迁出需 `GuardRule` 化（P2）并在裁定簿追加条目；本轮只迁了其中的章号数字（2-15）。 |
| 2-11 | 已列 B | `narrativeBoundaries.ts:74` | 灵飞镜来历、阿夕性命绑定、潘师姐许可 | 同上 | P2 |  | **剩余·未做**：问题在 `throw new Error` 里内嵌事实判定，迁出需 `GuardRule` 化（P2）并在裁定簿追加条目；本轮只迁了其中的章号数字（2-15）。 |
| 2-12 | 已列 B | `narrativeBoundaries.ts:75-79` | 鬼王峒未平定、鬼巫王未死（事件 ghost_king_swallowed） | 同上 | P1 |  | **剩余·未做**：问题在 `throw new Error` 里内嵌事实判定，迁出需 `GuardRule` 化（P2）并在裁定簿追加条目；本轮只迁了其中的章号数字（2-15）。 |
| 2-13 | 已列 B | `narrativeBoundaries.ts:81-83` | 此处不是王哲殉身的十里焦土 | 同上 | P2 |  | **剩余·未做**：问题在 `throw new Error` 里内嵌事实判定，迁出需 `GuardRule` 化（P2）并在裁定簿追加条目；本轮只迁了其中的章号数字（2-15）。 |
| 2-14 | 已列 B | `narrativeBoundaries.ts:85-87` | 04b 碧姬不在碧鲮村现场 | 同上 | P2 |  | **剩余·未做**：问题在 `throw new Error` 里内嵌事实判定，迁出需 `GuardRule` 化（P2）并在裁定簿追加条目；本轮只迁了其中的章号数字（2-15）。 |
| 2-15 | 已列 B | `narrativeBoundaries.ts:91` | 报错文字里写死「72 章」「105 章」 | 读 `chapterGates` | P1 |  | **已修**：`narrativeBoundaries.ts` 报错文字改为 `${approvedChapterGates.generalPosthumousDaughter}`／`${approvedChapterGates.xiaoziFather}`（72／105），输出文字不变。 |
| 2-16 | 已列 B | `narrativeBoundaries.ts:92` | 小紫师承在南荒不公开 | `GuardRule` + ledger | P2 |  | **剩余·未做**：问题在 `throw new Error` 里内嵌事实判定，迁出需 `GuardRule` 化（P2）并在裁定簿追加条目；本轮只迁了其中的章号数字（2-15）。 |
| 2-17 | 已列 B | `narrativeBoundaries.ts:96` | 小紫亲缘相似须过母系／父系门 | 同上 | P2 |  | **剩余·未做**：问题在 `throw new Error` 里内嵌事实判定，迁出需 `GuardRule` 化（P2）并在裁定簿追加条目；本轮只迁了其中的章号数字（2-15）。 |
| 2-18 | 已列 B | `narrativeBoundaries.ts:101-103` | 苏荔非碧鲮族长；黑魔海是宗派；血虎≠武二郎虎斑／死老头遗物 | 同上 | P2 |  | **剩余·未做**：问题在 `throw new Error` 里内嵌事实判定，迁出需 `GuardRule` 化（P2）并在裁定簿追加条目；本轮只迁了其中的章号数字（2-15）。 |
| 2-19 | 已列 B | `narrativeBoundaries.ts:104-107` | 凝羽事件：不编天竺；西门庆须由凝羽先说出 | 同上 | P2 |  | **剩余·未做**：问题在 `throw new Error` 里内嵌事实判定，迁出需 `GuardRule` 化（P2）并在裁定簿追加条目；本轮只迁了其中的章号数字（2-15）。 |
| 2-20 | 已列 A,B,C | `fixedEndingNarratives.ts:179-189` | 易虎状态（crisis_11／s04_05…，:179-181）；主角档案「程宗扬／男／白湖商馆南荒商队头领」（:184）；已故名单（:188）；「鬼王峒未平定」（:189） | ledger；主角读 `opening.playerCharacterId` | P1 |  | **剩余·未做**：需先建「已故／易虎状态」账本（新结构，无现成落点）；主角档案可读 `opening.playerCharacterId` 但同文件其余项仍在，本轮不拆。 |
| 2-21 | 已列 A | `legacyNarratorPacket.ts:218` | 别名「鬼王峒使者」第 77 章前不用 | 别名 `fromChapter`（`contextOnlyAliases` 同类） | P1 |  | **剩余·待用户定**：账本里「鬼王峒使者」换名在第 **78** 章（np006 panel），代码用 **77**，口径不一致；统一前须定 77 还是 78。 |
| 2-22 | 已列 B | `legacyNarratorPacket.ts:299` | 事件 crisis_18 且父系已揭 → 注入「小紫是岳帅的遗腹女」 | ledger `reveals` 带 `inject` 文本 | P2 |  | **剩余·未做**：需要 ledger `reveals` 带 `inject` 文本（新字段，P2）。 |
| 2-23 | 已列 A | `characterResolver.ts:624` | np006 =「阁罗」或「鬼王峒使者」，凭事件 weapon_deal_with_geluo | ledger 称呼档 `requiresState` | P2 |  | **剩余·未做**：需 ledger 称呼档 `requiresState` 接事件（P2）。 |
| 2-24 | 已列 A | `characterResolver.ts:627-631` | 朱八八／殇侯凭事件 shanghou_revealed | 读 ledger `namingMilestones.shanghou_revealed`（=120，已有） | P1 | 重复 | **剩余·待用户定**：账本 `namingMilestones.shanghou_revealed=120` 是**章号**，代码判的是**事件** `shanghou_revealed` 是否完成；改读账本会把事件门变成章门，行为不等价，需用户定。 |
| 2-25 | 已列 A | `characterResolver.ts:634-636` | ghost_king_swallowed 前删乐明珠记忆里的「老公」 | ledger 记忆过滤档 | P2 |  | **剩余·未做**：需 ledger 记忆过滤档（P2）。 |
| 2-26 | 已列 A | `characterResolver.ts:638` | 乐明珠：事件 s04_03 或章 ≥47 | 读 `namingMilestones.s04_03` | P1 | 账本是 48，代码是 47，口径不一致 | **剩余·待用户定**：账本 `s04_03=48`、代码 47（且代码另有事件分支），口径不一致；须定 47 还是 48。 |
| 2-27 | 已列 B | `characterResolver.ts:558-571,593` | `xiaoziDisclosure`：stage_06+ 视为全揭；事件 s05b_09／weapon_deal_with_geluo；worldFacts 里的中文句子（「小紫母系已演出：碧姬的女儿」）当标记；:593 对 worldFacts 做碧奴→碧姬字符串替换 | ledger `reveals:[{fact,gate}]` | P1 | `chapterGates.xiaoziFather=105` 现在没人读 | **剩余·待用户定**：`chapterGates.xiaoziFather=105` 仍无人读：代码按「stage_06+／事件 s05b_09」判父系，迁成章门会改时机；需用户定。 |
| 2-28 | 已列 B | `characterResolver.ts:652-653` | 谢艺身手隐藏：stage_02–04b 且事件 crisis_13 未完成 | 同上 | P2 |  | **剩余·未做**：P2，需事件门字段。 |
| 2-29 | 已列 A | `ledger/naming.ts:75-76` | 小紫母系名第 115 章碧奴→碧姬 | 读 `bi_ji.naming.panel`（已有章门） | P1 | 文件工作区有未提交改动 | **已修**：`naming.ts` 的 115 改取 `bi_ji` 账本面板档的 `fromChapter`，逐字等价。 |
| 2-30 | 已列 A | `ledger/naming.ts:89` | 南荒 = 章 37–124 字面量 | `stageOpeningChapters` 推出或入账本 | P2 |  | **剩余·待用户定**：37／124 与 `stageOpeningChapters` 的首尾（最后一关 stage_07 起于125）不是同一口径；是否有意需确认。 |
| 2-31 | 已列 A | `secondaryLines.ts:856` | 章 ≥121 显示「黑魔海／毒宗」 | 读 `chapterGates.poisonSectName`（=121） | P1 | 重复 | **已修**：`secondaryLineDisplayName` 改读 `chapterGates.poisonSectName`（121）。 |
| 2-32 | 新 | `eventNarrativeView.ts:27-62；baihuGambleRefusal.ts:496-497,694-720` | 拒赌事件的 description／axisBeat 等结果文案，两个文件各写一份；我核对的 eventNarrativeView.ts:27-28 与 baihuGambleRefusal.ts:496-497 逐字相同，其余行未逐条比对 | 事件合同一处 | P2 | eventNarrativeView.ts 工作区有未提交改动 | **剩余·未做**：P2，两个文件各一份拒赌文案，需事件合同一处。 |
| 2-33 | 新 | `divergenceLedger.ts:94-212（:199-210）` | IF 分支后果散文：小紫／碧姬、苏妲己、郭解、贾文和、谢艺 | IF 定义（内容包） | P2 |  | **剩余·未做**：P2，IF 分支散文迁内容包。 |
| 2-34 | 已列 C | `modularTurn.ts:258-259` | 易虎非在场时不得「带路／归队」，读 `人物状态?.易虎` 并以 /易虎/ 匹配 | 账本人物状态 + id | P2 | 同时属 6 | **剩余·未做**：P2。 |
| 2-35 | 已列 D | `eventReconcileService.ts:458-490,523-535` | 事件 s06_03／s06_04 的谢艺死亡、碧姬被杀快路 | 事件合同字段 | P2 |  | **剩余·未做**：P2。 |
| 2-36 | 已列 C | `runtime.ts:3087-3092` | 把「易虎之死」改写成「易虎失踪」 | ledger `textRewrite` | P2 | ❄ | **剩余·冻结**：冻结文件 `runtime.ts:3087-3092`。**需用户批准**。 |

### 类 3　数值／阈值写在代码里（7 条）

| # | 状态 | 位置 | 写死了什么 | 迁出落点 | 优 | 备注 | 修复状态（2026-10-14） |
|---|---|---|---|---|---|---|---|
| 3-01 | 新 | `affinityLadder.ts:35-44,47-48,56-62,72-73,80-84,98-101,103-107` | 好感八档区间、姿态边界、亲密／底线揭示阈值、单回合上限 15／重大事件 40／触犯底线 60、事件增量 8／3、滞回 3 点 1 日；注释自称「数值是初值，按实玩手感调整」 | `game-numbers` 新增 affinity 段 | P2 | 有意做成单一真值源（R3-9），但仍在代码里，不在 game-numbers。`bottomLineBreach` 全仓无读取者 | **已修**：八档区间、姿态边界、揭示阈值、失配判据、单回合上限、事件增量、滞回参数迁入 `game-numbers.qingyu.json` 的 `affinity` 段；`affinityLadder.ts` 导出名不变，值引用 `GAME_NUMBERS`（同一对象，运行时调参有效；档位区间在模块加载时读入 `AFFINITY_TIERS`）。`bottomLineBreach` 仍无读取者（另一件事，未处理）。 |
| 3-02 | 新 | `reputationLedger.ts:27-31` | 声望事件增量 critical 20／normal 6 | `game-numbers` | P2 |  | **已修**：`REPUTATION_EVENT_GRANT` 引用 `game-numbers.reputation.eventGrant`（20／6）。 |
| 3-03 | 新 | `legacyNarratorPacket.ts:252` | 在场人物上限：南荒 18、其余 3，同时靠 stage 正则判断 | `game-numbers.npcCard`（已有 maxCards 等） | P2 | 同时属 4 | **已修**：在场人物上限进 `game-numbers.npcCard.maxPresentActorsSouthern`（18）／`maxPresentActorsDefault`（3）；用阶段正则判断南荒属 4-03，未动。 |
| 3-04 | 新 | `AIBidirectionalSystem.ts:2861` | 南荒每拍时间推进 120 分钟（有 dayPart 则 0） | `game-numbers` | P2 | ❄ 同时属 4 | **剩余·冻结**：冻结文件 `AIBidirectionalSystem.ts:2861`。**需用户批准**。 |
| 3-05 | 新 | `relationships.ts:40-41,43` | 境界→年龄区间表；寿命上限 100 | `game-numbers` | P3 | ⚖ 下限 18 在 :48,51,61（C01，B1 保留项），不动 | **剩余·未做**：P3；⚖ 下限18在 :48,51,61（C01，B1 保留项）不动。 |
| 3-06 | 新 | `runtime.ts:2548-2549,3473；eventReconcileService.ts:37` | 节奏常量 10／6／4；对账停滞阈值 10 在两个文件各抄一份（注释写「与脱节哨兵同阈值」） | `game-numbers` 或共享常量 | P3 | ❄ runtime.ts | **剩余·冻结**：冻结文件 `runtime.ts:2548-2549,3473`；`eventReconcileService.ts:37` 与之同阈值，只改一边会漂移，故两边都不动。**需用户批准**后一起迁。 |
| 3-07 | 新 | `locationLoot.ts:85-86（businessRules.ts:294 提示词里另抄一份）` | 货币兑换率 金铢 2000／银铢 100／铜铢 1，与 `game-numbers.currency`（1／100／2000）逐值重复，且按显示名而不是 id | 读 `game-numbers.currency`，按 id | P1 | 同时属 6；一行级改动 | **已修**：`locationLoot.ts` 改读 `DEFAULT_CURRENCIES[币种].价值度`（来自 `game-numbers.currency`，按币种 id 配置）；`businessRules.ts`／`worldStandards.ts` 两处提示词里的 1／100／2000 改为从 `GAME_NUMBERS.currency` 插值，输出文字不变。 |

### 类 4　阶段门／事件门散落在代码里（27 条）

| # | 状态 | 位置 | 写死了什么 | 迁出落点 | 优 | 备注 | 修复状态（2026-10-14） |
|---|---|---|---|---|---|---|---|
| 4-01 | 新 | `characterResolver.ts:276-322；scripts/apply-character-cards-v3-to-mod.mjs:27-` | `CARD_TIME_GATE_EXCLUSIONS`：stage→被排除角色表，运行时 11 个 key、构建脚本 9 个 key，两份各写一遍，注释写「与构建期同步」 | ledger 里一份 stage 排除表，运行时与脚本共读 | P1 | 两份已经不一致：共有 7 个 key，运行时独有 03b／04／04b／05b，脚本独有 lyg.shixiang_ambush、lyg.ganlu_bian；共有 key 的内容我没逐项比对〔未核〕 | **已修**：两份合并为 `mod-kit/entity-ledger/card-time-gates.json`，每关带 `at:[build|runtime]` 保留各侧原行为（构建期9关、运行时11关；共有7关内容逐项一致）。两侧是否应统一（`lyg.shixiang_ambush`／`lyg.ganlu_bian` 运行时是否也排除；03b／04／04b／05b 构建期是否也排除）待用户定。 |
| 4-02 | 已列 E | `AIBidirectionalSystem.ts:826-827` | 南荒 `03b/4/4b/5b` 正则（两处） | 「阶段集合」账本项 | P1 | ❄ | **剩余·冻结**：冻结文件 `AIBidirectionalSystem.ts:826-827`。**需用户批准**。 |
| 4-03 | 已列 E | `legacyNarratorPacket.ts:252` | `03b/4/4b/5b` | 同上 | P1 |  | **剩余·待用户定**：「南荒阶段集合」至少 7 种口径，哪些是有意区分需先确认（审计 §1.2 同一问题）；确认前合并会改行为。 |
| 4-04 | 已列 E | `narrativeBoundaries.ts:71` | `03b/4/4b/5b` | 同上 | P1 |  | **剩余·待用户定**：「南荒阶段集合」至少 7 种口径，哪些是有意区分需先确认（审计 §1.2 同一问题）；确认前合并会改行为。 |
| 4-05 | 已列 E | `fixedEndingNarratives.ts:128` | `isNanhuangSceneStage` = `03b/4/4b`（AIB.ts:781,815,2861 经它判断） | 同上 | P1 |  | **剩余·待用户定**：「南荒阶段集合」至少 7 种口径，哪些是有意区分需先确认（审计 §1.2 同一问题）；确认前合并会改行为。 |
| 4-06 | 已列 E | `legacyNarratorPacket.ts:298` | `03b/4/4b` | 同上 | P1 |  | **剩余·待用户定**：「南荒阶段集合」至少 7 种口径，哪些是有意区分需先确认（审计 §1.2 同一问题）；确认前合并会改行为。 |
| 4-07 | 已列 E | `fixedEndingNarratives.ts:181` | `4b/5b` | 同上 | P1 |  | **剩余·待用户定**：「南荒阶段集合」至少 7 种口径，哪些是有意区分需先确认（审计 §1.2 同一问题）；确认前合并会改行为。 |
| 4-08 | 已列 E | `characterResolver.ts:367` | 数组 [03b,04,04b] | 同上 | P1 |  | **剩余·待用户定**：「南荒阶段集合」至少 7 种口径，哪些是有意区分需先确认（审计 §1.2 同一问题）；确认前合并会改行为。 |
| 4-09 | 已列 E | `characterResolver.ts:591` | 数组 [03b,04,04b,05b] | 同上 | P1 |  | **剩余·待用户定**：「南荒阶段集合」至少 7 种口径，哪些是有意区分需先确认（审计 §1.2 同一问题）；确认前合并会改行为。 |
| 4-10 | 已列 E | `characterResolver.ts:637` | 数组 [03b,04] | 同上 | P1 |  | **剩余·待用户定**：「南荒阶段集合」至少 7 种口径，哪些是有意区分需先确认（审计 §1.2 同一问题）；确认前合并会改行为。 |
| 4-11 | 已列 E | `characterResolver.ts:651` | 数组 [02,03b,04,04b] | 同上 | P1 |  | **剩余·待用户定**：「南荒阶段集合」至少 7 种口径，哪些是有意区分需先确认（审计 §1.2 同一问题）；确认前合并会改行为。 |
| 4-12 | 已列 E | `storyContext.ts:543` | 数组 [03b,04,04b,05b] | 同上 | P1 | 文件工作区有未提交改动 | **剩余·待用户定**：「南荒阶段集合」至少 7 种口径，哪些是有意区分需先确认（审计 §1.2 同一问题）；确认前合并会改行为。 |
| 4-13 | 已列 E | `runtime.ts:3878,3893` | 数组 [03b,04,04b,05b] 与 [03b,04,04b] | 同上 | P1 | ❄ | **剩余·冻结**：冻结文件 `runtime.ts:3878,3893`。**需用户批准**。 |
| 4-14 | 已列 E | `presence.ts:176` | 数组 [03b,04]（排除小紫） | 同上 | P1 |  | **剩余·待用户定**：「南荒阶段集合」至少 7 种口径，哪些是有意区分需先确认（审计 §1.2 同一问题）；确认前合并会改行为。 |
| 4-15 | 新 | `travel/defs/qingyuNanhuang.ts:16-22（travelLedger.ts:215）` | `NANHUANG_STAGE_IDS`，含 stage_02 共 5 个 | 同上 | P2 |  | **剩余·待用户定**：「南荒阶段集合」至少 7 种口径，哪些是有意区分需先确认（审计 §1.2 同一问题）；确认前合并会改行为。 |
| 4-16 | 已列 E | `services/characterRagService.ts:315` | 小紫在 stage_01–04／03b 不召回 | 读 `presenceWindow` | P2 |  | **剩余·待用户定**：「南荒阶段集合」至少 7 种口径，哪些是有意区分需先确认（审计 §1.2 同一问题）；确认前合并会改行为。 |
| 4-17 | 新 | `voiceCards.ts:16` | 早期伪装期 `stage_0[1-4](b)` 正则 | 阶段集合 | P3 |  | **剩余·待用户定**：「南荒阶段集合」至少 7 种口径，哪些是有意区分需先确认（审计 §1.2 同一问题）；确认前合并会改行为。 |
| 4-18 | 新 | `characterResolver.ts:567` | `lateStage` = stage_06–19 或 `ly[lg].` 前缀，用于父系揭示 | `reveals` 门 | P2 |  | **剩余·未做**：P2，需 `reveals` 门字段。 |
| 4-19 | 已列 C | `presence.ts:156-165` | stage_01／02 之后算「过了开场／过了王哲」 | `stageOpeningChapters` | P2 |  | **剩余·未做**：P2，需 `stageOpeningChapters` 接入。 |
| 4-20 | 已列 C | `presence.ts:167-225` | `nanhuangCastExclusions`：58 个非空行，我数得 34 个实体 id、5 个 stage id（14 处）、30 个事件 id（审计写的是约 67／22／40+，口径不同，我没复核）。`:171` 已读 `presenceWindow` | `presenceWindow` 的事件版 | P1 | 单点最大的一块 | **已修**：58 行规则迁入 `mod-kit/entity-ledger/cast-gates.json`（41 条规则，人物按 id；条件为 done／entered／notPrepared／flagTrue 及 all／any），`presence.ts` 通用求值；同时「白夷族长／蛇傀／六朝石匠」改按 id、旧 id `canon.character.15b71fd1c8／81be8593ee` 改主 id。4 万次随机状态对拍旧实现，输出（含顺序）逐项一致。 |
| 4-21 | 新 | `reputationLedger.ts:47-66` | `STAGE_REGION`：stage→国家线 | ledger | P3 |  | **已修**：`STAGE_REGION` 迁入 `overrides.json` 的 `stageRegions`（37 关，顺序内容与 HEAD 字面量逐项一致；国家名仍是中文标签，改成地区 id 属另一件事）。 |
| 4-22 | 新 | `milestoneRewards.ts:25-47` | 关→称号奖励表（4 条） | 内容包 | P3 |  | **剩余·未做**：P3，本轮不动。 |
| 4-23 | 新 | `divergenceLedger.ts:53-92` | `AUTO_BRANCH_RULES`：事件→IF 分支映射 | IF 定义 | P2 |  | **剩余·未做**：P2，IF 定义迁内容包。 |
| 4-24 | 新 | `strictInitializer.ts:246` | `modId==='lcq.stage_01'` 开局分支 | ledger 开局项 | P3 |  | **剩余·未做**：P3，本轮不动。 |
| 4-25 | 新 | `baihuGambleRefusal.ts:220,416,547,552,600` | 拒赌模块写死 stage_02 | 合同字段 | P3 | 特例模块，迁内容包时一并 | **剩余·未做**：P3，本轮不动。 |
| 4-26 | 已列 F | `runtime.ts:1150,1497,1871-1884,1908,1980-1983,2000,2381-2384,2762-2764,3375-3377,3769-3773,4005-4007` | 按事件／关 id 写的结算特例（拒赌屏蔽、shanghou_revealed 致命选项、sudaji 事实替换、s02_04 前置、flag、焚尸、强制移动、stage_11 筛选、stage_02 意图刷新、王哲结局话术、旧档补事件） | 事件合同字段 | P3 | ❄ 审计建议不动；`:2762-2764`、`:3375` 为本次补充 | **剩余·冻结**：冻结文件 `runtime.ts`（行号见该行）；审计建议不动。 |
| 4-27 | 新 | `AIBidirectionalSystem.ts:874,896` | `eventId==='lcq.event.ningyu_regicide_offer'` 加入静默守卫范围 | 合同字段 | P3 | ❄ | **剩余·冻结**：冻结文件 `AIBidirectionalSystem.ts:874,896`。**需用户批准**（P3）。 |

### 类 5　modular 路径绕过 ledger，或依赖旧路径／TS 字面量（8 条）

| # | 状态 | 位置 | 写死了什么 | 迁出落点 | 优 | 备注 | 修复状态（2026-10-14） |
|---|---|---|---|---|---|---|---|
| 5-01 | 新 | `presence.ts:129-141,220；characterResolver.ts:565-566,594-596` | 三套「事件已完成」判定且语义不一致：presence 读 flag＋completedEventIds＋offscreenResolvedEventIds；resolver `done` 读 completedEventIds＋travelLedger.doneEventIds＋eventActionStates.readyAtTurn＋flag；resolver `settled` 同 `done` 但没有 travelLedger。另有裸 `completedEventIds.includes('lcq.event.…')`：AIB.ts:825,851、fixedEndingNarratives.ts:179,181,189 | 共用一个 `eventDone()`，读 travelLedger | P1 | 代码重复，不是数据。同一事件在不同文件可能判成不同结果 | **剩余·待用户定**：三套「事件已完成」判定语义不一致，合并会改变行为；另有裸 `includes` 在冻结文件。需用户定统一语义。 |
| 5-02 | 新 | `ledger/naming.ts:65；narrativePromptState.ts:20；AIBidirectionalSystem.ts:227,825,891,1926,1932；presence.ts:157,163,170；characterResolver.ts:152-154,435,567；runtime.ts:1418,2764` | 以内容包前缀 `lcq.`／`lcq.stage_` 字面量决定是否走 ledger／守卫；`lyl.`／`lyg.` 包进不了这些分支 | 内容包清单声明适用的 ledger／守卫 | P2 | ❄ 部分在冻结文件 | **剩余·冻结**：冻结部分：`AIBidirectionalSystem.ts:227,825,891,1926,1932`、`runtime.ts:1418,2764`。**需用户批准**；其余需先定「内容包清单声明适用守卫」的方式。 |
| 5-03 | 新 | `characterResolver.ts:609 ↔ builtins/data/lcq.stage_04b_lingfei_baiyi_crisis.json:1957` | 小紫种族：数据里仍是「南荒人」，代码在运行时覆写成「碧鲮族」 | 修数据，不靠代码覆写 | P2 | 用代码补数据 | **部分**：代码里的字面量「碧鲮族」已改读 registry `staticProfile.race`（逐字相同）；stage 数据里的「南荒人」（`lcq.stage_04b…json:1957`）未改——它在生成关卡里，需走 authority overlay，留待用户确认。 |
| 5-04 | 已列 H | `secondaryLines.ts（1005 行）、characterQuests.ts、canonRail.ts、mainQuestAxis.ts、fixedQuestObjectives.ts、legacyPilotScenes.ts、eventNarrativeView.ts:149-163` | 内容表放在 TS 里。迁移已在进行：`mod-kit/quest-lines/lines.json`、`src/modules/contentPacks/`、未提交的 `packs/qingyu/lines-*.json` | 内容包 | P3 | 不是守卫，属另一件事 | **剩余·未做**：P3，另一件事（内容表迁移已在进行）。 |
| 5-05 | 新 | `fixedEndingNarratives.ts:65-88` | 固定拍正文表（event::action→正文，约 20 条）。同文件 `:11` 的结局正文已改读 `CONTENT_PACKS.texts`，这里没迁，半迁移 | `CONTENT_PACKS.texts` | P1 |  | **已修**：20 条固定拍正文迁入 content pack `texts.json`（键 `fixed.beat.<事件id>.<动作id>`），`fixedBeatNarrative` 按键读；逐条对 HEAD 原文断言一致。 |
| 5-06 | 新 | `fixedEndingNarratives.ts:92-96` | 五个结局的承接句字面量 | 同上 | P2 |  | **已修**：5 句结局承接句迁入 `texts.json`（键 `ending.bridge.<结局id>`）。 |
| 5-07 | 新 | `AIBidirectionalSystem.ts:2972-2977` | 订约成功固定正文，与 fixedEndingNarratives.ts:78 逐字重复；AIB 直接覆写 `textContent` | 删一份，读 `fixedBeatNarrative` | P2 | ❄ | **剩余·冻结**：冻结文件 `AIBidirectionalSystem.ts:2974`（订约正文与内容包重复）。**需用户批准**后改读 `fixedBeatNarrative`。 |
| 5-08 | 已列 §1.5 | `narrativeBoundaries.ts:71-107；AIBidirectionalSystem.ts:891-905` | 南荒守卫直接 `throw`，没走 `ledger/guardFramework.ts` 的 `GuardRule`（shadow／enforce 与日志） | `GuardRule` | P2 | ❄ AIB.ts | **剩余·冻结**：冻结文件 `AIBidirectionalSystem.ts:874-919`；`narrativeBoundaries.ts` 部分同 2-09 等。**需用户批准**。 |

### 类 6　用实体名词而不是 id（5 条）

| # | 状态 | 位置 | 写死了什么 | 迁出落点 | 优 | 备注 | 修复状态（2026-10-14） |
|---|---|---|---|---|---|---|---|
| 6-01 | 新 | `characterResolver.ts:270,330` | id 查不到时回落 `byName.get(name)` | 只留 `byId` | P2 |  | **剩余·未做**：按名回落是旧档兼容路径，可否删需确认旧档范围。 |
| 6-02 | 新 | `characterResolver.ts:395,403,423,524` | `hasRegistryEntry`／`getRegistryIdentity`／`getRegistrySpeechStyle`／`getRegistryBottomLine` 以中文名为参 | 增加按 id 的版本 | P1 |  | **部分**：新增 `getRegistrySpeechStyleById`（含 idAliases），`npcCardLayer.ts` 不再 id→名→查；`getRegistryIdentity`／`hasRegistryEntry`／`getRegistryBottomLine` 仍按名——调用方在冻结的 `runtime.ts:3447-3458` 或改按 id 会改变行为（见 6-03）。 |
| 6-03 | 新 | `storyContext.ts:594；npcCardLayer.ts:98；runtime.ts:3447-3458` | 上面 API 的调用方：npcCardLayer 先 id→名再按名查；runtime 取 `npc.名字` 缺省时用 key。小紫 aliases 只有「紫妈妈、紫丫头」，ledger 的「紫衣少女」不在其中，按名可能查不到〔推〕 | 传 id | P1 | ❄ runtime.ts | **部分**：`npcCardLayer.ts` 已按 id（等价：原先取的就是该 id 的规范名）。`storyContext.ts:594` 未改：按名查时，显示标签名（朱老头／紫衣少女／骑白象的鬼王峒使者）取不到谈吐，按 id 会在身份揭示前就把阁罗等的谈吐喂进提示词，属行为变化，需用户定。`runtime.ts:3447-3458` 冻结，**需用户批准**。 |
| 6-04 | 新 | `fixedEndingNarratives.ts:181` | `ledger?.actors?.易虎` 靠 `affinityIdentity.ts:152` 的不可枚举别名属性才取得到 | 按 id 取 | P2 | 兼容层依赖 | **剩余·未做**：P2，兼容层依赖。 |
| 6-05 | 新 | `AIBidirectionalSystem.ts:826；presence.ts:185,191,192,216,217；narrativeBoundaries.ts:73-74,81` | 无 id 的名词字面量：「孟老大」「白夷族长」「蛇傀」「六朝石匠」「老彝婆」「蛇祖」「灵飞镜」「潘师姐」 | 先在 ledger 登记实体，再按 id 引用 | P3 | ❄ AIB.ts | **部分**：`presence.ts` 中「白夷族长／蛇傀／六朝石匠」已按 id（数据表）。其余：`AIBidirectionalSystem.ts:826` 冻结（**需用户批准**）；`narrativeBoundaries.ts:73-74,81` 的「老彝婆／蛇祖／灵飞镜／潘师姐」无 id，需先在 ledger 登记实体。 |

文件名未写路径的都在 `src/modules/scenarioMods/` 下；`AIBidirectionalSystem.ts`、`narrativePromptState.ts`、`narrativeStateReconciler.ts`、`musicLibrary.ts` 在 `src/utils/`；`characterRagService.ts`、`eventReconcileService.ts` 在 `src/services/`。

## 附录 K　故意且 OK（不计入违规）

| # | 位置 | 内容 | 为什么 OK |
|---|---|---|---|
| K-1 | `runtime.ts:1018-1050,3327；:1062-1067；:4005-4007` | 旧档迁移哈希表、焚尸迁移、旧档补事件 | 迁移代码，只在旧档触发；审计 §F／§C 同样列为 P3 不动 |
| K-2 | `wuyuanOpenWorldSlice.ts:129-174,216-238,367` | 开放世界切片自带的人物／事件合同 | 自成合同的数据，审计 §C 建议不动；文件工作区有未提交改动 |
| K-3 | `narrativeBoundaries.ts:22-31` | `NARRATIVE_BOUNDARIES` 事件边界表（现仅 sudaji_south_pact） | 本身就是数据表，文件注释写明追加即可；扩展点已存在 |
| K-4 | `travel/defs/qingyuNanhuang.ts、qingyuWuyuanZones.ts` | 行旅区域／路线定义 | 声明式定义，id 键控，带类型；属内容数据放在 TS，随内容包迁移时处理（stage 集合那一行见 4-15） |
| K-5 | `utils/musicLibrary.ts:91-96,199-202` | stage→背景音乐映射 | 表现层配置，不影响剧情判定 |
| K-6 | `playerActionPresentation.ts:4-31,73-76` | 玩家动作第一人称展示句（含人名） | 玩家可见的 UI 文案；key 是事件 id，迁内容包时同迁 |
| K-7 | `branchDecision.ts:34` | 分支决策按钮文案 | UI 文案 |
| K-8 | `eventNarrativeView.ts:249` | 由 stage id 解析「第N关」标签 | UI 格式化 |
| K-9 | `CharacterManagement.vue:538-546；dev/combatTrial/*；*Playtest*.ts；r2AcceptanceFixtures.ts；views/*PlaytestStartView.vue；WorldSimulationPlaytestPanel.vue` | 试玩入口常量、测试夹具 | 按「不要列」规则排除；随内容包走（审计 §E 同） |
| K-10 | `aiService.ts:108-109,179；eventReconcileService.ts:38-42；backgroundAuditCore.ts:10-15；legacyNarratorPacket.ts:26-27,37；fixedInventoryContracts.ts:229；legacyNarrativeContract.ts:10-11；qingyuTurnLongRequests.ts:4-6；fastNarrativeDemo.ts:52-57；AIBidirectionalSystem.ts:205` | 超时、限额、提示词字数预算、叙事长度约束 | 框架／写作约束常量，不编码游戏设计 |
| K-11 | `cotCore.ts:32；defaultPrompts.ts:382` | 示例 id | 审计 §H 已判无害 |
| K-12 | `fixedEndingNarratives.ts:124-127` | `sceneDayPart` 时段切分（5／8／12／17／20 点） | 通用时段划分，非剧情数值 |
| K-13 | `ledger/guardFramework.ts` | 性别影子规则（shadow 模式） | 守卫框架本身，已是账本方向 |

## 附录 C　合规，仅标记（不评估、不建议改）

依 `CLAUDE.md` 与 `COMPLIANCE-REQUIREMENTS.md`：清单内条目是有意偏离，只标记；新增合规条目须用户确认。以下位置与六类违规的位置重叠或相邻，迁移时必须原样保留相关措辞。对应的 C／R 编号引自审计 §G 与清单，我只核对了行号确实存在，没有重新判定。

| # | 位置 | 内容 | 对应条目 |
|---|---|---|---|
| C-1 | `AIBidirectionalSystem.ts:844` | 「出场者全为 18 岁以上、缺年龄不猜」，与苏荔／云苍峰人设句同一行 | C01；若日后拆 D 类，这一句原样保留（审计 §G 同） |
| C-2 | `modularTurn.ts:225-226` | 年龄正则，命中即退稿 | C01 |
| C-3 | `runtime.ts:3873` | 「被程宗扬用麻古迷奸」改写为药物侵害表述 | C03／C05，清单 Q6 |
| C-4 | `characterResolver.ts:602-603,611,639-642` | 小紫「成年少女」、乐明珠「成年花苗新娘」等措辞（正是 1-01、1-05 所在行） | C01；迁移时措辞原样保留，改措辞须用户定 |
| C-5 | `relationships.ts:40-61` | `estimateNpcAge` 年龄下限 18（B1，用户 14:22 保留） | C01 |
| C-6 | `intimacyProfiles.ts:66-422` | 整份亲密档案（16 条） | R08–R12 / C10 / C06 / C02 |
| C-7 | `relationships.ts:213；runtime.ts:3877` | 「【内部约束·不入正文】」前缀过滤 | C05 |
| C-8 | `stanceProfiles.ts:559-565` | 阿夕姿态含「小孩子气」「主人」，与 `COMPLIANCE-REQUIREMENTS.md:65` 的 05b 旧词同词 | `COMPLIANCE-REQUIREMENTS.md` 没登记这个文件〔核：grep〕。只标记，是否新增条目请用户定 |
| C-9 | `character-registry.json（阿夕 goals／relationToProtagonist）；lcq.stage_05b.json（阿夕 personality）` | 「享受性爱…」「女奴/性伴侣」「淫媚」 | R43／Q10（已在清单）；动阿夕卡之前须先过用户 |

## 附录 M　方法

- 起点：复刻 `scripts/validate-ledger-ratchet.mjs` 的人名计数，得 1,949 处（与审计一致），按文件排序，逐个读上下文。
- 逐类 rg：stage id 字面量（`lcq.stage_*`、`03b|4b` 简写、`startsWith('lcq.')`）、事件 id（`lcq.event.*`、`event.*.done`）、章号（`第N章`、`chapter >= N`）、数值常量（`const X = 数字`、好感比较）、名词键控（`Record<string,…>` 的中文键、`byName`）。
- 对照数据：`mod-kit/entity-ledger/overrides.json`（22 实体；`chapterGates`、`namingMilestones`、`npcAddress`）、`mod-kit/game-numbers.qingyu.json`、`character-registry.json` 相位值、`ratchet-baseline.json`（3,277／57 个文件）。
- 没覆盖：`scripts/` 里的硬编码（只抽查了与 `characterResolver.ts` 重复的一处）；`mod-kit` 作者 JSON 内部是否有数值重复；`tests/` 夹具。
- 过程中在仓库外写了中间文件 `/tmp/xt_principles_hist.txt`、`/tmp/xt_inv/*`，未删。

## 附录 R　2026-10-14 修复轮（写模式）汇总

依据本文件与 `AXI-XIAOZI-BOTTOMLINE.md`。规则：不动冻结文件 `runtime.ts`／`AIBidirectionalSystem.ts`；合规项只标记；不编造 canon 文本；不写关键词字典；未 commit／push／删除文件；未跑 `dev/combat-trial/build.mjs`；未用任何模型、未打印任何 key。标注：〔核〕= 我跑过／读到；〔推〕= 推断。

### R.1 按类计数（96 行）

| 类 | 主题 | 已修 | 部分 | 剩余·冻结 | 剩余·待用户定 | 剩余·未做 | 合计 |
|---|---|---:|---:|---:|---:|---:|---:|
| 1 | 角色数据 | 4 | 2 | 0 | 0 | 7 | 13 |
| 2 | 剧情事实 | 3 | 0 | 9 | 5 | 19 | 36 |
| 3 | 数值阈值 | 4 | 0 | 2 | 0 | 1 | 7 |
| 4 | 阶段门／事件门 | 3 | 0 | 4 | 14 | 6 | 27 |
| 5 | 旧路径／TS 字面量 | 2 | 1 | 3 | 1 | 1 | 8 |
| 6 | 实体名词 | 0 | 3 | 0 | 0 | 2 | 5 |
| | **合计** | **16** | **6** | **18** | **20** | **36** | **96** |

「未做」不是“不用做”：主要是落点不存在（要先新建账本结构）、动 `storyContext.ts` 核心 prompt（须先读裁定簿并同提交追加条目）、或体量大（`narrativeBoundaries.ts` 的 10 条 `throw` 要 `GuardRule` 化）。每行末列写了原因。

### R.2 已修的做法与验证

| 项 | 做法 | 验证 |
|---|---|---|
| 1-01／1-02／1-03／1-04／1-05 | 小紫／殇侯／乐明珠的展示文本：小紫 role／description／appearance／personality 读 registry 04b／05b 相位；殇侯、乐明珠的 hidden／revealed 文本、小紫的种族变体与三句【已知身世】进 ledger `identityDisplays`（逐字）；代码只剩选档判定 | `_newbot_tmp/modfix-1014/golden_resolver.mjs`：37 关逐个 `resolveScenarioCharacters`＋南荒四关×6 种揭示状态的 `syncNanhuangIdentityDisplay`，改前改后 JSON **逐字节一致**（4,334,467 字节）〔核〕 |
| 1-08 | 七个对主角称呼进 ledger `naming.npcAddress`，删 `addresses` 表 | `eq_addr.mjs`：6 个 id×4 个章号取值与原字面量一致〔核〕 |
| 2-15／2-29／2-31 | 读 `chapterGates`（72／105／121）与 `bi_ji` 面板档 `fromChapter`（115） | 报错文字、取值不变；全量测试〔核〕 |
| 3-01／3-02／3-03 | `game-numbers.qingyu.json` 新增 `affinity`、`reputation`，`npcCard` 加 `maxPresentActors*` | `tsc --noEmit` 零错误；全量测试〔核〕 |
| 3-07 | `locationLoot` 读 `DEFAULT_CURRENCIES[币种].价值度`；两处提示词从 `GAME_NUMBERS.currency` 插值 | `eq_currency.mjs`：提示词子串与改前一致，三币种 1／100／2000〔核〕 |
| 4-01 | `mod-kit/entity-ledger/card-time-gates.json`（运行时与构建脚本共读，`at` 保留各侧原行为） | `cmp_gate.mjs` 先确认共有 7 关逐项一致；`apply-character-cards-v3-to-mod.mjs --dry-run` 改前改后输出相同（projected 1378／touchedStages 32／touchedCharacters 211）〔核〕 |
| 4-20／6-05（部分） | `mod-kit/entity-ledger/cast-gates.json`，41 条有序规则；`presence.ts` 通用求值；旧 id `canon.character.15b71fd1c8／81be8593ee` 改主 id；「白夷族长／蛇傀／六朝石匠」改按 id | `fuzz_presence.mjs`：随机状态 4 万例（含 permanentOnly）＋ `departedPresentNames`／`stampDepartedCast` 500 例，与旧实现输出（含顺序）逐项相等；3000 例里 2997 例非空、1700 种不同结果，说明确实覆盖到分支〔核〕 |
| 4-21 | `STAGE_REGION` 进 `overrides.json` 的 `stageRegions` | 与 HEAD 字面量逐项（含顺序）比对一致，37 项〔核〕 |
| 5-05／5-06 | 20 条固定拍正文、5 句承接句进 content pack `texts.json`（`fixed.beat.<事件id>.<动作id>`、`ending.bridge.<结局id>`） | `eq_beats.mjs`：对 HEAD 原文逐条断言一致；`content-packs.mjs --check` 通过〔核〕 |
| 6-02／6-03（部分） | 新增 `getRegistrySpeechStyleById`，`npcCardLayer.ts` 改用 | 原先取的就是该 id 的规范名，等价〔推，读码〕；全量测试〔核〕 |

### R.3 八人入档（`CANON-DECISIONS.md` #215）

用户批准的文本逐字写入：樨夫人＝白夷族长的妻子；小魏＝白湖商馆的年轻护卫，曾走过南荒；石刚＝白湖商馆的护卫，使雁翎刀；卡瓦＝花苗的年轻汉子；蛇傀＝阁罗的随从，长得像蛇；黑舌＝阁罗的随从；达古＝鬼王峒秘营的巫师，以腹语驱使鬼战士；娄蒙＝红苗族长之子，未来的继承人。文本不含章节号。

- **没建重复 card**：八人在 registry 里本来就有条目（id 为 `lcq.character.nanhuang_*`；樨夫人、娄蒙的旧 `canon.character.15b71fd1c8／81be8593ee` 是 `idAliases`，裁定 #206／#210）〔核〕。这次在**同一条目**上写：
  - 6 个新人：`staticProfile.identitySummary`＋逐关 `stage-projection` 相位（identity／description／status），原先这些相位的 scope 写成 `stage`，全仓没有读取者〔核：grep〕，等于没生效，现改成 `stage-projection` 才被 `characterResolver` 读到；
  - 樨夫人（stage_04、04b）、娄蒙（stage_05b）：只**新增**相位，不覆盖已有的更长的 `identitySummary`（含丹宸、后受程宗扬影响等）；
  - 关卡里的阶段档（tracked authority overlay：`mod-kit/canon-authority-overlays/lcq.stage_03b／04／04b／05b.json` 共 17 张卡）同步 `description` 与 `profile.origin`。**`role` 一律不动**（已有测试 `authorConflictCorrections.test.mjs` 把 role 当“短标签”断言：白湖商馆护卫、鬼王峒巫师、红苗族长之子）。
- 实际生效（快照对比）：只有这八人的 `description`、`profile.origin`、`profile.notes`（多一条【阶段身份】）变了，其余所有角色在 37 关×6 状态下与改前一致〔核〕。
- **性格、谈吐、底线**：用户没提供，留空。
- **蛇傀、黑舌「第79章起＝阁罗的生意伙伴」没有写入**：南荒没有第79章的关卡边界。账本 `stageOpeningChapters`：stage_04b 起于 56、stage_05 起于 74、stage_05b 起于 87〔核：overrides.json〕；二人的 `presenceWindow` 是 78–80，所以第79章落在 04b 中间，per-stage 相位表达不了。现在写的是 79 章前的身份，在 04b 里对第79–80章也是这个（与改前口径一致，改前就是「阁罗的随从…」）。要做章级身份门，需要新规则（例如相位带 `fromChapter`，或 ledger `naming` 增一个身份通道），我没有新增代码规则，等用户定。
- **合规，只标记，没改写**：第78章行 11630–11640（〔推〕应是樨夫人卡 `humanNotes` 所引的第78章使者场面；她现有 registry 卡 `appearance`／`visualOutfits` 里已有「半褪」「卧于窗下（情色场景）」字样〔核〕，未动）；第79章行 11885–11886；第87章约行 12916；娄蒙之妻丹宸：`liuchao.character.dan_chen` 现卡外貌含露骨描写、`storyAge` 为空，`COMPLIANCE-REQUIREMENTS.md` F11／F12 已提到丹宸〔核：grep〕；我没改，也没新增合规条目。

### R.4 数据缺口（留空，没补）

1. **阿夕底线**：131 个提交里 `principles` 始终为空；仅有的原文扫描结果是 1 条低置信（`bottomline-scan/阿夕.json`：「不犯大错：对族群有大害的事绝不参与」），按落地规则不采用；没有来源，不写。
2. **小紫底线**：曾有 3 条（用户 07-04 修正过），2026-10-04 第八批随整张真实人格卡移入 `privateProfile`；第 3 条含「毒宗」与裁定 #188 冲突，需剧情策划另写「当期适用」版本。没有来源，不写。
3. 殇侯 role：registry 04b 相位「老向导」≠ 代码字面量「云氏雇用的老向导」（已按代码字面量进 ledger），以哪个为准待定（1-04）。
4. 蛇傀／黑舌第79章身份（R.3）。
5. 凝羽、乐明珠南荒关的底线（审计 O10，已有）。
6. 阶段档有、总表没有的 12 个实体：阿葭、叶媪、白夷族长、易勇、小津、易雄、六朝石匠、黑衣丽人（`lcq.character.nanhuang_*`），宁成（`liuchao.character.ning_cheng`），张恽（`lyg.character.np011`），何漪莲（`lyl.character.he_yilian`），王蕙（`lyl.character.np016`）；它们的文本只存在于阶段档，要进总表须有用户批准的描述，我没建。
7. 谈吐／性格：八人均无。

### R.5 测试与构建

- `npm run canon:build`（含 37 关校验、单并发全量测试）全绿，两次：tests 1754／pass 1748／fail 0／skipped 6〔核〕。`npm test`（并发）同数字〔核〕。
- 基线 1749 passed／0 failed／5 skipped；差 1 条是**跳过数 5→6**：`tests/baihuLinesRealPath.test.mjs:193` 的「the built bundle embeds the same quest-line catalog…」在 bundle 比 `generated/catalog.json` 旧时自动跳过（我改了 `texts.json`、重新生成了 catalog，内容包 `4bb9a77919c7b73f` → `26ccf8b2aa77a311`）；外部重跑 `dev/combat-trial/build.mjs` 后应转为通过〔推：跳过原因文字为「bundle is older than the generated catalog」〔核〕〕。
- 开工时第一次 `npm test` 曾因 Node 25 并发 worker 的 IPC 反序列化错误掉 1 个文件（`xieyiEntrustmentFate`，单跑 11/11 通过）；`canon-build.mjs` 里已注明这是已知偶发，改用单并发〔核〕。
- `node scripts/content-packs.mjs --check` 通过：`Content Pack 26ccf8b2aa77a311: 14 contracts, 4 playtests, 3 entries`〔核〕。`tsc --noEmit` 零错误〔核〕。`npm run canon:build` 里的 `apply-character-cards-v3-to-mod.mjs` 会重建 `stages-pre-v3-cards-backup/`（脚本自己的备份目录，非我删除）。
- 构建 SHA：**待填**（我没跑 `dev/combat-trial/build.mjs`）。

### R.6 改动文件

- 代码：`src/modules/scenarioMods/{characterResolver,presence,fixedEndingNarratives,legacyNarratorPacket,narrativeBoundaries,secondaryLines,locationLoot,affinityLadder,reputationLedger,npcCardLayer}.ts`、`ledger/naming.ts`；`src/utils/prompts/definitions/{businessRules,worldStandards}.ts`；`scripts/apply-character-cards-v3-to-mod.mjs`。
- 数据：`mod-kit/entity-ledger/overrides.json`（`identityDisplays`、`stageRegions`、`npcAddress`、樨夫人实体）、新 `card-time-gates.json`、新 `cast-gates.json`；`mod-kit/game-numbers.qingyu.json`；`mod-kit/canon-authority-overlays/lcq.stage_03b…／04／04b…／05b.json`；`src/modules/contentPacks/packs/qingyu/texts.json`；`CANON-DECISIONS.md`（#215）；源卡 `character-cards-v3.json`（gitignored，改前备份在 `_newbot_tmp/modfix-1014/`）。
- 构建产物（canon:build 重写）：`character-registry.json`、`builtins/data/lcq.stage_03b／04／04b／05b.json`、`builtins/manifest.json`、`mod-kit/entity-catalog/index.json`、`contentPacks/generated/catalog.json`。
- 文档：本文件、`BAIHU-NINGYU-LMZ-DEMO-DELIVERY.md` §13。
- 探针与快照（未删）：`_newbot_tmp/modfix-1014/`。

## 附录 F　冻结文件里需用户批准才能修的位置（精确行号，2026-10-14 工作区）

`AIBidirectionalSystem.ts`（5436 行；开工前已有他人未提交改动，行号可能漂移；本轮复核过的行号：761／823／825／826-827／828／829-830／842／844／851／855／856／874／896／2861／2974／2982-2986，227／891／1926／1932 为 `lcq.` 前缀字面量）：

| 行 | 内容 | 对应行 |
|---|---|---|
| 761, 2723 | 王哲留下结局的 `sourceEventId:'lcq.event.s02_02'` 字面量 | 2-08 |
| 825, 848, 907 | `wangZheDead`：王哲、段强已故（事件 s02_02 或 stage 号 >2） | 2-02 |
| 823 | `canon.character.a33134d511`（岳帅，canon-only，主 id，无需改） | — |
| 826–827 | 南荒阶段正则 `03b/4/4b/5b`（两处）、「孟老大」名词 | 4-02, 6-05, 2-03 |
| 828, 847 | 冰蛊压力提示 `iceGuPressure` | 2-07 |
| 829–830 | 缺席名单凭事件 `regroup_caravan_envoy／weapon_deal_with_geluo`；:830 的 `canon.character.15b71fd1c8` 应改主 id `lcq.character.nanhuang_xi_furen`（解析结果相同） | 2-03 |
| 842, 844 | 黑魔海是宗派／苏荔是花苗族长／血虎由易虎改造（:844 含 C01「出场者全为18岁以上」，须原样保留） | 2-01, C-1 |
| 851 | 鬼巫王死否凭事件 `ghost_king_swallowed` | 2-04 |
| 855 | 「毒宗名号按121章书信、122章对白」；岳帅性别；易虎失踪等 | 2-05 |
| 856 | 蛇彝村空村 | 2-06 |
| 874, 896 | `eventId==='lcq.event.ningyu_regicide_offer'` 并入静默守卫 | 4-27 |
| 874–919 | 南荒守卫直接 `throw`，未走 `GuardRule` | 5-08 |
| 2861 | 南荒每拍推进 120 分钟 | 3-04 |
| 2974（及 771） | 订约成功固定正文，与内容包重复 | 5-07 |
| 2982–2986 | 冰蛊身体信号固定正文 | 2-07 |
| 227, 825, 891, 1926, 1932 | 以 `lcq.` 前缀字面量决定走不走账本／守卫 | 5-02 |

`runtime.ts`（行号取自 2026-10-14 工作区）：

| 行 | 内容 | 对应行 |
|---|---|---|
| 1418, 2764 | `lcq.` 前缀字面量 | 5-02 |
| 1150, 1497, 1871–1884, 1908, 1980–1984, 2000, 2381–2384, 2762–2764, 3375–3377, 3769–3773, 4005–4007 | 按事件／关 id 写的结算特例 | 4-26 |
| 2548–2549, 3473 | 节奏常量 10／6／4 （`eventReconcileService.ts:37` 同阈值，非冻结，但与之成对） | 3-06 |
| 3087–3092 | 把「易虎之死」改写成「易虎失踪」 | 2-36 |
| 3447–3458 | `getRegistryBottomLine(name)` 按显示名取底线 | 6-03 |
| 3878, 3888, 3893 | 南荒阶段数组；:3888 为 `canon.character.a33134d511`（岳帅，主 id） | 4-13 |
| 3873, 3877 | ⚖ 合规相关改写（C03／C05），只标记 | C-3, C-7 |

## 附录 D　双 id 体系调查：`canon.character.*` 与 `liuchao.character.*`

> 术语（2026-10-14 统一，见 `docs/CHARACTER-DATA-STRUCTURE.md`）：**角色总表**＝`character-registry.json`；**阶段档**＝各关 `canon.characters[]` 的一条（本附录原称“场景卡”）；**角色卡**＝仅指每回合现算给模型看的页面，不存档。下文已按此改称，数字与结论未变。

用户的问法：存在两套角色 id，`canon.character.*`（原著总表 registry）与 `liuchao.character.*`（游戏 阶段档）；原则是一张总表、一个实体一个 id、代码只引 id。先调查：各自存什么、谁读哪个、为何分开、如何映射、阶段档 是否只是重复 registry。

### D.1 结论（白话）

**不是两套并行的 id，而是同一张总表加一层“各关阶段档”。** 〔核〕
- **总表 = `character-registry.json`**：322 个人，每人一个 id，存“这个人是谁”的静态档案（外貌、性格、谈吐、底线、称呼、逐关身份……）。
- **阶段档 = 每一关 `builtins/data/<关>.json` 里 `canon.characters[]` 的一条**：存“这个人在这一关的动态状态”（在哪个地点、什么境界、带什么技能物品、归属哪个势力、级数、哪几章在场），并用**同一个 id** 指回总表。游戏开局物化时，`resolveScenarioCharacters` 按 id 把总表里的静态档案写回阶段档。
- 前缀只是历史来源，不是两个空间：总表里 `liuchao.character.*` 170 人、`canon.character.*` 97 人、`lcq.character.*` 22 人、`lyg.character.*` 20 人、`lyl.character.*` 13 人。`canon.character.<10位哈希>` 只是“**没有任何阶段档的人**”（canon-only）的自动编号（`md5(规范名)` 前 10 位，`scripts/build-character-registry.mjs:35`）；有阶段档的人沿用阶段档里的 id（同文件 :21-26 的 `nameToId`）。所以你看到的“canon.* 是总表、liuchao.* 是阶段档”是一个**错觉**：总表里同样装着 `liuchao.*`。
- 名字上容易混：`canon.characters`（JSON 路径，阶段档所在的字段）和 `canon.character.xxx`（id 前缀）毫无关系。

### D.2 各自存什么（数字均取自 2026-10-14 工作区）〔核〕

| | 总表 registry | 阶段档 per-stage profile |
|---|---|---|
| 位置 | `src/modules/scenarioMods/builtins/character-registry.json`（`scripts/build-character-registry.mjs` 由源卡 `character-cards-v3.json` 生成，不可手改） | 37 个 `builtins/data/*.json` 的 `canon.characters[]`（来源：生成关卡＋tracked authority overlay；其中八个南荒配角的卡**只**在 overlay 里） |
| 规模 | 322 条 | 1386 条卡实例，238 个不同 id |
| id 前缀 | liuchao 170／canon 97／lcq 22／lyg 20／lyl 13 | 与总表同一批 |
| 存什么 | 静态：身份、外貌、性格、谈吐、底线、称呼、关系、逐关相位（`stage-projection`）、立绘分层、级数/年龄事实、别名 | 动态：`locationId`(415)、`realm`(933)、`skillIds`(245)、`techniqueIds`(107)、`itemIds`(254)、`affiliations`(1231)、`level`(10)、`presenceWindow`(14)；以及总表静态字段的**复制品**：`profile.personality`(1264)、`profile.origin`(1198)、`profile.appearance`(964)、`description`(904)、`profile.notes`(565)、`profile.race`(427) |
| 对得上吗 | 226 条被至少一张阶段档引用；96 条没有阶段档（95 条 canon-only＋1 条 `lcq.character.biling_woman_ch80`） | 226 个 id 在总表；**12 个不在**（见 R.4-6）；0 个靠 `idAliases` 对上 |

### D.3 谁读哪个（file:line，现状）〔核〕

- 总表 → `characterResolver.ts:260-266` 建 `byId`（含 `idAliases`）／`byName`；`:286` `resolveOne` 先按 id 再按名取条目，把 personality／notes／race 覆盖到阶段档，appearance／origin 仅缺失时补（场景特写不被抹）；`:336` `resolveScenarioCharacters`；入口：`builtins/index.ts:18`（内置关加载时）、`runtime.ts:3251-3254`（旧档按 registry 版本对齐）。
- `characterResolver.ts:348-380,484` 的 `hasRegistryEntry`／`getRegistryIdentity`／`getRegistrySpeechStyle(ById)`／`getRegistryBottomLine`：按名（`ById` 版本按 id）。
- `namedEntities.ts:2,11`：把总表＋账本＋实体目录合成一张“标签→id”查找表（`canonicalEntityId` 对 `idAliases`、别名、旧 id 一律归到主 id）；绝大多数提示词／守卫里的人名正则经 `entityNamePattern(id)` 取。
- `ledger/affinityIdentity.ts:1-16`：名字→id 表，来自总表＋账本别名。
- `services/characterRagService.ts:23,156`：总表做向量检索。
- 阶段档 → `runtime.canon.characters`：`storyContext.ts`（聚焦人物）、`legacyNarratorPacket.ts`（在场人物）、`presence.ts`（`presenceWindow`）、`npcCardLayer.ts` 等。
- 代码里直接写死的 `canon.character.*`（src 内 .ts／.vue）：`characterResolver.ts:540-541,627`、`narrativeBoundaries.ts:72,94`、`runtime.ts:3888`、`AIBidirectionalSystem.ts:823,830`、`musicLibrary.ts:191`——除 `AIBidirectionalSystem.ts:830` 外都是**岳帅(a33134d511)／高俅(8da99e7c5f)**，这两人是 canon-only，canon.* 就是他们的主 id，没有问题。`:830` 是樨夫人的旧 id（见 D.5）。

### D.4 为何分开〔核：git／文档〕

- 2026-07-01 `23accb3b`「角色 RAG（向量检索召回）＋全量档案瘦身＋同人双卡合并」创建总表与 `characterResolver.ts`。设计文档 `CHARACTER-RAG-DESIGN.md` §1 列的问题之一就是“**档案重复**：静态 profile 在每关每角色重复（占 stage ~30%）”；`characterResolver.ts` 文件头说明：mod 阶段文件里角色只保留动态字段，静态档案在“物化到存档”那一刻从共享总表按 id／name 还原。即：**总表正是为了消灭阶段档里的重复而建**。
- 构建脚本注释（`build-character-registry.mjs` 头）“id 必须映射 stage 角色 id”（吸收 Codex 评审）：总表 id＝阶段档 id，因此不会出现两个空间。
- 真正出现“同一个人两个 id”只有两处，都已有人为裁定：
  1. `CANON-DECISIONS.md` #210（2026-10-06）：「娄蒙／樨夫人按引用多数采用关卡 id、旧 registry id 留别名」→ `idAliases`（`e9c541f7`）；#206：地点／势力同名多 id 同理。
  2. 敌人表另有 `lcq.enemy.*` id（`dan_chen`、`gui_wu_wang`、`blood_tiger_yi_hu` 等）→ `character-levels.qingyu.json` 的 `idAliases`（11 条）。

### D.5 如何映射（alias 表）〔核〕

| 机制 | 位置 | 内容 |
|---|---|---|
| `idAliases`（总表条目字段） | `character-registry.json`，由源卡经 `build-character-registry.mjs:139` 带出 | 2 条：`canon.character.15b71fd1c8`→`lcq.character.nanhuang_xi_furen`，`canon.character.81be8593ee`→`lcq.character.nanhuang_loumeng`；`characterResolver.ts:264`、`namedEntities.ts:11`、`build-entity-index.mjs:14` 读 |
| 级数表别名 | `mod-kit/entity-catalog/character-levels.qingyu.json` 的 `idAliases`；`characterLevels.ts:6` 读 | 11 条（上面 2 条＋ 9 条 `lcq.enemy.*`→人物或敌人主 id） |
| 名字别名 | 总表 `aliases`、账本 `entities[].aliases`、`namedEntities` 的 `lookup` | 标签→id，唯一才解析 |

### D.6 阶段档 是否只是重复 registry？

**一半是，一半不是。** 〔核：字段计数＋读码〕
- **是重复的部分**：`personality`（总表非空即覆盖）、派生 `notes`（每次重算）在物化时由总表写回；`race` 仅在阶段档缺失或为默认「人族」时被总表覆盖；`origin`／`appearance` 缺失时由总表补；构建期 `apply-character-cards-v3-to-mod.mjs` 也在往阶段档里投影同一份。这些字段在阶段档里是“缓存副本”。
- **不是重复的部分**：地点、境界、技能、物品、归属、级数、出退场窗口，总表不存；阶段档里的 `description`／`role`／`origin` 有一部分是**场景特写**（刻意不被总表强制覆盖，见 `apply-character-cards-v3-to-mod.mjs` 里“appearance/origin 保留不动：场景/提取特定”的注释）。
- 所以**不能“删掉阶段档改读总表”**；能做的是“阶段档只保留 id＋动态字段，静态文本一律由总表按 id 补”。要让阶段档不再需要抄 `description`，需要决定一个行为变化：目前 `characterResolver.ts` 只对 8 个主角（程宗扬、凝羽、苏荔、阿夕、谢艺、武二郎、祁远、云苍峰）在 03b／04／04b 三关用相位 `description`／`identity` 覆盖阶段档；其余人物的阶段档 `description` 是作者原文。把它推广到所有有相位的人物，会改很多人物在很多关的描述。（见 D.8 决定 1。）

### D.7 本轮已做／没做

- 已做（安全且不触冻结文件）：
  - 樨夫人、娄蒙：**没有新建重复 card**；字段补在总表条目上（新增 `stage-projection` 相位），阶段档只同步 `description`／`origin`（R.3）。
  - 代码里对樨夫人／娄蒙的旧 id 引用改主 id：`legacyNarratorPacket.ts`；`presence.ts` 的规则表（改成数据后）也用主 id。解析结果相同（`canonicalEntityId` 归一）。
  - 新增按 id 取谈吐的 API；`npcCardLayer.ts` 不再 id→名→查。
- 没做：
  - `AIBidirectionalSystem.ts:830` 仍写旧 id（冻结，需批准；解析结果相同，不影响行为）。
  - 12 个“阶段档有、总表没有”的实体没有补进总表（缺用户批准的描述）。
  - 不删 `idAliases`／不合并 `lcq.enemy.*`：它们是裁定产物（#206／#210），删了会让旧存档里的旧 id 解析失败。

### D.8 需要用户决定

1. 阶段档的 `description`／`role` 是否改为“总表相位优先”（见 D.6）；这会批量改人物描述，需先抽样确认。
2. 12 个阶段档专有实体是否进总表，描述由谁给。
3. 是否把 `lcq.enemy.*` 与对应人物 id 并为一个（现用别名表过渡；涉及战斗合同引用，需战斗侧一起改）。
4. 是否同意 `AIBidirectionalSystem.ts:830` 把旧 id 换成主 id（一行，行为不变）。
