# 白湖商馆 + 凝羽线 + 乐明珠线 · 可玩 demo 交付（2026-10-14，模块策划）

状态：**未提交、未推送、未重建 8097**。设计依据：`_newbot_tmp/2026-10-14-白湖商馆与情感线细化.md`（主）、同名大纲、`LINE-DESIGN-NATION-ORG-AFFINITY.md`。

## 0. 撤下 04b/stage_02 场试点

- `manifest.json` 去掉 `scene-pilot-overlays.json`；`stage3-overlays.json` 补的 4 条 `sceneBeat` 已撤（该文件对 HEAD 已无差异）。
- 重新生成后 `catalog.json` 与 HEAD **逐字节一致**（`git diff` 为空）。之后才开始第二部分。
- `scene-pilot-overlays.json` 与 `docs/SCENE-PILOT-04B-02-2026-10-14.md` 保留，文档开头已注明「备稿，未采用，未挂载」。

## 1. 机制：在 quest-line 现有 schema 上扩字段（不另开 v2）

全部是可选字段，未填走旧路径；`mod-kit/quest-lines/lines.json` 的老线照常通过 `validate-quest-lines`。

| 位置 | 字段 | 作用 |
|---|---|---|
| beat | `role` | `load_bearing / choice / color / transition` 的数组（承重+选择写两项） |
| beat | `card` | `previousId / tensionId / optionIds`：承上、当下张力、可做的事。投影成动作的 `previousBeat` 与 `sceneObjective`（当下张力；非南荒关卡另把承上并进 `sceneObjective`，因为只有南荒三关读 `previousBeat`） |
| beat | `echo` | `{reads, variants}`：读一个早先的状态，按值给出不同的承上/结果文本。编译期展开成同一步的变体动作（`.v_<值>`），用 `visibleWhen` 保证同时只有一个可见；回执与 `byAction` 效果随变体复制 |
| beat | `onExpire` | 窗口关闭仍无回执时写入的状态（只允许 `setState`）。`expireQuestLineWindows` 只在首次过期时写，已回答的不覆盖 |
| step | `visibleWhen / previousId / variantOf / replyMode / forbidden` | 见上；`replyMode` 取 `fixed` 或 `model` |

编译器（`scripts/content-packs.mjs` + 新增 `scripts/content-pack-quest-lines.mjs`）新增：
- `{"$num":"lineBonds.xxx"}`：数值只写在 `mod-kit/game-numbers.qingyu.json` 的 `lineBonds` 一节，内容文件里不出现具体数字（有测试）。
- 内容包 `questLineResources`（记忆模板/事实/好感权重/重要度/自由输入匹配）与 `texts` 多文件。
- 内容包 `questLines` 自动投影成可选事件（`critical:false`，加到对应关卡），不用手写事件；`replyMode:model` 在没有叙事守卫的关卡会被编译器拒绝。
- 实体 id 总表（`build-entity-index.mjs`）收录内容包线上的 `receipt / state / memoryTemplate / fact / affinityWeight`；`visibleWhen` 读的状态必须有写入方，否则编译失败。

运行时只改了 `questLines.ts`（解析与合并资源）、`questLineContext.ts`（`onExpire`）、`contentPacks/index.ts`（类型）。**没碰 `runtime.ts`；`AIBidirectionalSystem.ts` 只在 §7.2 的用户授权下改了 858/895 两处检查。**

## 2. 停靠点对照

「窗口」= 该选项出现的时段。主线事件是 critical、动作集合被合同哈希锁住，所以每个停靠点都是主线事件旁边的**可选姿态拍**（新事件，`critical:false`），不替换主线动作，也不改任何正典结果；点「下一步」永远不会触发它们。

| 设计稿 | 状态 | 事件（后缀） | 窗口 | 选项 | 写入状态 |
|---|---|---|---|---|---|
| O1 六十金铢 | 做了（改写，见 §4） | `charge_sudaji_fee_ins_baihu_price` | 该主线事件当前时 | 说成买卖 / 先问她要什么 / 低头应下 | `branch.baihu.first_bargain` |
| O2=Y2 弑主提议 | 做了 | `ningyu_regicide_offer_ins_ningyu_reply` | 主线事件完成后 | 答应 / 拒绝 / 先问为什么 | `branch.baihu.regicide_stance`、`branch.ningyu.regicide_reply` |
| O3 水镜传讯 | 做了（改写） | `s04b_…_07_ins_baihu_report` | 该主线事件当前时 | 照实说 / 镜子按下不提 / 另谎称霓龙丝有线索 | `branch.baihu.report` |
| O4 霓龙丝着落 | 沿用已有 `side_biling_algae_silk` | — | — | 已有三步 | 已有回执 |
| O5 期限 | 做了（改写） | `s05b_ice_gu_detour_ins_baihu_return` | 该主线事件当前时 | 托云苍峰带信 / 谁也不通知 / 托小魏另带信；O3 谎报过则承上多一句祁远点破 | `branch.baihu.return_message` |
| Y1 入局 | 不动（赌局锁） | — | — | — | — |
| Y3 黑石滩火光 | 做了 | `rainforest_black_shoal_ins_ningyu_fire` | 主线事件完成后 | 当众道谢 / 私下递干衣服 / 什么也不做 | `branch.ningyu.care` = plain / warm / none |
| Y4 竹楼大潮 | 降为过渡，折进 Y5 承上 | — | — | — | — |
| Y5 进峒 | 做了 | `guiwangdong_coop_pact_ins_ningyu_enter` | 主线事件完成后 | 带她 / 留她在峒外 / 先问她；黑石滩递过衣服则承上不同 | `branch.ningyu.enter_dong` |
| Y6 隔门道别 | 做了（必须主动的一步） | `s05b_yeao_palm_ningyu_stays_ins_ningyu_door` | 主线事件完成后至尾声 | 隔门说一句话 / 门前留一样东西 | `branch.ningyu.farewell` = word / token；窗口关闭仍没做 → `silent` |
| Y6 加分 ×3 | 做了 | `…_ins_ningyu_y6_knock / call / recall` | 同上 | 敲门 / 唤她名字 / 提起黑石滩的火与旧话 | `branch.ningyu.door_knocked / called / recalled` |
| L1 鸦人 | 做了 | `s04b_…_02_ins_lmz_crow` | 02 或 03 当前时 | 立刻冲出去 / 等破绽 / 先护住她 | `branch.lmz.first_rescue` |
| L2 别跟潘师姐说 | 改了已有拍 | `s04_03_ins_le_mingzhu_pan_secret` | 已有 | 已有三选 | 新增 `branch.lmz.pan_secret` = promised / hard_truth / teased；窗口关闭仍没答 → `none` |
| L2 加分 | 做了 | `s04_03_ins_le_mingzhu_share_mushroom` | 同 L2 | 分烤鹅掌菌 | `branch.lmz.shared_mushroom` |
| L3 拔鱼叉 | 后补，见 §7（用户改定） | `lcq.event.pull_harpoon_lemingzhu_ins_lmz_harpoon` | 主线事件当前时至完成后 | 替她把叉拔下来 / 拔下来再给她包扎 | `branch.lmz.harpoon` = pulled / bandaged |
| L4 重逢 | 做了 | `s05b_06_…_ins_lmz_reunion` | 该主线事件当前时 | 笑着认栽 / 数落她 / 先拉着她跑；L2 答应过保密则承上不同 | `branch.lmz.reunion` |
| L5 红光 | 做了（只能见证） | `s05b_10_…_ins_lmz_redlight` | 主线事件完成后 | 唯一动作「在一旁看着」 | 玩家事实 `fact.lmz.phoenix_change`、`branch.lmz.phoenix_change` |
| L6 改口 | 后补，见 §7、§9（用户改定：改在 L4 重逢，按主动得分线，不看总好感） | 沿用 L4 事件 | 同 L4 | 同 L4 | `branch.lmz.title_upgraded`（主动得分≥分数线才写）；账本 `npcAddress` 读它 |

状态 id 全部用 `branch.` 前缀：关卡切换时 `strictInitializer` 只携带 `branch.* / scene.* / character.*` 等前缀的旗标，设计稿原写的 `fact.* / memory.*` 前缀跨关会丢。对照：`fact.baihu.first_bargain → branch.baihu.first_bargain`，`memory.ningyu.care → branch.ningyu.care`，依此类推。

「成瘾」：内容包 `statuses.json` 建了通用 `addiction`（任何人可中）与预设 `addiction.maigu`（麻古），按来源→效果→解除写。通用档只能用物品（`detox`）解除（项目规则：general 档状态不得由剧情旗标解除，`supplement19StatusTuning` 守着）；麻古预设用剧情旗标解除，且没有任何内容会写入这个旗标（红线「毒瘾不能被治好」）。**没有任何落点施加它**（毒瘾段按用户令只标记）。

## 3. 配置项与初值（`mod-kit/game-numbers.qingyu.json` → `lineBonds`）

| 项 | 初值 | 用在 |
|---|---|---|
| `bonusPerActiveAction` | 1 | 凝羽隔门的敲门/唤名/提旧事，每项 |
| `salience.notable` | 30 | 情感线记忆条目的重要度 |
| `ningyu.replyMode` | `fixed` | 隔门回应：`fixed` 固定备用版 / `model` 模型生成+检查 |
| `ningyu.regicideAgree / Refuse / AskWhy` | 1 / −1 / 3 | O2 |
| `ningyu.carePublicThanks / careWarm / careNone` | 1 / 4 / 0 | Y3 |
| `ningyu.enterBring / enterStay / enterAsk` | 1 / −2 / 2 | Y5 |
| `ningyu.farewellWord / farewellToken` | 6 / 6 | Y6 |
| `lemingzhu.teasePenalty` | −3 | 取代原写死的 `aff.w.small_neg`（已有拍「拿潘师姐吓唬她」改用它，行为不变） |
| `lemingzhu.shareMushroom` | 2 | 分烤鹅掌菌 |
| `lemingzhu.crowRush / crowWait / crowShield` | 2 / 0 / 3 | L1 |
| `lemingzhu.reunionLaugh / reunionScold / reunionRun` | 3 / −1 / 2 | L4 |
| `lemingzhu.titleUpgradeActiveScore` | 8 | L6 改口的主动得分线（§9），取代 `titleUpgradeThreshold` |
| `lemingzhu.activeScore.*` | l1Rush 2 / l1Wait 0 / l1Shield 3；l2Promise 3 / l2HardTruth 0 / l2Tease −3；l2Share 2；l3Pull 2 / l3Bandage 3；l4Laugh 3 / l4Scold −1 / l4Run 2 | 各停靠点每个选择的得分（§9） |

注意：数值在**编译期**代入 `catalog.json`；运行时的 `applyGameNumbers`（H1 的 tuning.json）改不到它们，改了配置要重新跑 `node scripts/content-packs.mjs`。

设计稿里没落成配置的两项：
- `big_event_threshold`：「单次 ±10 以上算大事」是 `runtime.ts` 里写死的常量（`settleOptionalLine`），要配置化必须改 runtime.ts，本轮没做，也没留一个不起作用的配置项。
- `auto_affinity_min`：走到门前/叶媪告知/离开山村本来就是主线事件、一律可自动带过，插入拍里没有对应步骤，所以不需要这个门槛，没建。

## 4. 偏离设计稿之处（都是为了不改正典结果）

1. **O1/O3/O5 的选项重写成「开口的姿态」**：主线事件本身已经写死了结果（六十金铢谈定并收下、水镜里报告了黑魔海的事、货队去白龙江口）。设计稿的「不要钱换别的」「只报霓龙丝」之类会和已落账的主线正文冲突，所以改成与结果兼容的姿态选择（见 §2）。如果要真改这些主线事件的动作，就是被撤下的试点那条路，需要你另定。
2. **O1→O3「苏妲己第一句话」的回响删了**：你已定水镜一场只有一版。
3. **「站位梯」只记状态，没有好感投影**：苏妲己在 04b/05b 不是本关人物，给她加好感/记忆会因关系记录缺失而抛错，所以白湖商馆线只写状态与路径回执。
4. **echo 受 8 个动作上限限制**：一个事件最多 8 个动作，所以 Y5 只做了 `warm` 一个变体，L4 只做了 `promised` 一个变体（其余值走默认承上）。
5. **每条线的「重要事件只有一步必须主动」**：落成了「窗口关闭仍无回执 → 默认状态」。只点下一步从不触发那一步（有测试）；只做必须的那一步也能正常结算（AC-NY-03）。

## 5. 验证

见主回复。新增测试：`tests/baihuLinesDemo.test.mjs`（20 条：id 总表、编译期数值代入、echo 展开、各停靠点真实运行时流程、AC-NY-01/02/03、乐明珠三条验收、检查函数）。

## 6. 受阻 / 没做

- 隔门回应「模型生成+检查」**没接线**：`farewellReplyGuard.ts` 已写好并测过（关键词→主持模型复核→固定备用版），但在叙事管线里调用它需要改 `AIBidirectionalSystem.ts`（现有的步骤守卫只覆盖 03b/04/04b，不含 05b），按规则停下。在此之前 `replyMode=fixed`：门内回应是按黑石滩照料档位选的固定备用句，玩家说的话本身不会进门内回应。
- 乐明珠「L1→L2 开场语气」回响没做：L2 的步骤在 `lines.json`，加变体会改动已投影进 `lcq.stage_04.json` 的事件，波及 canon 同步。
- 宋线 / 星月湖迁移、月霜护卫合同：按用户令本轮不做。
- 黑石滩「运真阳」选项：原著机制在合规段内，没有实现，仅在合规清单登记（BH-04/BH-05）。

## 7. 2026-10-14 补充：L3 拔鱼叉、L6 山村改称呼（用户改定）

### 7.1 L3 拔鱼叉：可选加分拍

- 事件 `lcq.event.pull_harpoon_lemingzhu_ins_lmz_harpoon`（`critical:false`，04b 关卡，海神殿），beat `beat.lmz.l3_harpoon`，`role:["choice"]`，带 `card`（承上/当下张力/两个选项）和 `echo`（读 `branch.lmz.first_rescue`，值为 `shielded` 时承上多一句「山顶碧潭那回你先护在她身前」）。
- 窗口：主线 `pull_harpoon_lemingzhu` 当前或已完成、乐明珠在场、在 `sea_temple`；`xieyi_biling_war` 完成或章序 ≥ 77 关闭。窗口关了没做就什么也不发生（不设 `onExpire`），点「下一步」不会触发（有测试）。
- 两个动作互斥（一拍只结算一次）：`act.lmz.l3.pull`「替她把叉拔下来」→ 好感 `lineBonds.lemingzhu.harpoonPull`（初值 2），状态 `branch.lmz.harpoon=pulled`；`act.lmz.l3.bandage`「拔下来，再给她包扎」→ `harpoonBandage`（初值 3），`bandaged`。都写记忆条目（重要度 notable）。2/3 的取值：不超过本线已有的单项最大加值（`crowShield` 3），包扎比只拔叉多 1。
- 主线事件 `pull_harpoon_lemingzhu` 原样（critical、两个动作 id、合同都不动，有测试断言）。
- 原著依据与限制：**本机没有原著全文**（`/workspace/xt/lcq.txt` 不存在，别处也没找到），所以没有重新核对原著。设计稿给出的鱼叉段行号（74:11047–11056、11094–11129、11145）全部在合规标记段内，拍子文本只用「拔叉」「包扎」两个姿态，且与主线事件现有措辞（「拔除卡住乐明珠的鱼叉」「止血包扎」）一致，不写伤口、身体、血腥，不取标记段内容。**注意**：设计稿 §0-10 说原著里叉是卡在岩石里、最后砍断，主线事件文本却写「拔除…稳定伤势」，两者不一致；本拍沿用主线事件的说法，没有裁断谁对。
- 合规清单 BH-13 已改：由「不另补拍」改为「补一个可选加分拍」，并写明不取标记行号的内容。

### 7.2 L6 改口（用户选方案 1，2026-10-14）：L4 重逢写状态，账本按状态选档，冻结文件两处检查改读账本

> **写状态的判据已改**：本节下面写的“按好感”“`affinityAtLeast`”“`titleUpgradeThreshold` 40”是当时的版本，已被 §9 取代（改看主动得分）。账本分档、`namingFor`、858/895 这几段不受影响。

**属于哪一渠道**：她叫主角 = `npcAddress`（不是面板/旁白/主角叫法）。

**为什么不是上一版的「山村 + 好感直接过门」**：上一版把好感写进账本门槛，但第 47 章那档是三个叫法的并集，已含「大笨瓜」，改口形同虚设；而且 `AIBidirectionalSystem.ts` 的 858/895 在鬼巫王被吞（第 111 章前后）之前硬禁「大笨瓜」，与 L4（第 99 章）冲突。用户选方案 1：授权小改这两处。上一版的 `minAffinityKey` / `affinity` 参数 / `legacyNarratorPacket` 的好感传参已全部撤回（我自己上一轮加的，没有别的调用方）。

**账本（`overrides.json`，乐明珠 `npcAddress`）**——第 47 章档拆开，新档读状态：

| fromChapter | 叫法 | 条件 |
|---|---|---|
| 47 | 大笨蛋／大笨牛（旧） | — |
| 99 | 大笨瓜（新） | `requiresState: branch.lmz.title_upgraded` |
| 111 | 大笨蛋／大笨牛／大笨瓜 | —（鬼巫王被吞后恢复全书并集，等于原 #199 的写法） |
| 111 | 大笨瓜 | `requiresState: branch.lmz.title_upgraded`（已改口者仍只用新叫法） |

99 = L4 重逢拍的锚点章；111 = `ghost_king_swallowed` 按 `namingChapter` 算出的章（首个锚点 `qingyu.111`，不是我上一轮说的 112）。第 111 章那两档是为了保持旧行为：原守卫在鬼巫王被吞后放开，账本并集也在那之后才算数。**这是我的判断，请确认。**

**写状态（只改 `questLines.ts`）**：quest-line 的 effect 加了可选 `when`（任何现有条件：`affinityAtLeast` 等），在 `settleLineInsertion` 里按"本次回执当时的上下文"过滤，不满足的 effect 不生效；`onExpire` 上不允许带 `when`；引用检查把 `when` 里的人物也查了。L4 的三个动作及 `promised` 变体各加一条 `setState branch.lmz.title_upgraded=true, when: affinityAtLeast(乐明珠, {"$num":"lineBonds.lemingzhu.titleUpgradeThreshold"})`，编译后代入 40，数字只在 `game-numbers.qingyu.json`。**判定用的是选择当时、该动作自己的好感加值落地之前的好感**（上下文先于结算），所以好感 39 选"笑着认栽"（+3）仍不改口。`runtime.ts` 一行没碰（它只负责把通过的 `setState` 写进 `flags`）。

**`namingFor` 按状态选档（`ledger/naming.ts`）**：第 4 参数 `{flags}`；带 `requiresState` 的档，只有 `flags[状态]===true` 才放开，没传 flags 不过门。`legacyNarratorPacket.ts` 读 `npcAddress` 时传 `namingRuntime.flags`，所以叙事材料 `称呼.对主角` 在改口前是「大笨蛋／大笨牛」、改口后是「大笨瓜」，第 111 章起未改口者是并集。

**858/895（`AIBidirectionalSystem.ts`，只改了这两行和 import）**：
- 新增 `naming.ts` 的 `npcAddressWithheld(id, runtime)`（首档之后新增的称呼词，所有含它的档都未放开则返回）和 `withheldAddressUsed(...)`（原守卫的正则：角色名 + 35 字内 + 该词）。
- 858：`乐明珠尚未使用“<被扣的词>”称呼主角，不能借用小紫口头禅。`，词取自账本；没有被扣的词则不加这句。
- 895：原条件改为 `withheldAddressUsed(...)` 命中则抛同一个 `ModuleNarrativeGuardError('声线时序冲突：乐明珠尚未使用X称呼')`。
- 文件里不再出现「大笨」二字（有测试断言）。读的是 `narrativeRuntime`（该处已有变量：场景存档的剧本模组，缺则回落 `runtime`；原条件读 `runtime.completedEventIds`，我没有逐项核对两者在所有路径上是否同一对象）。
- 与旧守卫的差别：(a) 放开条件由"事件 `ghost_king_swallowed` 完成"变成"账本章门/状态"，推断对绝大多数存档等价（未实机验证），但 `namingChapter` 也取"正在进行的事件章"的最小值，所以同章活动事件可能比旧守卫早一点放开；(b) 首档词（大笨蛋／大笨牛）不会被新禁（第 47 章前也不禁），保持旧守卫只禁「大笨瓜」的范围。

**没做/没验证**：858/895 没有走真实叙事管线跑过（只有 helper 的单元测试和对该文件的静态断言）；没有开 8091 实机；起点好感没有实测，40 是否过易/过难仍需实测。山村场景（第 123 章 `s05b_yeao_palm_ningyu_stays`）实测在场名单里没有乐明珠，改口发生在 L4，不依赖山村。

### 7.3 改动文件

- `mod-kit/game-numbers.qingyu.json`：`lineBonds.lemingzhu` 新增 `harpoonPull` 2、`harpoonBandage` 3（`titleUpgradeThreshold` 40 已在 §9 换成主动得分线）
- `src/modules/contentPacks/packs/qingyu/lines-lemingzhu.json`（`beat.lmz.l3_harpoon`；L4 三动作加 `setState branch.lmz.title_upgraded` + `when`）、`lines-texts.json`、`lines-resources.json`
- `mod-kit/entity-ledger/overrides.json`（乐明珠 `npcAddress` 拆为 4 档）
- `src/modules/scenarioMods/questLines.ts`（effect `when`）、`ledger/naming.ts`（`requiresState`、`npcAddressWithheld`、`withheldAddressUsed`）、`legacyNarratorPacket.ts`（传 `flags`）
- **`src/utils/AIBidirectionalSystem.ts`（用户授权，仅 import + 858 + 895）**
- 重新生成：`src/modules/contentPacks/generated/catalog.json`、`mod-kit/entity-catalog/index.json`；`canon:build` 顺带把 `builtins/character-registry.json` 的 version/generatedAt 改成 2026-10-14（只有这两个字段）
- `mod-kit/generated/deepseek-v4-flash/character-canon/CANON-DECISIONS.md`：追加 #212（L3 可选拍）、#213（L6 改口 + 授权小改冻结文件）
- `docs/COMPLIANCE-REQUIREMENTS.md`（BH-13、BH-10 两格；BH-10 已改成"L4 按好感改口"）
- `tests/baihuLinesDemo.test.mjs`（beat 总数断言 14→15；L6 的 3 条旧测试换成 6 条：账本结构、改口前后、L4 按好感写状态、叙事材料、守卫、`when` 校验）

### 7.4 验证

- `npm run canon:build` 全绿（含 37 关校验、人工裁定执法、全量测试）：1705 条，通过 1700，失败 0，跳过 5（仓库原有带理由 skip）。
- `node scripts/content-packs.mjs` 与 `--check` 通过；`validate-quest-lines` 无错误；`tsc --noEmit` 零错误；单独再跑全量 `npm test`：1705 / 1700 / 0 / 5。
- `tests/baihuLinesDemo.test.mjs` 27 条全过。
- 未提交、未推送、未删文件、未重建 8097。

## 8. 2026-10-14 试玩报告返修（O2/Y3 地点、新停靠点自由文本）

依据：`playtest-2026-09-28/REPORT-2026-10-14-baihu-demo.md`。**未提交、未推送、未删文件、未重建 8097；没有改 `runtime.ts` / `AIBidirectionalSystem.ts`**；乐明珠改口判据见 §9（用户已定，改看主动得分）。

### 8.1 O2 / Y3 在真档里永远不出现：三层原因

先说怎么查的：新增 `tests/baihuMainlineWalk.mjs`（引擎夹具：不经 LLM，只按主线逐拍走 stage_01→05b，战斗用固定意图收束），每拍问「现在有哪些可选拍的选项」。旧夹具把人直接放在事件的正典地点，所以地点错位一直没暴露。

1. **地点条件来源**：不是编译器默认，是 `lines-ningyu.json` 里手写的 `atLocation: liuchao.location.wuyuan`，抄自 stage_02 数据里这两个事件的 `locationId`。stage_02 的路上五拍（铁索桥/商队宿处/紫溪/黑石滩/蛇彝村）正典地点一律写五原，真正的位置由行旅节点给：`nh.caravan_camp`、`nh.black_shoal`（这两个节点没有世界地点，存档的 `locationId` 就是节点 id；实体总表里已有这两个 location id）。
   - 修：beat 新增可选字段 `sceneLocationId`（玩家实际所在处；`locationId` 仍是阶段正典锚点，阶段校验要求事件地点在本关正典里）。O2=`nh.caravan_camp`、Y3=`nh.black_shoal`，`requires.atLocation` 同改。`sceneLocationId` 同时用于叙事用的 `sceneLocation` 名字（从实体总表取）和「在场人物」判定。
   - 编译期新增一致性检查：`requires` 里任何 `atLocation` 必须等于 beat 实际所在处，否则编译失败（有负向测试）。
2. **「主线事件完成后」的窗口根本不存在**：引擎实测，主线事件的完成与强制路线（商队宿处→紫溪、黑石滩→蛇彝村）发生在同一次 `advance`，人已经被带走。已有的 `deferOptionalDeparture`（可选停靠点保留到做完/主动离开）只认「线的 `entry` 里写了该事件完成」，人物线的 entry 是章序，所以 O2/Y3/Y5/L5 都没被保留。
   - 修（`questLineContext.ts`）：beat 自己的 `requires` 写了该事件完成、且该 beat 的事件确实在运行时里、当前开着，也保留出发。不做 = 不强制：窗口关闭后路线照走（有测试）。
3. **窗口关得太早**：Y3 `closeWhen` 章序≥36 是下一主线事件（蛇村）的章，一激活就关 → 改为「蛇彝村完成」或章序≥37。

### 8.2 其余停靠点逐个排查（同样用引擎只走主线）

| 停靠点 | 结论 | 处理 |
|---|---|---|
| O1 | 引擎里玩家站在点心铺（`lcq.zone.wuyuan.pastry_shop`），而条件是 `atLocation 五原`，零选项 | `atLocation` 现在认「当前地点及其所在地点」（区域→世界地点，读实体总表的 `worldLocationId` 与 `LOCATION_PARENTS`）；`eventActive` 过滤同口径 |
| O3 / O5 / L1 / L4 / L2 / Y6 | 正常出现 | 无需改 |
| Y5 | 地点对；但完成即被强制五日路程带走 | 同 8.1-2 |
| L3 | **窗口从没开过**：`closeWhen` 里的 `xieyi_biling_war` 在引擎主线里早于拔鱼叉就完成了 | 去掉该项，只留章序≥77 |
| L5 | 同 Y3：`closeWhen` 章序≥111，下一主线（鬼王被吞，114）一激活即关 | 改为「鬼王被吞完成」或章序≥115 |

结果：内容包 15 个 beat + 已有的 L2 保密拍，在「只点主线」的引擎推进里全部出现，选项数>0（`tests/baihuLinesRealPath.test.mjs`）。

附带修的一处：路上的拍（O2/Y3）作答后会把玩家挪回「中州·五原城」。原因是 `storyRouteLocation` 只认五个主线事件 id；现在 `<主线事件>_ins_<线>` 取主线事件的路上地点（`eventNarrativeView.ts`），作答后位置不动，随后路线照常走。

### 8.3 新停靠点自由文本不结算

- 这条链：`resolveNaturalIntent` →（1）`resolveStoryEventActionFromPlayerText` 只看**主线焦点事件**的合同动作，可选拍不在其中；人物线还被刻意排除 →（2）意图模型。所以可选拍的自由文本完全靠模型，没有确定性匹配。
- **非人物线（白湖商馆 O1/O3/O5）**：在 `naturalIntentRouter.ts` 新增 `resolveOptionalLineAlias`，用内容包 `questLineResources.intentMatches`（`matchAny/matchAll/rejectIf`）做明文短语匹配，唯一命中才结算，走与按钮同一条结算路径，不调模型。问句、假设、转述、否定框、一句话命中两个选项一律不结算。
- **人物线（凝羽、乐明珠，含 L2）**：没改，也不该改——提示词和 `affinityAssessment` 规定好感由主持模型评估，缺评估即不结算（`missing_affinity_assessment`）。离线用「模型照实返回候选」做了全链验证：`resolveNaturalIntent` → `verifyFreshSelection`（界面随后的二次核对）→ 结算，L2 的 `pan_secret=promised`、乐明珠 +2 都落账。所以代码侧没有发现 L2 文本必然失败的原因。
- **没能复现报告里的「这一步我还没听清」**：该提示只来自 `failed`（过期/存档已变/中止）或界面的几处二次核对失败，都发生在真模型返回之后，离线无法触发。若要定位需要真机的 intent 模块日志。**待用户定**：人物线要不要加「模型失败时按默认好感权重的确定性兜底」（会绕开主持评估）。

### 8.4 只报告：引擎存档点上点选项报「模块行动已失效」

- 该提示来自 `AIBidirectionalSystem.ts:746`：界面选中的动作与重新列出的候选在 `source/eventId/actionId/contractHash` 上不全等。
- 我离线核对：旧存档点（`checkpoints-b14`）里的可选拍，`contractHash` 与现编译目录下新走一遍的完全一致，`reconcile` 前后也不变；8097 的构建（09:08）之后，内容包目录、`game-numbers.qingyu.json`、`mod-kit/quest-lines` 里只有本轮改的三份文件更新（只查了这几处），所以大概率不是「构建与存档点的内容包不同」。**没找到会让它不一致的纯状态原因**，报告里「contractHash 不一致」我没能验证；疑点留在界面保存的选中动作与提交时重新列出之间（未验证）。没有改。

### 8.5 改动文件

- 内容：`lines-ningyu.json`（O2/Y3 `sceneLocationId` + `atLocation`、Y3 `closeWhen`）、`lines-lemingzhu.json`（L3/L5 `closeWhen`）；重新生成 `generated/catalog.json`
- 代码：`questLines.ts`（字段、`atLocation` 认包含关系、引用检查）、`questLineContext.ts`（地点链、在场人物按实际所在处、出发保留）、`eventNarrativeView.ts`、`naturalIntentRouter.ts`
- 编译与模式：`scripts/content-pack-quest-lines.mjs`、`scripts/content-packs.mjs`、`mod-kit/schema/xiantu.quest-lines.v1.schema.json`
- 测试：新增 `tests/baihuLinesRealPath.test.mjs`（15 条）、`tests/baihuMainlineWalk.mjs`（夹具）；`baihuLinesDemo.test.mjs` 的夹具给路上的拍放对位置
- 临时探针 `tests/_gen_tmp.mjs`、`tests/_probe_loc_tmp.mjs`、`tests/_nt_dbg_tmp.test.mjs` 已清空成一行注释，按「不删文件」没有删，可直接删

### 8.6 需要你知道的行为变化与未验证

- 凝羽/乐明珠的「完成后」窗口开着时，玩家停在原地，下一个主线拍若在别处，会出现「前往」的主线 chip（既有的「主动离开跳过可选拍」路径）；O2/Y3 的下一拍仍是路上的拍，没有前往 chip。这是引擎层面的验证，**没有开 8091 在真界面看过**。
- L3/L5/Y3 的窗口比设计稿宽了一截（见 8.2）；L3 的「完成后」窗口现在真的会保留出发。保留出发只在该拍的事件确实在运行时里时才生效——`nanhuangTravelLedger` 的行旅夹具读的是不带内容包的原始关卡，没加这条判断时它会因此多出一次「前往」，现已按此判定，该夹具仍绿。
- 没跑 `npm run canon:build`（会重写 registry 时间戳）；跑了 content-packs（含 `--check`）、`validate-quest-lines`、`tsc --noEmit`、全量 `node --test tests/*.test.mjs`。

### 8.7 验证

- `node scripts/content-packs.mjs` 与 `--check` 通过；`validate-quest-lines` 无错误；`tsc --noEmit` 零错误。
- 全量 `node --test tests/*.test.mjs`：1721 条，通过 1716，失败 0，跳过 5（仓库原有带理由 skip）。
- 红绿：修前引擎推进里 O2/Y3/Y5/L3/L5/O1 选项数为 0，O2 作答后位置被挪回五原；修后全部 >0、位置不动、路线继续。

## 9. 2026-10-14 用户改定：乐明珠 L4 改口看“主动得分”，不看总好感

**规则**：L4 重逢时，把玩家在乐明珠线各停靠点的选择折成分数求和（含 L4 自己这一选），≥ `lineBonds.lemingzhu.titleUpgradeActiveScore` 才写 `branch.lmz.title_upgraded`。总好感完全不读。只点主线不做任何停靠点 = 0 分，永远不改口。

### 9.1 怎么算

- 停靠点的选择本来就记在状态里：L1 `branch.lmz.first_rescue`（rushed/waited/shielded）、L2 `branch.lmz.pan_secret`（promised/hard_truth/teased；窗口过期没答是 `none`）、L2 加分 `branch.lmz.shared_mushroom`（true）、L3 `branch.lmz.harpoon`（pulled/bandaged）。分数从这些状态现读，没有新写状态，也没有累加器；没做的停靠点没有状态 = 0 分，`none`/没列出的值 = 0 分。
- 新增 quest-line 条件 `stateScoreAtLeast: {terms:[{stateId, scores:{值:分}}], plus, value}`（`questLines.ts`：类型、解析校验、求值、引用检查；`xiantu.quest-lines.v1.schema.json` 加了条件定义）。`plus` 是正在结算的这一选（L4 自己）。L4 三个动作及其 `promised` 变体的 `setState title_upgraded` 的 `when` 由 `affinityAtLeast` 换成它。`runtime.ts`、`AIBidirectionalSystem.ts` 没动。
- **自由文本也走同一个分**：分数只看选了哪个动作（状态值），与主持模型给的好感增量无关，所以人物线的自由文本结算不会改变得分规则。

### 9.2 分数表与分数线（全在 `game-numbers.qingyu.json` → `lineBonds.lemingzhu`）

| 停靠点 | 选择 → 分 |
|---|---|
| L1 鸦人 | 冲出去 2 / 等破绽 0 / 先护住 3 |
| L2 别跟潘师姐说 | 答应保密 3 / 直说 0 / 拿潘师姐吓唬 −3 |
| L2 加分（分烤鹅掌菌） | 2 |
| L3 拔鱼叉 | 拔下来 2 / 包扎 3 |
| L4 重逢（本身这一选） | 笑着认栽 3 / 数落 −1 / 先拉着跑 2 |

**分数线初值 8，最高可得 14**（3+3+2+3+3）。理由：
1. 分值我照抄了各选择当时的好感加值，这样“主动得分”和玩家看到的优劣顺序一致；负分只在对她不友好的两个选择（吓唬 −3、数落 −1），会抵掉别处挣的分。
2. 8 的含义是“至少三处认真做”：任意两个停靠点最多 3+3=6，够不到；三个最好的选择 9，够；四个普通选择（冲出去 2 + 分菌 2 + 拔下来 2 + 跑 2）刚好 8。只做一两处、或做了又吓唬她，都不够。
3. 14 的 57% 左右。起点没有实测，**是推算**，需要真机玩几遍看顺手程度再调；调的只有配置里这两处，改完重新跑 `node scripts/content-packs.mjs`。

### 9.3 改动文件

- 配置：`mod-kit/game-numbers.qingyu.json`（删 `titleUpgradeThreshold`；加 `titleUpgradeActiveScore` 8 和 `activeScore` 12 项）
- 内容：`lines-lemingzhu.json`（L4 三个动作的 `when`）；重新生成 `generated/catalog.json`、`entity-catalog/index.json`（由 `canon:build` 跑出）
- 代码：`questLines.ts`（`stateScoreAtLeast`）；模式：`xiantu.quest-lines.v1.schema.json`
- 文档：本节、`COMPLIANCE-REQUIREMENTS.md` BH-10 一格、`CANON-DECISIONS.md` 追加 #214
- 测试：`baihuLinesDemo.test.mjs`（L6 的“账本结构”“叙事材料”两条改写；“L4 按好感写状态”一条换成“只点主线不改口”“主动做够改口”“逐一枚举所有选择组合”三条，另新增“分数线位置”一条；27→30 条）、`baihuLinesRealPath.test.mjs`（+1 条：引擎只点主线走到 L4，好感拉满也不改口）

### 9.4 验证与未验证

- 红绿：旧规则下，好感 100 的只点主线玩家会改口、好感 0 的主动玩家不会；新规则下反过来（`只点主线不改口`、`主动做够改口` 两条测试，参数取好感 0/40/100/500）。
- `L6 the written condition is the plain sum`：对 4×4×2×3×3=288 种“停靠点选择 × L4 选择”逐一核对条件结果等于独立求和 ≥ 线。
- **没开 8091 实机玩过；每个停靠点在测试里是各自的存档里做的再合并状态，不是一局里连着玩。**
- 已改口的旧存档不受影响（状态已写）；已经过了 L4、按旧“好感≥40”规则写过状态的存档，状态保留。

## 10. 2026-10-14 白湖 demo r2 返修（包 `c1ee00db`）

依据：`playtest-2026-09-28/REPORT-2026-10-14-baihu-demo-r2.md`。**未提交、未推送、未删文件、未重建 8097（`dev/combat-trial/dist` 仍是 11:11 的包）；没改 `runtime.ts` / `AIBidirectionalSystem.ts`**；合规只标记，无新增。

### 10.1 【高】O2、Y3 真档仍不出现——测试路径与真机路径的差别

先排除你列的三个猜测（都是**已核实**）：
- 打包的 catalog 不是旧的：8097 的 `combat-trial.js`（11:11）里 `beat.ningyu.o2_regicide` 的 `requires` 就是 `atLocation: nh.caravan_camp`，Y3 是 `nh.black_shoal`，与磁盘 `catalog.json`（10:49 生成）一致。
- 没有第二份数据源：构建只读 `generated/catalog.json` 和 `builtins/data/*.json`。
- 测试员看到的「bundle 里 O2 locationId 仍是 wuyuan」是事件的**阶段锚点** `locationId`（设计如此，§8.1-1），不是 beat 的触发地点（`sceneLocationId`/`requires`）。

**真因在代码，不在数据**：真机每回合推进后，`AIBidirectionalSystem` / `legacyNarratorPacket` 还会调 `ensureWuyuanOpenWorldSlice`；它在「已离开五原」分支里按**当前主线焦点事件**重写玩家位置（`storyRouteLocation(focus.id)`）。O2/Y3 的窗口靠行旅账把人留在上一拍的路上节点，但主线事件一完成，焦点已是下一拍（紫溪/蛇彝村），这个钩子就把位置改成下一拍的节点 → `atLocation nh.caravan_camp` 不成立 → 0 个 chip；随后窗口按章序过期，路线照走。§8 的引擎夹具 `baihuMainlineWalk.mjs` 推进时**没调这个钩子**，所以一直绿。
- 复现（红）：给夹具每次 `advanceScenarioRuntime` 后加 `ensureWuyuanOpenWorldSlice`，O2/Y3 立刻变成 never offered，与 r2 日志一致（`o2replay.txt`：事件完成后位置已是「南荒途中·紫溪」）。
- 修：`wuyuanOpenWorldSlice.ts` 的该分支在行旅账里还有「已推迟、尚未结清」的出发事件（`deferredDepartureEventIds` 里有、`doneEventIds` 里没有）时不按焦点改位置；其余路径不变。
- 测试：`baihuMainlineWalk.mjs` 现在每拍和真机一样调这个钩子；`baihuLinesRealPath.test.mjs` +2 条：「真机钩子不得把留在节点上的玩家拉走」「打包产物内嵌的目录、投影事件、场面合同与磁盘一致，且含该守卫」。后一条默认读 `dev/combat-trial/dist`（仅当它晚于 catalog 构建，否则 skip 并说明），也可 `XIANTU_BUNDLE_PATH=<另一个输出目录>/combat-trial.js` 指向别处。
- 打包内容核对（不覆盖 dist）：`webpack-cli --config webpack.combat-trial.config.js --mode development --output-path /tmp/ct-verify`，产物在 `/tmp/ct-verify/combat-trial.js`；用上面的测试对它跑过，catalog（含 14 份场面合同）与磁盘逐项相等，守卫在包里。**8097 现在服务的包没有这个修复，需要你重建。**

未验证：没有开真机界面；O2/Y3 在引擎里（带真机钩子）出现并可作答、作答后路线继续，但没有看真界面。

### 10.2 【高】碧鲮湾交锋无法收束——旧问题，不是 fix1 引起

- **不是 fix1**：`f07.json`、`sceneModule/` 在 HEAD 之后没有任何改动（git 里没有 diff）；「窗口开着时保持不离开」只作用于可选拍的出发，不碰场面。
- **引擎本身能收束（已核实）**：用夹具推进到 `biling_bay_stance`，指定「制服蛇傀 → 救火楼 → 守村口」（或「留活口」变体）并固定骰 20，场面在村口那拍结束。
- **真因是识别**：该合同有 3 个推进目标各只作用于一个参与方（`command/capture→armed`、`rescue→fire`、`seal→exit`），外加一个**不推轨道、不改胜负**的铺垫目标 `stop_slaughter`。目标与参与方都没有 `aliases`，规则识别对「守村口」实测返回空（「救火楼」修前没单独测，按同一原因推断），「守住村口，不让一个人跑掉」实测归到 `stop_slaughter`（「守住」命中 `PROTECT`，铺垫目标得 5 分，推进目标 0 分）。**推断**：模型回复目标对、参与方点错时 `validateProposal` 把目标丢掉、整份提议作废，也会落回规则。测试员 `autoB.txt` 里进场后 17 拍：15 拍「阻止滥杀奴隶」、1 拍「守村口」、1 拍「分派人手」。
- 「推进已到你能推到的上限」是**误导文案**：`renderResultLines` 对没有轨道的铺垫目标也输出这句（那个目标的 `claimed` 恒为 0）。不是村口轨道真的到顶。
- 修（均不在冻结文件）：
  1. `f07.json`：给 5 个目标、3 个参与方（`armed/fire/exit`）补 `aliases`（内容，不是数值）。
  2. `host/recognize.ts`：规则识别里，玩家话里点名的参与方是某推进目标的 `targetIds` 时该目标 +10 分；模型回复选了铺垫目标、玩家又点名了有专属推进目标且轨道未到终态的参与方、且没提铺垫目标自己的词时，改归到那个推进目标并把目标换成该参与方。只对带 `targetIds` 的合同生效（现只有 `f06–f09` 的内容包合同有，其中只有 f07 同时有铺垫目标）。
  3. `brief.ts`：「已到上限」只在 `claimed>0` 时输出。
- 测试：`tests/sceneBilingRecognition.test.mjs`（5 条：规则识别、模型识别重归、玩家真说「阻止滥杀」时保持、轨道已到终态不重归、结果卡文案）。
- **未验证**：我没有调真模型，**看不到测试员那局里模型实际回了什么**；「模型路径」是按症状和代码推断并用模拟回复覆盖，规则路径是实测。真机需要再打一遍碧鲮湾确认。

### 10.3 【中】300s 超时——测试驱动的误报，游戏无需修

三次（11:21 凝羽赌局、11:28 与 11:41 阿姬曼身契）全部发生在**剧情分支决定**（「接赌/不赌」「当面撕契并改道出城 / 先收起身契」）：
- 已核实：三次的截图都是该决定卡；日志里这一步的本地回合在点击后 0.1–1 秒内就结束（`[DEMO_MODULE_ONLY] path: local` 紧跟点击，`chatReqs=0`）。
- 已核实：此时输入框按设计只读（`MainGamePanel.vue` 的 `:readonly="!!branchDecision"`），而驱动 `drivercb.mjs` 的 `inputReady()` 要求 `!readOnly`，所以空等满 300 秒才放弃。再点同一选项（或下一步）就正常了，与日志吻合。
- 结论：不是界面卡忙。驱动该在存在分支决定卡时按「决定卡出现」判定回合结束（测试工具侧，不在本仓库）。

### 10.4 【低】L2「吓唬」好感 48→38 与实际 46

- 已核实（引擎复现）：自由文本走主持模型的好感评估（`selection.lineAffinityDelta`，此处给 −10）→ 该拍的账 48→38；同一回合 `advance` 里主线事件 `s04_03` 自己的共历好感 +8（38→46）。所以账与实际都对，只是两笔账；玩家看到的是净值 46。按钮路径用配置权重 `teasePenalty` −3（48→45）。−10 来自主持评估，不是配置。
- 主动得分现在可核对：`questLines.ts` 在每次可选拍结算时，把所有「得分过线才写入」的状态的明细写进存档 `世界.状态.剧本模组.questLineState.activeScores["branch.lmz.title_upgraded"]`：`terms`（每项状态、当时的值、得分）、`plus`（L4 本次选择的加分）、`total`、`needed`（来自配置的分数线）、`passed`。只读快照，判定仍由 `lineConditionMet` 现算，不参与判定。L1–L3 结算后就有（`plus:0`），L4 时给出终值。
- 测试：`baihuLinesRealPath.test.mjs` +1 条（L1 后、L4 笑着认栽、L4 数落三种情形；明细总和与配置值逐项相等，且导出的 `passed` 与实际写入的状态一致）。

### 10.5 改动文件

- 代码：`wuyuanOpenWorldSlice.ts`（持有出发时不按焦点改位置）、`sceneModule/host/recognize.ts`、`sceneModule/brief.ts`、`questLines.ts`（`activeScores`）
- 内容：`contentPacks/packs/qingyu/f07.json`（aliases）；重新生成 `generated/catalog.json`（内容包版本 `1003fc13327fd4a1`）
- 测试：`baihuMainlineWalk.mjs`、`baihuLinesRealPath.test.mjs`（15→19 条，含 skip 说明）、新增 `sceneBilingRecognition.test.mjs`
- 临时文件：`tests/_real_tmp.test.mjs`、`tests/_walk_real_tmp.mjs` 是我这轮建的探针，删除被拦（「不删文件」），已清成一行注释，可直接删

### 10.6 验证

- `node scripts/content-packs.mjs` 与 `--check` 通过；`validate-quest-lines` 无错误；`tsc --noEmit` 零错误。
- 全量 `npm test`：1734 条，通过 1728，失败 0，跳过 6（5 条仓库原有带理由 skip；1 条是打包产物核对——8097 的 dist 比重新生成的 catalog 旧，默认 skip；对 `/tmp/ct-verify` 里的新包跑是通过的）。
- 红绿：O2/Y3（给夹具加真机钩子后）修前 never offered、修后出现且可作答；碧鲮湾规则识别修前「守住村口，不让一个人跑掉」→ `stop_slaughter`、「守村口」「我堵住村口」「封锁村口」→ 空，修后都归 `seal`、目标 `exit`，「救火楼」归 `rescue`。

## 11. 2026-10-14 白湖 demo r4 返修（包 `4522b6ba`）

报告：`playtest-2026-09-28/REPORT-2026-10-14-baihu-demo-r4.md`。没有改 `runtime.ts`、`AIBidirectionalSystem.ts`；没有提交/推送/删文件，8097 没动（所以这些修复要重建部署后才能在真机上看到）。没有新增数值，别称和正则都在合同 JSON 里。

### 11.1 【高】05b「与鬼巫王交锋，设法脱身」收不了尾

**原因（已核实：我用 f10 合同在「鬼巫王已离场、丹宸和骨虎在场、第 5 拍、已有 `blood_known`」的状态下逐句探针，修前复现）**

- f10 的三个推进目标 `subdue_alive`（制住丹宸）、`destroy_tiger`（让骨虎沾血）、`drive_away`（赶走丹宸）**没有 `targetIds`**，也几乎没有别称（`drive_away` 只有「赶走/驱走」，另两个没有）。上轮碧鲮湾的改道只对带 `targetIds` 的合同生效，对 f10 完全不起作用。模型一回铺垫目标 `survive_tiger`（躲开骨虎和断斧），就停在那里；这个目标成功了也不推任何轨道，所以固定骰 20 也结束不了。
- 「真阳之血喷骨虎」连规则路径都不行：`true_yang_blood.actionPattern` 里没有「喷」，血杠杆被当成没有主动行为剥掉，`destroy_tiger` 又被降成 `survive_tiger`。
- 「双刀逼退丹宸冲出」规则路径归 `subdue_alive`（天花板只到 2，要再用 `drive_away` 才能收），模型路径归 `survive_tiger`；「脱身外撤」规则路径根本没有目标。
- **推断，未核实**：测试员那局模型实际回了什么我看不到（没调真模型），「模型回了 `survive_tiger`」是按报告症状推的，用模拟回复覆盖；规则路径是实测。

**改了什么**

1. `sceneModule/host/recognize.ts`
   - 改道泛化：玩家原话命中某个推进目标的**别称**（取命中最长的），或点名了它的作用对象，而模型/规则选的是铺垫目标、又没说铺垫目标自己的词 → 改归推进目标，目标换成该推进目标当前能作用的参与方。没有 `targetIds` 的合同按「在场敌方且带这条轨道」认。轨道已到终态的不改道（沿用上轮的行为）。
   - 轨道要求特定杠杆（骨虎要真阳之血）而提议里没有该杠杆时不改道——所以「击退骨虎」「挥刀砍骨虎」仍留在 `survive_tiger`（合同设计：普通刀砍不能消灭它）。
   - 玩家主动用血、模型却漏了血杠杆时，按原话补上（依据仍是原话里的词，照常过校验）。血的「主动行为」正则改读元素自己的 `actionPattern`，不再在代码里写死一份。
   - 规则路径：推进目标有 `targetIds` 时，点名/默认目标只取它的作用对象。
   - 顺手修一个旧问题（探针扫出来的）：f08 里玩家说「砍达古」，第一条「说了砍就归标签含『攻击』的推进目标」把它改成 `command`（组织防线攻击达古）。现在原话已命中当前推进目标自己的别称时不再覆盖。
2. `contracts/f10.json`：三个推进目标补 `targetIds`（丹宸 / 骨虎）和别称；`drive_away` 别称加「逼退丹宸、脱身、摆脱、外撤、撤出、突围、冲出…」；`destroy_tiger` 别称都是带主动行为的说法（「用血克制骨虎」「血喷骨虎」「真阳之血喷骨虎」…）；`actionPattern` 加「喷/溅」和「血…喷」的语序；`use_blood` 动词别称加「血喷、喷血、血洒、血溅」。
3. 排查所有场景交锋合同（14 份；`f14.draft.json` 是草稿、不进游戏，没动）：推进目标共有 16 个**完全没有别称**，已全部补上——
   `f01/f02/f04/f05.attack`、`f03.turn_tide/finish_last/harass`、`f03-entry.break_through`、`f06.repel/release`、`f07-geluo.explain`、`f08.attack/command`、`f09.repel/rescue`、`f14.slay`。已有别称的（f03.attack/capture、f07 全部、f13.hold_well、f10 的 drive_away）逐条验证都能到达自己的目标。其中真正存在「被铺垫目标吞掉」条件的是 f01/f02/f04/f05（有 defend）、f03、f06（有 parley）；f08/f09/f14/f03-entry/f07-geluo 没有铺垫目标，补别称是为了让自然说法有稳定落点。

**通用测试** `tests/sceneEngagementClosers.test.mjs`（6 条）

- 所有合同的每个推进目标都必须有别称；
- 每个别称，在规则路径下、以及模型回「本阶段任意一个铺垫目标」时，都必须落到自己的推进目标（现在 26 个推进目标、137 个别称、431 个「说法 × 模型回复」组合；测试里断言至少 50 个别称，防止空跑）；
- 每个胜利条件里要推到终态的轨道（`not` 里的不算）至少有一个带别称的推进目标能推它；
- 05b 的三句原话（模型回 `survive_tiger` 也要改道、血杠杆跟着走）、「没用血不算毁骨虎」、「丹宸轨道已完成不再改道」。
- 以后新增合同如果推进目标没别称、或别称会被铺垫目标吞掉，这条测试会直接红。

**行为变化 / 没覆盖的**

- 「逼退丹宸」现在归 `drive_away`，不再归 `subdue_alive`（逼退 = 赶走，一拍就能到天花板并收尾）。「脱身/摆脱/冲出」也归 `drive_away`，作用对象是丹宸；合同里没有专门的「脱身」目标，骨虎仍然必须靠真阳之血，所以「脱身」不会单独结束整场——这是合同的设计，不是遗漏。
- 通用测试验证的是**说法落到哪个目标**，不是整场能打到收尾（那要按场景各自看轨道天花板和杠杆要求）。带 `when` 条件的推进目标测试里跳过（现在没有这样的）。
- 没有再跑真机。

### 11.2 【中】「进度已保留，可返回入口选择下一期」——选了「让继续到下一期真的可用」

**查明（已核实）**：一期、二期共用同一个隔离角色和同一个存档位「清羽记开局」，差别只在存档里的终点标记（`endModId/endEventId/scope`）。界面的「本期结束」和引擎的转场拦截（`isNanhuangDemoFinished`、`getStageDepartureOffer`、`transitionToNextScenarioStage`）都只读这个标记。所以「选二期 + 继续上次」读到的还是一期标记，仍是本期结束；「重置并重新开始」则是按二期重新建档，从第 1 章来。

**为什么选做功能而不是只改文字**：一期到二期要重打 124 章，而存档里的进度本来就是二期该有的进度，只差把终点标记挪到二期的终点——改的是 3 个字段，不碰 `runtime.ts`；只改文字则等于把「做不到」写清楚，玩家仍得重打。

**改了什么**

- `contentPacks/packs/qingyu/playtests.json`：`nanhuang-1` 加 `nextId: "nanhuang-2"`（数据驱动，不在代码里写期号）；`scripts/content-packs.mjs` 校验 `nextId` 必须指向存在的试玩；`PackPlaytest` 类型加 `nextId`。
- `qingyuOpeningPlaytest.ts`：`nextNanhuangPhase(save)`（按终点标记认当前期）、`withNextNanhuangPhase(save)`（返回新存档，只改终点标记，不改入参）。
- `gameStateStore.continueToNextPlaytestPhase()`：仿 `transitionToNextStage`，改标记 → `loadFromSaveData` → 落盘；AI 正在生成时拒绝。
- `MainGamePanel.vue`：本期结束卡有下一期时显示「继续到下一期」按钮并改了提示文字；最后一期则提示「这是试玩的最后一期，进度已保留」，只留「返回试玩入口」。
- `QingyuOpeningPlaytestStartView.vue`：下拉框选「二期」+「继续上次试玩」时，若上次档是一期，读档后自动挪到二期（二期档再继续是无操作）。「重置并重新开始」不变。
- 测试：`tests/playtestPhaseContinueAndAutosave.test.mjs`（一期终点档继续后：标记变二期、不再判结束、可启程、转场不再报「本期南荒试玩已结束」、入参不被改；最后一期/非分期档无下一期；界面接线）。

**未验证**：只用「把运行时设成 04b、写入 `enter_dong_with_migu` 已完成」的合成存档验证了标记逻辑和引擎的拦截条件；**没有在浏览器里点过按钮，也没有真的从一期终点继续打到二期**。继续后能否「启程」取决于存档里的 `nextStageReadyId` 是否已就绪——和二期直接打到这里时一样，没就绪就继续剧情。

### 11.3 【低】自动存档覆盖手动存档位

**查明（已核实，读代码）**：不是为手动存档设计的，是「读档把被读的槽设为当前激活存档，之后每回合自动存档写进这个槽」的通用行为（`loadGame` → `当前激活存档`；`saveCurrentGame` 写激活槽）。「新建存档」「覆盖存档」都不改激活槽，所以只有**读了手动存档位再继续玩**才会被盖；r3 报告里「r3真档-enter_dong_with_migu 被本期结束的状态覆盖」就是这样。落地试玩和战斗检查点早就有「自动存档写工作副本」的保护，隔离的清羽试玩没有。

**改了什么**：`utils/isolatedPlaytestPersist.ts` 新增 `packPlaytestWorkingSlot()`，`characterStore.loadGame` 对**内容包隔离试玩档**读到固定试玩槽以外的存档位时，把数据接回固定试玩槽（清羽就是「清羽记开局」）作为激活槽，被读的存档位不再被自动存档改写；战斗检查点（自带保护）、落地试玩（自带逻辑）、正式角色不受影响。测试在上面同一个测试文件里（含对 `loadGame` 接线的源码断言）。

**取舍/没改的**：读手动存档位会覆盖「清羽记开局」槽（那本来就是自动存档位）——误读一个旧档会丢掉自动存档里的最新进度；要避免的话可以改成每次读档另起一个新工作槽，代价是「继续上次试玩」就不再是最新进度。我**没有**改正式（非隔离）角色的读档行为，那是通用存档语义，需要你拍板。没在浏览器里验证。

### 11.4 改动文件

- 代码：`sceneModule/host/recognize.ts`、`scenarioMods/qingyuOpeningPlaytest.ts`、`stores/gameStateStore.ts`、`stores/characterStore.ts`、`utils/isolatedPlaytestPersist.ts`、`components/dashboard/MainGamePanel.vue`、`views/QingyuOpeningPlaytestStartView.vue`、`contentPacks/index.ts`、`scripts/content-packs.mjs`
- 内容：`sceneModule/contracts/f01/f02/f03/f03-entry/f04/f05/f10.json`、`contentPacks/packs/qingyu/f06/f07-geluo/f08/f09/f14/playtests.json`；重新生成 `generated/catalog.json`（内容包版本 `4bb9a77919c7b73f`）
- 测试：新增 `sceneEngagementClosers.test.mjs`（6）、`playtestPhaseContinueAndAutosave.test.mjs`（5）
- 临时文件：`tests/_dump_tmp.mjs`、`_probe_f10_tmp.mjs`、`_explore_tmp.mjs`、`_dbg_tmp.mjs` 是我建的探针，已清成一行注释，可直接删

### 11.5 验证

- `node scripts/content-packs.mjs` 与 `--check` 通过；`tsc --noEmit` 零错误；`vue-tsc --noEmit` 对两个改过的 .vue 无报错。
- 全量 `npm test`：1745 条，通过 1739，失败 0，跳过 6（与上轮同样的 6 条）。
- 红绿：修前探针——模型回 `survive_tiger` 时「脱身外撤 / 真阳之血喷骨虎 / 双刀逼退丹宸冲出」全部停在 `survive_tiger`，规则路径「真阳之血喷骨虎」被降成 `survive_tiger`；修后分别归 `drive_away`、`destroy_tiger`（带血杠杆）、`drive_away`。别称排查：补前 16 个推进目标无别称，补后通用测试全绿。

---

## 12. 2026-10-14 NPC 角色卡有界层接入模块化路径（构建 SHA 由用户补）

依据：`NPC-DESIGN-AUDIT.md` A2/A4、`SEMANTIC-INTENT-PLAN-v2.md`、`_newbot_tmp/ab-npc-latency/RESULT.md`（AFTER 层集合与已测延迟）。本节只写代码改动与验证，不含构建/部署。

### 12.1 改了什么

1. **有界 NPC 卡**（新文件 `scenarioMods/npcCardLayer.ts`，在 `readPresentActors` 里挂到演员的 `card` 字段）。只给包内前 `maxCards`(=2) 个在场演员，全按角色 id 取：
   - 立场行：`formatRelationStance`（含 `STANCE_PROFILES` 专属形态，按存档里的好感/标签/滞回姿态）＋好感上限行 `formatAffinityCap`；
   - 阶段门：当前关画像 `notes` 里的【本阶段禁用】【关系身份门禁】；
   - 底线：当前关画像 `notes` 里的【底线】，门控沿用 `shouldRevealBottomLine`（未达则给旧路径的“尚未摸透”句）；**不读** `社交.关系.人格底线`、**不回落**静态注册表，所以南荒关对底线的阻挡原样保留；
   - 承重角色保护：旧路径的“尚未完成关键事件所系人物”口径，抽成 `loadBearingCharacterIds` / `formatLoadBearingProtection` 两处共用；
   - 最近 3 条 `记忆[]`；最近 2 条相关编年史事件（按事件 `relatedCharacterIds` 与角色 id 关联，不做人名匹配）；
   - 性格沿用演员卡原有 `traits`（≤3，带泄密过滤）；谈吐在画像缺失时按 id 取注册表补位（同一泄密过滤）；
   - 封口人物（谢艺昏迷/技能未揭、殇侯、未揭身份的乐明珠）只给旧路径的封口行（`formatSealedCharacter`，从 `formatFocusedCharacter` 原样抽出），不带谈吐/立场/底线；
   - 上限全在 `mod-kit/game-numbers.qingyu.json` → `npcCard`：`maxCards 2 / maxFallbackActors 6 / maxMemories 3 / memoryChars 80 / maxEvents 2 / eventChars 70 / maxGateNotes 3 / noteChars 160 / maxCardChars 1400`（超 `maxCardChars` 时从末尾逐行丢：事件→记忆→保护→底线→阶段门→上限行，立场行不丢）。
2. **自由输入 actor 为空**：`readLocalMemoryCapsule(save, selection?, freeInputOffered?)`。自由输入时 ①当前候选里所有演员表并集（修复前只取 `candidates[0]`，Y6 门前只得到殇侯）；②一个都没有时回落到 `questLineContext` 声明的在场人物（代码声明，不靠正文），最多 `maxFallbackActors` 人。冻结文件只改一处（见 12.3）。
3. **按钮回合卡片不完整**：内容包按钮拍 `cast.present` 写的是角色 id；`readLocalMemoryCapsule` 现在用画像 canon 把 id 解析成名字（`castNames`），`readPresentActors` 才能按名匹配到画像，名字/性格/身份/外貌随之补齐。
4. **没有补任何数据、没写任何 canon 文本**。

### 12.2 改动文件

- 新增：`src/modules/scenarioMods/npcCardLayer.ts`、`tests/npcCardLayer.test.mjs`
- 修改：`src/modules/scenarioMods/legacyNarratorPacket.ts`（`card` 字段、`castNames`、`readLocalMemoryCapsule` 签名与回落）、`src/modules/scenarioMods/storyContext.ts`（只抽取/导出：`shouldRevealBottomLine`、`BOTTOMLINE_HIDDEN_NOTE`、`formatSealedCharacter`、`loadBearingCharacterIds`、`formatLoadBearingProtection`，`formatFocusedCharacter` 与承重行行为不变）、`mod-kit/game-numbers.qingyu.json`（新增 `npcCard` 段）、`src/utils/AIBidirectionalSystem.ts`（冻结文件，仅 12.3 一处）
- 未改：`runtime.ts`、任何 canon / `mod-kit/generated/**`、内容包数据
- 探针（我建的，未删）：`_newbot_tmp/npc-card/probe1–6.mjs`

### 12.3 冻结文件 `AIBidirectionalSystem.ts`（用户授权，仅限自由输入 actor 为空）

工作区该文件开工前已有 7 行未提交差异（命名台账/称呼时序），不是本次改的。本次只动 794–795 行，两行换成一行（开工前后对比 `diff -U0`）：

```
@@ -794,2 +794 @@
-    const capsuleSelection = candidates[0];
-    const capsule = capsuleSelection ? readLocalMemoryCapsule(saveData, capsuleSelection) : null;
+    const capsule = readLocalMemoryCapsule(saveData, candidates[0], candidates.slice(1));
```

逻辑全部在未冻结的 `legacyNarratorPacket.ts`；`capsule` 在该分支此前只用于 `compiled` 为空（自由输入）时，不再可能为 null，下游 `capsule?.…` 写法不变。

### 12.4 验证

- 新增 9 条：(a) 第 10/100/300 回合规模（300 为合成上界：编年史 300、NPC 60、每人记忆 40 条且顶满字数）卡片字数 ≤ `maxCards×maxCardChars`，且 300 比 10 回合多出的字数 ≤ 记忆+事件满额预算；记忆只取末 3、事件只取末 2 且按 id 关联；(b) 自由输入有场景内 actor（Y6 含凝羽、叶媪；无候选状态回落且 ≤ 上限）——**撤掉冻结文件那一行时此条变红**，恢复后绿；(c) 按钮回合名字为凝羽/叶媪、`traits/appearance/role/speechStyle` 非空；(d) 低好感(−15)与高好感(70)立场行不同，专属形态随档变化；另有阶段门保留（05b 好感 100 也不出底线，stage_02 按好感门控）、承重保护出现/消失、封口人物只给封口行。
- 全量 `npm test`：1754 条，通过 1749，失败 0，跳过 5（上轮 1745/1739/0/6；多出 9 条是本次新增，跳过数 6→5 我没追查原因，5 条均为既有 `skip` 标注）。
- `node scripts/content-packs.mjs --check` 通过（内容包 `4bb9a77919c7b73f`）；`tsc --noEmit` 零错误；`validate-character-levels` 通过。未改 canon 数据，未跑 `npm run canon:build`。
- 夹具里量到的大小（`tryModularTurn` 截获，不联网）：Y6 按钮拍好感 25 时整段 system 4,197 字符（RESULT.md 的 AFTER 为 4,324），凝羽卡 682 字、叶媪卡 36 字；好感 −15 时凝羽卡 774、存档原值（好感 100）879。**没有重跑真模型延迟，没有浏览器验证**；延迟以 RESULT.md 的已测值为准，本次实现的层集合与它不完全相同（底线改读阶段画像、加了承重保护与阶段门行）。

### 12.5 数据缺口 / 阶段门 / 合规标记（只报告，没有补写）

- **乐明珠**：03b、04 关画像里她是“花苗新娘”，`personality` 为空、无谈吐、无底线/阶段门；这两关按封口规则只给封口行。04b、05b 关有 7 条性格，画像仍无谈吐（卡里的谈吐由注册表补位）。**所有南荒关画像都没有她的【底线】**，`人格底线` 记录里有但被刻意不发。缺口，不写新文本。
- **凝羽**：【底线】只在 stage_01/02 画像里有；03b、04、04b、05b 画像都没有。**这是阶段门对凝羽底线的阻挡，本次保持原样**；要不要给这些关补“当期适用”的底线（审计 O10）需你定。05b 画像里她的性格 5 条与其它关不同，原样带入（见下合规）。
- 凝羽、乐明珠在这些关的画像里都没有【本阶段禁用】/【关系身份门禁】，也都不在 `AFFINITY_CAPS` 里，所以卡里没有“阶段门”行——数据不存在，不是漏接。
- **承重保护**：沿用旧路径的事件关联推导；台账里没有“必须存活”数据（审计 O7 待剧情策划）。Y6 当前存档里凝羽/叶媪都不在未完成关键事件里，卡上没有保护行。
- **亲密档案**未接：`formatIntimacyProfile` 靠关键词场景门（`INTIMATE_SCENE_RE`）触发，且属审计 E1 的 m2/m3，本次不碰；RESULT.md 的 AFTER 集合也没有它。
- **合规（只标记，不改写不决定）**：①凝羽 `记忆[]` 原样带入，Y6 存档末 3 条是“【阶段身份】白湖商馆侍卫长，穹羽族人；多次交合；凝羽毒瘾发作时程宗扬照料”这类片段，含成人向与毒瘾旧事（审计 m6/Q6），且一条记忆里混着【阶段身份】标签，是数据形态问题；②05b 凝羽 `traits` 含“外冷内媚(冰火交融)”“以冷酷伪装情感与欲望”（既有，未改）；③乐明珠外貌口径 Q17 仍待确认，本次未碰；④命中 C10/C13/Q6/Q15/Q17 的处理均未做。

### 12.6 行为变化与没做的

- 外貌重复守卫（`validateStepSceneNarrative`）以前在按钮拍里因为 `appearance` 为空而不生效，现在会生效，可能多一次拒稿重写。
- 自由输入的在场名单更大了（Y6：殇侯+凝羽+叶媪，以前只有殇侯），提示变长；谁拿卡取决于在场名单顺序：先事件自带在场人物（作者顺序，无作者名单时按名字排序），再其他候选，最后才是回落名单。**没有按“玩家点名谁”选卡**——那要等语义识别（v2 S1）给出目标 id，不做关键词/人名匹配。
- 冻结文件里的 `card?.cast?.present`（`absentCast` 过滤、`known.add`）对内容包按钮拍仍是 id；只改了 `readLocalMemoryCapsule`，未改 `settledStepScene`，避免扩大影响面。

**8097 构建（2026-10-14 21:5x SGT）**：`node dev/combat-trial/build.mjs` 成功。combat-trial.js SHA256 `7b12069c9470ea87a4304f746bb17f2a8f31e6acd72dde0a31bf71c02c79ba5f`，MD5 `48d402ba0edf3ba6e456fc6451f36ca0`。127.0.0.1 / 192.168.50.51 / 192.168.50.164 三地址均返回 7b12069c。回滚包 `_newbot_tmp/1014baihu-deploy/rollback-dist-48cd1377/`。PID 65144 未重启。

## 13. 2026-10-14 模块化违规修复（构建 SHA 由用户补）

依据 `HARDCODED-SETTINGS-INVENTORY.md`（逐行状态与附录 R／F／D）与 `AXI-XIAOZI-BOTTOMLINE.md`。规则：不动冻结的 `runtime.ts`／`AIBidirectionalSystem.ts`；合规只标记；不编造 canon 文本；无关键词字典；未 commit／push／删除文件；未用模型；未跑 `dev/combat-trial/build.mjs`。

### 13.1 修了什么（16 行已修＋6 行部分，共 96 行）

- **数据迁入账本／配置／内容包，代码按 id 读**：
  - 小紫／殇侯／乐明珠南荒展示文本 → registry 相位＋ledger `identityDisplays`（1-01…1-05）；
  - 七个对主角称呼 → ledger `npcAddress`，删 `legacyNarratorPacket.ts` 里的表（1-08）；
  - 章号门 72／105／121／115 → 读 `chapterGates` 与账本面板档（2-15、2-29、2-31）；
  - 好感阶梯、声望增量、在场人物上限 → `game-numbers.qingyu.json`（3-01、3-02、3-03）；货币兑换率 → `game-numbers.currency`（3-07）；
  - 构建期／运行时两份 `CARD_TIME_GATE_EXCLUSIONS` → `card-time-gates.json`（4-01）；
  - `presence.ts` 58 行出场／离场表 → `cast-gates.json`，人物按 id（4-20）；`STAGE_REGION` → `stageRegions`（4-21）；
  - 20 条固定拍正文、5 句结局承接句 → 内容包 `texts.json`（5-05、5-06）；
  - 按 id 取谈吐的 API（6-02、6-03 的 `npcCardLayer` 部分）。
- **八人入档**（`CANON-DECISIONS.md` #215）：用户批准文本逐字写入 registry 条目（`lcq.character.nanhuang_*`；樨夫人、娄蒙的旧 `canon.character.*` 是 `idAliases`，未建重复 card）与四个 overlay 里的阶段档；性格／谈吐／底线留空。
- **双 id 体系**：调查结果见 `HARDCODED-SETTINGS-INVENTORY.md` 附录 D。结论：不是两套 id，而是“一张总表＋各关阶段档用同一 id 指回总表”；`canon.character.*` 只是没有阶段档的人的自动编号。

### 13.2 验证

- 行为等价：`_newbot_tmp/modfix-1014/` 下 `golden_resolver.mjs`（37 关＋南荒 6 种揭示状态，改前后逐字节一致，八人除外）、`fuzz_presence.mjs`（4 万例对拍）、`eq_addr.mjs`、`eq_beats.mjs`、`eq_currency.mjs`。
- `npm run canon:build` 全绿（含 37 关校验与单并发全量测试）；`npm test`：tests 1754／pass **1748**／fail **0**／skipped 6。基线 1749／0／5：差的一条是 `tests/baihuLinesRealPath.test.mjs:193` 因 bundle 比重新生成的 `catalog.json` 旧而自动跳过，外部重跑 `combat-trial/build.mjs` 后应转通过。
- `node scripts/content-packs.mjs --check`：`Content Pack 26ccf8b2aa77a311: 14 contracts, 4 playtests, 3 entries`（改前 `4bb9a77919c7b73f`，因 `texts.json` 新增 25 条）。`tsc --noEmit` 零错误。
- 构建 SHA（2026-10-15 00:10 SGT）：combat-trial.js SHA256 `d4516e483a8db024d6f9daf9c2f6a992ee2c92106bfea3667407ecbfba8a929e`，MD5 `284a90afcdf92af68777dda86e9438a1`；127.0.0.1 / 192.168.50.51 / 192.168.50.164 均返回 d4516e48。回滚包 `_newbot_tmp/1014baihu-deploy/rollback-dist-7b12069c/`。PID 65144 未重启。

### 13.3 剩余及原因（逐行原因见清单末列）

- **冻结文件（18 行，需用户批准）**：`AIBidirectionalSystem.ts` 与 `runtime.ts` 的违规，精确行号见清单附录 F。
- **待用户定（20 行）**：南荒阶段集合 7 种口径（4-03…）；账本与代码口径不一致的章门（2-21：77／78；2-26：47／48；2-30）；事件门变章门是否可接受（2-24、2-27）；三套“事件已完成”语义（5-01）；两份时间闸是否统一（4-01 的 `at`）。
- **未做（36 行）**：多为落点缺（要先建“已故／私有知情／reveals”等账本结构）、`storyContext.ts` 核心 prompt（须先读裁定簿并同提交追加条目）、或体量大（`narrativeBoundaries.ts` 的 `throw` 事实判定要 `GuardRule` 化）。
- **数据缺口**（没补，不编造）：阿夕底线、小紫底线、殇侯 role 以哪个为准、蛇傀／黑舌第79章「阁罗的生意伙伴」（南荒无第79章关卡边界，需章级身份门，待定）、阶段档专有的 12 个实体入总表的描述、八人的性格／谈吐。
- **合规（只标记，未改）**：第78章行 11630–11640、第79章行 11885–11886、第87章约行 12916；丹宸现卡外貌含露骨描写；樨夫人现卡外貌／装束含「半褪」「卧于窗下（情色场景）」。
- **一处需留意的行为差异**：称呼表由“按显示名”改为“按 id”（1-08），同一人以别名出现时现在也取到同一称呼。

### 13.4 改动文件

代码：`characterResolver.ts`、`presence.ts`、`fixedEndingNarratives.ts`、`legacyNarratorPacket.ts`、`narrativeBoundaries.ts`、`secondaryLines.ts`、`locationLoot.ts`、`affinityLadder.ts`、`reputationLedger.ts`、`npcCardLayer.ts`、`ledger/naming.ts`（均在 `src/modules/scenarioMods/`）；`src/utils/prompts/definitions/businessRules.ts`、`worldStandards.ts`；`scripts/apply-character-cards-v3-to-mod.mjs`。数据：`mod-kit/entity-ledger/overrides.json`、`card-time-gates.json`（新）、`cast-gates.json`（新）；`mod-kit/game-numbers.qingyu.json`；`mod-kit/canon-authority-overlays/lcq.stage_03b／04／04b／05b.json`；`contentPacks/packs/qingyu/texts.json`；`CANON-DECISIONS.md`（#215）；源卡 `character-cards-v3.json`（gitignored）。构建产物：`character-registry.json`、`builtins/data` 四关、`builtins/manifest.json`、`mod-kit/entity-catalog/index.json`、`contentPacks/generated/catalog.json`。文档：本节与清单。

### 13.5 角色数据结构文档与术语统一（只改文档与注释，未改逻辑）

- 新增 `docs/CHARACTER-DATA-STRUCTURE.md`：三层＝①角色总表（`character-registry.json`，一人一 id，含 `idAliases`）；②阶段档（各关 `canon.characters[]`，同一 id 的动态字段；此前称“场景卡”）；③角色卡（每回合现算给模型看，不存档，不新建任何角色卡存档）。含各层文件、读取方 file:line、卡构建流程、id／alias 规则（#210、#215）、阶段档哪些字段是总表副本、“阶段档只留 id＋动态字段”的计划与 4 项待用户决定。
- 术语统一：`characterResolver.ts`（文件头与 8 处“卡”字注释）、`npcCardLayer.ts` 文件头、`scripts/apply-character-cards-v3-to-mod.mjs` 的 2 处注释、清单附录 D、本文 §13、裁定簿 #215 里的“场景卡／占位卡”→“阶段档”。未改名的：数据文件 `card-time-gates.json`、源数据 `character-cards-v3.json`（文件名沿用历史，改名属逻辑改动）。
- 每回合角色卡**不加**结构提示行（理由与触发条件见该文 §6；未做对照试验，属设计判断）。
- 验证：`npm test` tests 1754／pass 1748／fail 0／skipped 6；`node scripts/content-packs.mjs --check` 通过（`26ccf8b2aa77a311`，与上节一致）。未改 `runtime.ts`／`AIBidirectionalSystem.ts`，未跑 `dev/combat-trial/build.mjs`，未 commit／push。

## 14. 2026-10-15 章级身份切换、总表优先、8 人入总表（裁定 #216，构建 d4516e48 → 46ea7de2）

依据用户 2026-10-15 01:02 批准的四项。规则：合规内容只标记不改写；数字进配置、实体按 id；无关键词字典；不 commit／push／删除文件；模型配置未动；未重启任何进程（PID 65144 未碰）；改过的 gitignored 文件（`character-cards-v3.json`）改前已备份到 `_newbot_tmp/chswitch-1015/backup/`（连同账本、registry、37 关内置数据、生成源 stages、overlay、被改的 ts／mjs）。

### 14.1 章级身份切换（通用机制，账本驱动）

- 账本 `mod-kit/entity-ledger/overrides.json` 新增 `chapterIdentities`（按人物 id＋`fromChapter` 的身份档）；`ledger/naming.ts` 新增 `identityFor`／`applyIdentityStep`，由已有的 `syncCharacterNaming` 每次按当前章求值，写 `description`、`profile.origin`、`【阶段身份】` 备注（档里给了 `role` 才改 `role`）。代码里没有人物名或 id（测试有断言）。
- 数据：蛇傀 `lcq.character.nanhuang_shekui`、黑舌 `lcq.character.nanhuang_heishe`，`fromChapter:79` 起「阁罗的生意伙伴」；第78章及以前是总表 04b 相位原文（蛇傀「阁罗的随从，长得像蛇」、黑舌「阁罗的随从」）。第79章在 04b 关内，按章不按关。
- `role` 同取该句（用户只给了身份句）：模块化叙事包只带 `role` 不带 `description`，不写则切换对模型不可见。代价是原 `role` 里「鬼王峒使者」「鬼王峒的人」限定语第79章起不再带；蛇傀第79章起 `description` 也不再含「长得像蛇」。要补回，改账本对应档即可。
- 覆盖 #215 里「蛇傀、黑舌第79章…暂不入数据」一句。

### 14.2 总表优先（描述与身份一律来自角色总表）

- 规则与代码：`characterResolver.ts:309-311`（见 `CHARACTER-DATA-STRUCTURE.md` §7.1）。总表该关相位的 `description` 非空 → 覆盖阶段档 `description`；`identity` 非空 → 覆盖 `profile.origin`；相位空值或没有该关相位 → 阶段档原文保留当缺口兜底，不编造。删掉了原来只对 8 个主角在 03b／04／04b 生效的名单代码。
- **阶段档旧文字没有物理删除**：6 个 tracked authority overlay（stage 01／02／03b／04／04b／05b）的 `set canon.characters` 把整张角色源快照写在 `from` 里并逐字比对，改源文件即报 drift。试过在构建脚本里剥离，已回滚（生成源已从备份还原，逐文件比对一致）；现为运行时覆盖，旧文字只作兜底。若要物理清理，需要先重生成这 6 个 overlay 的 `from`，请用户定。
- **改了多少**（37 关逐个 `resolveScenarioCharacters` 前后快照对比〔核〕）：`description` 变化 **125 个「关×人」实例、47 个人物**（lcq 41／lyl 41／lyg 43 处）；`profile.origin` 变化 86 实例、48 人；两者合计 51 人。只有 `description`／`profile.origin`（及 8 个新条目多出空 `profile.notes`）变了，其余字段逐字节不变。另有原始阶段档与总表冲突的实例 169 个，其中 44 个不计入变化〔推：此前已被 8 主角名单、时点闸或账本展示接管，未逐个核〕。
- 值得注意的变化：
  - 程宗扬（31 处，各关）「现代穿越者」→「程宗扬，来自现代的穿越者，凭商人头脑…身份随剧情在商人、盟友、客卿等位置间变化…」；
  - 凝羽 01 关：原长篇场景特写（含「淡红月牙印记」「太一经末技」）→「白湖商馆侍卫长，穹羽族人；奉苏妲己之命护卫商队。」；
  - 月霜 02 关：「岳帅遗孤之一…」→「王哲门下的骑手，女扮男装，英气逼人。」（总表相位不提后期身份）；
  - 易虎 04 关「云氏护卫」→「云氏商会护卫，与商队同行；被山洪卷走后失踪，去向未明。」；
  - 05b 关 16 人（苏荔、阿夕、武二郎、谢艺、云苍峰、阁罗、丹宸、龙神、鬼巫王…）由一句话标签变成总表的人设长文；04b 阁罗「鬼王峒使者」→「鬼巫王的仆从阁罗，…」（正文里「阁罗」名由命名章门投影，第78章前显示为「骑白象的鬼王峒使者」）；
  - 孙寿、赵合德、云丹琉、尹馥兰、成光（云龙／燕歌）：原文含「侍婢／情妇／鼎炉／侍奴」等已成事实的关系，改为总表相位的「本关开场尚未…」（时序更安全）；
  - 吕雉 11 处（燕歌）：「沦为他人掌中玩物…烙着屈辱的玺印」→「仍以吕氏与飞羽族存续为先，在朝局中与程宗扬既对立又有交易空间。」；
  - 祁远 10 关：仅一字（「账面上的银钱」→「长安的银钱」）。
- 殇侯（`liuchao.character.shang_zhen_yu`）：**待用户裁定，保持原行为**（账本 `masterPrecedence.pendingIds`）。实测此刻没有行为差异：南荒 03b／04／04b／05b／06 他被时点闸排除，展示文本另由账本 `identityDisplays` 接管；其余关阶段档与总表逐字相同。仍待定的是 R.4-3 的 role 冲突（总表 04b 相位「老向导」vs 账本「云氏雇用的老向导」）。

### 14.3 12 人入总表（核对后与指令前提有出入）

> 第二轮（01:11）已取代其中“描述留空”：12 人描述已逐字补齐，见 §14.9。

- 阿葭、叶媪、白夷族长、易勇、小津、易雄、六朝石匠、黑衣丽人 **8 人**确为只在阶段档里：以现有 id（`lcq.character.nanhuang_*`）入总表，`description`／`identitySummary` 留空，`review.flags` 含 `master-description-pending`、`followUps` 写明待剧情策划提供；性别阶段档里没有，不填；总表 322→330 条。阶段档里的短标签（如「花苗伴娘」）继续作兜底。
- 宁成、张恽、何漪莲、王蕙 **4 人总表早有完整条目**（此前靠名字回落解析），阶段档用的是另一个 id。若按指令另建条目会出现“一人两 id”，且按 id 先命中的空条目会遮住按名字解析到的完整条目。所以改记 `idAliases`（总表 id 不变）：`lyg.character.np011`→`liuchao.character.zhang_yun`，`lyl.character.he_yilian`→`liuchao.character.he_yilian`，`lyl.character.np016`→`liuchao.character.wang_hui`，`liuchao.character.ning_cheng`→`lyl.character.np043`。阶段档里这 4 个 id 没改（别名即可按 id 解析）；要不要把阶段档 id 统一改成总表 id，请用户定（会碰 overlay 和事件引用）。
- 现状：37 关 1386 条阶段档的 238 个 id **全部**能对到总表（测试断言）。
- 副作用待留意：(a) 账本人名棘轮把新总表名字算进字面量预算，6 个文件按**实测增量**调高基线（characterQuests 165→166、eventNarrativeView 26→27、fixedQuestObjectives 41→45、playerActionPresentation 12→17、secondaryLines 742→748、travel/defs/qingyuNanhuang 6→10，共 +21，均为早已存在的字面量，代码未改）；(b) 总表有了「白夷族长」「六朝石匠」「黑衣丽人」（≥3 字）后，`stripNarrativeUnintroducedCharacters` 会把「未在当前事件 cast 里出场」时提到这些名字的句子判为“未登场正典人物”删掉，与其他总表人物同一规则；(c) 8 个新条目的 RAG 向量文本只有名字，检索质量等剧情策划补描述。

### 14.4 冻结文件（唯一获批改动）

- `src/utils/AIBidirectionalSystem.ts:830`：`entityAliases("character","canon.character.15b71fd1c8")` → `entityAliases("character","lcq.character.nanhuang_xi_furen")`（樨夫人旧 id → 主 id；`entityAliases`／`entityNamePattern` 两个 id 结果相同，已核）。
- `src/modules/scenarioMods/runtime.ts`：**0 行**。逐个核过两文件里所有 `*.character.*`／`*.enemy.*` 字面量：旧／别名人物 id 仅此一处；其余人物 id 已是主 id（其中 `lcq.character.nanhuang_yiyong`、`nanhuang_ajia` 现已入总表）；`AIBidirectionalSystem.ts:829` 的 `lcq.enemy.ge_luo` 是敌人表 id、不是人物别名，不在批准范围，仍待“是否合并 enemy 与人物 id”的决定。

### 14.5 章号管线（不改章号）

> 第二轮（01:11）已取代：章号已按原著核实并切换为 78／47，`effectiveChapterGates` 已删除，见 §14.9。

- 阁罗改名章（账本78／代码77，`legacyNarratorPacket.ts:218`）、乐明珠揭示章（账本48／代码47，`characterResolver.ts:605`）：两处代码改读账本 `effectiveChapterGates.<名>.effective`，**现行有效值仍是 77／47**，行为不变；账本已核值记在同条 `ledgerValue`（78／48）。`src` 里没有别的 47／48／77／78 章门（`eventNarrativeView.ts:152` 的「第48章」是界面标签）。
- 切换方法：把 `overrides.json` 的 `effectiveChapterGates.geluoEnvoyAliasFrom.effective` 改成 78、`lemingzhuRevealFrom.effective` 改成 48（或核实后的新章号），再更新 `tests/chapterIdentitySwitch.test.mjs` 里“现行有效值仍为 77／47”那条断言。不改代码。已临时改成 78／48 试过：两条行为测试照常通过，只有钉值断言按预期失败；随后已还原。

### 14.6 验证（按指令顺序）

1. `node scripts/content-packs.mjs --check`：`Content Pack 26ccf8b2aa77a311: 14 contracts, 4 playtests, 3 entries`〔核〕。
2. `npm run canon:build` 全绿（含 37 关校验、单并发全量测试）：tests 1767／pass 1761／fail 0／skipped 6〔核〕。
3. `npx tsc --noEmit`：exit 0〔核〕。
4. 备份 `dev/combat-trial/dist` → `_newbot_tmp/1014baihu-deploy/rollback-dist-d4516e48/`（combat-trial.js SHA 与 d4516e48 一致）；`node dev/combat-trial/build.mjs` 成功。
5. 重建**之后**跑 `npm test`：tests 1767／pass **1762**／fail **0**／skipped 5〔核〕。基线 1749／0／5：+13 条新测试（`tests/chapterIdentitySwitch.test.mjs` 7、`tests/masterTablePrecedence.test.mjs` 6）；上一轮的那条“bundle 比 catalog 旧”自动跳过现已转为通过，跳过数回到 5。
6. 新构建 combat-trial.js SHA256 `46ea7de232798dc6d77add7c97535327b3dd687b28ca41e89e5044b0c03c74dd`（MD5 `2e599e5058da569a69ea4b8385c29bcd`，2026-10-15 01:22 SGT）：http://127.0.0.1:8097、http://192.168.50.51:8097、http://192.168.50.164:8097 用 node fetch＋crypto 取回哈希，三处均与 dist 文件一致〔核〕。回滚包 `_newbot_tmp/1014baihu-deploy/rollback-dist-d4516e48/`。
7. 测试有效性：对 resolver 临时注释掉描述覆盖行，总表优先两条测试按预期失败，还原后通过〔核〕。

### 14.7 缺口与合规标记

- 缺口（没补，不编造）：8 个新条目的 `description`／`identity`；总表相位 `description` 为空的 297 个「关×人」实例（保留阶段档原文）；没有本关相位的 252 个实例（含 8 个新条目）；蛇傀／黑舌第79章后的 `role` 限定语；殇侯 role 冲突；阿夕、小紫底线（R.4-1、R.4-2）。
- 合规（只标记，未改写）：总表优先让下列总表原文进入了更多关，均未动。**年龄硬线相关**：阿夕 05b「花苗少女…娇小的身躯含苞待放，注定要成为献给鬼巫王的祭品」；乐明珠 04b「圆润童颜…天真活泼」。其余成人内容按 10-04 裁定不处理：丹宸 05b「雪白丰腴…如一件精美的玩物」、小紫燕歌「肤白如乳…」、李辅国燕歌、成光燕歌「鼎炉与侍奴」、潘金莲燕歌「受虐的顺从」、周飞燕歌「程宗扬奴仆」、黎锦香燕歌「身陷奴婢之位」、吕雉燕歌「雪白丰腴…」、杨玉环燕歌「丰腴美艳」、苏荔 05b「妩媚」。也有变好的：云龙关孙寿、赵合德、云丹琉、尹馥兰改为「尚未…」。何漪莲阶段档兜底文本含「她甘为程宗扬奴婢」，未动。

### 14.8 改动文件

- 数据：`mod-kit/entity-ledger/overrides.json`（`chapterIdentities`、`effectiveChapterGates`、`masterPrecedence`）、`mod-kit/entity-ledger/ratchet-baseline.json`（6 个文件基线，见 14.3）；源卡 `character-cards-v3.json`（gitignored；+8 卡、+4 个 `idAliases`；改前备份）；`CANON-DECISIONS.md` #216；构建产物 `character-registry.json`（330 条）。内置 37 关数据与 overlay **未改**（逐文件比对一致）。
- 代码：`ledger/naming.ts`、`characterResolver.ts`、`legacyNarratorPacket.ts`；冻结文件仅 `AIBidirectionalSystem.ts:830`。
- 测试：`tests/chapterIdentitySwitch.test.mjs`、`tests/masterTablePrecedence.test.mjs`。
- 文档：本节、`docs/CHARACTER-DATA-STRUCTURE.md`（§3／§4／§5 改写，新增 §7）。
- 探针与快照（未删）：`_newbot_tmp/chswitch-1015/`（`golden.*.json` 前后快照、`rows.final.json` 逐条差异、`gdiff.mjs`、`analyze*.mjs`）。

### 14.9 第二轮（用户 2026-10-15 01:11 批准，裁定 #217；构建 46ea7de2 → ebff75e7）

**章号（已核实，已切换）**
- 阁罗改名＝第78章（账本正确）。代码原用的 77 来自事件 `lcq.event.regroup_caravan_envoy`（使者到来场面），不是改名。乐明珠揭示＝第47章末（她自报姓名与门派）。**警告：仓库锚点 `#index` ＝ 章号＋2（前言条目计入），不得把 `#index` 当章号。**
- 账本：`namingMilestones[lcq.event.s04_03]` 48→47；`effectiveChapterGates` 整块删除（不再有第二份“有效章号”）。
- 代码改读账本：`ledger/naming.ts` 新增 `ledgerChapterGates`（改名章＝np006 面板称呼首个 `kind:"name"` 档的 `fromChapter`＝78；揭示章＝`namingMilestones['lcq.event.s04_03']`＝47），`legacyNarratorPacket.ts:218`、`characterResolver.ts:605` 读它。注释里不写人名（账本人名棘轮按字面量计数，未调基线）。
- 其它 48→47：`eventNarrativeView.ts:152`（原指令写 :143，行号已漂移）章标题「第48章·新娘身份」→「第47章·新娘身份」；stage_04 的 s04_03 `axisAnchor`「六朝清羽记·#50·第48章·窥情」→「六朝清羽记·#49·第47章·神女」（该锚点在 story-timeline 里已存在，改的是 overlay stage_04 的 `to`，`from` 与生成源未动，内置数据由 `canon:build` 重生成）。
- **指令之外必须同步的一处**：乐明珠羁绊线入口 `lines-lemingzhu.json` 的 `entry.canonChapterAtLeast` 48→47。否则揭示事件记第47章后，关内章号到不了48，`beat.lmz.l2.share` 不再出现（`tests/baihuLinesDemo.test.mjs` 3 条按预期红，改后转绿）。
- **未改（有意）**：避风港一拍 `beat.lmz.l2.share`、`pan_secret` 插入事件的 `canonChapter:48`／`axisAnchor:"第48章"`／描述里的「第48章，南荒山涧…分烤鹅掌菌」——这是第48章开头的场面，发生在揭示之后，不是揭示本身。如认为它也该是47，请另示。

**12 人总表描述（逐字，不含章号）**
- 写入源卡 `character-cards-v3.json`（gitignored，改前备份 `_newbot_tmp/chswitch-1015/backup-r2/`）的 `staticProfile.identitySummary`，重建 registry（仍 330 条，只有这 12 条变）。
- 前 8 人原为空：另按其出场的关各补一条只含 `description` 的 `stage-projection` 相位（阿葭 03b；叶媪 04／05b；白夷族长 04／04b；易勇 04／04b；小津 04b；易雄 04b；六朝石匠 04b／05b；黑衣丽人 05b，共 12 条），因为总表优先只读相位；身份／role／notes 留空（用户只给了描述）。`master-description-pending` 标记已去掉。
- **宁成、张恽、何漪莲、王蕙原有概括被替换**（旧值：帝党干将、知名酷吏、曾任大司农／内侍/中黄门／洛帮帮主／秦桧之妻），因为用户这轮给的是这 12 人的总表描述。要恢复，改回源卡后重建。

**关／事件键身份切换（数据，无人物专属代码）**
- 走总表 `stage-projection` 相位——与蛇傀／黑舌同样是“按 id 读数据”，只是切换键是关而不是章。三个关 id 全部存在，无缺口（`lyl.luoyang_coup`、`lyg.dingtao_beijing`、`lyl.taiquan_core_conflict`；`lyg.mijing_rumen` 也在）。
- 宁成：汉国官员（静态，无相位的关）→ 舞都太守（`lyl.luoyang_coup` 起）→ 逃犯（`lyg.dingtao_beijing` 起：相位 `identity` 原为「舞都太守」改「逃犯」，`role` 本就是「逃犯」）。
- 张恽：汉宫中黄门（静态）→ 程侯府内侍（`lyl.luoyang_coup` 起）。coup／dingtao_beijing／mijing_rumen 三关相位 `identity` 均为「程侯府内侍」（原 coup 为「奴仆/内侍」），coup 关 `role` 由「内侍」改「程侯府内侍」。切换点只用 coup，没用 dingtao_beijing／mijing_rumen。
- 何漪莲：`lyl.taiquan_core_conflict` 起（及其后 afterfall／cloud_secret／coup／han_palace_endgame）相位本就是「洛帮帮主」，未改。**留意**：更早三关（lin_an_bridge、xiaoyingzhou_blacksea_trap、taiquan_sacred_fruit）总表相位也写着洛帮帮主，我按“can be”的字面没有隐去；若要在 core_conflict 之前隐去，请另示。

**改动量（37 关前后快照，本轮增量）**：`description` 变 12 个「关×人」实例／8 人；`profile.origin` 变 4 实例（张恽 3、宁成 1）；另 `role` 1 处（张恽 coup）、`profile.notes` 4 处（【阶段身份】随 origin）。例：阿葭「花苗伴娘」→「花苗族的少女，龙神新娘的伴娘」；易勇「云氏护卫」→「云氏商会的护卫」；黑衣丽人「黑魔海来客」→「黑魔海来的女子」；宁成 dingtao_beijing origin「舞都太守」→「逃犯」；张恽 origin「奴仆/内侍」→「程侯府内侍」。累计（两轮，对第一轮之前的快照 `golden.before.json`）：`description` 变 **137 个「关×人」实例／55 人**（第一轮 125／47，本轮 +12／+8 个新人），`profile.origin` 变 90 实例／51 人，两者合计 62 人；逐条差异在 `_newbot_tmp/chswitch-1015/rows.cum.json`（累计）与 `rows.r2.json`（本轮）。

**冻结文件**：本轮 0 行。累计仅 `AIBidirectionalSystem.ts:830`（樨夫人旧 id→`lcq.character.nanhuang_xi_furen`）；`runtime.ts` 0 行（与第一轮备份逐行 diff 核过）。

**测试**：新增 `tests/masterTableIdentityChain.test.mjs`（5 条：12 人描述逐字；8 人每个出场关都有相位且主表胜出；宁成三步；张恽；何漪莲）；`tests/chapterIdentitySwitch.test.mjs` 重写 3 条章号测试（账本直读 78／47；乐明珠第46章隐藏／第47章揭示＋锚点与章标题；阁罗第77章「鬼王峒使者」／第78章别名放开）；`tests/masterTablePrecedence.test.mjs` 更新 8 人那条（描述已填，不再 pending）。

**验证（按序，均在最后一次改动之后）**
1. `node scripts/content-packs.mjs --check`：`Content Pack 639c972d651f953b: 14 contracts, 4 playtests, 3 entries`〔核〕。
2. `npm run canon:build`：全绿（37 关校验＋单元测试 1772／pass 1766／fail 0／skipped 6）〔核〕。
3. `npx tsc --noEmit`：exit 0〔核〕（中途一次红：新相位缺 `identity` 字段使 registry JSON 类型推断变成联合类型，补 `identity:""`／`role:""`／`notes:[]` 后转绿）。
4. 回滚备份：d4516e48 的已在；另备当时线上 46ea7de2 → `_newbot_tmp/1014baihu-deploy/rollback-dist-46ea7de2/`。`node dev/combat-trial/build.mjs` 成功。
5. 重建**之后** `npm test`：tests 1772／pass **1767**／fail **0**／skipped 5〔核〕（上一轮 1767／1762／5，+5 条新测试）。
6. 新 SHA256 `ebff75e7bb9b783b10dd8f8d6ac30989ad198d8e16746158b1f3af50bc728e49`：http://127.0.0.1:8097、http://192.168.50.51:8097、http://192.168.50.164:8097 三处 node fetch＋crypto 取回的哈希都与 dist 文件一致〔核〕。bundle 内含新数据（「洛都江湖帮会的首领」「第47章·新娘身份」在，`effectiveChapterGates` 已无）〔核〕。

**合规标记（只标记，未改写、未读改内容）**：第78章 `lcq:11594-11598`；第86章 `c/86:10-13`；`ygx:1168`。

**缺口**：①何漪莲 core_conflict 之前三关是否隐去洛帮帮主（见上）；②避风港一拍的 `canonChapter:48` 是否也要动（见上）；③8 人仍无 `identity`／外貌／性格，阶段档里 `profile.origin` 仍是旧短标签（如「花苗伴娘」）与新 `description` 并存；④殇侯仍待裁定，role 冲突未变；⑤阶段档旧文字仍未物理删除（overlay `from` 逐字比对，同第一轮）。

## 15. 2026-10-15 第三轮：概括还原、id 统一、何漪莲前三关隐去身份、殇侯裁定、蛇傀／黑舌补回限定语（裁定 #218；构建 ebff75e7 → dca8d9ea）

承接 §14.9。用户 2026-10-15 第三轮六项裁定，全部落地；没有 commit／push／删除文件，没动模型配置、进程和受保护端口。备份在 `_newbot_tmp/chswitch-1015/backup-r3/`（源卡、4 个生成关卡文件、账本、registry、测试、文档、gates 等），前后快照 `golden.r3.before.json`／`golden.r3.after.json`／`rows.r3.json`。

### 15.1 总表概括还原（撤回 #217 ② 对 4 人的改写）
改前原值取自备份源卡 `backup-r2/character-cards-v3.json`，不是新写的；仅原本为空的 8 人保留 #217 的逐字一句。

| 人物 | 第二轮（撤回） | 现在（还原） |
|---|---|---|
| 宁成 | 汉国的官员 | 帝党干将、知名酷吏、曾任大司农 |
| 张恽 | 汉宫的中黄门（宦官） | 内侍/中黄门 |
| 何漪莲 | 洛都江湖帮会的首领 | 洛帮帮主 |
| 王蕙 | 秦桧的妻子 | 秦桧之妻 |

解析结果无变化（这 4 人在其出场的每一关都有相位，静态概括只在无相位的关回落；快照对比 0 行）。第二轮写的相位 identity／role（宁成 舞都太守→逃犯；张恽 程侯府内侍）不动。裁定簿 #217 已改：四句标为已撤回，#218 记现行值。

### 15.2 阶段档 id 统一为总表 id（一人一 id）
| 人物 | 旧 id（留作总表 `idAliases`） | 阶段档现用（总表 id） | 涉及关 |
|---|---|---|---|
| 张恽 | `lyg.character.np011` | `liuchao.character.zhang_yun` | lyg.dingtao_beijing、lyg.mijing_rumen |
| 宁成 | `liuchao.character.ning_cheng` | `lyl.character.np043` | lyg.dingtao_beijing |
| 何漪莲 | `lyl.character.he_yilian` | `liuchao.character.he_yilian` | lyl.luoyang_coup、lyl.taiquan_core_conflict |
| 王蕙 | `lyl.character.np016` | `liuchao.character.wang_hui` | lyl.luoyang_coup |

- 其余各关本来就用总表 id。同步改的引用：`world-sim-refinements/qingyu-yunlong.json`（3 处）、`mod-kit/test-pack/03-燕歌-定陶开局.json`（3 处）、`tests/r2_11n_luoyang_coup_character_projection.test.mjs`、`scripts/fix-luoyang-coup-character-projection.mjs`；内置数据由 `canon:build` 从生成关卡文件同步。快照对比：6 个「关×人」实例的 `id` 变了，别无字段变化。
- **冻结文件里的旧 id 引用：无**（`runtime.ts`、`AIBidirectionalSystem.ts` 均 0 处，也不含这 4 个人名）；无需留任何旧 id。别名继续解析，旧存档按旧 id 仍命中（测试断言）。
- **有意没动**：`character-canon/` 下的生成期派生映射（`yunlong.character-id-map.json`、`yange.character-id-map.json`、`character-alias-registry.json`、`canon-rail/audit.json`、`time-node-violations.json`、各 `backups/`、`stages-pre-*` 备份目录）仍记旧 id；它们不在 `canon:build` 管线内，是历史产物。历史文档（HARDCODED-SETTINGS-INVENTORY、裁定簿旧条目）里的旧 id 也保留作记录。

### 15.3 何漪莲前三关隐去「洛帮帮主」
- 关：`lyl.lin_an_bridge`、`lyl.xiaoyingzhou_blacksea_trap`、`lyl.taiquan_sacred_fruit`（总表原著序号 seqHi 均小于 `lyl.taiquan_core_conflict` 的 seqLo）。
- 机制：通用相位开关 `identityWithheld: true`（`characterResolver.ts`，约 10 行，无人物专属代码）。解析器遇到它：`role`／`description`／`profile.origin` 取相位值，不回落总表静态概括和阶段档文字，也不加「关系身份门禁」备注。
- 数据：这三关的相位 identity／role／description 清空，notes／relationToProtagonist 清空。**没有找到任何现成的非剧透身份文字，所以留空为缺口，没有编造。**
- 前后（解析后的阶段档，三关相同）：role「洛帮帮主」→（空）；description「一帮之主，天生一张明星般的艳光面容，风尘媚态里藏着凌厉手段，与尹馥兰针锋相对。」→（空）；origin「洛帮帮主」→（空）；备注里的【关系】【阶段身份】【关系身份门禁】洛帮帮主句去掉。核对：三关解析结果除 `affiliations` 外无「洛帮／帮主／一帮之主／首领」字样。`lyl.taiquan_core_conflict` 及之后照常披露，没动。
- **缺口**：这三关阶段档的 `affiliations`（洛帮 角色「帮主」；程宗扬势力 角色「侍奴/从侍奴」）仍在——它是阶段变化字段，由归属投影写入，不属于本次身份开关，需要另行决定。

### 15.4 殇侯裁定与一个必要的偏差
- 总表南荒五关（03b／04／04b／05b／06）相位 role「老向导」→「云氏雇用的老向导」（identity 本就是「云氏雇用的老向导，自称朱八八。」，与账本 `identityDisplays.hidden.role` 一致）；从 `masterPrecedence.pendingIds` 移除（现为空）。前后快照殇侯 0 行变化。
- **偏差（请知悉）**：role 改后，构建期卡投影会把新 role 写进这几关的生成关卡文件，而 4 个 authority overlay（lcq.stage_03b／04／04b／05b）的 `from` 逐字记着旧值「老向导」，同步报 `source drift at canon.characters`（实测，仅殇侯／朱八八 role 一处）。你要求不重生成 overlay，所以我没碰 overlay，而是在 `card-time-gates.json` 把这 4 关的 `at` 由 `["runtime"]` 改为 `["build","runtime"]`（与 `lcq.stage_06` 同），并把生成关卡文件里被误写的 role 还原为 overlay `from` 的值。副作用：这 4 关构建期也不再向被排除人物投影——殇侯，03b／04 另含乐明珠；当前输出无变化（内置数据与 overlay `to` 决定最终文字）。替代方案：只改 4 个 overlay `from` 里的 role 一处（文件小改，但属于动 overlay，所以没做）。

### 15.5 蛇傀／黑舌第79章起补回限定语（仅账本数据）
措辞取自第一轮前的旧 role／描述原文，只把「随从」换成「生意伙伴」：

| | 第79章前（不变） | 第一轮后的第79章起 | 现在第79章起 |
|---|---|---|---|
| 蛇傀 description／origin／【阶段身份】 | 阁罗的随从，长得像蛇 | 阁罗的生意伙伴 | 阁罗的生意伙伴，长得像蛇 |
| 蛇傀 role | 鬼王峒使者阁罗的随从 | 阁罗的生意伙伴 | 鬼王峒使者阁罗的生意伙伴 |
| 黑舌 description／origin | 阁罗的随从 | 阁罗的生意伙伴 | 阁罗的生意伙伴 |
| 黑舌 role | 阁罗的随从，鬼王峒的人 | 阁罗的生意伙伴 | 阁罗的生意伙伴，鬼王峒的人 |

蛇傀旧 role 原文就没有分隔符（「鬼王峒使者阁罗的随从」），按原措辞保留。你举的「阁罗的生意伙伴，长得像蛇」原本在旧描述里而不是旧 role 里，所以放进了 identity（description／origin），role 保留旧 role 的限定语。

### 15.6 冻结文件
本轮 0 行。累计只有 `AIBidirectionalSystem.ts:830`（樨夫人旧 id `canon.character.15b71fd1c8` → `lcq.character.nanhuang_xi_furen`）；`runtime.ts` 累计 0 行（与第一轮备份逐行 diff 核过）。

### 15.7 测试
- `tests/masterTableIdentityChain.test.mjs`：12 人描述改为「8 人逐字＋4 人还原原值」；宁成／张恽静态步改读还原值；何漪莲静态改「洛帮帮主」；**新增**「前三关不披露」一条（总表标记集合＝这三关；披露文本取自核心冲突相位本身；阶段档带旧文字也被清空；核心冲突照常披露；解析器无人物专属代码）。
- `tests/masterTablePrecedence.test.mjs`：殇侯那条改为「已裁定、不再 pending、总表优先、南荒五关 role 与账本一致」；别名那条改为「阶段档不再出现旧 id、同名同 id、旧 id 仍可解析」；其余排除 `identityWithheld` 相位。
- `tests/chapterIdentitySwitch.test.mjs`：第78章前后的 description／role 逐字断言（含限定语）；第79章起蛇傀／黑舌各自取值。
- `tests/affinityLadder.test.mjs`：id 统一后何漪莲、王蕙才与总表 id 对上、被识别为「有出场的主要女性」，而她们确实没有姿态档案（此前被漏算）；按 id 登记为已知缺口并断言补档后必须删名单。**姿态档案待剧情策划提供，未编造。**
- 其余 `tests/r2_11n_*` 改了一个 id。

### 15.8 验证（按指令顺序，均在最后一次改动之后）
1. `node scripts/content-packs.mjs --check`：`Content Pack 639c972d651f953b: 14 contracts, 4 playtests, 3 entries`〔核〕。
2. `npm run canon:build`：全绿（37 关校验＋单元测试 tests 1773／pass 1767／fail 0／skipped 6）〔核〕。中途红过两次：①overlay drift（见 15.4）；②`affinityLadder` 覆盖测试（见 15.7），均已处理。
3. `npx tsc --noEmit`：exit 0〔核〕。
4. 回滚备份：当时线上 ebff75e7 → `_newbot_tmp/1014baihu-deploy/rollback-dist-ebff75e7/`（备份后 `combat-trial.js` SHA 与 ebff75e7 一致〔核〕）。`node dev/combat-trial/build.mjs` 成功。
5. 重建**之后** `npm test`：tests 1773／pass **1768**／fail **0**／skipped 5〔核〕（上一轮 1772／1767／5；+1 是新增的「前三关不披露」测试）。
6. 新 SHA256 `dca8d9ea3ff280ef1731cecdefd7e87e7c3663889cf807b2ecfb0a6878d16f1a`：http://127.0.0.1:8097、http://192.168.50.51:8097、http://192.168.50.164:8097 三处 node fetch＋crypto 取回的哈希都与 dist 文件一致〔核〕。bundle 里含 `identityWithheld`、三条蛇傀／黑舌新文字、还原后的概括；已无「汉国的官员」「洛都江湖帮会的首领」「汉宫的中黄门」〔核〕。

### 15.9 行为变化量（37 关＋南荒变体前后快照，本轮）
`description` 变 4 个「关×人」实例（蛇傀第79章后 1、何漪莲 3）；`profile.origin` 4；`role` 5（蛇傀 1、黑舌 1、何漪莲 3）；`profile.notes` 4；`id` 6。其余字段、其余人物 0 变化（殇侯、宁成、张恽、王蕙的解析结果除 id 外 0 行）。

### 15.10 缺口与合规标记
- **缺口**：①何漪莲前三关的身份文字（无现成非剧透文本，留空）与这三关阶段档 `affiliations`（见 15.3）；②何漪莲、王蕙缺姿态档案（见 15.7）；③8 人仍无 `identity`／外貌／性格，阶段档里 `profile.origin` 仍是旧短标签；④阶段档旧文字仍未物理删除（overlay `from` 逐字比对，同第一轮；本轮也没重生成 overlay）；⑤避风港一拍的「第48章」按指示保持原样。
- **合规（只标记，未改写）**：第78章 `lcq:11594-11598`、第86章 `c/86:10-13`、`ygx:1168`（沿用 §14.9）。何漪莲阶段档兜底描述里「她甘为程宗扬奴婢」（`lyl.luoyang_coup`／`lyl.taiquan_core_conflict` 的总表相位原文）仍是总表原文，未动。


## 16. 2026-10-15 第四轮：撤回 card-time-gates 改动、改 overlay 殇侯 role、何漪莲前三关同时隐去势力归属（裁定 #219；构建 dca8d9ea → c471ced9）

承接 §15。用户 2026-10-15 第四轮两项裁定，全部落地；没有 commit／push／删除文件，没重启任何进程，没动受保护端口，模型配置未动。备份在 `_newbot_tmp/chswitch-1015/backup-r4/`（含 gitignored 的生成关卡文件与 `character-canon/`、`card-time-gates.json`、账本、4 个 overlay、registry 相关测试与文档）。

### 16.1 殇侯：撤回 card-time-gates 改动，改 4 个 overlay 的 `from` 一处
- `mod-kit/entity-ledger/card-time-gates.json`：第三轮的改动整体撤回，`lcq.stage_03b_snake_flower_bridge`／`lcq.stage_04`／`lcq.stage_04b_lingfei_baiyi_crisis`／`lcq.stage_05b` 四关的 `at` 恢复为 `["runtime"]`（与 `backup-r3/` 里第三轮前的文件逐字一致，含各关原有 note），构建期对殇侯（03b／04 另含乐明珠）的投影回来。
- 4 个 `canon-authority-overlays` 的 `from` 里**只**改殇侯（`liuchao.character.shang_zhen_yu`）的 role 一行，「老向导」→「云氏雇用的老向导」；用 `diff` 对 `backup-r4/` 核过，每个文件恰好 1 行差异，overlay 未重生成：

| 文件 | 行 | 改前 | 改后 |
|---|---|---|---|
| `lcq.stage_03b_snake_flower_bridge.json` | 3245 | `"role": "老向导",` | `"role": "云氏雇用的老向导",` |
| `lcq.stage_04.json` | 1355 | 同上（`from` 中名为「朱八八」的那条） | 同上 |
| `lcq.stage_04b_lingfei_baiyi_crisis.json` | 3292 | 同上 | 同上 |
| `lcq.stage_05b.json` | 2366 | 同上 | 同上 |

- 结果〔核〕：`canon:build` 无 drift（日志里「drift」只出现在测试名中）；生成关卡文件与内置数据里这 4 关殇侯 role 均为「云氏雇用的老向导」；乐明珠 role 与第三轮前一致（03b 女主角／04 医者／04b 女主角／05b 女主角）。

### 16.2 何漪莲前三关同时隐去势力归属
- 关：`lyl.lin_an_bridge`、`lyl.xiaoyingzhou_blacksea_trap`、`lyl.taiquan_sacred_fruit`。
- 机制：沿用 `identityWithheld`（通用相位数据开关），`characterResolver.ts` 的 `resolveOne` 在该分支里多一行 `delete character.affiliations; delete character.factionId;`（与南荒小紫／殇侯／乐明珠已有写法一致）；接口注释同步。没有新字段、没有人物专属代码；数据不用改（这三关早已带 `identityWithheld: true`）。
- 前后（解析后）：`affiliations`［洛帮 帮主；程宗扬势力 侍奴/从侍奴］→ 无；`factionId` → 无。`lyl.taiquan_core_conflict` 及之后照常保留。
- 说明：用户示例里提到「withheld-field 列表」，这里没有另建列表——该开关的现有语义本就是「不披露身份／职务」，势力归属并入同一开关即满足通用、数据驱动；这三关是目前唯一使用它的相位。若以后需要「只藏某几项」，再引入字段列表。

### 16.3 测试
- `tests/masterTableIdentityChain.test.mjs`「identity withheld 何漪莲」一条扩充：三关各自带上阶段档的两条 `affiliations` 与 `factionId` 跑解析，断言都被清掉；核心冲突关带 `affiliations` 解析则原样保留。（未新增用例条数，所以总数不变。）
- 殇侯 role 一致性由 `canon:build` 的 overlay 同步校验与既有 `masterTablePrecedence` 断言覆盖，未另加测试。

### 16.4 验证（按指令顺序，均在最后一次改动之后）
1. `node scripts/content-packs.mjs --check`：`Content Pack 639c972d651f953b: 14 contracts, 4 playtests, 3 entries`〔核〕。
2. `npm run canon:build`：全绿；tests 1773／pass 1767／fail 0／skipped 6〔核〕。
3. `npx tsc --noEmit`：exit 0〔核〕。
4. 回滚备份：`dev/combat-trial/dist` → `_newbot_tmp/1014baihu-deploy/rollback-dist-dca8d9ea/`（备份后 `combat-trial.js` SHA 与 dca8d9ea 一致〔核〕）；`node dev/combat-trial/build.mjs` 成功。
5. 重建**之后** `npm test`：tests 1773／pass **1768**／fail **0**／skipped 5〔核〕（与第三轮相同）。
6. 新 SHA256 `c471ced9fa31cfc3f6c560f5ab5bfbbfc73ef04c8935cb87745202daf3d06665`：http://127.0.0.1:8097、http://192.168.50.51:8097、http://192.168.50.164:8097 三处取回的哈希与 dist 文件一致〔核〕（23378330 字节）。

### 16.5 行为变化量（37 关＋南荒变体前后快照 `golden.r3.after.json` → `golden.r4.json`，`gdiff.mjs`）
仅 3 行：`lyl.lin_an_bridge`、`lyl.xiaoyingzhou_blacksea_trap`、`lyl.taiquan_sacred_fruit` 各 1 个何漪莲的 `affiliations`。殇侯及其余字段、其余人物 0 变化。

### 16.6 缺口与合规标记
- **缺口**：①何漪莲前三关身份文字仍为空（无现成非剧透文本）；②何漪莲、王蕙缺姿态档案（`affinityLadder` 已知缺口名单）；③8 人仍无 `identity`／外貌／性格；④阶段档旧文字仍未物理删除；⑤避风港「第48章」按指示保持原样；⑥这三关阶段档/生成关卡文件本身仍带 `affiliations`（隐去发生在新档物化的解析器里，与 role／description 同一路径），未改生成文件。
- **冻结文件**：本轮 0 行。
- **合规（只标记，未改写）**：沿用 §14.9／§15.10，本轮无新增。
