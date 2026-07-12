# 仙途 · 对外发布 Roadmap

> 项目级"能不能发"的门禁清单 + 发布后深耕方向。2026-07-07 立档（Claude 评估，用户要求落盘）。
> 与 `character-canon/CORE-DOCS-ROADMAP.md`（内容管线 A~K 组）、`character-canon/TODO-待完成.md`（工作项）互补：那两份管内容质量，这份只管发布拦截与发布后的价值排序。
> 更新约定同 core-docs roadmap：完成一项把 `[ ]` 改 `[x]` 并补"产物/日期"。

## 总判断

项目现在缺的不是内容量（37 关、主轴覆盖 100%、角色/关系/物品/势力/音乐管线均已成型），而是**长局稳定性**和**发布形态**：一个外部玩家连续玩 20+ 轮后暴露的系统性问题（主线死锁、数据脱节、存档被绕写坏），才是对外发布的真门槛。

## R0 · 待拍板（决定 R2 优先级）

- [ ] **发布对象定义**：小圈子内测（朋友/社区）还是公开发布？
  - 内测 → R1 修完即可发，API 配置手把手教即可。
  - 公开 → R1-3 合规终审升格为最高优先；且原作为成人向小说，发行渠道与年龄门槛需先想清楚。
  - 建议：先内测。十个外部玩家一周暴露的边角案例，比自查三轮更多。

## R1 · 发布 blocker（不修就是"玩一晚上必坏"）

- [x] **R1-1 主线死锁软完成 / 主线对齐叙事**（✅ 2026-07-07 深夜落地，commit `ea65eb1`+`a7476bf`）
  实现＝事件对账 `eventReconcileService`：哨兵触发式（stallTurns≥10、每 5 轮重试，非每轮），LLM 核对存档记忆（长3+中10+短4）输出 **done（已实质发生，含玩家等价路径）/void（前提被玩家叙事消解，机械放行）/pending**；确定性 validator 护栏（连续前缀防跳序/evidence 逐字接地/void 0.85>done 0.75/单次上限5/宁 pending）；落 flag 当轮 advance 即推进、stall 清零。usageType `event_reconcile` 默认开（稀有触发成本近零，面板可关）。**Codex 整环审判定"闭环条件闭合、无 blocking、可落地"**。两死锁存档（stall 16/23，含"谢艺该死却被玩家救活永卡链"分岔案例）已手动处置并写成端到端测试。
  残余 backlog（非阻塞，见记忆 `xiantu-steering-cooldown-wip`）：evidence 只验接地不验语义相关性；持续主动偏移推迟对账；"走回主线途中"stall 不清零仍会催。
- [~] **R1-2 steering-cooldown 收尾**（2026-07-07 全部完成）
  - [x] 第一批 回主线引子重做 + 偏移冷却，**判定完全交乙**（关键词甲经 Codex 五轮复审证明追不上自然语言的否定/复合/语义 → 砍甲；冷却字段挪进 runtime 保护区 canonGuard+commandValidator 双拦）。产物 commit `2bcc7fc`，落 `feat/builtin-scenario-templates`（此 repo 用 feature 分支工作流、非 master；临时 `feat/steering-cooldown` 已 ff-merge 回原线并删）。
  - [x] 第二批 objective：205 个 critical 事件（37 关中 19 关含关键事件）补 `objective`（玩家视角+地点+不剧透，DeepSeek-V4-Flash 按关批量生成）→ RightSidebar 主线渲染 + steeringLine 引子共用；`sync-builtin-mods` 传导进内置 mod；当前存档单档注入。产物 commit `d047139`。**范围/模型已拍板=全 37 关 / DeepSeek-V4-Flash**。
  - [x] 脱节哨兵：stallTurns≥10 UI 预警（零成本确定性、默认开、只提示不改数据）。产物 commit `3cf81b5`。
  - [x] 事件对账 → 已落地，见 R1-1（独立模块 `eventReconcileService` 而非 progress_audit 三段输出——保 progress_audit"绝不碰 flag"契约；默认开+哨兵触发替代了原"opt-in 默认关"方案）。
  - [x] objective 补 17 关 126 事件（生成脚本对齐引擎 critical 兜底判定，commit `f65600a`，全库 331 事件全覆盖）。
  "不知道主线往哪走"是新玩家前 30 分钟的劝退项，与 R1-1 同属一条体验主线。
- [ ] **R1-3 内容合规终审**（红线，出一次事故项目就没了）
  - [ ] `character-canon/portraits/_review_minor/` 隔离图确认不进任何发布包。
  - [ ] 幼态/未成年标记角色去性化 remediation 全量复查（不只主要女角；risk-audit HIGH 名单 10 人逐一过）。
  - [ ] 脱敏后文本走向抽查（走向/机制保留、无直白露骨泄漏进正文 prompt）。

## R2 · 发布前应修（不修也能发，但会立刻收到差评）

- [ ] **R2-1 发布形态与 API 配置 onboarding**
  用户自带 key（OpenRouter/MiniMax）：首次配置引导、key 无效/额度耗尽的明确报错与降级；修"API 配置自动上传 fire-and-forget 悄悄丢"的可靠性问题（见记忆 `xiantu-config-sync`）。
- [ ] **R2-2 存档校验大洞**（已被标记为独立 milestone，见 steering WIP 记忆）
  skeleton 保护模式 + AI 存档修复（characterStore.executeTavernCommands）可绕过所有校验写任意字段（含剧本 flag）。至少把最危险路径（世界.状态.剧本模组）堵上；canonGuard + commandValidator 纵深已给 steeringCooldown 打了样。
- [ ] **R2-3 主轴/存档契约冻结**
  发布后再动主轴 seq/事件 id，老玩家存档兼容会很痛。event.id append-only 契约已在；发布前确认无 pending 的主轴重排（qingyu 重抽若仍有未合入产物，定稿或明确弃用），之后主轴改动只走 regen-binding。
- [ ] **R2-4 新玩家首小时**
  切关仪式感 + 战役编年史（已批设计，见 CORE-DOCS-ROADMAP"已批待做"节）建议赶发布车——它同时解决"我在哪/我完成了什么"的定向问题；开局创建角色→选剧本→第一关引导流程完整跑一遍外部视角审。

## R2.5 · steering/objective 闭环残余（非阻塞，实测中收集）

- [ ] **对账 evidence 只验接地、不验语义相关性**（Codex 整环审 PLAUSIBLE）：LLM 可摘"真实但与该事件无关"的原文片段绕过接地检查 → 误判 done/void。加固：evidence 附 why/matched_core，validator 校验 evidence 与事件 name/axisBeat 关键词交集，或二次判定。
- [x] ~~objective 相邻事件近义重复~~ → 已由 UI"只显示当前一拍"(commit `868eeae`)稀释：一次只亮 axisSeq 最前的当前目标 + "后续 N 个节点"，永不并列显示相邻近义拍。（根因是关卡事件无顺序门控、整关一次性全 active 被剁碎铺出；试过改生成 prompt 强化"地点+去重"→不收敛、反把 s07_02 的"清远"弄丢，已撤销。结论：文案精修边际递减，结构上"一次一条"才是解。）objective 单条文案参差（对话/揭示类天生无地点）仍在，但一次一条后不扎眼。
- [ ] **"走回主线途中"stall 不清零仍会催**：系统分不清"无视主线"与"正执行主线未完成"。objective 化后引子内容=正在做的事，烦度已降；实测若仍疲劳，解耦"引子静默"与"stall 累加"（乙判"正执行路标"→只静默引子不暂停 stall，不影响对账触发）。
- [ ] **持续主动偏移会推迟对账**（尊重自由探索的代价）：若实测乙误判偏移多，加"stall 已很高时冷却只静默引子、不暂停对账"。
- ⚠️ **工程纪律**（自省，2026-07-08）：手改磁盘存档 `.xiantu-server/save-storage/*.json` 在游戏运行时**无效**——每次自动存档用内存状态覆盖磁盘。载入路径已验证＝后端优先(8091代理→后端读该目录)+IDB兜底。要注入存档必须游戏退出/不自动存档时做，或走游戏内正常通道（对账模块就是对的做法）。关键路径先验证再断言，勿吃记忆老本。

## R3 · 发布后深耕（价值排序）

1. [ ] **枢纽事件演出密度**：高光节点专属立绘构图 + BGM mood（musicEngine 加"正典高光"类）+ 半预制核心文本，AI 日常段落与精雕枢纽段落形成节奏对比。投入产出比最高的表现力升级，不动架构。
2. [ ] **续写缺失的后续篇章**（if 线待办已重定目标为大纲级续写，见记忆 `xiantu-ifline-design` 顶部 2026-07-04 重定）。
3. [ ] **燕歌行续作 canon（第③层）+ 世界暗线揭盅**：以 **`character-canon/ENDING-BLUEPRINT.md` v2 为真值源**（三幕脊椎 人→组织→系统、终战=对抗自动策展系统、岳氏全谱、"毕业生"终幕；裁定 #69/#80-89）。落地项＝141 个空 ending 回填 + if 顶层分岔锚点定义 + #1017 李辅国借尸钩子 + 试验场假说揭盅（`WORLD-暗线-试验场假说.md`）+ 新脊柱/新角色/新地区。管线需从"epub 抽取"换成"多模型协同创作"，单独立项。
   - [ ] **关系密档知情注入引擎（B/C，独立 milestone）**：把 `character-canon/RELATIONSHIPS-SECRET.md` 的剧透血缘（岳氏父女谱/碧姬=西施/林妙仙身体本主等；裁定 #89 密档层方案 A 已落，边不进可见关系网）按**知情图谱分层可见**（B）或 **per-stage 解锁**（C）受控注入给该知情的 NPC——让"该知道的 NPC 才知道、不知情者问答不泄底"。升级为运行时可见须过 18-mod validator 引用解析。参照小紫弑母 per-stage 快照先例 + 生死根机密 prompt 规则（裁定 #12）。
4. [ ] **立绘补全**（E-M2~M4）：96 张官方图已覆盖主要角色；余量等额度恢复后按 SAFE 名单慢铺（内容红线见记忆 `xiantu-portrait-pipeline`）。
5. [ ] **细粒度打磨**：态度建模全本跑（yunlong/yange ~15 条）、好感分阶段化、faction 对外关系 UI 渲染、次要角色 description 小说化余量、63 归属审计裁定、性转沙盒 if 模式。

## 修订记录

- 2026-07-07 立档。注意两处早期评估口径已过时并在此修正：关卡覆盖为 **37 关 / 主轴 100%**（非 18 关/32%，那是 06 月底状态）；"补主轴 #80-185 盲区"已被覆盖收口取代。
- 2026-07-07 更新 R1-2：第一批（回主线引子重做 + 偏移冷却，Codex 五轮复审后砍关键词甲、判定完全交乙）、objective（205 个 critical 事件玩家视角目标，DeepSeek-V4-Flash 全 37 关）、脱节哨兵 三项完成，落 `feat/builtin-scenario-templates`（commit `2bcc7fc`/`d047139`/`3cf81b5`）。事件对账暂缓，并入 R1-1 主线对齐大工程（落 flag 严护栏 + Codex 多轮审）。分支口径修正：此 repo 用 feature 分支工作流、非 master 直开发。
- 2026-07-07 深夜 **R1-1 完成**：用户点破"自由探索/软提醒/不卡死本是连贯闭环"→ 同晚落地事件对账（`ea65eb1`）+ objective 补 17 关（`f65600a`）+ 整环审收尾（`a7476bf`）。Codex 整环审（非逐 diff）判定闭环条件闭合、无 blocking。R1 仅剩 R1-3 合规终审。
- 2026-07-12 R3-3 扩写：续作 canon 挂真值源 `ENDING-BLUEPRINT.md` v2（结局蓝图定稿 + 裁定 #80-89）；新增子项**关系密档知情注入引擎（B/C）**——本次会话落了关系补边密档层（方案 A，`RELATIONSHIPS-SECRET.md`，裁定 #89），运行时按知情图谱/进度注入是其下一步独立 milestone。
