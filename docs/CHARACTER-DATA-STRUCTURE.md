# 角色数据结构（三层）

2026-10-14。数字与 file:line 取自当日工作区（已逐项核对）；调查全文见 `docs/handoffs/2026-10-14/HARDCODED-SETTINGS-INVENTORY.md` 附录 D。

2026-10-15 更新（用户 01:02 批准，裁定 #216）：总表 330 条（+8）；描述／身份以总表为准（§7.1）；章级身份切换机制（§7.2）；章门读账本（§7.3）；§3、§4、§5 已按此改写，file:line 为 10-15 复核值。

2026-10-15 01:11 再更新（裁定 #217）：章号已按原著核实并切换（阁罗改名 78、乐明珠揭示 47），§7.3 重写；12 人总表描述已逐字补齐（§4、§7.4）；关键身份切换（宁成、张恽、何漪莲）走总表相位（§7.4）。

## 0. 术语（代码注释与文档统一用这套）

| 说法 | 指什么 | 不是什么 |
|---|---|---|
| **角色总表** | 唯一的角色数据表：一个角色一个 id、一条记录（`character-registry.json`）。 | 不叫“注册表／总卡”混用；不是存档。 |
| **阶段档**（per-stage profile） | 每个关卡文件里 `canon.characters[]` 的一条：同一个 id 在这一关的动态状态。此前口头称“场景卡”，改称阶段档以免与“卡”混。 | 不是第二张角色表，不是卡。 |
| **角色卡** | **仅指**每回合由总表＋存档状态生成、给叙事模型看的页面（几行文字）。 | 不是独立存档；**禁止新建角色卡存档**。 |
| 源数据 `character-cards-v3.json` | 总表的构建输入（gitignored），文件名沿用历史。 | 不是角色卡；运行时不读。 |

## 1. 三层

| 层 | 文件 | 存什么 | 谁读（file:line） |
|---|---|---|---|
| ① 角色总表 | `src/modules/scenarioMods/builtins/character-registry.json`（330 条：liuchao 170／canon 97／lcq 30／lyg 20／lyl 13）。由 `scripts/build-character-registry.mjs` 从源数据生成，**不可手改**。 | 静态：身份、外貌、性格、谈吐、底线、称呼、别名 `aliases`、旧 id `idAliases`、逐关相位 `phaseIdentities[scope=stage-projection]`。 | `characterResolver.ts:264-270`（建 `byId`／`byName`，含 `idAliases`）；`:294` `resolveOne`；`:341` `resolveScenarioCharacters`；`:385` `getRegistrySpeechStyleById`。`namedEntities.ts:11,15`（`canonicalEntityId` 把别名／旧 id 归到主 id）。`ledger/affinityIdentity.ts`。`services/characterRagService.ts:23,155`（向量检索）。`scripts/build-entity-index.mjs:14,18` |
| ② 阶段档 | 37 个 `src/modules/scenarioMods/builtins/data/<关>.json` 的 `canon.characters[]`（1386 条，238 个不同 id，现已全部能按 id 或 `idAliases` 对到总表）。由 `mod-kit/generated/deepseek-v4-flash/<书>/stages/*.json`＋`mod-kit/canon-authority-overlays/` 经 `scripts/sync-builtin-mods.mjs` 生成。 | 动态：见 §4。 | 内置关加载时 `builtins/index.ts:14-20` 调 `resolveScenarioCharacters`，按 id 把总表静态字段写回（description／origin 以总表本关相位为准，见 §7.1）；开档后以存档里的 `runtime.canon.characters` 副本为准；旧档由 `runtime.ts:3243-3254,3383-3434` 按总表版本号（`REGISTRY_VERSION`）重新对齐。 |
| ③ 角色卡（每回合） | 无文件、不存档，每回合现算。 | 见 §2。 | 叙事模型。 |

## 2. 角色卡怎么建（现状，两条路径）

输入都是存档里的 `runtime.canon.characters`（即②物化后的副本，**不是每回合重读总表**），加存档里的好感、记忆、事件：

1. **模块化路径**：`legacyNarratorPacket.ts:208` `readPresentActors` 为在场人物组 `presentActors`（姓名、称呼、种族、外貌首句、`traits` 等），前 `maxCards`（=2）人再调 `npcCardLayer.ts:57` `readNpcCard`，得到有界的 `actor.card: string[]`（立场→好感上限→阶段门→底线→承重保护→最近记忆→相关大事，超出 `maxCardChars`=1400 从末尾丢，上限全在 `GAME_NUMBERS.npcCard`），谈吐由 `getRegistrySpeechStyleById`（总表）补位。叙事提示里 `presentActors` 随场景材料经 `buildCompactModuleNarrativePrompt`（`legacyNarratorPacket.ts:591`，调用点 `AIBidirectionalSystem.ts:864`）以 JSON 发给模型，超 10000 字时先缩外貌／特质／谈吐，不删出场者；渲染计划试点另在 `:463`／`trimPacketToBudget :522` 有自己的字节预算。`fastNarrativeDemo.ts:505` 另有一份只含姓名＋特质的 `presentActors`，不带卡。
2. **旧路径**：`storyContext.ts:714` `buildFocusedCharacterPrompt`（调用点 `:1058`）→ `:553` `formatFocusedCharacter` 逐人拼“身份／归属／性格／谈吐／外貌／记忆／正典备注”行，最多 8＋名字召回到 12 人。

底线、禁用、身份门禁都读**当前关投影后**的 `profile.notes`，不回落到静态总表（`npcCardLayer.ts` 文件头）。

## 3. id 与 alias 规则

- 一个角色一个主 id，主 id 住在总表；阶段档用同一个 id 指回总表。前缀（liuchao／canon／lcq…）只是历史来源，不是不同空间。`canon.character.<md5 前10位>` 只是“没有任何阶段档的人”的自动编号（`build-character-registry.mjs:35`；有阶段档的人沿用阶段档 id，`:21-26`）。
- 旧 id 只能做 alias：`idAliases`（裁定 #210、#215、#216）目前 6 条——`canon.character.15b71fd1c8`→`lcq.character.nanhuang_xi_furen`（樨夫人），`canon.character.81be8593ee`→`lcq.character.nanhuang_loumeng`（娄蒙）；另 4 条是阶段档里的少数派 id，总表早有同一个人的条目（2026-10-15）：`lyg.character.np011`→`liuchao.character.zhang_yun`（张恽）、`lyl.character.he_yilian`→`liuchao.character.he_yilian`（何漪莲）、`lyl.character.np016`→`liuchao.character.wang_hui`（王蕙）、`liuchao.character.ning_cheng`→`lyl.character.np043`（宁成）。另有敌人表 `character-levels.qingyu.json` 的 `idAliases`（11 条，`characterLevels.ts:6` 读），指敌人 id→人物主 id。
- 代码引用人物只写 id；显示名／别名一律经 `namedEntities`（`entityNamePattern`、`canonicalEntityId`）解析，不再手写名字正则。
- 例外已清：`AIBidirectionalSystem.ts:830` 原写樨夫人旧 id，2026-10-15 经用户批准换成主 id `lcq.character.nanhuang_xi_furen`（冻结文件仅此一行；`entityAliases`／`entityNamePattern` 结果与旧 id 相同，已核）。该文件里余下的 `lcq.enemy.ge_luo` 是敌人表 id，不是人物别名 id，另议（§5-3）。

## 4. 阶段档字段：哪些是总表副本，哪些是动态

（非空字段计数，37 关 1386 条）

- **总表副本**（物化时由总表写回，或构建期投影进去）：`profile.personality` 1264、`profile.notes` 565（每次重算）、`profile.race` 427、`profile.origin` 1198／`profile.appearance` 964（仅缺失时补）。
- **半副本**：`description` 904、`role` 1386——总表本关相位（`stage-projection`）给了 `description` 的人物，一律以总表为准（§7.1，2026-10-15 起，原先只有 8 个主角在 03b／04／04b 如此）；总表没给的保持阶段档原文，当缺口兜底。
- **动态，只在阶段档**：`locationId` 415、`realm` 933、`skillIds` 245、`techniqueIds` 107、`itemIds` 254、`affiliations` 1231、`presenceWindow` 14、`level` 10（级数的权威表是 `mod-kit/entity-catalog/character-levels.qingyu.json`）。
- 反向缺口（2026-10-15 已处理）：原先阶段档有、总表无的 12 个 id——阿葭、叶媪、白夷族长、易勇、小津、易雄、六朝石匠、黑衣丽人 8 人以现有 id 入总表（2026-10-15 01:11 起已按用户批准的逐字描述填入 `staticProfile.identitySummary`，并按各自出场的关补只含 `description` 的 `stage-projection` 相位；身份／外貌／性格仍空；`master-description-pending` 标记已去）；宁成、张恽、何漪莲、王蕙 4 人总表早有条目（此前靠名字回落解析），其阶段档 id 记为 `idAliases`。总表有、无阶段档的仍是 96 条。

## 5. 计划：阶段档只留 id＋动态字段；待用户决定

计划：静态文字不再抄进阶段档，一律运行时按 id 取总表；角色卡的静态部分也按 id 取总表，阶段档只供动态字段。**不能删阶段档改读总表**（§4 动态字段总表没有）。

2026-10-15 已决：
1. 阶段档的 `description`／身份一律“总表相位优先”——已落地，见 §7.1（殇侯待用户裁定，暂保持原行为）。阶段档里的旧文字**没有物理删除**：6 个 tracked authority overlay 把整张 `canon.characters` 的源快照写在 `from` 里（`canon-authority-overlay.mjs` 逐字比对），源文件一改就报 drift；改为运行时按总表覆盖，旧文字只作缺口兜底。
2. 8 个阶段档独有实体入总表、4 个记别名 id——已落地，见 §3、§4。
3. `AIBidirectionalSystem.ts:830` 旧 id 换主 id——已落地。

仍待用户决定：
- ~~是否合并 `lcq.enemy.*` 与人物 id~~（2026-10-15 22:21 用户已定方向：敌人种类作为总表条目、沿用原 id，不改合同；见 §8，裁定 #220）。
- 角色卡静态部分是否改为每回合直接读总表，而不是读存档里的副本（现状让旧档在版本号变化前保持旧文字）。
- 殇侯是否也纳入总表优先（账本 `masterPrecedence.pendingIds`；注意账本 `identityDisplays` 的「云氏雇用的老向导」与总表 04b 相位 role「老向导」本就不一致，见 R.4-3）。

## 6. 给叙事模型的结构提示：不加

不在角色卡里加“这是角色卡／来自总表”之类的提示行。理由：模型看不到也不需要知道存储分层；`card` 键和各行的中文标签（立场、阶段门、底线、最近记忆）已自说明；场景材料有字数预算（`buildCompactModuleNarrativePrompt` 的 10000），多一行就要从别处挤。我没做过“有／无提示”的对照试验，所以这是设计判断，不是实测结论。若日后确有人物混淆的证据，再加一行固定常量、≤40 字，并计入 `maxCardChars`。

## 7. 总表优先、章级身份切换、章门读账本（2026-10-15，裁定 #216）

### 7.1 总表优先（`characterResolver.ts:309-311`）

- 规则：总表该关 `stage-projection` 相位的 `description` 非空 → 覆盖阶段档 `description`；相位的 `identity` 非空 → 覆盖阶段档 `profile.origin`（`role` 原本就按相位覆盖）。相位给的是空值 → 不动阶段档原文（缺口，不编造）。没有该关相位的人 → 不动（总表静态 `identitySummary` 是全书快照，不回落，否则会把后期身份带进早期关）。
- 通用：对所有有总表条目的人物按 id 生效；删掉了原来只对 8 个主角在 03b／04／04b 生效的那段名单代码。新开档、内置关加载、旧档 `REGISTRY_VERSION` 对齐三条路径都走 `resolveScenarioCharacters`，同一规则。
- 待裁定者：账本 `mod-kit/entity-ledger/overrides.json` 的 `masterPrecedence.pendingIds` 内的人物跳过覆盖、保持原行为。**现为空**：殇侯已于第三轮（2026-10-15，裁定 #218）裁定并移出，总表南荒五关相位 role＝「云氏雇用的老向导」（与账本 `identityDisplays` 一致）。前后快照对比殇侯 0 行变化：南荒 03b／04／04b／05b／06 他被时点闸排除，展示文本由账本接管；其余关阶段档与总表逐字相同。机制保留，以后有待裁定者仍往该名单里加。
- 总表优先之后，南荒四关里小紫／殇侯／乐明珠仍由 `syncNanhuangIdentityDisplay` 在其后覆盖（原有行为，未动）。

### 7.2 章级身份切换（账本 `chapterIdentities`，`ledger/naming.ts` 的 `identityFor`／`applyIdentityStep`）

- 数据：`overrides.json` 顶层 `chapterIdentities: { <总表 id>: { source, steps: [{ fromChapter, identity, role? }] } }`。章号取自 `namingChapter(runtime)`（已完成事件的章锚点、进行中事件、阶段起始章、里程碑取最大），与称呼章门同源。
- 求值：`syncCharacterNaming` 每次（`readPresentActors`、`runtime.ts` 的 sync 调用点都会走到）对每个人物按 id 取 `fromChapter <= 当前章` 的最后一档；有则把 `description`、`profile.origin`、`【阶段身份】` 备注写成该档 `identity`，档里给了 `role` 才改 `role`。没有档（章前）则不动，保持总表相位原文。代码里没有任何人物名或 id。
- 现有数据（第三轮补回旧限定语，措辞取自旧 role／描述原文，仅「随从」→「生意伙伴」）：蛇傀 `lcq.character.nanhuang_shekui` 第79章起 `identity`「阁罗的生意伙伴，长得像蛇」、`role`「鬼王峒使者阁罗的生意伙伴」；黑舌 `lcq.character.nanhuang_heishe` 第79章起 `identity`「阁罗的生意伙伴」、`role`「阁罗的生意伙伴，鬼王峒的人」。第79章前仍是总表 04b 相位的描述「阁罗的随从，长得像蛇」／「阁罗的随从」，role「鬼王峒使者阁罗的随从」（原文无分隔符）／「阁罗的随从，鬼王峒的人」。第79章落在 04b 关内，所以必须按章而不是按关。
- `role` 也随档切换，是因为模块化叙事包（`presentActors.role`）只带 `role`，不带 `description`；不写则切换对模型不可见。限定语（蛇傀「鬼王峒使者」、黑舌「鬼王峒的人」）第三轮已经补回档里；要再改，只改账本该档的 `role`／`identity`。
- 新增一个章级切换＝在账本加一条，不改代码；`tests/chapterIdentitySwitch.test.mjs` 会逐条核对「fromChapter 前后各自取值」。

### 7.3 章门读账本（`ledgerChapterGates`，2026-10-15 01:11 已按原著核实）

- 阁罗改名＝**第78章**（账本正确；此前代码用的 77 来自事件 `lcq.event.regroup_caravan_envoy`，是使者到来场面，不是改名）。乐明珠揭示＝**第47章末**（她自报姓名与门派）。**仓库锚点 `#index` ＝ 章号＋2（前言条目计入），不得把 `#index` 当章号。**
- 代码不再另存章号：`ledger/naming.ts` 的 `ledgerChapterGates` 直接从账本取——改名章＝np006（`lcq.character.np006`）面板称呼里首个 `kind:"name"` 档的 `fromChapter`；揭示章＝`namingMilestones['lcq.event.s04_03']`。读它的两处：`legacyNarratorPacket.ts:218`（鬼王峒使者别名放开）、`characterResolver.ts:605`（乐明珠身份揭示）。旧的 `effectiveChapterGates` 已删除。
- 与揭示章同步的三处：stage_04 的 s04_03 `axisAnchor`（→「六朝清羽记·#49·第47章·神女」，改在 `mod-kit/canon-authority-overlays/lcq.stage_04.json` 的 `to`）、`eventNarrativeView.ts:152` 章标题、乐明珠羁绊线入口 `lines-lemingzhu.json` 的 `entry.canonChapterAtLeast`（48→47；否则揭示后章号到不了48，避风港一拍不出）。
- 有意保留 48：避风港／`pan_secret` 插入事件的 `canonChapter:48`、`axisAnchor:"第48章"` 与描述（第48章开头的场面，在揭示之后）。
- 以后改章号：只改账本（改名档的 `fromChapter`、`namingMilestones`），`tests/chapterIdentitySwitch.test.mjs` 里钉值的那条断言同改；不改代码。

### 7.4 关键身份切换：总表相位（2026-10-15 01:11，裁定 #217）

- 按“关”切换身份不需要新机制：总表 `phaseIdentities[scope=stage-projection]` 就是“按 id＋stageId 取身份”的数据，§7.1 的总表优先规则负责写到阶段档。没有该关相位的关，`profile.origin` 缺失时退回静态 `identitySummary`（这就是“第一步”）。解析器里没有任何人物专属代码（`tests/masterTableIdentityChain.test.mjs` 断言）。
- 宁成：总表概括「帝党干将、知名酷吏、曾任大司农」（静态，第三轮还原）→ 舞都太守（`lyl.luoyang_coup` 起）→ 逃犯（`lyg.dingtao_beijing` 起）。张恽：「内侍/中黄门」（静态，第三轮还原）→ 程侯府内侍（`lyl.luoyang_coup` 起，其后 `lyg.dingtao_beijing`／`lyg.mijing_rumen` 同；切换点只用 coup）。何漪莲：静态「洛帮帮主」（第三轮还原）；`lyl.taiquan_core_conflict` 起相位披露洛帮帮主，更早三关隐去（§7.5）。
- 关的先后看相位的 `seqLo`（原著序号），不看 `manifest.json` 里的排列顺序（它是字母序，不是剧情序）。
- 8 人静态描述逐字（不含章号）：阿葭「花苗族的少女，龙神新娘的伴娘」、叶媪「南荒山村里养蛊的老妇」、白夷族长「白夷族的族长」、易勇「云氏商会的护卫」、小津「碧鲮族女子，祁远的救命恩人」、易雄「云氏商会的护卫」、六朝石匠「在峒口刻柱的六朝石匠」、黑衣丽人「黑魔海来的女子」。另 4 人（宁成／张恽／何漪莲／王蕙）#217 曾改写的一句已在第三轮撤回，总表概括还原为改前原值（见 §7.5、裁定簿 #218）。
- 新增一个“按关切换”的身份＝在源卡里给该人物加（或改）一条 `stage-projection` 相位，重建 registry；不改代码。

### 7.5 第三轮（2026-10-15，裁定 #218）：概括还原、id 统一、前三关隐去身份

- **概括还原**：宁成「帝党干将、知名酷吏、曾任大司农」、张恽「内侍/中黄门」、何漪莲「洛帮帮主」、王蕙「秦桧之妻」（改前原值，取自备份源卡）。只有原本为空的 8 人保留 #217 的逐字一句。
- **一人一 id**：这 4 人的阶段档 id 统一为总表 id，旧 id 留在总表 `idAliases`（`resolveOne` 按 id 或别名 id 都命中，旧存档不丢）：张恽 `lyg.character.np011`→`liuchao.character.zhang_yun`；宁成 `liuchao.character.ning_cheng`→`lyl.character.np043`；何漪莲 `lyl.character.he_yilian`→`liuchao.character.he_yilian`；王蕙 `lyl.character.np016`→`liuchao.character.wang_hui`。生成关卡文件、world-sim-refinements、test-pack/03 与相关测试／脚本里的引用同步改；`tests/masterTablePrecedence.test.mjs` 断言“阶段档里不再出现旧 id、同名同 id”。冻结文件不含这些旧 id。生成期的 `character-canon/*.character-id-map.json`、`character-alias-registry.json` 等派生映射仍记旧 id（不在 `canon:build` 管线内，未动）。
- **不披露身份的通用开关**：总表相位可带 `identityWithheld: true`。解析器遇到它：`role`／`description`／`profile.origin` 取相位值（可空），不回落总表静态概括和阶段档文字，也不加「关系身份门禁」备注。何漪莲 `lyl.lin_an_bridge`／`lyl.xiaoyingzhou_blacksea_trap`／`lyl.taiquan_sacred_fruit`（均早于 `lyl.taiquan_core_conflict`）用它，相位 identity／role／description／notes／relationToProtagonist 清空——没有现成的非剧透文字，空着是缺口，不编造。`tests/masterTableIdentityChain.test.mjs` 断言这三关解析结果不含核心冲突相位的披露文本。第四轮（2026-10-15，裁定 #219）起，解析器遇该开关时同样不带出势力归属：`affiliations`（洛帮 帮主／程宗扬势力 侍奴/从侍奴）与 `factionId` 一并删除（与南荒小紫／殇侯／乐明珠的既有写法一致），仍是通用相位开关、无人物专属代码；核心冲突起照常保留。
- **副作用**：统一 id 后，事件 `relatedCharacterIds` 里的何漪莲、王蕙才与总表 id 对上，`tests/affinityLadder.test.mjs` 的“有出场的主要女性都有姿态档案”因此看到这两人缺姿态档案；已在该测试里按 id 登记为已知缺口（并断言补档后必须删名单），姿态档案待剧情策划提供。
- **殇侯**：见 §7.1。总表南荒五关 role 改「云氏雇用的老向导」。第三轮曾为避免 authority overlay `from`（旧值「老向导」）报 drift 而把 `card-time-gates.json` 里 03b／04／04b／05b 的 `at` 改成 `["build","runtime"]`；第四轮（裁定 #219）已撤回：四关 `at` 恢复 `["runtime"]`，构建期投影（殇侯；03b／04 另含乐明珠）回来；改为在 4 个 authority overlay 的 `from` 里只把殇侯的 role 由「老向导」改为「云氏雇用的老向导」（授权的最小数据编辑，overlay 未重生成、其余不动），生成关卡文件随之带新 role，`canon:build` 无 drift。

## 8. 基础属性、阶段覆盖项、敌人种类与实例（2026-10-15，裁定 #220）

### 8.1 谁存什么
- **角色总表**每条记录可带：`baseStats`（`level`、`levelSource`、`combatStrength`、`attributes`）、`mustSurvive`（布尔，缺省 false）。源头是源卡 `character-cards-v3.json`，由 `build-character-registry.mjs` 透传并在构建时校验（未知/越界字段、非布尔 `mustSurvive` 直接报错）。旧卡顶层 `level`（整数）折成 `baseStats.level`，两者并存以 `baseStats` 为准。
- **阶段档**（`canon.characters[]`）只存与基础不同的覆盖项，字段名 `stats`，形状同 `baseStats`；旧有顶层整数 `level` 按同一规则当作 `stats.level` 的覆盖项，`stats.level` 优先。不另建第二份表。
- **敌人种类**也是总表条目：一个种类一个 id（沿用合同与敌人目录已有的 id），`entityType:"enemy_kind"`，只放基础属性。种类**不**进：按人名的总表查找、人物命名表、姓名→人物 id 解析、角色向量索引、人名棘轮与两个“不写死姓名”的测试（它们是物种/群体名，不是人名）。先行三个：`lcq.enemy.guiwang_warrior`（鬼王峒武士，level 3）、`lcq.enemy.merfolk`（鲛人，level 4）、`lcq.enemy.altar_corpse`（尸鬼，level null）。
- **mustSurvive** 读法：`getRegistryMustSurvive(id)`（`characterResolver.ts`），严格布尔、只认 true、总表没有的 id 返回 false；实例 id 按其种类读。只约束玩家自由行动的结算，不拦剧情合同死亡，所以**不得**接进 `injuries.ts`、`runtime.ts`、`host/writeback.ts`、`canonGuard.ts`、`fixedEndingNarratives.ts`（`tests/characterStats.test.mjs` 静态检查）。

### 8.2 合并规则（运行时：总表基础 ⊕ 当前阶段档覆盖项；实现 `characterStatsMerge.ts`，读取 `characterStats.ts`）
1. **缺省沿用**：覆盖项里没有某键（或值为 undefined）= 沿用基础。
2. **存在即替换**：覆盖项里有某键 = 替换基础的同名字段。显式 `null` 也算“存在”：表示本阶段该项不适用，不是 0，也不回落到基础。
3. **嵌套对象逐键合并**：目前只有 `attributes`。覆盖项里写了的属性替换，没写的沿用基础；不是整体替换。标量与 `levelSource` 整体替换。
4. **未知字段不进结果**：顶层只认 `level / levelSource / combatStrength / attributes`；`attributes` 只认判定权重表里的六司（根骨、灵性、悟性、魅力、心性、气运，取自 `game-numbers.weights`，不另立名单）；`level`、`combatStrength` 必须是 `levels.min..max` 内的整数或 null。不合规的字段在基础和覆盖项两边都被丢弃，路径记入 `ignored`；运行时只丢弃不报错，构建期与 `validator.ts` 把它们当错误。
5. “当前阶段”＝存档里的 `runtime.canon.characters`（本关阶段档副本）；该 id 没有阶段档条目（敌人种类通常没有）= 只有基础。合并不改总表也不改传入对象，每次读取现算。
6. **战斗强度**：`combatStrength` 与 `level` 同单位（级数当量）；战斗与判定读 `combatLevelOf = combatStrength ?? level`，都为 null/缺省 = 无值，按既有规则“缺值按同级”。
7. **战斗读哪里**：`host/factors.ts snapshotLevels` 先读按章时点级数表（`character-levels.qingyu.json`，仍是按章的权威），没有该 id 该章的行时才读上述合并结果（与关系记录的境界取大），再无值按同级。原先读的阶段档顶层 `level` 与敌人目录 `enemies.json` 的 `level` 已并入这份合并结果，不再单独读。

### 8.3 实例
- 实例 id：`<种类id>#<场景id>:<n>`，n＝合同里同种类参战方的出场顺序（从 1 起，由合同推出，不另存计数）。`actorInstances.ts` 提供 `instanceId / parseInstanceId / kindIdOf / isEnemyKindId`。
- 伤势：敌人参战方的伤势照旧以 `<场景id>.<参战方id>` 为键存进 `statusRecords.groups`（旧档兼容，键未变），记录里新增 `instanceId`，`enemyId` 仍记种类。种类 id 名下永远没有伤势记录；总表里登记的种类即使不在敌人目录里也走个体路径。
