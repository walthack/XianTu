# 第六批交付：剧情公开信息与旧档兼容

状态：READY_FOR_RETEST，未提交／未推送。保留第五批、移动系统与模块策划战斗原型全部未提交改动。备份：`/Users/clawbot/Desktop/xiantu-batch6-backup-20261004-073256/pre-change.tgz`，附 pre-existing.patch。

## A／B 已实施

- 四份 overlay 为权威，重新物化对应 builtin；新增 opening、manifest 简介、章节摘要与04章节标题／背景的原文现场文本。不跑生成器，不修改基底事件。整数组 set 的修改均并入 to；overlay 双次套用和重建校验已过。
- 02：武二郎工钱、凝羽两步、黑石滩两步、蛇彝村两步改源 actionText；已结算成功反馈改为玩家正文。约束移至 stepGuardTerms／内部 notes，不再在玩家行动中预报秘密或写系统备注。武二郎源文本保留两枚银铢／每月先付一半／返回补齐；删除旧显示缩写，正文不预设他离开又回来。
- 03b：夜林异动改名／目标／行动；阴蛛沿用第五批袭击→焚尸→向导三步，没有重复新增事件。补出刀削前肢与后肢刀痕；焚化阿葭、阴蛛、蛇彝遇害者并收骨。burn 标签是用户指定的“焚化阿葭的遗体和阴蛛”。送亲公开事实按三名女子与熊耳铺交使者，不编财物或牲畜贡物。
- 03b／04／04b：程宗扬、谢艺、云苍峰、凝羽、武二郎、祁远、苏荔、阿夕按14稿§6–8更正当前身份、外貌、谈吐、性格、描述和内部约束，保留既有属性、年龄、阵营、技能／物品目录等未授权字段。04b的青布方巾与凝羽休养状态单独按关处理。
- 源卡权威是 `character-cards-v3.json`，不是稿件误写的 `qingyu.character-cards-v3.json`。修正凝羽的错误冰蛊归属、公开身体／性格／语音；苏荔、阿夕公开性格／外貌／语音；小紫 race 改为“碧鲮族”。已批准阶段卡同步源phase，缺04时点的阿夕等补最小阶段投影，防止回退全书关系。registry 仅由 `scripts/build-character-registry.mjs` 生成。原其他全书关系资料保留；未新增情欲设定或成人内容。
- 谢艺的 canon realm **仍为化神**；65章杀使（`s04b_lingfei_baiyi_crisis_13` 完成）前，公开NPC面板为未知、叙事身份包不提供真境界／星月湖身份。完成后恢复公开境界。本段角色卡无折扇、无墨镜，不伪发放72章物品；72章动态戴镜需要相应节点后续实现，当前不靠开场卡预穿戴。
- 内部 notes 不再复制进玩家可见人物“记忆”；旧档同前缀内容也剔除。人物公开描述对齐已批准的阶段卡，不覆盖好感、已玩正文记忆、装备或实际命运。
- 第59章前的苏荔／花苗红苗刺王密谋：不只改04背景，也清理了 `s04_01`、花苗势力说明和后续 previousBeat 里的提前披露。s04_01原ID／axis／rail／完成flag保留，改为询问送亲路上的疑点。裁定#185窄修旧#172的第49章提前透露口径；乐明珠第48章个人目的仍保留。

## 兼容与连带修复

`runtime.ts:980/3206`：精确 from→to 哈希名单迁移七个发生公开文案变化的合同。保留 preparations、attemptCount、attempts、readyAtTurn与完成状态；不重记货币／物品／行旅。新旧合同之外的规则修改拒绝迁移，旧异步回执仍要匹配新合同。另对送亲固定事实在机械哈希完全相同条件下更新材料。未知或私改旧合同仍按原失效保护，不承诺任意旧版本通吃。

`runtime.ts:1593`：批准的开场文本直接显示，不再被背景首句盖掉。已有旧档的阅读历史不重写；新切关获取新开场。

`travel/travelLedger.ts:289`：身份纠正后“侍卫长”不再命中原`role === 商队成员`的兜底，导致五原出发漏凝羽。改为也认已有“商队成员／商队护卫”归属；继续排除死亡／离场／失踪，仍取当前队伍，不硬加名字，不改路线或天数。

## C 排期决定：与战斗接入一起实施

用户明确允许等待战斗接入。目前只有 `dev/combat-proto` 原型，主线事件还没有判定档位入口；本批不伪造战斗回执、不加绝路按钮，不新建第二份战斗配置框架。

待接入时按以下最终口径写 encounter.tierEffects 数据和终局：

- 所有14场记录 `lcq.encounter.f01..f14.tier`，只用 `win|lose|rout`；未打不伪记结果。
- F01–09、F11、F12只在rout埋创意稿中的 `lcq.branch.*`，不实施分支剧情；不用旧12稿的lcq.hook替代新分支flag。
- F10 `s05b_05b_ideology_duel_and_defeat`、F13 `ghost_king_swallowed`：rout直接死亡，不实施鬼王宫客卿／龙首上的人。
- F14 `slay_dragon`（须覆盖同段 `s06_02`，不能一场重复掷骰）：rout进入**失败终局**“龙精入体”，龙神死、龙精携鬼巫王残念入丹田，到此结束，不续玩、不同时进入“龙陨之前”。
- 待模块接入采用14稿§9修正：龙神由鬼巫王星阵唤醒；F12黑影仅表面显示、削发／挟持小紫锁定；F11敌方补阁罗。F07按最新创意稿 sea_blessed，不拿旧“向阁罗报信”钩子替代。

剧情侧需提供F10/F13死亡正文与标题、F14“龙精入体”失败终局固定全文；胜负规则与以上终局方向已定，不需要重新拍板。本批**尚未实施C的flag、tier或终局数据**。

## 验证

串行16份定向测试 **167/167通过，0失败、0跳过**。包括 canonAuthorityOverlay、场景账本、动作投影、本批三项新用例、registry哈希、R2-12阶段资料、南荒事件与行旅、白湖32项、模块演出、最小叙事包、真实流水线29项、事件判定、星月湖好感、世界情势、跨关阅读面。早先三个失败分别为同行漏凝羽、已批准源文案导致旧断言失效、stub检查的“贡物”词不在新事实材料；已修后全部复跑。新测试另验证谢艺披露前/后及叙事材料不带化神。

`git diff --check`通过；受保护源字段（affiliations／birthYear／storyAge／debutLocation）对备份逐项相同。日志 `/tmp/xiantu-batch6-*.log`，汇总 `/tmp/xiantu-batch6-tests.json`。

未跑全量单测、tsc、build、canon:build或真机。New Bot第五批1242项门禁绿是本批修改前的基线，不能充当本批通过证据。全量门禁与完整游玩体验由New Bot统一验收；当前只可进入复测。

## 需要剧情策划继续提供

- C终局定稿与战斗接入数据后复核。
- 14稿§10明确标“本次不做”的剩余P2资料、实际搜刮清单仍由剧情策划后续供给，未越界补写。
- 本批没有角色卡待裁定冲突：第五批“缺原文依据而暂缓”已被14稿的原文依据和本轮批准解决。AGE/AFF/DEBUT字段未变。

## 本批文件清单

- `mod-kit/canon-authority-overlays/lcq.stage_02.json`
- `mod-kit/canon-authority-overlays/lcq.stage_03b_snake_flower_bridge.json`
- `mod-kit/canon-authority-overlays/lcq.stage_04.json`
- `mod-kit/canon-authority-overlays/lcq.stage_04b_lingfei_baiyi_crisis.json`
- `mod-kit/generated/deepseek-v4-flash/character-canon/CANON-DECISIONS.md`
- `src/modules/scenarioMods/builtins/character-registry.json`
- `src/modules/scenarioMods/builtins/data/lcq.stage_02.json`
- `src/modules/scenarioMods/builtins/data/lcq.stage_03b_snake_flower_bridge.json`
- `src/modules/scenarioMods/builtins/data/lcq.stage_04.json`
- `src/modules/scenarioMods/builtins/data/lcq.stage_04b_lingfei_baiyi_crisis.json`
- `src/modules/scenarioMods/characterResolver.ts`
- `src/modules/scenarioMods/playerActionPresentation.ts`
- `src/modules/scenarioMods/runtime.ts`
- `src/modules/scenarioMods/travel/travelLedger.ts`
- `tests/modularTurn.test.mjs`
- `tests/playerActionPresentation.test.mjs`
- `mod-kit/generated/deepseek-v4-flash/character-canon/character-cards-v3.json`
- `src/modules/scenarioMods/storyContext.ts`
- `src/modules/scenarioMods/relationships.ts`
- `src/modules/scenarioMods/schema/canon.ts`
- `tests/batch6NarrativeCorrections.test.mjs`
- `PROJECT-STATUS.md`
- `docs/PLANNING-ROUNDS.md`
- `docs/handoffs/2026-10-04/BATCH5-CHARACTER-CORRECTIONS.md`
- `docs/handoffs/2026-10-04/BATCH6-IMPLEMENTATION.md`
