> **当前收口已含W-48**：统一目录 `contracts/statuses.json:465` 定义yin.sha_arm轻档，F13 `contracts/f13.json:377` 只引用id；输局不挂，不合并W52。W49/50材料口径已引用，新救援流程未扩。当前8097 MD5 `f5e92d4eeb2a2418778fb3127d3ec8fc`，覆盖本文原阶段包号；最新门禁1511过／0败／5skip、tsc0、canon绿。第2阶段未开工，NPC记忆未实施，最新包未真模型复测。详见[W48收口](W48-STAGE1-CLOSE.md)、[日终交接](DAY-END.md)。

# 固定战斗五步计划 · 第1阶段通用能力

2026-10-05。依据剧情合同31号§0b/§21/§21.7/§22及本会话用户裁定。只做第1阶段，完成后等待第2阶段指示；无提交、推送或删除，未操作受保护端口/PID，合规文件与内容未改。

## 已落实

1. **G1 状态目录**：`src/modules/sceneModule/contracts/statuses.json` 为本书目录，`statuses.ts` 导出 STATUS_CATALOG/catalogStatus。现有6个部位/装备条目＋10个伤情类别；内置6个临时通用状态继续可用。目录项记录来源、效果、解除；新增描述型条目仍 provisional，不自行编伤害数值或原著未定的治疗法。解析顺序：宿主目录→本书目录→合同→内置。既有通用状态数值没有改变。
2. **G2 角色/群体伤情**：`sceneLedger.statusRecords` v1，`actors[角色id]` / `groups[群体id]`，groupLabels单独显示。每项记录statusId、sourceScene、appliedAt、expiresAt、effects、remove、player；按游戏日历计算时限。NPC/群体不注册成新人物。F03花苗汉子/商馆护卫已给明确group.id；群体简报、识别、代价用group.label。旧 injuries 字符串保留为legacyInjuries，只作历史文字，不猜测成数值/死亡/状态。
   - 写回每拍只发布已结算状态；原来源/期限跨场继承，伤情升级替换旧记录；主角效果仍写角色.效果，NPC/群体通过injuries/groupInjuries兼容现有材料。
   - 开场恢复结构化状态并参与判定；宿主基础因子排除同一结构化伤情，避免状态系统再扣一次。
   - 到期、明确story解除flag、removeSceneInjury匹配的rest/item规则可解除。提供受限代码入口，本轮没有新增休整/修复按钮或让模型自行清状态。
   - 匿名参与方未写group时沿用合约局部id兼容；跨场同一群体必须由作者写稳定group.id，不按显示名猜合并。
3. **条件事件**：固定事件新增when、trigger、enemyActionId。节点为beatStart/afterAction/beforeEnemyAction/afterEnemyAction；代码条件判定、firedEvents存档去重、有限轮数处理条件链。条件触发不能与拍数/开场/收束混写；预览不触发、不掷骰。援军可在特定攻击前阻断，攻击者中途离场后不再打后续目标。本轮没有把F01/F08等未接场次假装转换完成。
4. **G4 审问章节门**：合同interrogation声明maxChapter、goalIds、requires、facts[id/fromChapter/text/forbiddenBefore]。当前进度与合同上限取较小值；无章节证据就不披露，未控制活口则不给确认动作。F03新增审问支援动作，要求至少有被俘武士，信息仅到45–46章已知来人。
   - 供词由代码按已结算结果和白名单输出，模型不能生成新供词；已结算审问记入interrogationReceipts。隐藏条目不进提示材料。
   - 来历/幕后/谁派等信息请求也进入代码审问门；普通场内闲聊仍走原模型路径，不能生成供词。后续场次的事实清单在逐场转换时填，不从全书资料自动抽取。
5. **G5 输局承重**：新增独立continuity.effects/fixedCosts/checks/facts/flags，适用于全部结果；不修改胜负，不发胜利奖励，不套全歼终态。收束同时检查redLines与afterState，失败不写回推进。F03原本三个分支重复的探路人/凝羽内伤移入共同承重；输局仍有自己的护卫代价。F10共同事实保留鬼巫王、丹宸存活。既有检查模式带入战后普通回合；这不是完整语义事实核验，未配置的语义冲突不会自动识别。
6. **G3 奖励授权**：rewardPolicy.itemIds白名单在lint和写回两处检查。当前注册合同和F14草稿已声明；F10仍发断斧/碎水晶，未加搜刮互斥flag，不去重口径保留。
7. **N1–N4**：沿用已定默认值，并新增测试锁定：失败消耗一次性杠杆，大成功noExposure不消耗；敌方难度+2仅本拍；无fumble时主角失衡，下一拍劣势并显示后果；临时通用状态仍可用。

## 保留的最新口径与阶段边界

- F13只有win/lose，lose→E07；F14草稿lose→E08，赢才继续。无rout/普通输另档（旧存档rout仅兼容读取）。F14未注册，待后续场次转换。
- F14只定谢艺重伤，生死留给xieyi_entrustment；死亡线和长休IF均保留。
- W49娄蒙可救、萨安默认不可救，硬救要另有人被吸；W50朱诺心脏只作叙事物件。F13叙事材料已引用这两条，奖励白名单为空；本阶段不新增救援动作或其结算流程。
- W48收口补挂：剧情侧状态id已核对为 `yin.sha_arm`，见人物状态B类4.3与31号§23。统一目录定义轻档，F13胜利分支只引用id给武二郎挂载；输→E07不挂。仍可参战，化虎不算治愈，不和W52龙爪废功合并。具体数值与根治时长未定，目录暂以外貌/出力描述承接，不捏造扣幅或自动治愈。
- 尚未接11场，未做NPC记忆、感情线、F09具体阳气判定，未改主模型路由。

## 本轮文件

- 状态/引擎：types.ts、statuses.ts、statusAdapters.ts、scene.ts、enemy.ts、queries.ts、lint.ts、brief.ts、index.ts（均在src/modules/sceneModule/）。
- 合同：contracts/statuses.json、registry.ts、f03.json、f10.json、f13.json、f14.draft.json。
- 宿主：host/injuries.ts（新增）、information.ts（新增）、writeback.ts、factors.ts、refs.ts、recognize.ts、narrate.ts、controller.ts。
- 信息门：src/modules/sceneModule/interrogation.ts（新增）。
- 原账本兼容：src/modules/scenarioMods/fixedEndingNarratives.ts、ledger/affinityIdentity.ts。
- 测试：tests/sceneCommonCapabilities.test.mjs（新增）。
- 文档：本文件、COMBAT-WIRING.md、PROJECT-STATUS.md、docs/PLANNING-ROUNDS.md。
- canon门禁刷新registry/manifest生成字段，保留产物；已有其他脏文件不是本轮新增修改。

## 验证与包

最终验收：定向96/96；tsc --noEmit 0错；串行全量1513项，1508通过/0失败/5既有跳过；canon:build全绿56.5秒，内含同计数单测；git diff --check通过。8097已重建，LAN实取与本地产物一致，MD5 `7523b61590d263c0b28eb98f79902d1b`，地址 `http://192.168.50.51:8097/?sceneModule=on`。本包包含第1阶段通用能力和此前F13 lose→E07口径，不包含剩余11场转换。日志：`/tmp/xiantu-stage1-focused.log`、`-tsc.log`、`-full.log`、`-canon.log`、`-8097-build.log`。定向涵盖目录优先级、NPC/群体id、跨场与日历、状态升级和维修规则、玩家不双扣、条件援军/群攻中断/幂等/预览无骰、输局承重、奖励授权、审问章节及模型不能增供词、N1–N4。没有真实模型或玩家复测，门禁通过不等于体验验收。
