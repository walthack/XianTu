# Claude 接手单：清羽／云龙 world-sim 征兆精修

日期：2026-08-14

## Summary

清羽与云龙的 world-sim baseline 征兆已经完成批量精修实现，固定提交为 `5db8d17 feat: refine Qingyu and Yunlong world omens`，父提交为 `916b2a0`。本批覆盖清羽 15 个 stage／159 条 situation、云龙 11 个 stage／92 条 situation，合计 26 个 stage／251 条；燕歌不在本批范围。

Grok 4.6 Build 已承担逐 stage 首稿生成，Codex 已完成确定性拒收／合并、tracked overlay、内置数据同步、测试、构建与 NAS 评审副本。当前唯一收尾门是 Claude 对 251 条内容的独立剧情二审，以及针对实证 P0／P1／P2 的修复和复验。不要重跑已经完成的 Grok 批次，也不要重做 world-sim runtime。

## 固定状态

- 项目目录：`/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu`
- 分支：`feat/builtin-scenario-templates`
- 接手提交：`5db8d17389691d7ee004cf860995aeb3a329c189`
- 接手时工作树：干净
- 权威裁定：`mod-kit/generated/deepseek-v4-flash/character-canon/CANON-DECISIONS.md` #156／#157／#158
- 实现报告：`docs/WORLD-SIM-REFINEMENT-QINGYU-YUNLONG-2026-08-14.md`
- tracked 内容权威：`mod-kit/world-sim-refinements/qingyu-yunlong.json`
- 生成内置数据：`src/modules/scenarioMods/builtins/data/lcq.*.json` 与 `lyl.*.json`
- 可重复同步入口：`node scripts/sync-builtin-mods.mjs`

## 已完成实现

1. `scripts/world-sim-refinement-pipeline.mjs`
   - `prepare`：抽取逐 stage 自包含事件、地点、人物资料包。
   - `run [stageIds...]`：调用本机 `grok-4.6` 生成结构化首稿，结果按 stage 缓存。
   - `merge`：校验数量／稳定 ID／禁用剧透词／长度，并把人物候选限制到 source event 的 `relatedCharacterIds`。
   - `apply`：生成 tracked overlay 并应用到本地 generated stage。
2. `scripts/world-sim-refinement-overlay.mjs`
   - 只替换 situation 的标题、摘要、可观察事实、环境兜底、正文插段与传递者。
   - 不改事件、条件、时钟、锚点、IF、事件结果或玩家知识。
3. `scripts/sync-builtin-mods.mjs`
   - 每次打包时确定性加载 tracked overlay，保证不是一次性手改 builtin JSON。
4. `tests/worldSimulationAllStages.test.mjs`
   - 断言 26 stage／251 situation／251 overlay entries 完整一一映射。
   - 断言 sourceEventId 不变、表现字段完全同步、人物候选不越过事件相关人物、messenger／environment 兜底存在。

## 不变量与内容边界

- 251 条必须保持原 `stageId + situationId + sourceEventId`。
- 不得改变激活／结算条件、`afterTurns`、硬锚点、IF 或事件结果。
- 征兆只写当前可观察压力；不得提前断言死亡、登基、被俘、叛逃、遇袭成功或胜负。
- 不得伪记玩家亲历、替玩家决定去留，也不得出现玩家／系统／回合／倒计时／机会卡／剧情等元语言。
- `preferredCharacterIds` 只能来自同一 source event 的 `relatedCharacterIds`；没有合适 NPC 时使用 messenger／environment。
- 人物关系、性格底色、阶段身份、称谓、私有知识和成人边界继续服从既有正典；征兆表现层无权改写。
- 燕歌和定陶人工纵切不属于本批，禁止顺手改动。

## 已有模型工件

隔离目录（被 git 忽略）：

`/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/.xiantu-server/world-sim-refinement-2026-08-14/`

其中包括：

- `targets.json`
- `prompts/<stage>.txt` 与 schema
- `results/<stage>.json` 与 stderr log
- `merged-draft.json`
- `merge-issues.json`（最终为空数组）
- `final-canon-build.log`
- `claude-review-prompt.txt`

Grok 的第二轮只读自审只返回 `pending/placeholder`，已明确拒收，不是质量证据。不要引用它作为 PASS，也无需再让 Grok 自审。

## 当前 Claude 二审任务

- jobId：`claude-2026-08-14T00-45-55-262Z-fcdbe608`
- 模型：`claude-sonnet-5`
- 模式：只读 `permissionMode=plan`
- watch：`/Users/clawbot/.codex/claude-review-watch.json`
- 提交时 `reported=false`
- 当前任务已启动，**先等待并读取这个 job，禁止重复提交同范围二审**。

状态与结果命令：

```bash
/opt/homebrew/bin/node /Users/clawbot/.codex/bin/claude-async.mjs status claude-2026-08-14T00-45-55-262Z-fcdbe608
/opt/homebrew/bin/node /Users/clawbot/.codex/bin/claude-async.mjs result claude-2026-08-14T00-45-55-262Z-fcdbe608
```

二审要求已写入 `claude-review-prompt.txt`：逐条检查剧透、无来源细节、传递者知识边界、人物阶段身份／性格底色、元语言、模板化病句，以及 overlay／sync／测试的真实缺口；按 P0／P1／P2／P3 提供具体证据。

## 已通过验证

- `node --test tests/worldSimulationAllStages.test.mjs`：6／6 PASS。
- `npm run canon:build`：37／37 stage schema，600／600 tests PASS。
- `npm run type-check`：PASS。
- `npm run build:single`：PASS。
- JSON 差异审计：26 个 builtin stage 除允许的 title／summary／omen facts／fallback／presentation／transmitters 外，无其他字段变化。
- `git diff --check`：PASS。
- NAS 正典镜像已单向同步。
- 评审副本：`/Volumes/botsvault/06_material/XianTu-Mod-Kit/world-sim-refinement-qingyu-yunlong-2026-08-14/`

## 接手后的执行顺序

- [ ] 等现有二审 job 完成，读取结果并按 P0／P1／P2／P3 归档；把 watch 的 `reported` 原子设为 `true`，避免重复通知。
- [ ] 验证每条 finding 的 source event／人物卡证据；Claude 结论是审查证据，不自动当作事实。
- [ ] 修复所有实证 P0／P1；本批追求精修，实证 P2 也应修复。P3 可只登记，除非是低风险明确病句。
- [ ] 文案修复优先只改 `mod-kit/world-sim-refinements/qingyu-yunlong.json`；随后运行 `node scripts/sync-builtin-mods.mjs` 重建 builtin。不要直接只改 builtin，否则下次同步会丢失。
- [ ] 若修复涉及人物候选，保持 source event `relatedCharacterIds` 子集；无合适人物则删候选，保留 messenger／environment。
- [ ] 运行 focused test、`npm run canon:build`、`npm run type-check`、`npm run build:single`、`git diff --check`。
- [ ] `canon:build` 会刷新 `src/modules/scenarioMods/builtins/character-registry.json` 的日期时间；若 sourceHash 与内容没变，只恢复这份无关时间戳噪声，不要把它混入提交。
- [ ] 更新本报告、`PROJECT-STATUS.md` 与 `RELEASE-ROADMAP.md`；只有 Claude 二审 P0／P1／P2 关闭后，才把清羽／云龙 G1 标为完成。
- [ ] 将变更和报告再次单向同步到 NAS 评审目录。
- [ ] 形成新的干净提交。若修复 materially 改变风险面，用 `/Users/clawbot/.codex/bin/claude-review-submit.mjs` 提交一次聚焦复审；不要直接调用裸 `claude-async submit`。

## 完成定义

本批完成仅表示：清羽／云龙 26 stage 的 251 条 baseline 征兆经过剧情精修与独立二审，可在既有 world-sim 运行时中作为未知结果、可忽略、世界内传递的事前信号使用。

它不表示燕歌已经精修，也不表示 R3-9 关系姿态层已经实现，更不授权修改玩家存档、发布、扩量到其他系统或重写原世界因果合同。
