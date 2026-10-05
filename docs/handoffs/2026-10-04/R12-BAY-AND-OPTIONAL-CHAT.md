# r12 · 碧鲮湾预算卡死与可选闲聊按钮返修

2026-10-05；不commit/push，已有全部工作区改动保留，不动src/dev/combatTrial或棘轮基线，不改合规/角色卡/剧情数据。

## 1 碧鲮湾无法推进

证据：`../_newbot_tmp/r12/run2/ckpt-04b-stuck-biling-bay-stance.json`。事件 `lcq.event.biling_bay_stance`，17人cast；旧AIB在发请求前硬检查system.length > 10000后抛错，同一存档重试不会减少材料，形成永久卡死。

根因是重复/描述性材料叠加且把写手输入预算误当成剧情门禁：present与presentActors重复，recentNarrative与记忆重叠，世界事实/上一拍与完整账本重复；原先packet预算又与AIB叠加材料后的预算不同。

修改：
- `src/modules/scenarioMods/legacyNarratorPacket.ts:547`（以函数实际位置为准）新增在现有文件内的`buildCompactModuleNarrativePrompt`，小材料原样；超预算先去重复历史/账本字段/重复名字列表和空描写，再缩traits、长外貌及语气，历史留最新100字。全部17人、id、性别、代词、族属、职务、关系称呼及本拍结算/固定事实/禁止事项保留；不截JSON、不截整段prompt。
- `src/utils/AIBidirectionalSystem.ts:818、846`使用完整指令前缀+上述材料构建函数。10k为精简目标，不能再在请求前抛错/退legacy；若不可删的事实本身仍超过目标，保留完整事实照常请求，console.warn记录长度。console.info记录精简前后长度；provider和请求失败/结算逻辑不变。
- 这是输入去重与软预算处理，没有把硬上限盲目换成更大的数字，也没有丢弃演员来压预算。

离线真实checkpoint编包：17人保留；采用2800字模拟完整指令前缀、两段600字历史，11674→9900字。该数字是控制实验，不宣称是真API全部prompt的长度。日志`/tmp/r12-fixes/checkpoint-replay.log`。未请求模型，待New Bot真机验证实际请求/正文/推进。

## 2 朱老头闲聊没有可辨识按钮、过窗仍活跃

实际核查存档及代码：闲聊动作能够生成；`getCurrentStoryExplorationActions`的label只保留泛称动词+推断targetLabel，朱老头用别名且本动作没有识别出的targetLabel时退化成“行动”。日志c065–c066的“探索 行动 · 耗时1回合”就是这条可选动作，而不是没有任何动作。上一轮静态测试只查eventId没有查显示label，因而没覆盖这个缺口。

修改：
- `src/modules/scenarioMods/runtime.ts:1559`：探索动作无targetLabel时补合同action.label，显示“行动 · 听朱老头聊聊黑魔海旧闻”；其余动作/地点/朱八八规范id、visibleWhen、requiresPresentCharacterIds均不改。
- `runtime.ts:3876`：可选探索event.conditions关闭后从activeEventIds移除；不伪造完成/发奖励，也不阻止继续主线。仍按原有窗口激活，不移到其他章节。
- `tests/batch12RetestRepairs.test.mjs`：原正常rail白夷窗口测试加可见label断言，原单次结算/跳过主线/行旅只记一次断言保留；完成14后闲聊不再活跃也不再出按钮。

真实r12停滞存档离线仅将位置改白夷及14完成flag撤至窗口状态，实际公开API返回“行动 · 听朱老头聊聊黑魔海旧闻”；这是复现显示缺口的控制实验，非完整真人复测。

## 验证

- 定向45/45：batch12RetestRepairs、legacyNarratorPacket、baihuGambleRefusal。新增17人超预算保留硬事实和不可压缩指令仍不抛错测试；不改变旧断言。
- tsc --noEmit：0错误。
- npm test：1373项，1368通过、0失败、5既有跳过。
- canon:build：已运行，仍在账本人名棘轮因原五个战斗试玩文件中断，后续步骤未执行；没有放宽基线/改动其文件，不能标全绿。
- git diff --check：通过。
- 日志 `/tmp/r12-fixes/{focused,tsc,npm,canon,checkpoint-replay}.log`；修改前备份`/tmp/r12-fixes/before.tgz`。

本轮文件：AIBidirectionalSystem.ts、legacyNarratorPacket.ts、runtime.ts、batch12RetestRepairs.test.mjs、PROJECT-STATUS.md、docs/PLANNING-ROUNDS.md、本交接。无数据/合同hash/源卡修改，无提交推送。

下一步：New Bot从原卡死存档确认能发模型请求并推进；白夷65章窗口确认有具名闲聊按钮、单次结算及离城/14完成后按钮与活跃事件清除。外部战斗棘轮修复后重跑完整canon。

## 同轮第3项 · 全新二期试玩首回合响应式递归

证据：`../_newbot_tmp/r13/run/logs/console.log:4–5`，Maximum recursive updates exceeded in MainGamePanel；`../_newbot_tmp/r12/run2/tools/patch.js`绕行补丁对关系/关系矩阵预拷贝后可以继续。

根因：`gameStateStore.toSaveData()`组装v3时仍引用store的关系和关系矩阵，在原`:664`调用`backfillRelationshipIds(v3,...)`后才执行最终深拷贝。ID迁移不只是查询，会写入/改键/加兼容别名，并把矩阵nodes/edges重新赋为映射数组，即使规范ID已存在也可能触发响应式写入。MainGamePanel的多个computed读toSaveData时反写了自己的依赖，形成重算循环；不是模型超时，且不能靠关闭webpack overlay解决。

修改：
- `src/stores/gameStateStore.ts:664–667`：先把整份v3深拷贝成snapshot，再对snapshot进行关系ID迁移，返回snapshot。关系及矩阵只在副本里修改；ID迁移与旧名兼容保留，不取消迁移、不逐个修改computed、不依赖patch.js。
- `tests/run4FollowupRepairs.test.mjs:1068`：实际Pinia store + Vue computed/watchEffect/deep watch，旧朱八八关系及矩阵保留在store，连续10次toSaveData可在快照里规范化但store写入0次、render effect1次；修改返回副本也不影响store。
- 同文件`:1100`：使用二期新开局工厂、实际AIB processPlayerAction首动作生成-发布-结算链，模拟模型响应；断言到达模型边界、无generationError、transactionCommitted且回合推进。没有浏览器绕行补丁。

验证：定向56/56（run4FollowupRepairs、batch12RetestRepairs、ledgerP0）；tsc0错误；全量1375项：1370过/0败/5既有跳过。canon已执行，仍在原五个战斗试玩文件人名字面量棘轮中断；未改文件或放宽基线，后续步骤未执行。git diff --check通过。

日志`/tmp/r12-opening-reactivity/{focused,tsc,npm,canon}.log`，修改前备份`before.tgz`。前两项r12修复和此前全部工作区改动保留，本轮另外只修改gameStateStore.ts、run4FollowupRepairs.test.mjs及共享状态/本交接文档。没有提交、推送、合规改动或在线服务重启。

成熟度：实际store/Vue响应式和模拟生成链已验证；没有真实浏览器或真实MiniMax本轮验收。New Bot请用全新浏览器配置再走主页→历史试玩→二期→首动作，同时保留前两项复测。不能把上述受控测试计为真机PASS。
