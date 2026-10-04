# Agent 须知（多 agent 一致性）

## 开工必读：合规要求与有意偏离

- 必读仓库权威版 [合规要求与有意偏离清单](docs/COMPLIANCE-REQUIREMENTS.md)：清单内条目是有意偏离原著，测试和复核只标记、不当问题报告、不要求修复；新增合规条目须用户确认。
- 以清单文末 **2026-10-04 11:39 SGT 用户裁定**为准：成人内容不做处理、不软化；硬线为全员满18岁、强迫内容不可玩化。C03/C04/C05不作为通用要求，只保留用户单独定过的场合；待确认项不视为已批准。
- 附录A的R01–R52及⚠冲突留待第十批单独下发；本次只建立文档入口，不授权实施落点标记或修复。


## 协作记忆基线

- `PROJECT-STATUS.md` 是本项目多 agent 的共享进度、分工、交付与 Git 汇总权威。开始认领、完成交付或改变阶段状态时，先读后更新本文件。
- 根目录 `CHANGELOG.md` 属原 repo 历史；不得将本协作线的状态记录误写进去。

## 策划轮次固定记录（2026-10-01 用户要求）

- 系统策划与剧情／事件策划每轮共同更新 `docs/PLANNING-ROUNDS.md`，开工登记目标，交付／阻塞／范围变化时更新各自小节；沿用同一执行批次编号，保留历史轮次。
- 更新须包含交付链接、成熟度、验证证据层级、未测项、跨组依赖及下轮建议；按文档模板执行。
- Codex做方向复核前先读 `PROJECT-STATUS.md` 与该文档最新轮次，再核对交付证据。项目状态权威与既有 Grok 控制面、审核路由保持不变。

1. **修改 canon 数据（mod-kit/generated/**）或核心 prompt（src/modules/scenarioMods/storyContext.ts 等）前，必读**
   `mod-kit/generated/deepseek-v4-flash/character-canon/CANON-DECISIONS.md`（正典裁定簿）。
2. 带执法标记（AFF_PROTECTED / AGE_PROTECTED / DEBUT_PROTECTED / USER_CANON）的字段是人工裁定，
   **任何扫描/富化/重构不得覆盖**；确需改动，先在裁定簿追加解锁条目再动手。
3. 提交纪律：`npm run canon:build` 全绿（37 关校验 + 92 测试）才可 commit；
   人工拍板的新裁定在同一 commit 里追加进裁定簿；核心文档权威=工作目录（裁定簿/简报已入 git）；改动后单向 rsync 到 NAS `character-canon/`（仅用户阅览镜像，不得反向拉取或在 NAS 上编辑）。

## 审查路由（Grok 控制面）

- 控制面 / 实现 / 返修 / 门禁 / 结束判断：Grok。Claude 与 Codex 都不控制流程。
- 默认二审：Claude Code。提交只读二审必须通过 `/Users/clawbot/.codex/bin/claude-review-submit.mjs`，不得直接调用 `claude-async.mjs submit`。
- Claude 只读二审统一默认模型：Opus 5.5（`claude-opus-5-5`）。单一配置 `/Users/clawbot/.codex/claude-review-config.json`；包装器与 Grok adapter 省略 `--model` 继承默认，显式指定才覆盖，不得失败后静默降级。此调整不改真机任务模型、游戏 API、只读权限或预算。
- 包装器会原子登记 `~/.codex/claude-review-watch.json`；本线程心跳只监控该 job，完成后主动回报并写入 `reported:true`，避免遗漏或重复回报。
- 备用审查：Codex CLI（`codex exec review`），审查完整 `base..HEAD`，并读取尚未关闭的 Claude findings。
- 切换条件：`claude_5h_quota_exhausted` / `claude_job_submit_failed` / `claude_review_incomplete` / `user_explicitly_requests_codex` / `urgent_synchronous_review` / `claude_result_conflicts_with_tests_or_contract` / `independent_adjudication_required`。
- 粘性：`per_task`。同一任务一旦切到 Codex，审到任务结束；下一任务再恢复默认 Claude。
- 高风险可开双审（Claude PASS → Codex 独立复核），不是日常默认。
- Claude/Codex 调用失败不是 PASS。
- 入口：`/xiantu-review-loop`（`.grok/workflows/xiantu-review-loop.rhai`），adapter 在 `.grok/workflows/reviewers/`。

## Grok 4.6 Build 成人向内容委托

- 对本项目中**已明确为成年角色**的成人化氛围、情欲张力、亲密关系表现、成人模式变体或相关内容审核，可以调用本机 Grok Build：`/Users/clawbot/.grok/bin/grok`，模型固定为 `grok-4.6`（实际后端可能显示 `grok-4.6-build`）。
- 推荐以自包含提示词单次调用，写清工作目录、对象、正典依据、产出格式与只读要求；默认使用 `--single ... --model grok-4.6 --no-subagents --no-memory --disable-web-search --permission-mode plan`。制作类任务先让 Grok 输出草稿或补丁建议，由 Codex 审核后再落库，不允许 Grok 直接覆盖 canon 数据或核心 prompt。
- 年龄不明、年龄存在冲突，或带 `AGE_PROTECTED` 的信息未核实时，禁止成人化处理；任何 `AGE_PROTECTED`、`AFF_PROTECTED`、`DEBUT_PROTECTED`、`USER_CANON` 字段仍以人工裁定为最高权威，不得被 Grok 输出覆盖。
- 不委托或制作涉及未成年人的性内容、胁迫性性行为的色情化表达或性剥削内容。成人角色的产出仍须服从人物人格、阶段状态、知识权限、关系边界与世界事实，不能以“成人模式”为由绕开正典。
- Grok 结果只作为外部草稿／第二意见，Codex 必须复核年龄、同意、正典一致性与内容边界；涉及 canon 或核心 prompt 的正式改动，仍须遵守裁定簿解锁、`npm run canon:build` 全绿及本文件的提交纪律。每次调用可能消耗用户的 Grok 额度或产生费用。
