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
