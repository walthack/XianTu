# 补充22b · rerun4剧情数据修正

依据：`_newbot_tmp/2026-10-06-rerun4剧情侧三问.md`；按当前工作区内容定位，不照副本旧行号。保留补充22与模块策划全部现有改动；不提交/推送、不删文件、不碰端口、不重建8097。备份：`/tmp/supp22b-backup/`。

## 1. 段强

源卡stage_01阶段与builtin的description、role、currentAppearance、appearance、七条memories按报告§1.3替换。去初始已故/已死亡/草原死亡/死因/结局，去误抄半兽人武士的外貌；staticProfile.principles两条无依据设定去掉，首次出场定位改第1章。registry由脚本重建，不手改；死亡由s01_02既有剧情事实处理，未改该事件。

初始检索没有当前章节，故新增数据字段searchSummary及生成器的显式摘要读取：段强使用报告给的安全摘要；月霜/朱老头用出场表面身份，避免从全书角色卡、别名链把终点秘密重新灌进检索材料。全书角色事实/时点称谓账本仍保留，不把检索摘要当新角色身份权威。

落点：`builtins/data/lcq.stage_01.json:1140`，源卡段强phase/staticProfile，`scripts/build-character-registry.mjs:104`，新增`mod-kit/canon-authority-overlays/lcq.stage_01.json`。老实人天赋报告仅建议另拟、未给替换稿，本轮未改，留剧情策划后续确认。

## 2. 场景时段

`lcq.stage_04`山涧描述采用报告§2.2白天、黎明浓雾稿；chapter.eventIds将s04_02排首。s04_02/s04_03作者场景标为白天，s04_01单独标蕈子林、日落后至深夜；不新增地点、不改移动路线，也不挪原著锚点。乐明珠插入拍brief中的“山涧巨蕈林边”改为当前山涧白天浓雾，不把后续夜景拼到插入拍。

落点：`builtins/data/lcq.stage_04.json:447,2109,2208,2719`、`mod-kit/canon-authority-overlays/lcq.stage_04.json`、`mod-kit/quest-lines/resources.json:19`。本轮按用户本条确认的山涧场景实施，不冒称第48章原著所有片段都在黎明；原锚点保留供剧情复核。

## 3. 凝羽寒气

stage_02 ningyu_regicide_offer 与stage_03 s03_09第2步同步五种探问语义，明确不要求先知道西门庆。现有requiresPreparation保持；intentMatch.rejectIf拒绝自身/苏妲己/冰蛊等错误归属；固定要点写明由凝羽亲口说出，程宗扬此前不知。stage_03补齐对应fallback及语义检查，避免新场景要点违反数据schema。

数据原有匹配器把所有问句当承诺风险拒绝，单靠关键词表不能接受原著探问：增加allowInquiry布尔数据标记（仅作者标记的信息动作），自然意图解析器仅对标记候选允许直接问句；仍检查玩家证据、候选有效性/前置，假设与转述不结算。rejectIf在模型归档返回后再次检查，不能靠错误模型选择蒙混。全新的未知错误人名仍依赖主持语义归档，不声称有限词表能兜住所有句式。

本次副本里registry及16个phase已在前批修正，旧报告不是当前状态；实际剩余一处错误句在character-cards-v3的sourceCards副本，已事实纠正。原错误词串计数：源卡备份1→当前0，重建registry0；没凭旧行号重复改16份。

落点：`builtins/data/lcq.stage_02.json:3395`、stage_03对应第2步；02 overlay及新增03 overlay；`schema/scenario.ts:272`、`naturalIntentRouter.ts:323,420–424`；源卡sourceCards、自动registry。

## 4. 十二项同类初始资料

| 报告序号 | 处理 |
|---|---|
| 1 | stage_01程宗扬只保留刚穿越，去遇王哲/被段强拖累。 |
| 2–3 | stage_01王哲初始存活，去未来传功/战死记忆。后续事件不改。 |
| 4 | stage_01凝羽未来记忆撤出初始；未重写合规原句/规则，未擅改演员系统。 |
| 5 | stage_01苏妲己只保留经营商馆，去未来收奴/下冰蛊初始记忆。 |
| 6 | stage_01月霜改出场身份左武军骑手/王哲门下，去雪隼/遗女与尚未发生冲突。 |
| 7 | stage_02程宗扬去未来冰蛊/凝羽/南荒记忆，保留已遇王哲。 |
| 8 | stage_02王哲currentAppearance改仍在军中。 |
| 9 | stage_02凝羽两条未来记忆撤出初始。原批准药物事实原句原样存sourceCards.deferredStageMemories，仅保留来源不生成运行时初始记忆；未改字句或玩法合规规则。对应旧测试只同步“不能提前注入”的时点断言，并检查原句仍保留。 |
| 10 | 月霜registry的stage_01/02 phase按出场身份重建；阶段关系/结局列表不回落终点设定。 |
| 11 | 03b/04b/05b殇侯phase当前已是表面老向导，核对后保留；补收窄无章号检索摘要。原阶段称谓门/揭名事件不变。 |
| 12 | 03b/04b祁远已修，核对后保留；05/05b及07–09去江州锦衣掌柜未来描述，采用已核白湖商馆老行商。10–12的江州阶段资料未猜改。 |

源卡与投影overlay一起维护，未只改builtin；05/07/08/09尽量使用单字段overlay，保留既有冻结事件与其他源操作。新增01/03/09 overlay，manifest与重建闭包测试明确14份；来源漂移检查、重建逐字节检查、二次套用幂等检查均保留。裁定簿追加#211，不改旧裁定正文。

## 五组待核（均未改其原文数据）

1. 黛姬雪娜stage_02：韩庚之死、母子关系与复仇动机是否已发生。
2. 殇侯清羽07–12/云龙/燕歌阶段：刘询、阳武侯、屠吕家身世链揭示时点。检索入口仅使用表面摘要，不擅自裁定这些阶段资料的真伪或揭示章。
3. 剑玉姬多关description“刘建背后那双看不见的手”：幕后身份揭示时点。
4. 阮香凝多关notes“真身是黑魔海高层”：揭示时点。
5. 墨枫林taiquan_core_conflict角色“后背叛”：剧情时点。

## 本轮文件

- 源卡character-cards-v3.json（现有ignored源，未force add）、CANON-DECISIONS.md追加#211。
- scripts/build-character-registry.mjs。
- mod-kit/quest-lines/resources.json。
- overlays：01新增、02、03新增、04、05、05b、07、08、09新增及manifest。
- builtins/data同上九关、character-registry.json（脚本生成）、manifest.json（门禁产物）。
- src/modules/scenarioMods/naturalIntentRouter.ts、schema/scenario.ts。
- tests/supplement22bStoryData.test.mjs新增；canonAuthorityOverlay.test.mjs扩展三份正式overlay闭包（未放宽检查）；batch10Compliance.test.mjs只同步初始时点、保留原句断言。
- 本交接、PROJECT-STATUS、PLANNING-ROUNDS。

## 验证

定向47/47；tsc0；全量1630项1625过/0败/5既有跳过。canon:build全绿176.7秒（内含1625过/0败/5跳）；无新真实模型/真机复测，不声明模型从此绝不串错。8097未重建；模块策划并行状态工作未触碰。

最终补验：生产build成功（webpack compiled successfully），git diff --check通过。构建仅生产包，不构建combat-trial，不换8097。overlay.from保留旧源快照供漂移校验，其中旧词不代表运行时当前卡；to及脚本重建的builtin/registry采用已核时点。

发布补记：用户随后授权提交推送，本轮纳入RERUN4-REPAIRS-PUBLISH；上文“不提交”保留为当时工作约束。8097仍不重建。

ignored人物源卡最小变更见SUPPLEMENT22B-SOURCE-CARD-PATCH.json；原始全书源卡不强加git。其他副本若持有旧源卡，重建前须按canonicalName逐项核对并应用本补丁，不能仅拿旧源卡覆盖新registry/overlay。
