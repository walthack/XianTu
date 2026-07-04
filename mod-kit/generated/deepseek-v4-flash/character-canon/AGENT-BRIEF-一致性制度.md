# XianTu 多 agent 一致性制度（2026-07-04 落地，commit d69fe4d）

**背景**：多个 agent（Claude Code / Codex / MiniMax 批处理脚本）并行修改 canon 数据，发生过重扫覆盖人工裁定的事故（148 角色重扫抹掉月霜的人工归属）。现建立裁定集中制。

## 1. 正典裁定簿（必读）

路径：`mod-kit/generated/deepseek-v4-flash/character-canon/CANON-DECISIONS.md`

- 只收**人工拍板且至今有效**的裁定（角色 / 世界观 / 工程纪律三节），每条带执法方式 + commit 溯源
- **修改 canon 数据（mod-kit/generated/**）或核心 prompt（src/modules/scenarioMods/storyContext.ts 等）之前必须先读它**
- **追加式**：不删行；裁定被推翻时原行标 ~~作废~~ 并新增一行引用旧编号
- **用户拍板了新裁定 → 在同一个 commit 里追加进簿**（每个 agent 的义务）

## 2. 人工权威保护集（不得覆盖）

带以下标记的字段是人工裁定，**任何扫描/富化/重构脚本不得覆盖**：

- `AFF_PROTECTED`（32 人归属）/ `AGE_PROTECTED`（年龄）/ `DEBUT_PROTECTED`（登场信息）——定义在各 apply-*.mjs 脚本里
- `USER_CANON` 地点（太泉古阵/长安/苍澜镇 的 region 与风貌）——定义在 apply-location-fengmao.mjs

确需改动：先在裁定簿追加解锁条目，再动手。

## 3. 提交纪律

- 改 canon 后必须 `npm run canon:build` 全绿（37 关校验 + 92 node tests）才可 commit
- **核心文档权威=工作目录**；本簿与本简报已豁免 gitignore 纳入 git（版本历史在仓库里）
- NAS `/Volumes/botsvault/06_material/XianTu-Mod-Kit/DeepSeek-V4-Flash/character-canon/` 仅为用户阅览镜像：**单向 rsync 工作目录→NAS**，改动后同步一次；不得反向拉取、不得直接在 NAS 上编辑
- repo 根 `AGENTS.md` / `CLAUDE.md`（同内容）是本制度的入口精简版

## 4. 规划中（用户尚未拍板，勿自行实施）

第二层机器执法：`human-authority.json` 锁定字段清单 + canon:build 第 38 关校验器——锁定字段被改则构建红灯。批准后由发起方实现，届时各脚本的保护集改为从该清单读取（单一事实源）。
