# Agent 须知（多 agent 一致性）

## 开工必读：合规要求与有意偏离

- 必读仓库权威版 [合规要求与有意偏离清单](docs/COMPLIANCE-REQUIREMENTS.md)：清单内条目是有意偏离原著，测试和复核只标记、不当问题报告、不要求修复；新增合规条目须用户确认。
- 以清单文末 **2026-10-04 11:39 SGT 用户裁定**为准：成人内容不做处理、不软化；硬线为全员满18岁、强迫内容不可玩化。C03/C04/C05不作为通用要求，只保留用户单独定过的场合；待确认项不视为已批准。
- 附录A的R01–R52及⚠冲突留待第十批单独下发；本次只建立文档入口，不授权实施落点标记或修复。


1. **修改 canon 数据（mod-kit/generated/**）或核心 prompt（src/modules/scenarioMods/storyContext.ts 等）前，必读**
   `mod-kit/generated/deepseek-v4-flash/character-canon/CANON-DECISIONS.md`（正典裁定簿）。
2. 带执法标记（AFF_PROTECTED / AGE_PROTECTED / DEBUT_PROTECTED / USER_CANON）的字段是人工裁定，
   **任何扫描/富化/重构不得覆盖**；确需改动，先在裁定簿追加解锁条目再动手。
3. 提交纪律：`npm run canon:build` 全绿（37 关校验 + 92 测试）才可 commit；
   人工拍板的新裁定在同一 commit 里追加进裁定簿；核心文档权威=工作目录（裁定簿/简报已入 git）；改动后单向 rsync 到 NAS `character-canon/`（仅用户阅览镜像，不得反向拉取或在 NAS 上编辑）。
