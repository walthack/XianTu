# 清羽／云龙 world-sim 征兆精修

日期：2026-08-14
范围：清羽 15 stage／159 situation；云龙 11 stage／92 situation；合计 26 stage／251 situation。燕歌不在本批范围。

## 目标

把全 stage baseline 的通用提示改为剧情内可感知的事前征兆：人物言行、使者口信、现场痕迹或环境异动。征兆只表达当前压力和可能关闭的介入窗口，不提前给出死亡、登基、被俘、叛逃、胜负等确定结果，也不替玩家决定去留。

## 分工与工件

- Grok 4.6 Build：按 stage 接收自包含的事件、地点、相关人物卡和既有 situation，批量生成 251 条标题、摘要、可观察事实、候选传递者、环境兜底与正文插段。
- Codex：实现 prepare／run／merge／apply 管线；对数量、顺序、稳定 ID、禁用剧透词、长度和人物候选边界 fail-closed；把通过项合并为 tracked overlay，并用全量测试证明可重复打包。
- Claude：在固定提交上做独立剧情二审；P0/P1/P2 未关闭前，本批状态保持“已实现、待二审”，不宣称承重叙事验收完成。

模型临时工件位于 `.xiantu-server/world-sim-refinement-2026-08-14/`，包括 `targets.json`、逐关 prompt/schema/result、`merged-draft.json` 和 merge 问题表。运行时权威是 `mod-kit/world-sim-refinements/qingyu-yunlong.json`，模型原始输出不会被运行时直接读取。

Grok 第二轮只读自审返回 placeholder，未完成实际逐条审计，已拒收且不计验收证据；独立审稿仍由 Claude 完成。

## 不变量

- 251 条全部锁定原 `stageId + situationId + sourceEventId`。
- 不改变 event、激活／结算条件、相对时钟、硬锚点、IF、事件结果或玩家知识。
- `preferredCharacterIds` 只能取同一 source event 的 `relatedCharacterIds`；每条仍保留 messenger 与 environment 兜底。
- 旧定陶人工纵切不被 overlay 覆盖；燕歌数据无改动。

## 自动验证

- overlay 映射：251/251；stage：26/26；重复 situation ID：0。
- `node --test tests/worldSimulationAllStages.test.mjs`：6/6。
- `npm run canon:build`：37/37 stage schema；600/600 tests。
- 待固定提交后二审：Claude 对剧透、来源接地、知识边界、人物底色与模板化措辞出 P0/P1/P2/P3 报告。

## Claude 独立二审与修复（2026-08-14）

二审 job `claude-2026-08-14T00-45-55-262Z-fcdbe608`（只读 plan 模式，固定在 `5db8d17`）结论为 FAIL：1 项 P0、2 项 P1、3 项 P2、1 项 P3。接手方逐条复核证据后处置如下。

### 已关闭

- **P0-1 `fruit_conflict` 提前揭晓身份谜底**：该 event 唯一的 `playerCompletionContract` 就是"确认凝姨就是林娘子阮香凝"，而征兆用"正是／便是……阮香凝"把谜底当既定事实讲完。复核时把范围扩大了一格——`summary` 里的"凝姨即林娘子"同样属于谜底（`lyl.lin_an_black_sea` 的角色卡写明此时"真实姓名、婚姻与门派身份均未揭示"）。现改写为只写可观察摩擦：称呼仍是"凝姨"、府中下人却按主母规矩伺候、她的应对与成婚多年的说法对不齐；身份判断留给玩家动作。
- **P1-1／P2-1／P2-2 未翻译的拉丁残留**：全量扫描确认精修面共 4 处且仅此 4 处——`银 ingots`（`lin_chong_confront`，逐字推给玩家的 `presentation.text`）、`高俅 encel?`、`内院 Curtain`、`江面 mult`。已逐条改为通顺中文。
- **P1-2 回归测试的禁用词闸门弱于生成期**：新增共享模块 `scripts/world-sim-omen-guards.mjs`，`pipeline` 与 `tests/worldSimulationAllStages.test.mjs` 共用 `FORBIDDEN_OMEN_TEXT`／`BASELINE_OMEN_TEXT`，并补新增的 `LATIN_RESIDUE`（生成期原本没有这道闸门，正是 4 处英文残留漏网的原因）。收严前实测：严格正则对全部 37 关的 omen 字段 0 命中，可安全启用；测试面**不**扩到 `situation.summary`，因为燕歌 11 关共 107 条仍是未精修的基线模板（"…玩家可以介入…"），不属本批范围。已用注入违规词的负向测试确认闸门确实会红，随后原样还原（文件哈希一致）。
- **二审未发现、复核时新查出的实证缺陷**：`s04_05` 的 4 个字段（含 `presentation.text` 与 situation 标题）把正典角色**谢艺**写成不存在的**谢仪**。全库 315 人 registry 无此人，父提交 `916b2a0` 该文件 0 次命中，确系本批引入，已改回谢艺。二审在 P2-3 只做了抽查（查到"阿葭"合规即收），未覆盖到这条。

### 只登记，不修

- **P2-3 正文专名溯源闸门**：二审未发现实证违规，本次补充复核也确认无杜撰。两种候选闸门均实测不可用——"只认源事件"口径在 251 条上产出 14 条告警，逐条读原文全部是同关在场人物或 ID 命名空间不一致造成的假阳性；"正典姓氏 + 非正典人名"启发式产出 4410 条告警（莫、车、云、石等都是常用字）。故不建闸门，登记为技术债；同类精修批次继续依赖人工溯源，本轮已证明人工溯源能抓到讹名。
- **P3-1 措辞模板化**："对不上" 48/251、"互相打架" 27/251，属风格疲劳而非违规，按接手单只登记。

### 修复后验证

- `node --test tests/worldSimulationAllStages.test.mjs`：6/6 PASS。
- `npm run canon:build`：37/37 stage schema，600/600 tests PASS。
- `npm run type-check`、`npm run build:single`、`git diff --check`：PASS。
- 内置数据差异：仅 5 个 stage 文件共 12 行表现字段，加 `manifest.json` 内容哈希 1 行；`character-registry.json` 的日期时间戳噪声已还原（`sourceHash` 未变）。
