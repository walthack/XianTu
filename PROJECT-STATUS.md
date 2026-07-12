# 仙途 (XianTu) · 项目总体状况与并行分工文档

> 面向「新加入的 agent」。读完这一篇即可独立认领一个模块开工。
> 最后更新：2026-07-12。基线 git：`d6a3323`（分支 `feat/builtin-scenario-templates` 系一脉；自 `bceaf66` 起 +197 commit）。

> **多 agent 协作基线（用户裁定）**：本文件是本项目的共享进度、分工、交付与 Git 汇总权威；开始认领、完成交付或改变阶段状态时先读后更新。根目录 `CHANGELOG.md` 属原 repo 历史，不记录本协作线的状态。

---

## 0. 一句话

把三部「六朝」修真小说（清羽记 / 云龙吟 / 燕歌行）改造成一个可玩的 AI 修真文字游戏的**剧本 Mod 套件**：从小说原文抽取 → 生成 18 个关卡 Mod（地图/角色/关系/物品/事件/势力）→ 内置进 Webpack 应用 → 在测试服跑。当前主轴、人物、地图、关系、if 分支地基都已成型；运行时**默认线正典轨道（Canon Rail）+ 可见行动判定引擎 + 事件对账死锁自愈**三大系统已落地，续写**结局蓝图 v2** 已定稿为真值源。仍在推进：**数据深度补全 + if 线扩量 + 立绘 + 续写 canon 回填**。

---

## 1. 环境与路径（**必读，最容易踩坑**）

| 用途 | 路径 |
|---|---|
| **真实工作目录**（有 mod-kit/、.env、生成内容） | `/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu` |
| ⚠️ 旧 checkout（**没有** mod-kit，别在这干活） | `/Users/clawbot/Projects/XianTu` |
| 生成内容根 | `mod-kit/generated/deepseek-v4-flash/`（`qingyu/ yunlong/ yange/ shared-atlas/ character-canon/`）|
| 脚本（167 个 .mjs） | `scripts/` |
| 核心文档 roadmap | `mod-kit/generated/deepseek-v4-flash/character-canon/CORE-DOCS-ROADMAP.md` |
| **正典裁定簿（改 canon/prompt 前必读）** | `…/character-canon/CANON-DECISIONS.md`（89 条人工裁定 + 执法标记）|
| 续写总纲 / 剧透血缘密档 | `…/character-canon/ENDING-BLUEPRINT.md` v2（真值源）+ `RELATIONSHIPS-SECRET.md`（关系密档层，裁定 #89）|
| 默认线正典轨道设计 | `…/character-canon/DEFAULT-CANON-RAIL-DESIGN.md` |
| 对外发布 roadmap（发布门禁/发布后深耕） | `RELEASE-ROADMAP.md`（仓库根，2026-07-07 立档） |
| NAS Mod Kit（同步目标） | `/Volumes/botsvault/06_material/XianTu-Mod-Kit/` |
| NAS 成品区（18 个可导入 Mod） | `…/XianTu-Mod-Kit/完善版剧本Mod/{六朝清羽记,云龙吟,燕歌行}/` |
| 三本小说原文（抽取源） | `/Volumes/botsvault/06_material/{A-六朝清羽记, B- 六朝云龙吟, C-六朝燕歌行}.epub` |
| 人物卡（权威设定源） | `…/06_material/{六朝清羽记,六朝燕歌行}-人物卡.md`（云龙吟无卡）|

**书名映射**：qingyu=六朝清羽记=`lcq.`，yunlong=六朝云龙吟=`lyl.`，yange=六朝燕歌行=`lyg.`（角色统一 id 前缀已迁到 `liuchao.character.<slug>`）。

**Shell 注意**：每次 Bash 调用 cwd 会重置回 `~/Projects/XianTu`。必须每条命令内联 `cd /Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu && …`。

**LLM 抽取层**：DeepSeek-V4-Flash over OpenRouter（`.env` 里 `OPENROUTER_API_KEY`）。露骨章节框定法 = system 声明「成人向小说参考背景，仅提取游戏机制、中性临床措辞、勿复述露骨」即可正常返回（否则返空）。HTTP header 必须 ASCII（X-Title 不能含中文）。

**测试服**：`192.168.50.51:8091`，是 **macOS LaunchAgent 常驻**（`com.xiantu.devserver`），**不要**用 Bash `run_in_background` 起。
- 重启/强制重打包内置 mod：`launchctl kickstart -k gui/$(id -u)/com.xiantu.devserver`
- 日志：`~/Library/Logs/xiantu-devserver.log`
- 用户访问机：Windows ROG-SIN（`192.168.50.4`，`ssh kan@`，密钥认证）；存档/模板库在该机 Chrome 的 IndexedDB。游戏内 bug 优先用 **Chrome MCP** 连过去读 Pinia gameState / IndexedDB / Pixi 调试。

---

## 2. 架构：三层数据 + 一个应用

### 2.1 三层数据架构（用户定的项目方向，推进强制顺序 ①→②③）

```
① 严格剧本走向（canon 真值）   ← 地基。线性主轴 story-timeline(1034节点) + 18关卡对齐
        │
        ├── ② if 线 / 分支       「假如…从某锚点岔出」，可永久分叉或回流脊柱
        │
        └── ③ 未来拓展           相对锚点新增内容（续写 canon / 锚点间填空）
```

- **承重脊柱**（`{book}.story-spines.json`，status:final）= 与剧情同级的不变量。三本各定稿，kind 分 invariant/throughline/arc/bridge。好 if 线必须**敢翻枢纽事实**（死亡/胜负），否则只是花絮；翻完常被脊柱重新吸住。
- **主轴 axisId 软绑定**：`event.id` 冻结 append-only = 存档键；`axisId` 是软元数据。主轴改版只 regen-binding，存档不坏（见 `AXIS-INTEGRATION-PLAN.md`）。

### 2.2 数据管线（小说 → 关卡 Mod）

```
epub 原文
  → extraction/batch-*.json      （事件/角色状态/contentFacts/relationships）
  → stage-plan.json              （每关 sourceStart/EndIndex 范围）
  → stages/*.json  ×18           （scenario mod：map/characters/relationships/items/events/factions/contentAccess）
  → character-canon/             （LLM 抽取的 appearance/personality/constraints/cards）
```

18 关卡 Mod 每个自包含、可单独导入游戏 `/scenario-mods`。角色丰富度靠一串确定性脚本叠加投影（外貌/性格/六司/灵根/境界/技能/物品/约束/关系/势力关系），全部「补空不覆盖」+ 时间门控（晚期内容不进早期关卡），每步备份 `{book}/stages-pre-*-backup/`。

### 2.3 应用（**关键：Webpack 不是 Vite**）

- `src/env.d.ts` 引 webpack-env；ts-loader/vue-loader；`build = webpack --mode production`。内置聚合用 `require.context`，**不能**用 `import.meta.glob`。
- 18 个成品 Mod 已**内置**进 app（`src/modules/scenarioMods/builtins/`），启动播种进库（默认 `enabled:false`），用户无需手动导入。
- npm pre-hook（`prebuild`/`preserve`/`prewatch` 等）每次构建自动跑 `sync-builtin-mods.mjs` 从 mod-kit 重新打包最新 mod —— **改完 mod 下次 build/serve 自动生效**。
- 内置库自愈：`BUILTIN_VERSION = manifest内容哈希 + 播种逻辑后缀(.sN)`；改播种逻辑或要强制全库对账时 bump 后缀。
- **行动门控（二层失败惯性）**：应用侧轻量机制，存档路径 `系统.扩展.行动门控.recent`。失败/部分成功/被阻断且会影响后续尝试时，AI 通过 `tavern_commands` 写入门控；下一轮 prompt 注入活跃门控，要求承接失败后果、提高难度/要求新筹码或新路线，并避免 `action_options` 原样推荐刚失败动作。实现文件：`src/utils/actionGate.ts` + `src/utils/AIBidirectionalSystem.ts` prompt 注入/过期清理 + `businessRules.ts`/`actionOptions.ts` 规则。**不拦自由输入，不做高级分支状态机，不触碰 Mod 数据管线**。

---

## 3. 进度总览

> **前瞻计划以 `RELEASE-ROADMAP.md` 为权威**（发布门禁 R0–R2 + 发布后深耕 R3：续写 canon＝`ENDING-BLUEPRINT.md` v2、关系密档知情注入引擎、立绘、细粒度打磨等）。本节只记**当前快照**；「计划要落的部分」看 roadmap，别在这重复维护。

### ✅ 已完成（已构建 + 同步 NAS + 多数已 git 提交）

| 区块 | 状态 |
|---|---|
| 核心文档（地图/主轴/人物/别名/势力档案/图鉴/关系网络/主轴对齐） | ✅ |
| 18 关卡 Mod 全字段补全（外貌/性格/六司/灵根/境界/技能/物品/约束/关系/势力关系/品质数值） | ✅ |
| 原版品质系统兼容（24 品级→神仙天地玄黄凡）+ 物品/功法机制数值 | ✅ |
| 故事主轴 1034 节点 + 锚点 + axisId 软绑定 + 18 关对齐 | ✅ |
| 三本承重脊柱定稿（story-spines.json，GPT 二审精修） | ✅ |
| 内置剧情模板 + 自愈播种 | ✅ |
| 世界地图铺满全大陆地点（5→40+/关）+ 主角标记修复 | ✅ |
| 提示词六朝化（prompts_all）+ 主要女角外貌成年化（去幼态） | ✅ |
| 主要角色性格重做（统一一套 + 人物卡权威源）+ 关系缺失修复 | ✅ |
| if 线系统：schema v3 + 校验器 + 三本共 **14 条** 分支（qingyu4/yunlong5/yange5，覆盖四模式） | ✅ |
| 头像数据地基（schema/validator/运行时透传）+ EPUB 官方插图抽取 96 张 | ✅ |
| 时间节点违规清理（D4）、别名清理（D1）、势力 id 归一（D6） | ✅ |
| 行动门控（二层失败惯性）：失败后结构化记录场景惯性，下一轮不把同一动作当无后果重开 | ✅ |
| 局域网云存档：人物列表、当前存档、存档数据、剧本 Mod 库通过 `/api/v1/save-storage` 同步，成功保存有用户提示 | ✅ |
| 云端 API / 提示词配置：API 管理支持上传覆盖云端，提示词自定义项可跨设备同步，无需登录验证 | ✅ |
| **正典裁定簿 CANON-DECISIONS**（89 条人工裁定中央执法簿 + 溯源/执法标记，改 canon 前必读） | ✅ |
| **默认线正典轨道 Canon Rail**（未选 if 时沿原著主轴，确定性生成器接入 + 空轴/冲突硬门禁 + 冲突关隔离待复核，裁定 #58-65） | ✅ |
| **事件对账 + 主线死锁自愈**（哨兵触发/记忆窗口封顶/内嵌 think 剥离/bigram 证据接地，真机验收） | ✅ |
| **可见行动判定引擎 P0-P5**（本地确定性判定·预检·结算·行动余波·UI 回执，LLM 不重骰，裁定 #66-75） | ✅ |
| **Canon Rail 存档修复边界**（重置叙事/锚点时保留玩家关系标签、好感、关系卡记忆与 NPC 关系矩阵；`33333` 已从修复前备份回填关系状态，`c1c3892`） | ✅ |
| 主线 UI：objective 任务目标（37关205事件）+ 当前一拍显示 + 主/支线金色/灰色视觉区分 | ✅ |
| **续写结局蓝图 v2**（真值源，三幕脊椎 + 六国收束 + 终战=对抗策展系统）+ 剧透血缘关系密档层（裁定 #80-89） | ✅ |
| 角色 RAG 向量检索 + 内置瘦身（省 ~25%）；势力富化去重 66→58；BGM 音乐引擎 | ✅ |
| 单测 76 → **186 全绿** | ✅ |

### 🔥 进行中 / 待落地

- **qingyu 全本重抽**（`scripts/reextract-qingyu.mjs`）—— 第一本 extraction 早期质量最弱，major 密度 0.63/章 vs 后两本 1.26/1.95，存在欠产 batch（水战弧 10 章 0 事件等）。重抽预期 major 185→~350。⚠️ **这是地基级改动**：完成后 qingyu 主轴段重建 → seq 重编号 → 需重映射脊柱锚点 + if 线样章 anchor。**未落库**（产 `qingyu.reextract.DRAFT.json` 不覆盖现版）。
- **if 线收尾**：validate-if-branches 接进门禁 runner；用户后审 14 条内容；if schema 接 `attitudeToProtagonist`。
- **态度建模全本跑**：qingyu 试点通过；待扩 yunlong+yange（~15 条处子/破身约束），低置信标人工核。

### 📋 列入「未来功能」

- 立绘 E-M2/M3/M4（上传存储 / 展示区 / AI 自动生成）。
- 燕歌行后续续写全新 canon（最大未来项，见 §5-F）。

### 🚫 已决定不修 / 待定

- D5 yange extraction 索引错位（纯展示位偏移，标记不修）。
- D2 阮香琳/蛇夫人/蛇奴 拆分、D3 尹馥兰/兰姑（身份层遗留，原文证据不足待人工裁定）。
- 6 条约束破戒后果需原文确认（碧奴/林娘子/虞紫薇/白仙儿/襄城君/孙寿）。

---

## 4. 验证门禁（任何模块改完都必须过）

在真实工作目录跑：

```bash
npm run type-check          # TS 类型
npm test                    # 单测（当前 186 用例，全绿）
npm run mod:validate        # 18 关卡 Mod 校验，必须 18/18 PASS
node scripts/validate-shared-scenario-atlas.mjs   # 共享 atlas（exit 0）
node scripts/validate-if-branches.mjs             # if 线（若动到 if/spine）
```

改完 mod 数据后：`node scripts/sync-builtin-mods.mjs` → 同步 NAS `完善版剧本Mod/` → `launchctl kickstart -k …` 重启服。
- 「补漏不重做」是铁律：脚本一律 union/补空不覆盖、晚期内容时间门控、每步落 `stages-pre-*-backup/`。
- 已存档不回溯，UI/坐标类变更需新开局验证。

---

## 5. 并行分工：可独立认领的模块

> 下面每个模块尽量**互不冲突**（动的文件集分开）。**唯一全局耦合点 = qingyu 全本重抽**（模块 B）会位移 qingyu 的 seq/锚点 —— 所有依赖 qingyu 主轴 seq 的工作（if 线锚点、主轴对齐）应在 B 落库前后协调，别同时改 qingyu 锚点。

### A. 角色数据深度补全 ⭐ 推荐首选，独立性最高
- **缺口**：~130 次要角色 `description` 未小说化；~20 男性外貌薄/无；多数角色 `memories` 仅 qingyu 8 人有；per-stage `currentAppearance`/`currentThought` 多缺。
- **可干**：扩 `regenerate-main-descriptions.mjs` / `extract-appearance-from-epub.mjs` 覆盖到次要角色；补 memories。
- **冲突面**：改的是各关 `canon.characters[].profile` 字段（补空不覆盖），不动主轴/if 线 → 与 C/D/E 并行安全。
- **铁律**：性格优先级 = 用户 OVERRIDES > 人物卡 > 原文抽取；**别拿 description blurb 当性格源**（会加暗黑滤镜）。改人设改 `consolidate-personality-drafts.mjs` 的 OVERRIDES。

### B. qingyu 全本重抽（地基，需协调）
- 跑 `reextract-qingyu.mjs` → 重建 qingyu 主轴段 → seq 重编号 → `reanchor-spines.mjs` / `reanchor-if-branches.mjs` 重映射锚点。
- **认领者必须独占 qingyu 主轴/锚点**，完成前通知其他模块暂停动 qingyu seq。后两本 yunlong/yange 不受影响。

### C. if 线 / 分支系统
- 14 条已成型（qingyu4/yunlong5/yange5；`if-branches-sample/` + `character-canon/{book}.if-branches.json`）。
- **可干**：把 `validate-if-branches.mjs` 接进门禁 runner；if schema 接 `attitudeToProtagonist`（翻转处子/破身时态度同步翻）；性别置换轴（genderswap，纯沙盒 if 层永不进 canon，样章已起 `qingyu.if-genderswap.SAMPLE.json`）；云龙/燕歌各再扩几条。
- **冲突面**：动 `if-branches/` + spine + schema，不动关卡 mod profile → 与 A 并行安全；但 anchor 依赖 qingyu seq，需与 B 协调。

### D. 态度建模 + 约束体检收尾
- 扩 `model-attitude-from-epub.mjs` 跑 yunlong+yange（~15 条处子/破身约束）。
- 6 条约束破戒后果原文确认（`constraints-audit.md` 列表）。
- 产物入 `character-canon/*.character-constraints-draft.json` → 投影 profile.notes。与 A 共享角色文件，注意先后顺序（都补空不覆盖，错开角色集即可）。

### E. 立绘 / 头像
- 数据地基已在（schema/validator/运行时）。EPUB 官方插图已抽 96 张（`character-canon/portraits/`，覆盖 ~50 角色）—— **有官图直接用，没官图的才生成**。
- **可干**：E-M2 上传/存储（IndexedDB + `img:<key>` 解析）；E-M3 立绘展示区；E-M4 AI 生成（主力引擎 = GPT via Codex 免费但慢；付费快速 = grok/gemini-3-pro-image）。
- **内容红线**：未成年/孩童化角色拒绝任何性化立绘；外貌字段取 `*.appearance-draft.json` 的 `appearance`+`bodyFeatures`，**别取** `character-descriptions.json`（有损摘要丢身材）。`portrait-risk-audit.json`：113 SAFE / 10 HIGH。
- **冲突面**：app 前端（`src/`）+ portraits 数据，与 A/C/D（数据层）几乎不冲突。

### F. 燕歌行续写新 canon（最大未来项，**设计层已定稿**）
- **结局蓝图 v2 已定稿=真值源**（`character-canon/ENDING-BLUEPRINT.md`，裁定 #69/#80-89）：三幕脊椎（人→组织→系统逐幕升维）、六国收束、终战=对抗自动策展系统、岳氏全谱/续写"毕业生"终幕；剧透血缘已落**关系密档层**（`RELATIONSHIPS-SECRET.md`，方案 A，不进可见关系网）。启动钩子仍 = #1017 李辅国魂魄占郭氏躯体。
- **待执行**：141 个空 ending 回填 + if 顶层分岔锚点定义 + 新承重脊柱/新角色（canon 新造）/新地区（扩 shared-atlas）。
- **独立 milestone（未做）**：运行时"知情 NPC 主动行动"注入引擎（按知情图谱分层可见 / per-stage 解锁），把密档血缘受控注入给该知情的 NPC。
- **难点**：无原文可抽 → 须「多模型协同创作」；独立性高但工作量最大、需用户深度参与方向。

### G. 应用侧功能 / 游戏内渲染
- 势力对外关系（factionRelationships）数据已在 worldInfo，但**游戏 UI 可能未渲染** → 游戏侧 Vue 工作。
- 是 `src/` 前端范畴，与数据层并行安全。

---

## 6. 工作分工惯例（用户定的固定模式）

- **Claude 管概念/方向/质量护栏**（框架·原型·schema·防过度推断·防过度模糊）；**DeepSeek 管批量原文读取 + 逐角色细化**。
- DeepSeek 坑：大块露骨原文易被审核返空、综合型约束易误判 unsupported → 用「约束式分类」（锚定章节窗口 + 只要标签不要复述细节）规避。
- **人物卡 = 权威源**，别太歪（程宗扬曾被抽成"随和洒脱"，卡实为"务实/精明/有野心"）。
- 未经用户要求不擅自 git 提交、不擅自同步 NAS 成品区（草稿类先待审）。

---

## 7. 给新 agent 的最短上手路径

1. `cd` 进真实工作目录（§1），`git log --oneline -5` 确认在 `d6a3323` 一脉。
2. 读 `character-canon/CORE-DOCS-ROADMAP.md`（带 ✅ 的逐项进度）+ 本文 §5 选一个模块。
3. 跑一遍 §4 门禁确认基线绿。
4. 认领模块前，若涉及 qingyu 主轴/锚点，先与模块 B 认领者对齐。
5. 改完 → 门禁全过 → 同步内置/NAS → 重启服 → （必要时）Chrome MCP 连 Windows live 验证。
```
