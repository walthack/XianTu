# 写死守卫盘点 + 读账本对速度的影响（只读，2026-10-14）

用户要求：「某阶段前不要做/说 xxx」这类时序检查，最好统一用账本管理。本文只盘点和评估，没有改任何代码或数据。

## 0. 口径与限制

- **账本** = `mod-kit/entity-ledger/overrides.json`（27,479 字节，22 个实体）+ `src/modules/scenarioMods/ledger/{naming,affinityIdentity,guardFramework}.ts` + 角色卡上的 `presenceWindow`。〔核〕
- **冻结文件** = `src/utils/AIBidirectionalSystem.ts`、`src/modules/scenarioMods/runtime.ts`（`AGENTS.md:52`，只许 bugfix）。其余文件没有冻结，但动 `storyContext.ts`、canon 数据前要先读裁定簿，`canon:build` 全绿才能提交（`CLAUDE.md`）。〔核〕
- 工作区里 `AIBidirectionalSystem.ts` 有 4 增 3 删未提交，就是 10-14 的 L6 授权小改（import + 858 + 895）。〔核：git diff --stat〕
- **没跑成任何测量脚本**：沙箱拒绝了 `node` 和写 `/tmp`，所以没有 profile 耗时。下文数字来自三处：静态读代码、用 python 统计 JSON/源码、`_newbot_tmp/` 里已有的真机浏览器日志。每条标〔核〕（我读到/算到的）或〔推〕（我的推断）。
- 行号是 2026-10-14 工作区状态，会漂移。

## 1. 总体发现

1. **人名基本已改成按 id 查表，其余没有。** 我用 python 复刻 `validate-ledger-ratchet.mjs` 的算法重算，字面人名 1,949 处（棘轮基线 3,277，基线从没调低）。但棘轮只数人名，**不数事件 id、stage 正则、章号、事实性散文**，这四类正是时序检查的主体，现在没有任何门禁盯着。〔核〕
2. **同一概念有多份拷贝，口径还不一致。**
   - 「南荒阶段」有 3 种写法：`03b|4|4b|5b`（`AIBidirectionalSystem.ts:828`、`legacyNarratorPacket.ts:238`、`narrativeBoundaries.ts:71`）；`03b|4|4b`（`fixedEndingNarratives.ts:128`、`legacyNarratorPacket.ts:272`）；`4b|5b`（`fixedEndingNarratives.ts:181`）。是否有意区分，我没查，需要确认。〔核：grep〕
   - 章号 121、115、72、105、77、47 在代码里各写了一份，账本里已有的值没被读（见 B 类）。
3. **账本 `chapterGates` 有 5 个键没有任何代码读**（`suliRegicide`、`shangName`、`shangTitle`、`xiaoziFather`、`zhuIdentity`），只被 `tests/approvedChapterGates.test.mjs` 引用。〔核：grep〕
4. **`presenceWindow` 机制已经有了，只覆盖 14 个角色**（stage 03b/04/04b/05b 的数据里），`presence.ts:171` 读它；同文件另有约 58 行按事件写的出场/离场表（C 类）。〔核〕
5. **守卫已有统一框架没用上**：`ledger/guardFramework.ts` 的 `GuardRule{mode: enforce|shadow|off}` 带日志，目前只挂了一条性别影子规则。南荒的正则守卫都是直接 `throw`。〔核〕

## 2. 清单（按类别）

「冻」列：❄ = 冻结文件；❄✓ = 冻结文件但这行已获 10-14 授权并改读账本。
优先级：P1 = 账本/配置里已有现成落点或重复拷贝，收益大风险小；P2 = 需要先扩账本字段；P3 = 建议不动（迁移代码、一次性补丁、自成合同）。

### A. 称呼 / 名字随阶段变化

| 文件:行 | 写死了什么 | 冻 | 能否读账本 | 优 |
|---|---|---|---|---|
| `AIBidirectionalSystem.ts:858,895-896` | 乐明珠 id；其余已读 `npcAddressWithheld/withheldAddressUsed` | ❄✓ | 已读账本。以后别的角色要同类检查，只需把角色 id 从账本取，不必再改此文件 | P3 |
| `ledger/naming.ts:75-76` | 小紫母系名按第 115 章切碧奴→碧姬 | | 账本 `bi_ji.naming.panel` 已有章门，可直接取 | P1 |
| `ledger/naming.ts:89` | 南荒 = 章 37–124 | | 可由 `stageOpeningChapters` 推出或放进账本 | P2 |
| `legacyNarratorPacket.ts:204` | 别名「鬼王峒使者」第 77 章前不用 | | 账本别名加 `fromChapter`；`contextOnlyAliases` 已有同类 | P1 |
| `characterResolver.ts:623-625` | np006 =「阁罗」或「鬼王峒使者」，凭事件 `weapon_deal_with_geluo` | | 账本称呼档 + `requiresState`（10-14 已建） | P2 |
| `characterResolver.ts:629-633` | 朱八八/殇侯凭事件 `shanghou_revealed` | | 账本 `namingMilestones.shanghou_revealed=120` 已有，重复 | P1 |
| `characterResolver.ts:637-641` | 花苗新娘/乐明珠凭 `s04_03` 或章 ≥47 | | `namingMilestones.s04_03=48` 已有，且 47/48 不一致 | P1 |
| `characterResolver.ts:634-636` | `ghost_king_swallowed` 前删乐明珠记忆里的「老公」 | | 账本记忆过滤档 | P2 |
| `secondaryLines.ts:856` | 章 ≥121 显示「黑魔海／毒宗」 | | 读 `chapterGates.poisonSectName`(=121) | P1 |
| `storyContext.ts:530` | 殇侯在 4 个 stage 只给已揭示身份；乐明珠用 `namingFor(…,0)` | | 账本加 `identityMasked`。核心 prompt，要先过裁定簿 | P2 |
| `fixedEndingNarratives.ts:184` | 账本摘要里主角写死「程宗扬/男/白湖商馆南荒商队头领」 | | 读 `opening.playerCharacterId` 和 canon | P2 |
| `AIBidirectionalSystem.ts:844,2734` | 主角 id `cheng_zongyang` 兜底 | ❄ | 已有 `opening.playerCharacterId` 可替代 | P3 |

### B. 披露 / 知情 / 章号门（身世、事实、名号）

| 文件:行 | 写死了什么 | 冻 | 能否读账本 | 优 |
|---|---|---|---|---|
| `characterResolver.ts:558-572` `xiaoziDisclosure` | stage_06+/云龙/燕歌 视为全揭；事件 `s05b_09_temporary_pact…`、`weapon_deal_with_geluo`；worldFacts 里的中文句子当标记 | | 账本 `reveals:[{fact,gate:{event\|chapter}}]`；`xiaoziFather=105` 现在没人读 | P1 |
| `characterResolver.ts:650-653` | 谢艺身手隐藏：stage_02–04b 且事件 `crisis_13` 未完成 | | 同上 | P2 |
| `narrativeBoundaries.ts:75-79,85-87` | `ghost_king_swallowed` 前不得写「鬼王峒平定／鬼巫王已死」；碧姬不在碧鲮村现场 | | 改成 `GuardRule`，门槛放账本 | P1 |
| `narrativeBoundaries.ts:89-96` | 小紫父系/母系；**报错文字里写死「72 章」「105 章」** | | 文字读 `chapterGates`，规则进账本 | P1 |
| `narrativeBoundaries.ts:71-74,82-83,92,101-106` | 灵飞镜来历、蛇彝村、十里焦土、苏荔非碧鲮族长、黑魔海是宗派、血虎与武二郎无关、凝羽事件里天竺/西门庆顺序 | | 同上，逐条转规则 | P2 |
| `narrativeBoundaries.ts:23-30` | 事件 `sudaji_south_pact` 的边界表 | | 本来就是数据表，且文件注释写明追加即可 | P3 |
| `AIBidirectionalSystem.ts:852,856` | 鬼巫王死否；「毒宗名号按 121 章书信、122 章对白开放」；岳帅性别；孟非卿不在队伍；易虎/阿葭/苏荔备注 | ❄ | 散文可转账本 `sceneNotes`；121 与 `chapterGates` 重复，122 账本里没有 | P1 |
| `fixedEndingNarratives.ts:189` | `ghost_king_swallowed` 前「鬼王峒未平定」世界事实 | | 同 A/B | P1 |
| `legacyNarratorPacket.ts:273` | 事件 `crisis_18` 且父系已揭 → 注入「小紫是岳帅的遗腹女」 | | 账本 reveal 带 `inject` 文本 | P2 |

### C. 在场 / 离场 / 已故

| 文件:行 | 写死了什么 | 冻 | 能否读账本 | 优 |
|---|---|---|---|---|
| `presence.ts:167-225` `nanhuangCastExclusions` | 约 58 行：每个 stage 下哪个角色「某事件进入前缺席／某事件完成后离场」（约 67 个实体 id、22 个 stage 字面量、40 余个省略前缀的事件 id）。第 171 行已读 `presenceWindow` | | 把「进入/完成某事件」也写成 `presenceWindow` 的事件版。这是单点最大的一块 | P1 |
| `presence.ts:150-165` | stage_01/02 之后算「过了开场/过了王哲」 | | `stageOpeningChapters` 现成 | P2 |
| `AIBidirectionalSystem.ts:826,849,908` | 王哲/段强已故：事件 `s02_02` 或 stage 号>2；复活检测正则 | ❄ | 「已故」做成账本（实体 + 生效条件），三处共用 | P1 |
| `AIBidirectionalSystem.ts:827` | 南荒 stage 下孟非卿/「孟老大」缺席 | ❄ | 同上 | P1 |
| `AIBidirectionalSystem.ts:830-831` | 事件 `regroup_caravan_envoy`/`weapon_deal_with_geluo` 时阁罗缺席；`s04_07` 必到白夷两人 | ❄ | 可转 `cast` 合同字段 | P2 |
| `fixedEndingNarratives.ts:179-188` | 易虎状态（事件 `crisis_11`、`s04_05`…）；已故名单写死段强、王哲 | | 同「已故」账本 | P1 |
| `modularTurn.ts:258` | 易虎非在场时不得「带路／归队」 | | 读账本人物状态 + 角色名 | P2 |
| `wuyuanOpenWorldSlice.ts:216-217,231-238,367` | `s02_02` 完成 = 王哲倒下；离开五原的 5 个事件 | | 开放世界切片自带合同，不建议动 | P3 |
| `runtime.ts:3087-3092` | 把「易虎之死」改写成「易虎失踪」 | ❄ | 可转账本 `textRewrite` | P2 |
| `runtime.ts:1062-1067` | 旧档焚尸迁移（阿葭、阴蛛） | ❄ | 迁移代码 | P3 |

### D. 提示词里写死的人设 / 事实散文（每轮都发）

| 文件:行 | 写死了什么 | 冻 | 能否读账本 | 优 |
|---|---|---|---|---|
| `AIBidirectionalSystem.ts:843` | 黑魔海、苏荔、血虎/易虎/武二郎、死老头遗物。**没有 `nanhuang` 门**，所有模块回合都发（含 stage_01） | ❄ | 账本 `sceneNotes`，按在场人物/地点才注入 | P1 |
| `AIBidirectionalSystem.ts:829,857` | 冰蛊压力；蛇彝村已是空村（后者按地点门） | ❄ | 同上 | P2 |
| `AIBidirectionalSystem.ts:906` | 本轮不得重复冰蛊/南荒之约提醒（退稿） | ❄ | `GuardRule` | P2 |
| `AIBidirectionalSystem.ts:2973,2985` | 事件 `sudaji_south_pact` 订约成功固定正文；三个事件首个成功动作后追加冰蛊身体信号 | ❄ | 内容包的 `ledgerEffects`/固定文本字段 | P2 |
| `narrativePerformanceGuard.ts:358` | 小紫、贾诩「必须亲自提出方案」 | | 读 `voiceCards` 名单 | P3 |
| `narrativeStateReconciler.ts:131-180` | 按人名抽取小紫、凝羽、云如瑶、赵飞燕、剑玉姬、祁玉仙的状态 | | 状态抽取表转配置 | P2 |
| `eventReconcileService.ts:440-531` | 事件 `s06_03`/`s06_04` 的谢艺死亡、碧姬被杀快路 | | 事件级合同字段 | P2 |

### E. stage 条件（无法单独归类的）

- `runtime.ts:3878,3893`、`characterResolver.ts:277-280,591,651`、`storyContext.ts:530`、`legacyNarratorPacket.ts:238,272`、`AIBidirectionalSystem.ts:828,892`：各自写一份 stage 列表。→ **统一成一个「阶段集合」账本项**（含 03b/04/04b/05b 是否各算），其余文件改读。P1。
- `services/characterRagService.ts:315`：小紫在 stage_01–04/03b 不召回。→ 读 `presenceWindow`。P2。
- `CharacterManagement.vue:538-546`、`dev/combatTrial/*`、`xingyuehu*Playtest*.ts`：试玩入口常量，随内容包走。P3。

### F. 事件特例分支（逻辑，不是文案）

`runtime.ts`（冻结）里按事件 id 写的特例：`1150`（白虎拒绝时屏蔽 `ningyu_enters_gamble`）、`1497/1871-1873`（`shanghou_revealed` 的致命选项条件）、`1884`（`sudaji_south_pact` 事实替换）、`1908`（`s02_04` 开放世界前置）、`1980-1983`（两个 flag）、`2000`（焚尸）、`2381-2384`（`crisis_14/13` 强制移动）、`3375-3377`（只在 stage_02 刷新意图元数据）、`3769-3773`（王哲留下结局的话术判定）、`4005-4007`（旧档补 `zhu88_heimohai_chat`）。
→ 这些是「结算逻辑」，按 `AGENTS.md:52` 本来就不该再长。**建议不动**，将来改成事件合同字段（`CONTENT-PACK-CONTRACT.md` 方向）时再一起迁。P3。迁移哈希表 `runtime.ts:1018-1050,3327` 同理。

### G. 合规相关（只标出，不建议改）

对照 `docs/COMPLIANCE-REQUIREMENTS.md`：
- `AIBidirectionalSystem.ts:845`（出场者全为 18 岁以上、缺年龄不猜、不复述排除性约束）〔C01〕。该行同时夹着苏荔/云苍峰的人设句，若以后拆 D 类，这一句要原样保留。
- `modularTurn.ts:225`（年龄正则，命中即退稿）〔C01〕。
- `runtime.ts:3872-3875`（宁雨记忆里「被程宗扬用麻古迷奸」被改写成药物侵害表述）〔C03/C05，清单 Q6〕。
- `characterResolver.ts:602-607`（小紫 role/appearance 强制「成年少女」）〔C01〕。
- `intimacyProfiles.ts`（整份，R08–R12：名单门、场景门、C02 吕雉致命后果等）〔C10/C06/C02〕。
- `relationships.ts:213`、`runtime.ts:3877`（「【内部约束·不入正文】」前缀过滤）〔C05〕。

### H. 数据表放在 TS 里（本次不展开）

`secondaryLines.ts`(742)、`canonRail.ts`(184)、`characterQuests.ts`(165)、`mainQuestAxis.ts`(129)、`stanceProfiles.ts`(128)、`fixedEndingNarratives.ts`(108)、`legacyPilotScenes.ts`(98)、`affinityCaps.ts`、`fixedQuestObjectives.ts`、`eventNarrativeView.ts:149-163`（章标签）：本质是内容表，括号内为棘轮基线里的字面人名数。不是守卫，迁到 JSON 属于另一件事。示例 id（`cotCore.ts:32`、`defaultPrompts.ts:382`）无害。

## 3. 读账本会不会拖慢生成

### 3.1 结论

- **账本查询本身不是瓶颈，也不随存档变大。**
- **真正影响速度的是：① 发给模型的字数，② 守卫退稿后整轮重试，③ 前台等待的召回请求。** 这三个跟「读账本还是写死」基本无关，但迁移时可以顺手改善。

### 3.2 每回合查账本的开销

- 账本是静态 import，进程内只解析一次。`namingFor` 是 22 个实体里线性找、每个渠道最多 5 档（均值约 1.2 档）。〔核：overrides.json 统计〕账本涨 10 倍也是微秒级。〔推〕
- 稍贵的是 `namingChapter`：每次调用都要遍历当前关的 `runtime.events` 并对每个事件跑一次章号正则。它只随**当前关的事件数**增长，不随游玩时长或存档大小增长：内置各关事件数 6–38（`lcq.stage_04b` 最多 38）。〔核：python 统计〕
  - 但它被反复调用：`legacyNarratorPacket.ts:225-235` 每个在场角色约 7 次；`projectNamingPacket` 对包里每个字符串又调一次。〔核〕按 ≤18 人、≤38 事件、上百个字符串估，每回合几万次正则匹配，应是毫秒级，**我没测**。〔推〕
  - 建议：每回合算一次 `namingChapter` 缓存起来（P1，几行改动，不在冻结文件）。
- **真正随游玩增长的 CPU 开销在别处**：
  - `AIBidirectionalSystem.ts` 一个模块回合最多 2–3 次 `cloneDeep(整个 saveData)` + `advanceScenarioRuntime`（`:759,2729,2998,3007`），回合后处理还有 `:3200,3340,3642-3643`。存档里带着整关 canon+events（内置 stage_04b 数据 273 KB）。〔核：grep；存档实际字节数没测〕
  - `runtime.ts:2899` `appendChronicleEntry` 每次追加都 `chronicle.some(...)` 线性扫描，且 chronicle 无上限，切关时整份带走。〔核〕
  - 老链路（非试玩存档）每回合 `syncFromLongTermMemories(全部长期记忆)`（`legacyForegroundRecall.ts:76-79`）。〔核〕

### 3.3 发给模型的提示词会不会变长

**账本里的内容不会整份进提示词**。进去的只有「当前步骤、每个渠道各取一档」，而且是原地替换名字（`projectNamingPacket`），不加字。账本相关的新增文本总共约 140 字：

| 段 | 字数 | 来源 |
|---|---|---|
| `namingInstructions`（南荒回合都带） | 112 | `overrides.json`，python 数出 |
| 乐明珠被扣称呼那句（`AIBidirectionalSystem.ts:858`） | 约 28 | 句式 + 词 |
| 每个在场角色的 5 个称呼字段 | 每人几十字以内 | 包有 6 KB 上限，见下 |

对比**写死的散文**：`AIBidirectionalSystem.ts:836-860` 这段系统提示里单引号字面量合计 ≥1,065 字（不含模板拼接部分）。〔核：python 提取〕按真机日志里约 0.5 token/字，≈ 530 token，占 10,000 字软预算的约 11%。其中 `:843`、`:845` 约 290 字**不受南荒门控制**，所有模块回合都发。〔核〕这块如果改成账本、按在场人物和地点注入，**提示词会变短而不是变长**。〔推〕

现有上限（都〔核〕）：
- `legacyNarratorPacket.ts:26-27`：包 6 KB、提示词 12 KB。
- `buildCompactModuleNarrativePrompt`（`:561`）：超过 10,000 字就去重复、砍描写，历史摘录缩到 1 条×100 字。预算「不是剧情门禁」，不会因超限拒绝请求。
- 在场角色上限：南荒 18、其余 3（`legacyNarratorPacket.ts:238`）。

**真机数据**（`_newbot_tmp/**/browser-events*.json`，586 对成功的聊天请求，都是短会话，**没有长时间游玩的数据**）〔核〕：
- 输入字数：547 次 <5,000；32 次 5,000–10,000；最大 9,821。最大值贴着 10,000 的软预算，与压缩逻辑吻合。
- 耗时中位数：输入 <3,000 字的 7.7 s（481 次）；≥3,000 字的 18.9 s（98 次，输出 token 也多：884 对 544）。
- 对「耗时 ~ 输入千字 + 输出 token」做最小二乘：4.3 s + 1.23 s/千字 + 6.9 ms/token，R²=0.31。**这是相关不是因果**（大输入多半是叙事回合，输出也长），模型后端是 `typesafe/jev-router`，具体是哪个模型日志里没有。拿它估上限：账本那 140 字 ≈ 0.2 s；`:836-860` 那 1,065 字 ≈ 1.3 s 以内。
- 回合墙钟：335 回合中位数 9.6 s、p90 42.9 s、最长 150 s；平均每回合 1.56 个请求，最多 10 个。〔核〕**长尾来自多请求（重试、后台任务），不是提示词字数**。

### 3.4 守卫退稿是速度的大头

南荒回合守卫抛 `ModuleNarrativeGuardError` 就整轮重写，最多 3 稿（`AIBidirectionalSystem.ts:875,919`，`modularTurn.ts` 的 `attemptModuleNarrative`）。每多一稿就是再一次完整生成，按上面中位数 8–19 s。〔核：代码；耗时用上面日志〕

日志里没有记录退稿次数（`[守卫拒稿]` 只打在控制台，浏览器事件日志没抓），所以**退稿率我给不出数**。这正是 `guardFramework.ts` 的 shadow 模式有用的地方：新规则先 shadow 跑一段，看误杀率再切 enforce。

### 3.5 按需加载现状

做得好的：
- `narrativePromptState.ts` 去掉 canon/章节/事件正文，只留进度字段。
- `storyContext.ts`：主事件 + 最多 1 个可选事件（`:331`）；聚焦人物 ≤12；在场 ≤12；已见人物 ≤30。
- 模块链路历史只取 2 条×≤600 字（`recentModuleMemory`）。
- 长期记忆在向量检索可用时换成 top-K；角色 RAG `topK 6, minScore 0.4`。
- 称呼只取当前档，不放整张表。

做得不够的：
- 上面 D 类散文**不按在场人物/地点筛**，南荒只要在这几个 stage 就整段发。
- 老链路（`@deprecated`，试玩存档被 `assertDemoModulePath` 拦在外面）每轮发整份 `社交.关系`、`flags`、`completedEventIds`、`divergences`、中期/长期记忆。〔核：`narrativePromptState.ts:33-70`〕

### 3.6 会随游玩时间膨胀的部分

| 部分 | 进提示词吗 | 有上限吗 | 备注 |
|---|---|---|---|
| 短期记忆 | 是 | 5 条（默认，可配）`:3072` | OK |
| 中期记忆 | 老链路是 | 25 条触发，总结最旧 17 条成 1 条长期（`:3761-3777`） | OK |
| 长期记忆 | 老链路是（向量检索失败时回退全量，`legacyForegroundRecall.ts:94`） | **没找到上限**，约每 17 回合 +1 条 | 老链路问题 |
| 各 NPC 的 `记忆` 数组 | 老链路是 | **没找到上限**；切关时合并去重（`strictInitializer.ts:411-412`），只增不减 | 老链路问题 |
| `flags`、`completedEventIds`、`divergences` | 老链路是 | 切关时 `completedEventIds` 重置，`branch.*/scene.*/character.*` 等 flag 与 divergences 跨关保留 | 随关数增长 |
| `sceneLedger`（人物状态、伤病、已故、worldFacts） | **模块链路也进**（`账本摘要`） | 无代码封顶，切关带走（`strictInitializer.ts:439`） | 目前由作者数据限定：南荒 4 个 stage 共 7 条 worldFacts ≈ 100 字，**现在不是问题**，但没有保险 |
| `chronicle` | 否（只取最后一条） | 无上限 | 影响存档大小和 cloneDeep |
| `acquaintances`、`stanceStates`、`playerKnowledge`、`pathReceipts`、`npcPrivateKnowledge`、`inventoryTransferReceipts` | 部分 | 跨关保留 | 我没逐个查是否进提示词〔未核〕 |

### 3.7 建议

1. 迁移时**按在场人物/地点筛选**注入，不要整表注入。这样读账本不会让提示词变长，反而变短。
2. `namingChapter` 每回合缓存一次（P1）。
3. 给 `sceneLedger` 的 `人物状态/伤病/已故/worldFacts` 加「只发当前在场或本关相关」的过滤，或加条数上限，作为保险。
4. `notePromptBytes`（`AIBidirectionalSystem.ts:872,1115,1433,1631`）只记总字节。加一个**分段字数的日志**（只打日志，不改行为），才能回答「账本段占多少」。
5. 实测：用 `xiantu-game-selftest` skill 在 8091 跑 100 回合，每 10 回合记 ① 提示词字数 ② 存档 JSON 字节 ③ 回合墙钟 ④ 退稿次数。**这次没做**，所以长时间游玩的曲线是空白。

## 4. 建议的推进顺序

1. **不涉及冻结文件、不涉及提示词的先做（P1）**：`namingChapter` 缓存；`naming.ts:75-76`、`secondaryLines.ts:856`、`legacyNarratorPacket.ts:204`、`characterResolver.ts:629-641`、`narrativeBoundaries.ts:91` 的文字，改读账本已有的值；统一「南荒阶段」集合。
2. **扩账本字段（P1/P2）**：`presence`（事件版 `presenceWindow`）、`deceased`（已故）、`reveals`（披露门，把没人读的 5 个 `chapterGates` 键用起来）、`sceneNotes`（按人物/地点注入的散文）。守卫统一进 `GuardRule`，新规则先 shadow。
3. **需要用户授权动冻结文件的只有一件事**：把 `AIBidirectionalSystem.ts:826-831,843-857,906,908` 换成一次账本调用（类似 10-14 对 858/895 的做法）。这一次授权之后，以后改这些事实只改数据。`runtime.ts` 不建议动。
4. 触及 `storyContext.ts`、canon 数据、`narrativeBoundaries.ts` 的改动，要先读 `CANON-DECISIONS.md`，在同一 commit 追加裁定条目，`npm run canon:build` 全绿。
5. 把棘轮扩成同时数事件 id、stage 字面量、`\d+章`，防止新增。现在它只数人名。
6. 合规 G 类的位置一律不动，拆 D 类时保留原句。

## 5. 没查 / 不确定的

- 没有运行任何代码，没有 profile，没有读真实存档大小。
- `strictInitializer` 切关时 `travelLedger.doneEventIds` 是否重置，没看到，所以「`namingChapter` 不随游玩增长」对这一项是〔推〕。
- 守卫退稿率、长时间游玩的提示词/耗时曲线：没有数据。
- A–F 表是我按「时序/披露/在场/stage」读出来的，不是穷举；H 类和 `sceneModule/`（战斗宿主）没有逐行读。
