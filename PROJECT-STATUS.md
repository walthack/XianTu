# 仙途 (XianTu) · 项目总体状况与并行分工文档

> 面向「新加入的 agent」。读完这一篇即可独立认领一个模块开工。
> **当前认领：P0-1 已复现并修代码，Claude 路1 二审 GO-WITH-CHANGES 后已按 P0 补测试与 store 回滚。** owner=Grok 4.6。起始 HEAD=`a6a2dc4`。未 commit。空命令 post-loop 用 `abortAfter(2)`，辅助等待后用 `abortAfter(3)`，均按 `abortReason` 断言闸口。`processGmResponse` 返回 `aborted/abortReason`；外层只在 `aborted` 时跳过 commit，成功路径即使随后 abort 也不拆已提交事务。store 写入前再查 abort，写入后若 abort 则 `loadFromSaveData(原档)`。证据：`tests/processGmResponseAbortAtomicity.test.mjs` **6/6**、`npm run type-check`、`git diff --check`。下一位：Claude 可复验；不要替本实现签核。
> 当前没有已确认的项目级 P0 缺陷；P0 队列只含本项“先复现再裁定”，以及正式发测前的清羽开局→白湖脱身连续试玩门。五原玩法闭环与 `world_sim` G2 为 P1。Fast Demo 已阶段性收尾并保持默认关闭，`editionPack` 暂停。
>
> ### 2026-08-23：当前 P 级队列已重排，准备移交其他 agent
> · 当前唯一认领入口=`docs/CURRENT-P-LEVEL-HANDOFF-2026-08-23.md`。分级口径改为：P0 只收已确认的存档／主线破坏与发测硬门；静态怀疑必须先复现，不能直接触发架构重写。旧 `R3-10-BACKLOG`、本文 §5 和 `TODO.md` 的历史优先级不再作为当前排序权威。
> · P0-1＝`processGmResponse` 取消原子性反例，先测后修；P0-2＝默认主路清羽开局至白湖脱身的连续真机与读档门。P1-1＝复用现有移动地基补完五原 30–40 回合玩法循环；P1-2＝三书抽样的 `world_sim` G2。P2 不抢占前两级，Fast 补背包争议仅在准备默认开启前专项评估。
> · 用户最新固定分工：Grok 负责主要代码实现与聚焦测试，Claude 负责独立只读／真机核验，Codex 负责方向、范围合同、canon／知识边界、补丁审核和最终验收。当前未创建或派发任何 agent 任务，等待下一位按编号认领。
>
> ### 2026-08-23：Batch B 二审后阶段性收尾；旧版叙事补背包机制转专项待办
> · Claude 只读二审 job=`claude-2026-08-23T13-35-46-372Z-db02aa03` 检查提交 `82d6b1c`，确认默认关闭、取消／超时安全、三类生产枚举与结算、白湖边界、知识投影和单请求性能合同成立；同时指出 Fast 正文仍会进入既有 `reconcileNarratedInventoryPossessions`，模型描写的物件可能被旧版机制持久化进正式背包。
> · 经产品校准，这不等于“正文不得补出玉佩、短刀等合理现场物件”，也不立即按项目级 P0 追修。真正待评估的是旧版“叙事事实自动补账”本身在玩家自由输入、遗漏命令兜底与持久世界真值之间是否仍有净收益，以及 Fast／Legacy 是否应采用不同来源策略。禁止用扩大禁词或整段拦截的方式牺牲合理探索。
> · 该项已登记 `TODO.md`，优先级为“Fast 默认开启或替换主路之前必须评定”，当前不修改运行时代码。Batch B 保持 **IMPLEMENTED / EXPERIMENT DEFAULT-OFF / PHASE CLOSED**；自动门禁证据仍为聚焦 **27/27**、完整 `canon:build` **836 / 831 pass / 0 fail / 5 skip**。下一轮若恢复，应先评定叙事补账机制，再决定是否补真机全线／速度验收。
>
> ### 2026-08-23：清羽速度 Demo 自由叙事 Batch B 实现记录（历史阶段）
> · Grok 4.6 按窄批次完成主体，Codex 审核并收口：快速 `RenderPacket` 已从 R3 判定扩到清羽隔离档真实 `eventAction`、王哲锦囊 `opportunityAction` 与五原 `openWorldAction`；范围止于 `lcq.event.baihu_shangguan_escape`，该事件完成后全快路 fail closed，后续武二郎／铁索桥／南路／蛇彝村不覆盖。
> · 所有选择必须与生产枚举出的 fresh selection 全字段一致；planner 只在 clone 预演本地结算，正式状态仍由既有 `processGmResponse` 事务写入。普通事件不得借王哲之名发锦囊；只有机会步骤的真实 inventory receipt 可投影 `获得1×锦囊`。显式传入 pending、stale 或篡改 judgement 时，即使 selection 合法也关闭快路。
> · 短 prompt 只含当前动作、通用本地结果、精确 settled facts、公开场景及“现场且已揭示”人物的安全 personality 标签（最多 3 人×3 条）；`currentThought/currentAppearance/memories/notes`、未揭示／不在场人物与带秘密、知识、身份、记忆、计划等标签不投影。模型仍可自由写合理现场细节；凭空持久物／能力、未结算玩家伤势、明确新死亡／关系终态、内部 ID、越界人物与事件完成声明走 deterministic fallback，同时保留尸体旧血、生死根感应死亡气息、险些被杀与假设关系后果等合法描写。
> · 性能合同未变：页面当前 provider/model/temperature、1 chat、0 embedding/RAG/Step2/rewrite/retry、`max_tokens=1024`、35s deadline，开关默认关闭。聚焦 **27/27**、`npm run type-check`、`git diff --check` 全绿；完整 `canon:build` **836 / 831 pass / 0 fail / 5 skip**，未改 canon、核心 prompt、内置事件 JSON、正式存档合同或 API 配置。
> · Grok 主要落盘会话：B1a=`01a02eb3-c43b-7a01-b766-285220279c70`、B1b=`01a02eb8-e444-7310-91f1-4b783fada322`、B1c=`01a02ebe-b8c5-7251-9376-0e0233f4c44f`、B2a=`01a02ec5-110e-7903-9fbe-a9726b2fb16d`、B2b=`01a02ec6-0522-75e1-a3e9-e4014cb172a5`、B2c=`01a02eca-4371-7af2-af8e-d57ad167d41b`、红线收口=`01a02ecf-5c32-7701-bc0c-e0a71657e1a1`／`01a02ed1-7aa8-78a0-97ac-09929a74e4b8`。本条完成时结论为 **IMPLEMENTED / NOT YET APPROVED**；后续二审与阶段收尾结论以上方最新条目和当前 P 级交接为准。
>
> ### 2026-08-23：清羽速度 Demo 自由叙事 Batch A 已完成（历史阶段）
> · Grok 4.6 完成主体改造，Codex 审核收口：R3 短刀事实由三种无玩法价值的位置细节收敛为 `source=nearby_battlefield_corpse + acquired:boolean + judgement receipt`。`perfect/great_success/success → acquired=true`，`partial/failure/critical_failure → false`；旧 `scene_held/on_ground/at_corpse` 状态只读兼容，短刀仍不进入正式背包、不改任务终态。
> · 固定 beat/style-code 运行时及测试已删除，恢复一次 `120–260` 字短 LLM 自由正文；合法正文直接显示，允许尸体、普通短刀、旧血迹、草叶等合理现场细节。只有与本地 acquired/outcome 冲突、凭空持久物品／能力、明确未结算玩家伤势、死亡／关系／事件完成、命令或内部 ID 等红线才 fallback。
> · 性能合同保持页面当前 provider/model/temperature，单次 chat、0 embedding/RAG/rewrite/retry、`max_tokens=1024`、35s deadline，开关默认关闭。聚焦 `19/19`、`npm run type-check`、`git diff --check` 与完整 `canon:build` **828 / 823 pass / 0 fail / 5 skip** 全绿；未改 canon、核心 prompt、内置事件 JSON、冻结 ID、正式存档合同或 API 配置。
> · 下一批只扩清羽 Demo marker 的既定路线：从实际首个可操作事件起，经 stage01/stage02 前段、赌局与白湖商馆，止于 `lcq.event.baihu_shangguan_escape`；更后的武二郎／铁索桥／南路／蛇彝村不在本 Demo。eventAction／judgement／局部行动仍由本地合同落账，LLM 只渲染已结算结果。完整自动门禁后再交 Claude 做只读反例审查与隔离真机全线／速度验收。
>
> ### 2026-08-23：清羽速度 Demo 正向 beat contract 架构已实现，待 Claude／真机批准
> **历史方案，已被上方自由叙事 Batch A 取代；保留本段仅用于追溯。**
> · 当前候选把模型从“事实正文作者”降为“风格码选择器”：模型只能返回 `pace/sensory/cadence/focus` 四个 allowlist 字段；六档掷骰结果、三种短刀现场终态、既有身体代价、动作／感官 beat 和最终中文正文全部由本地 canonical contract 构建。模型正文、JSON、命令、内部 ID、前后缀、空响应或注入都不会显示，只触发默认风格；重复 finalize 只匹配 raw，实际可见核心仍重新取自本地 renderer。
> · 普通风格 prompt 已由约 `2.48KB` 再降至实测 `593B`，不含人物名、连续性、任务目标、判定 ID、roll/total、effects、processBoundary 或内部事件信息；玩家行动被压成单行、截到 240 字并作为 JSON 字符串引用。调用合同暂冻结为页面当前 provider/model/temperature、1 chat、0 embedding、0 RAG、0 rewrite、0 retry、`max_tokens=1024`、35s deadline，便于把后续速度差异归因于架构。
> · Grok 分批实现会话：Batch A=`01a02e2f-3a03-7d40-88fa-3a2b02c5db35`，防篡改收口=`01a02e36-0530-7cf2-8463-f47b2b107f20`／`01a02e3a-5c21-72d3-988e-e4f264921348`，Batch B1/B2=`01a02e42-0bcb-7960-a945-364da8a85264`／`01a02e46-e291-7930-97e9-661c8bcf0c1b`，provenance 收口=`01a02e49-39f2-7d41-8f70-bcce0406cade`。Codex 独立复现并修复过“篡改 beat text 可显示”的 P0，最终聚焦 `18/18`；完整 `canon:build` 为 **834 / 829 pass / 0 fail / 5 skip**。Batch A 已提交 `dd1e500`；Batch B 尚待本次 clean commit、Claude 只读二审和隔离真机正例／反例／读档连续性／同模型速度证据。开关仍默认关闭，当前状态是 **IMPLEMENTED / NOT YET APPROVED**。
>
> ### 2026-08-23：清羽速度 Demo 博德式判定适配（Claude 二审与 P0/P1 收口完成）
> · 现有 R3“尸体短刀＋翻滚躲箭”已接成本地真实结算：最近战场尸体携带凡品短刀是有来源的 scene fact；`perfect/great_success/success → scene_held`，`partial → on_ground`，`failure/critical_failure → at_corpse`。scene fact、唯一现场位置和 action receipt 全部放在隔离 `系统.扩展.清羽记开局.adjudication`，绑定全局判定账的 `judgementId/actionHash/outcome`；重复 settlement 与同文案新 judgement 都不再产生第二次落账或重骰入口。
> · settlement 在 `resolvePendingJudgement` 后、第一次保存和 LLM 调用前执行；实验开关默认关闭时零写入。短刀任何结果都不进正式背包，不改 `lcq.event.s01_02` flags/completion/offscreen/任务 JSON；prompt 只投影短刀来源、已结算三终态和“当前事件终局不可由本轮改写”，不泄露段强必死。模型正文与终态冲突时整段走 deterministic fallback，并只追加一个对应终态 coda。取得后只有明确使用短刀的风险行动才得到 `source:item` 因子，marker 没有全局判定账对应回执时 fail closed。
> · Claude 只读二审 job=`claude-2026-08-23T07-40-07-528Z-9fb0da62` 结论为 **GO-WITH-CHANGES**：P0＝总开关关闭后既有 `scene_held` 仍会授予短刀因子；P1＝读取依赖只保留 20 条的全局 judgement `recent`，会让合法现场事实随游戏推进失效。Grok 会话 `01a02da2-0a10-7190-bcf8-84744c6e3a0c` 按窄合同实际完成补丁；Codex 复核后确认 P0 已补总开关，P1 改为写入时继续验证全局判定账、读取时验证覆盖 `judgementId/actionHash/outcome/location/sceneFact/turn` 的自包含完整性摘要及内部不变量。旧／缺摘要／篡改回执一律 fail closed，合法回执滚出 20 条窗口后仍连续。
> · 性能合同未变：同玩家 provider/model/temperature、1 chat / 0 embedding / 1024 tokens / 35s deadline / requestMaxRetries=0；未改 canon、核心 prompt、正式任务 JSON 或 API 配置。P0/P1 聚焦测试 `21/21` 与 `npm run type-check` 全绿；完整 `npm run canon:build` 为 **823 / 818 pass / 0 fail / 5 skip**，37 关 schema、人工裁定执法、主轴／存档合同全绿。真实页面三终态、续用短刀及同模型速度仍待 clean commit 后真机验收。实施合同位于 `.xiantu-server/bg3-style-demo-adaptation-20260823/IMPLEMENTATION-CONTRACT.md`。
>
> ## 最后更新：2026-08-23（**补记：本文档此前实质停在 08-17，其间 70 个提交未进档**）
>
> ### 2026-08-23：MiniMax 输出预算与 actorless core 真机复验
> · F70–F79 交错证明 `768` 对 MiniMax 不安全：768 组 3/5 因 `finish_reason=length` 截断并回退；3072 组 5/5 自然结束。F80–F89 再交错后，1024 组 5/5 自然结束，wall median `12.970s`；1536 组 5/5 自然结束，median `16.626s`。因此 Grok Phase 4 将默认关闭快路的调用级上限收敛为跨模型最低已测候选 `1024`，不修改玩家页面 API 配置。
> · 人工检查 F70–F92 发现旧门禁虽然保持存档零漂移，却仍允许模型给段强新增对白／动作／位置、给玩家新增伤口／衣损、虚构敌人数量距离和额外 loot。Grok Phase 5 改为“模型只写玩家当下动作／感官的非可信 core；段强在场与短刀终态由本地可信 coda 追加”，明显 NPC／敌人／伤势／数量越界直接回退，不发第二次 LLM。Codex 复核聚焦 `6/6`、`build:single`、`git diff --check` 全绿。
> · MiniMax 2.7 Highspeed 真机 F100–F109：wall median/min/P95/max=`16.037/12.219/20.739/21.081s`；TTFT=`13.100/9.301/17.766/18.052s`；10/10 HTTP 200、1 chat、0 embedding、实际 `max_tokens=1024`、零生成后状态漂移且短刀不入包。9/10 自然 stop，1/10 触顶回退；最终 8 份模型正文、2 份本地正文。
> · 质量结论仍为 **NO-GO**：新门已拦截明显 NPC 行动，但显示文本仍出现“陌生力量／额外收益”、第二支箭威胁闭合、新刀鞘／刃口／血渍属性、未落账钝痛等事实。速度架构成立，现有“自由散文 + 负面正则”还不足以保证玩家体验；下一轮须先决定更强的正向事实词表／本地 beat sheet 合同，不能继续无止境追加同义词正则。默认开关保持关闭，未提交 Git。
>
> ### 2026-08-23：Grok Phase 3 输出预算实验完成，额外收益未证明
> · 正确改用 Grok 4.6 `acceptEdits + 有工具 + 20 turns + streaming-json` 后，会话 `01a02c8f-4baf-7a33-b55e-ea24f6187d47` 正常读取、改写并自检；只把默认关闭快路的调用级输出预算 `3072→768`、表现目标 `250–500→180–280` 字，并更新聚焦测试。Codex 复核：聚焦 `5/5`、`build:single`、`git diff --check` 全绿。
> · F50–F59（全部 768）只有 2/10 完整模型正文，8/10 在约 35 秒空响应后走本地正文。为排除时段差异又交错跑 F60–F69：768 组 wall median `38.106s`、模型响应 0/5；3072 组 median `38.086s`、模型响应 1/5；两组 TTFT median 都为 `35.163s`。10/10 均为 1 chat / 0 embedding、零状态漂移、短刀不入包。
> · 当时结论：`768` 的额外提速为 **NOT PROVEN**，主导因素是 OpenRouter 上游未在 35 秒内返回响应体。后续 MiniMax 交错实测已证明 `768` 会截断，当前实验源码已改为 `1024`。产品运行时默认模型口径仍是玩家 API 配置所选的 **DeepSeek V4 Flash 或 MiniMax 2.7 Highspeed**。
>
> ### 2026-08-23：生成速度 Demo 第二阶段收束
> · 本地终态取代短刀释放同义词穷举；模型可自由写当下过程，但持久获得、非第二人称、NPC 未授权装备／伤势仍失败关闭。超时上限从诊断的 45s 收到 `35s`；服务错误／越界不二次请求，直接显示自然本地正文。
> · F30–F39：总耗时 median `25.770s`、P95/max `38.143s`；TTFT median `22.833s`、P95/max `35.172s`；10/10 为 1 chat / 0 embedding，10/10 零状态漂移且短刀不入包。相对 Legacy 总耗时 median 降低 `71.8%`（约 `3.55×`）。该批 5 份模型正文／5 份本地正文；人工复核追加拦截 1 条 NPC 暗示受伤文本。最终 NPC 短边界 prompt 后补跑 F40–F42，3/3 可读、零漂移。
> · 门禁：聚焦 `5/5`、`build:single` 全绿；完整 `canon:build` **813 / 808 pass / 0 fail / 5 skip**。没有改 canon、核心 prompt、存档 schema 或玩家 API 配置。Grok 第二阶段三次未形成交付物，已核实原因是 Codex 错用 `plan + 空工具 + 单轮 + plain` 的互相冲突参数，不是 Grok 模型或推理服务哑火；本次由 Codex 按原窄合同兜底集成。决策为单场景 Demo GO-WITH-CHANGES，默认开启／扩场景 NO-GO。详见 `docs/FAST-NARRATIVE-DEMO-BASELINE-AND-CONTRACT-2026-08-23.md`。
>
> ### 2026-08-23：生成速度窄 Demo 与正式 A/B 完成
> · Grok 完成主体架构／代码草案，Codex 负责接入、失败关闭、人物与未落账物品门禁及最终验证；Claude 首次 A/B 驱动未形成有效样本，第二次在执行前遇到额度上限，最终由 Codex 沿用隔离合同完成实测。未改 canon、冻结 ID、核心 prompt 或存档 schema；快路开关 `xiantu.fastNarrativeDemo.v1` 默认关闭。
> · 相同 `deepseek/deepseek-v4-flash-0731`、temperature `0.6`、相同 R3 输入下，Legacy L1–L3 总耗时 median `91.510s`（58.791–195.653），TTFT median `74.730s`；Fast 最终轮 F7–F9 总耗时 median `42.965s`（20.676–105.057），TTFT median `39.814s`。总耗时中位数降低 `53.0%`，约 `2.13×`。
> · Legacy 每回合 1–2 次 chat 加 10–11 次 embedding，chat 请求约 `134–137KB`；Fast 固定 1 次 chat、0 embedding、请求约 `2.27KB`，体积降低约 `98.3%`。Fast 三份生成前后非叙事状态均零漂移、背包均无短刀。
> · 玩家体验仍未达到扩场景标准：最终轮两份模型正文直接呈现，一份语义合格原文因“短刀滑进草丛”未命中本地终态词表而显示安全 fallback；另有诊断样本遇到上游 `content:null`。旧路径三份则分别出现 13 字残片、未落账持刀、以及状态未推进却写死段强死亡。
> · 决策：**新热路径架构 GO-WITH-CHANGES；扩大范围／替换主路径 NO-GO。** 下一刀应由本地合同追加固定终态收束，并为单请求设置硬等待上限，不再继续堆同义词正则；同场景至少 10 次稳定性与 P95 验收后再考虑第二场景。完整数据与证据见 `docs/FAST-NARRATIVE-DEMO-BASELINE-AND-CONTRACT-2026-08-23.md`。
>
> ### 2026-08-23：生成速度真机部分基线与窄 Demo 合同锁定
> · Claude 真机任务 `claude-2026-08-22T17-28-42-251Z-944cc330` 在隔离源码快照／浏览器档案中实际运行清羽开局；因 30 分钟任务上限被终止，结论为 **PARTIAL / NOT FULLY PROVEN**，源码 guard 通过且未修改项目。证据目录=`/Users/clawbot/.claude/scratch/xiantu-speed-baseline-evidence-20260823/`。
> · 页面保持 `deepseek/deepseek-v4-flash-0731`、temperature `0.6`、max tokens `20000`、force JSON 开启、润色关闭。1 次预热 + 3 次计时中，页面生成结束中位数 `121.860s`；唯一有效计时首字 `112.056s`。R3 风险动作单次 chat 仍耗 `130.969s`，请求约 `67.7KB`、响应 SSE 约 `1.10MB`；R1/R2 各发生 3 次完整 chat 且页面正文未更新。
> · 已验证主要慢点为约 `67KB` 全量上下文、过大的输出空间、JSON／命令合同、硬门禁缓冲和全量重试；网络首包通常约 `1–11s`，embedding 热回合约 `0.3s/次`，不是百秒主因。
> · 第一刀改为清羽 `lcq.stage_01` **本地判定已结算回合**的实验快路：本地真值先落账，allowlist `RenderPacket`，同 provider/model/temperature 单次纯文本渲染，调用级 `maxTokens=3072`、隐式重试 0，不跑 Step2／RAG／embedding／润色，不让 LLM 写任何命令；失败只走确定性安全短文。显式开关默认关闭，非目标回合完全走旧路。
> · Grok 写主体代码与聚焦测试草案；Codex 只审查、集成和跑门禁；Claude 用同一隔离档克隆、同一 R3 输入做真机 A/B。首版目标：1 次 chat、请求 ≤12KB、无 embedding、Fast 中位总耗时 ≤45s 且比 Legacy 至少快 50%，本地 judgement／effects 和全部非叙事状态一致。完整合同见 `docs/FAST-NARRATIVE-DEMO-BASELINE-AND-CONTRACT-2026-08-23.md`。
>
> ### 2026-08-23：Claude 已完成存档专属演出版独立评估
> · 只读二审 `claude-2026-08-22T14-00-51-032Z-a57c409a` 已完成，结论为 **GO-WITH-CHANGES**；Claude 未修改项目文件、未提交 Git。完整报告位于 `~/.claude/plans/xiantu-git-cryptic-owl.md`。
> · 采纳“制作期审核变体库 + 新档 seed 确定性绑定 + 存档持久化回执”；不采纳开局时由 LLM 生成整包，也不允许后台预写未来正文。
> · 当前只批准阶段 0+1：补齐现状文档，并由 Grok 产出独立 `editionPack` 模块与聚焦测试草案；Codex 只做合同／正典／知识边界审查、补丁整合与门禁；Claude 在落地后做独立只读复核。此阶段不接现有 runtime，不改 `AIBidirectionalSystem.ts`，不删 Step2／`tavern_commands`，不把未揭示内容加入 prompt。
> · Claude 另发现现有 `processGmResponse` 取消路径可能部分提交状态的 P0 风险；该问题与 `editionPack` 分开立项、分开测试，不与第一刀混改。
>
> ### 2026-08-22：存档专属演出版／快速叙事架构留档，待 Claude 复核
> · 用户明确人物性格、初始设定、核心动机、知识边界、正典故事线与关键锚点均已固定；新档差异不得生成新世界或改写人物，只能落在合法环境牌、传闻顺序、连接演出、过程纹理和已有合同支持的局部后果。
> · Grok 4.6 独立只读评估推荐：制作期生成并审核变体库，新档用 seed 确定性绑定 `slotId → contentId` 并持久化 revealed／consumed／invalidated 回执；反对开局运行时 LLM 生成整包，也反对后台预写未来正文。Codex 综合判断暂同意，以五原窄纵切为候选，不扩到 37 stage。
> · 候选热路径为“本地实际落账 → 短 RenderPacket → 固定骨架或一次短 LLM 渲染”；现有预结算与真实写账时序、移除分步第 2 步、旧档迁移、失败原子性及变体库门禁均属大架构改动，**Claude 额度恢复并完成独立评估前不实施**。
> · 评估包、三方案比较、数据合同、五原试点、验收指标及暂定 Grok／Claude／Codex 分工见 `docs/SAVE-SCOPED-EDITION-PACK-ARCHITECTURE-BRIEF-2026-08-22.md`。本条只登记候选与等待状态，不授权改 canon、核心 prompt、冻结 ID 或存档合同。
>
> ### 2026-08-21：文字开放世界 RPG 定位体检入档
> · 总判断：六朝已经是较强的正典互动叙事／世界因果引擎，但开放世界 RPG 的日常循环仍未完全闭合；当前缺口不是内容量，而是“获取局势 → 自主移动 → 用角色能力解决 → 承担成本与失败 → 世界／人物反馈 → 新机会与长期回响”尚未在一个连续纵切中稳定成立。
> · 优先级正式登记为：**P0 显式移动与空间规则 → 核心玩法动词 → 深拍延迟后果；P1 动态委托运行时 → 成长／经济／声望消费 → 承重 NPC 生活逻辑；P2 玩家可读信息与枢纽节奏。** 不另起平行任务层、事实引擎或 NPC 全量模拟。
> · 下一里程碑建议：以清羽开局／五原商馆为 30–40 回合纵切，覆盖 3–5 个相连地点、两条有代价的路线、一条动态交付委托、至少两种解决方法、一个 B 类场外事件、一件后续有用物品、一名十轮后主动回应的 NPC，以及失败后仍可继续的局面。
> · 纵切通过前，不优先为 37 stage 批量增加 event、征兆、机会卡或 NPC 日程；自动化全绿不替代真机文本、知识边界与“一个选择如何在十轮后产生乐趣”的验收。
> · 完整判断、范围、非目标和玩家视角验收：`docs/TEXT-OPEN-WORLD-RPG-DESIGN-AUDIT-2026-08-21.md`。本文档只登记设计与排期，不授权直接改 canon、核心 prompt、冻结 ID 或存档合同。
>
> ### 2026-08-21：五原开放世界 P0/P1 窄纵切实现
> · 用户纠正空间连续性后，实施边界重新锁定：**草原战争／左武军帅帐／王哲托付在前；战事与王哲身死后才进入五原，再到点心铺、落奴与白湖商馆。** 五原局部层不含帅帐、王哲或“城门盘查”；原 stage 数据中“五原城墙高耸”的旧生成描述未在本轮越权修改，但局部提示明确按源文采用无城门／无官署标记的开放市集。
> · 新增通用本地 `openWorldSlice`：稳定 zone/route ID、已知目的地 allowlist、有向邻接、路线条件、耗时与到达回执；自然输入 NFKC 归一、否定优先、歧义关闭；notice/source/reliability 分账；problem action、partial／failure-forward、成本、3–5／10–20 回合后果、承重 actor 状态及“因为 X，所以 Y”因果编年史均幂等持久化。旧档缺字段时只补默认，不清回执。
> · 五原纵切在 `lcq.stage_02` 且战争／帅帐段完成后才启用：初始为五原露天市集；已知街面快路可去点心铺，摊主传闻可解锁较慢后巷，未指定路线时保持歧义；固定消息始终显示来源与“已证实／传闻”层级。位置由本地合同写 `角色.位置`，模型命令在纵切启用后不得改位置或绕过到达回执。
> · `s02_04` 旧宽泛“一键推进”在 UI 被局部合同替换：玩家可拖住话头观察，或撞开桌案抢出口。两者分别形成 partial／failure-forward 的过程、成本和后续线索，但在 `canon_companion` 都诚实收束为既定被抓；`world_sim` 只结算局部过程，**不获得 Canon Rail completion 权**。王哲锦囊未被消费或改成通行证。
> · 承重人物首版只引用 stage02 已有合法 ID：凝羽、苏妲己固定在白湖商馆内院，未见面前不显示为在场；玩家在点心铺的应对会在 4 轮后改变凝羽后来观察玩家的切入点，12 轮后留下不同脱身线索。阿姬曼／葛龙／孙疤脸因当前关卡无合法角色 ID，本轮没有发明持久 actor。
> · Grok 4.6 按用户建议尝试实际编写两次，但其本地读取工具卡住，隔离 worktree 始终零改动，已中止以免继续耗额；本轮代码由 Codex 实现并复核。门禁：新增聚焦 17/17；完整 `canon:build` **807 / 802 pass / 0 fail / 5 skip**，37 关 schema、裁定执法、主轴／存档合同全绿；`type-check`、`build:single`、`git diff --check` 全绿。本地页面加载、清羽入口与控制台错误检查通过；**尚待从草原连续玩到五原的真机文本／长期乐趣验收**，自动化不替代该项。
>
> ### 2026-08-21：P0-P2 收束——自然行动落账与王哲锦囊实物交易
> · 协作按用户新分工执行：Grok 4.6 承担高 token 草案／第二意见，Codex 复审、落地与门禁；Claude 额度耗尽，本轮跳过。P0 完整审稿会话=`01a021a0-d1be-7131-9d5d-e951452565fe`；P1/P2 因 Grok 本地大文件读取接口故障改用最小上下文，审计原件在 `.xiantu-server/grok-p0-p2-2026-08-21/`。
> · **P0**：10 个权威 stage 补齐 17 条既有 event completion `initialFlags=false`，不改事件、条件、ID、顺序或正典事实。此前阻塞提交的 `uninitialized_flag` 欠账已清；`canon:build` 首次恢复全绿。
> · **P1**：事件动作新增可选 `intentMatch(matchAny/matchAll/rejectIf)`；运行时只在当前可用承重动作内做 NFKC／标点空白归一化匹配，否定优先、歧义关闭、泛化短句不认，最终仍把完整 `eventId/actionId/contractHash/actionText/outcome` 交给原有本地结算器。按钮原路径保留，清羽 Demo 只为 `s01_02..s01_06` 写了保守场内短语；段强／太乙两拍的压力与场外时钟不变，三条 A 类拍仍可无限等待玩家。
> · **P2**：王哲锦囊不挂在“听他说完”的宽泛事件动作，而挂在两个互斥机会路线的第一步实物接收点（`accept_silk_bag`／`hold_silk_object`）。两路共享物理交易 ID=`lcq.event.s02_01.inventory.jin_nang`，本地 catalog 发 `lcq.item.jin_nang ×1`；结构化按钮与自由输入都走同一幂等回执，重试／刷新／误走另一分支不双发。机会步骤的本地结算提前到模型命令应用前，正文补账和 tavern command 均不能再发第二只。
> · 验证：P1/P2 专项 14/14；`type-check`、`build:single`、`git diff --check` 全绿；完整 `canon:build` **790 / 785 pass / 0 fail / 5 skip**，37 关 schema、裁定执法、主轴／存档契约全部通过。局域网常驻服 `0.0.0.0:8091` 在线 bundle 已命中自然动作解析器、段强短语与锦囊 transferId；Windows 可继续从 `192.168.50.51:8091` 重建清羽 Demo 隔离档测试。
>
> ### 2026-08-21：三级任务固定目标重写与动态 LLM 委托设计
> · 三级层级不变：主轴／二级任务线／人物任务。原节点 `text` 共 516 条（主轴 16、二级 382、人物 54、高光 64）完整改名为制作侧 `reviewSummary`；它可以记结果，但不再进入玩家 UI 或叙事 prompt。所有真实可走节点继续绑定本地 event：主轴 13/13、二级 374/374、人物 49/49 均有固定 `objective`，`pending/new` 不冒充当前任务。
> · Grok 4.6 只读全量比对提出 67 条问题候选；Codex 对照 description、completion contract 与知识边界逐条复审，采纳 52 条表现层改写，去掉开发者元语言、提前谜底、错误主体和结果剧透。另 15 条不采纳：其中一些本来就是合法的战斗／营救目标，另一些被 Grok 改成“决定是否”却没有第二条本地合同，落地会制造假选择。
> · 52 条覆盖集中在 `fixedQuestObjectives.ts`，只影响任务栏、叙事视图与动作预填；event id、conditions、completion、contract hash/action payload、Canon Rail、IF 与世界真值均不改。显式 narrative variant 与已确认世界线偏离优先级高于基础覆盖。
> · 右栏 world_sim 只展示当前 event 的固定目标，不再摊同关未来节点或 `ready/total/余待扩` 制作进度；二级线与人物任务消费同一当前目标。“即兴目标”改称“个人目标”，明确只是玩家主动意图的跨轮备忘，不具备任务奖励、期限或结算权。
> · 随机内容另设“动态委托／机缘”，不作为第四级正典任务线。必须由已登场 NPC、告示、已拾物品、现场痕迹、可信传闻或世界余波在场内触发；LLM 只起草，引擎冻结来源、目标、生命周期、验收、奖励预算、期限与幂等回执。生命周期分 `player_dependent`（玩家不做就静置）与 `world_timed`（世界到期自行失效／场外结算）；物品奖励复用 `inventoryTransactions`。本轮只完成设计，尚未接入 runtime；首个建议纵切是五原商馆的低风险 NPC 交付委托。
> · 记录：`docs/FIXED-QUEST-OBJECTIVE-REVIEW-2026-08-21.md`、`docs/DYNAMIC-LLM-QUEST-DESIGN-2026-08-21.md`。Claude 额度耗尽，按用户裁定跳过；Grok 会话 `01a01ffe-b7f2-7013-9447-87757406ac0d` 的审计原件保存在 `.xiantu-server/grok-quest-objectives-2026-08-21/`。
> · 门禁：专项 26/26；串行全量 tests **780 / 775 pass / 0 fail / 5 skip**；`type-check`、`build:single`、`git diff --check` 全绿。并行全量曾出现两份 Node 测试进程反序列化噪声，单测与串行全量均复验通过。`canon:build` 仍只在既有 10 个旧 stage 的 17 条 `initialFlags` 欠账处中断，本轮 `lcq.stage_01` 与目标表现层无新增 schema 错误；依项目纪律未 commit。
> · 局域网测试服务已刷新并验证：`0.0.0.0:8091` 在本机两张局域网网卡 `192.168.50.51`／`192.168.50.164` 均返回 200，在线 bundle 已命中“当前主轴目标”“个人目标（可选）”及固定目标覆盖文案。
>
> ### 2026-08-21：稳定物品获得机制纵切
> · 根因确认：现行主路径仍是“正文叙述获得 → 指令模型补 `角色.背包.物品` → 中文正则查漏补账”，会受措辞、别名、数量、JSON 结构与重试影响；`narratedInventory` 只能做兼容兜底，不能继续当物品真值来源。
> · 新增本地交易合同 `outcomeEffects.inventoryTransfers`：每笔声明 `transferId / itemId / quantity`，物品完整数据只取当前模组 catalog；本地动作 outcome 确定后，同一调用内写背包与 `inventoryTransferReceipts`。`transferId` 幂等，重复响应／刷新不多发，同 itemId 确定性叠加数量，回执跨关继承。
> · 校验层新增：item 引用必须存在、数量必须为 1..999 整数、transferId 必须归属源 event 命名空间且全模组不重复。模型若又对本地已发物品 set/add 会被拦；正文补账兜底也跳过该物品，封住双发。
> · 设计与后续分层见 `docs/ITEM-ACQUISITION-TRANSACTION-DESIGN-2026-08-21.md`：固定剧情物品已可稳定接入；探索 loot 与即兴赠送后续也必须先形成待领取 catalog/本地判定，再复用同一交易器，不能让模型直接发背包。
> · 本轮未改 canon 数据或核心 prompt，也未为测试凭空发奖励。清羽线自然的首个真机验收点是王哲交锦囊，待逐拍核准后再把 transfer 挂到对应成功动作。
> · 门禁：新增聚焦测试 5 条；全量 tests **773 / 768 pass / 0 fail / 5 skip**；`type-check`、生产单文件 webpack、`git diff --check` 全绿。全内置模组复核仍仅受 08-20 已记录的 10 个旧 stage `initialFlags` 欠账阻塞，未 commit。
>
> ### 2026-08-20 夜：三级任务链推进纵切认领
> · 用户真机在清羽 Demo 首拍自由行动 17 轮，`s01_01` 仍未落账；现行 `objective_action` 只有点击正文下方“主线”按钮且保持预填文字逐字不变才会送入本地合同。界面却写“可修改后发送”，修改或自由输入都会失去选择身份。这把任务栏变成了剧情遥控器，属于引擎缺陷而非玩家操作问题。
> · 用户纠正：本轮盘点单位不是全库 524 个 event，而是 Claude 已完成并接入游戏的**三级任务线**。主轴不是故事线，而是“六阳＋保住一名岳血后裔”两个通关条件；二级任务线承载国家／地区／宗派等长期内容；人物任务作为上级当前拍的插入段，不抢上级 event。
> · R3-12 已确认两种事件推进形状：A＝无时限等待玩家，B＝`offscreenResolution` 超时后世界自行结算、玩家只能事后得知。不要另造 `world_driven/player_driven` 平行 schema；“自动发生／不强推”只在具体任务线内部选择现有 A/B 合同。
> · 本轮先按三级链盘清 `lcq.stage_01` Demo：区分此处呈现的是主轴条件、哪条二级线入口、哪些人物插入；再修它们如何由地点／相识／世界时钟自然接上。Grok 只按任务线复核其他线的归属、入口与 A/B 使用建议，Codex 复审后才改源文件；Claude 额度耗尽，本轮不再提交 Claude，但其既有实现与校验结论是本轮基线。
> · 已实现：Demo 开场正文已经呈现的 `s01_01` 通过隔离建档的 `initialFlags` 直接落账，第一屏进入 `s01_02` 段强遇袭压力；`s01_01` 从昭南线移除；太乙入口提示不再提前宣告王哲已经托付；太泉 `expedition` 在右栏显示为“远征”而非“国家”。未改三级链架构、全局事件 schema、canon 数据或核心 prompt。
> · Grok 任务线级复核经 Codex 对照后落档：`docs/THREE-TIER-QUEST-TRIGGER-AUDIT-2026-08-20.md`。十条二级线 kind 均保持；八条成线人物任务均保持人物线。晋国首节点归属、太泉入口暗号剧透列为后续候选，本轮未越界修改。
> · 门禁：聚焦 16/16；全量 tests **768 / 763 pass / 0 fail / 5 skip**；`type-check`、`build:single`、`git diff --check` 全绿。`canon:build` 在本轮文件之外的既有欠账处失败：10 个旧 stage 的新增 event 缺 `scenario.initialFlags` 声明；本轮相关 `lcq.stage_01` schema PASS。构建产生的同步噪声已还原，未夹带进工作区。由于项目要求 `canon:build` 全绿才 commit，本轮暂未提交。
>
> ### 2026-08-20 晚：协作方式与能力扫描接手状态
> · Claude 额度已用完，用户明确同意当前阶段**跳过 Claude**。协作口径：Grok 承担高 token 的代码实现、批量内容生成与初步自检；Codex 负责拆解任务、正典／知识边界／架构复核、补丁审查、必要修正与最终门禁。Claude 恢复前不作为完成阻塞项。
> · 不应把 Grok 限缩为“只写内容”：此前它负责过代码和大量内容生成，质量可用。边界是 canon 数据或核心 prompt 不允许 Grok 直接覆盖；此类改动仍先出草稿／补丁，由 Codex 审核后落库。
> · §七所记 `45 / 161` 已过时。当前目录已覆盖 161 / 161 个目标且 JSON 均可解析，但不能据此判定完成：`REPORT.md` 只汇总了 2 人，另有 25 人的 `verifyExisting` 数量与当前角色卡 `signatureAbilities` 数量不一致，说明断点续跑复用了旧口径结果。
> · Codex 加入逐字覆盖审计后，确认实际是 **38 人**有当前条目缺失、旧条目残留、重复或口径漂移；根因之一是旧扫描器把每条 `signatureAbilities` 截到 30 字再送验，长复合字段天然无法对齐。现已取消截断，并让条目不一致时旧缓存自动失效。
> · 前两次 Grok 试跑把“二验”错误扩大成回查整本 EPUB，已中止且**没有采用半成品**。用户纠正后二验合同定为：只比较 MiniMax 扫描产物、当前 `signatureAbilities` 与现有技法／器物拆分清单，判断可直接映射、格式漂移或确实缺项；**不重读原著、不重做抽取**。Grok 承担批量对比，Codex 复核后才允许落结果；不提前实施已压后的 P4-1「向高好感角色学功法」。
> · 正确合同的 Grok 第一批已完成 10 / 38 人、29 个当前条目：5 direct／20 format-only／4 partial／0 missing／17 需 Codex 判断。Codex 复核抓到阿合马当前卡把一条括号内容错拆为三个数组项，以及玄萝“阳钧宗／阳钩宗”一字冲突，证明不可机械落库。记录=`docs/ABILITY-SCAN-GROK-SECOND-PASS-2026-08-20.md`；本批未改 canon。
>
> ### 交给 Codex 的一句话
> demo 入口可玩（首页「清羽记开局」→ 隔离档 → `/game`，`canon_companion`），
> 所有改动**均已 commit**，工作区干净。门禁 **767 条 / 762 过 / 0 红 / 5 skip**。
> 后台有一个长任务在跑（见 §七）。
>
> ⚠ **本条是补记，不只是当天记录。**上一条正文写于 08-17；08-19 那条只记了 demo 入口且当时标注"未 commit"。
> 缺口：**70 个提交**（08-17 九个、08-18 二十三个、08-19 二十六个、08-20 十二个）。
> 下面 §0 补 08-18 那一大批，§一起是 08-19／20。
>
> ### 〇之前、08-17 后半（本文档正文写于当天上午，之后 9 个提交未进档）
> · **隔离关救援**：把 21 条承重拍从隔离关捞出来改挂可达关，随后**全部**隔离拍归位。
> · **汉宫宫变做成「去了现场 / 没去现场」两条分支**，并救活 **4 条永不触发的场外合同**。
> · **新增第九条二级线「商道」**，并纠正四条被我误判为"纯背景"的拍。
>   商贾线定性：**它是变现层，不是第九条平行故事线**（设计落档 R3-11，后期实施）。
> · **「82 条孤儿」是我两处统计口径的洞**，不是未完成的工作——已更正。
> · **小紫单独成线**：此前拦着不给她开线的那条"规则"是我自己加的，不是裁定。
> · 更正一条我写错的断言：曾把「地区声望不存在」当核实事实写进代码注释，
>   实为按中文 grep 漏看英文命名的引擎模块（`settleEventReputation` / `regionStanding`）。
>   **教训：本仓库中英混用命名，单语言 grep 的阴性结果不构成"不存在"的证据。**
>
> ### 〇、08-18：三级任务链从「能跑」做到「能审」
> · **文案总重写**：按句子契约重写 **234 条**节点文案（Grok 写、Claude 校对）。
>   起因是太乙线读着"没前后联系"——**不是缺 event，是文案在做逐拍摘要**；同样毛病在其余 8 条线一并修掉。
> · **登场补齐**：落 **46 条登场拍**，覆盖 67 名此前在可走线上根本不出现的角色；
>   吕雉／秦桧的国家段人物拍补完后，「用了却不介绍」清零。
> · **主轴定性**（重要，别再当故事线扩写）：主轴＝**两个通关条件**（六阳 ＋ 保住一名岳血后裔），
>   不是一条故事线；R3-12 文档里早先几处相反的判断已作废。
> · **裁定 #159**：判「正典无据」必须**两份抽取都查**（deepseek 735 章 / minimax 837 章，后者多 154 章）。
> · **裁定 #160**：抽取会把**人物台词压成世界事实**；采信三步——两份都查 → 查同一份内部矛盾 →
>   分辨叙述还是台词、说话人有没有动机撒谎。据此改写了大雁塔那一拍。
> · **`axisSeq` 为 null 的排序坑**：修三处——null 当 0 会把后段内容顶到线首。
> · **报告工具成型**：三级链一张报告，加逐条批注槽（用户在网页上直接写）、登场标记、复核标记按钮。
> · **方法教训**：「用了不介绍」这个指标口径**错了四次**（27→17→12→2），
>   原因是隔离件造成的假阳性与统计口径反复变动——已单独记档。
>
>
> ### 一、任务链结构（三级链定稿方向）
> · 主轴由 4 拍扩到 **13 拍**——补落此前漏掉的「五原城落奴 → 白湖脱身」9 拍（教程段，与昭南线双喂）。
> · `lcq.stage_02` 的 Canon Rail 由 6 拍**延长到全关 18 拍**，12 份正典合同由 Grok 取证、Claude 机检
>   （证据锚点在 1.4MB 双份语料中全部命中）。
> · **实证过一次死锁**：rail 只盖部分拍时，玩家跟着主线走会在 rail 跑完那一刻锁死剩余内容
>   （`railStageComplete` 会清空 activeEventIds 并把所有章标完成）。见 `tests/stage02RailDeadlock.test.mjs`。
> · 25 条 objective 全部改写并采纳，统一到「**处境 ＋ 眼下要做的判断**」；
>   连带修了 12 条与旧 objective 同文的按钮 label。
>
> ### 二、新增机制（都带门禁）
> | 机制 | 字段 | 说明 |
> |---|---|---|
> | 死亡结局 | `event.fatalOutcomes.{deadline,choices}` | 玩家自己走进的绝路；引擎只给 `facts`，正文由叙述写；`gameOver` 落上后引擎停摆 |
> | 场景压力 | `event.pressure.{afterTurns,approach}` | 危险逐轮逼近；**时钟锚在这一拍上**（`pressureStartedAt`），不受全局 stall 归零影响 |
> | 玩家在场 | `event.playerPresence: 'required'` | 到点**当场演完**而非场外结算；配 `offscreenResolution.onSceneDelta` |
> | 自身未点破 | `scenario.undisclosedSelfFacts` | 引擎知道 ≠ 角色知道；禁令覆盖正文、玩家台词与**行动选项** |
>
> ### 三、新增门禁（DEBT 只减不增）
> · `eventReachability` —— critical event 必须绑章或在 rail 上。**DEBT 97**（原 109，stage_02 的 12 条已清）。
> · `debutCardGating` —— 登场卡必须有 conditions。**DEBT 18**。
> · `stage02RailDeadlock` / `fatalOutcomes` / `scenePressure` / `unmetCharacterNaming` / `undisclosedSelfFacts` / `qingyuOpeningPlaytest`。
>
> ### 四、四个「引擎知道 ≠ 玩家知道」的泄漏，路径各不相同
> 这是本轮反复出现的一类缺陷，Codex 接手时请按这个模子查新内容：
> 1. **事件名印上按钮**——`deriveInteraction` 拿事件名当兜底对象，玩家看到「行动 · 段强被射杀」。
> 2. **未相识者被直呼其名**——登场门槛原文只管 NPC 知情、**不管叙述者的笔**。
> 3. **相识账本把原著投影当成见过**——建档时 `社交.关系` 就塞进全关角色，
>    且关系标签与好感度按原著预填（王哲开局即「恩人/受托者、好感 55」）。已改为只认已完成的拍 + 归属级标签。
> 4. **主角自身设定提前自知**——`角色.身份.灵根` 建档即写入，随人物面板每轮发给模型。
>
> ### 五、待裁定 / 未做
> · **P4-1 向高好感角色学功法**（backlog，用户明确压后）。两个前置：好感是原著投影不是玩家挣来的；NPC 功法内容为空。
> · **商贾变现层 R3-11 §9**：跑商模式与折现层**并存两层**，待开发。
> · **主轴续写**（王哲托付之后）仍是待办，不要擅自扩写。
> · demo 入口卡片第 4 条写「玩到白湖脱身即结束」，但 stage_02 实际会继续跑到蛇彝村——收不收口未定。
> · 两处绝路（战场不走 / 拒绝三月期限）**只做过引擎与门禁验证，真机未走到**。
>
> ### 六、⚠ 本轮踩过的坑（Codex 请直接继承，别重踩）
> · **`markEventTimelineOccurred` / `activatedAtTurn` 只对配了 `timeline` 字段的 event 存在**——
>   战场这些拍都没有。今天有四处代码/测试栽在这个字段上。
> · **测试里手动伪造运行时状态 = 测了不在链路里的东西**。本轮至少三次绿测掩盖了线上完全不生效。
> · **MiniMax-M2.7-highspeed 无视 `response_format: json_object`，返回纯散文** →
>   应用反复重试 → 看似卡死（实测 7 分钟 407 字）。排查顺序：**先看 `content` 里有没有 `{`，再谈慢不慢**。
>   `scripts/scan-boss-abilities.mjs` 不用严格 JSON、从散文里捞片段，故对 MiniMax 安全。
> · **`git add -A` 会卷走讨论中的改动**——本轮犯过一次，已用 `reset --soft` 拆开。
>
> ### 七、后台长任务（接手时先看它跑完没）
> `XIANTU_SCAN_NAMES=全部 node scripts/scan-boss-abilities.mjs`
> 对 161 个带 `signatureAbilities` 的角色做原文能力考据（MiniMax 主力 + DeepSeek 兜底，**断点续跑**）。
> 产物 `mod-kit/generated/.../boss-ability-scan/{名}.json`，当前 **45 / 161**。
> 目的不是每条都有铁证，而是拿到 `verifyExisting` 的**证实／未见**分野——即「哪些有据、哪些得自己编」。
> 跑完的下一步：Claude 机检覆盖 → **Grok 二筛**（用户已定）。
>
> ### 八、⚠ 裁定 #162：自编的边界
> 「原文无据可以自编」**只限功法与装备**，且**默认一律不许编**——
> 只有用户就某一类素材逐次明确开口时才成立，**不得由 agent 自行类推**
> （「功法可以编」推不出「丹药也可以编」）。自编项落地必须标注来源为自拟，不得伪装成正典。
>
> ---
>
> ## 上一条：2026-08-19（**清羽记开局 demo 入口：首页按钮 → 入口卡片 → 隔离存档进 /game**）
>
> 已交付：照抄「六朝世界试玩」形状，新增 `canon_companion` 平行入口。模组 `lcq.stage_01`（玩到 `lcq.stage_02`），用 `buildStrictScenarioInitialization` 建档，**不**写 `world_sim`。marker kind=`qingyu-demo-v1`，扩展键=`清羽记开局`。`installIsolatedPlaytestCharacter` 增加可选 `markerExtensionKey`。未改 `runtime.ts` / `storyContext.ts` / `canonRail.ts` / builtins json / `MainGamePanel.vue` 的 `playtestFinished`。未 commit。`type-check` 干净；`tests/*.test.mjs` 747 pass / 0 fail / 5 skip。
>
> ---
>
> ## 上一条：2026-08-17（**lcq.stage_05b／lyl.lin_an_bridge 再补 7 条隔离关改挂 event**）
>
> append-only：① `lcq.stage_05b` 末尾 `xiaozi_kills_mother`(217，原隔离关 `lcq.stage_06`)，轴窗已含 217，未放宽。② `lyl.lin_an_bridge` 末尾六条（原 `lyl.lin_an_black_sea`／`lyl.taiquan_expedition`）：`survey_wumu_mansion`(556)／`decode_bianmenwa_note`(557)／`meet_xue_yanshan`(558)／`identify_xue_cold_poison`(559)／`decide_chase_weiyuan`(561)／`pass_kotian_stone`(562)。seq 均在 550–562 内递增加，未放宽轴窗。合同均为手写双步动作，未用 `advance_declared_objective`。薛延山／敖润／冯源／俞子元／李师师／月霜不在本关 canon 名单，只写入正文，未挂 `relatedCharacterIds`。未改既有 event、未改 chapters、未跑 `build:single`，未改 `src/`、`tests/`。`mod:validate` PASS（stage_05b 6 条、lin_an_bridge 17 条未挂章节 warning，含本轮 7 条）。
>
> ---
>
> ## 上一条：2026-08-17（**lcq.stage_04b 再补 6 条：小紫登场至脱困**）
>
> append-only：原隔离关 `lcq.stage_05` 的黑舌疑点与小紫首现／拔叉稳伤／收拢商队见使者／武二郎斩达古／一阳逼退阴煞／机关脱困，改挂可达关 `lcq.stage_04b_lingfei_baiyi_crisis` 末尾为可玩拍：`xiaozi_first_appears`(123)／`pull_harpoon_lemingzhu`(125)／`regroup_caravan_envoy`(131)／`wuerlang_slays_dagu`(145)／`yiyang_repels_yinsha`(147)／`escape_cave_mechanism`(160)。轴窗已是 42–162，未再放宽。合同均为手写双步动作，未用 `advance_declared_objective`。黑舌／达古／石刚不在本关 canon 名单，只写入正文，未挂对应 id。小紫本拍只以碧鲮少女身份登场，未写入后期来历。未改既有 event、未改 chapters、未跑 `build:single`，未改 `src/`、`tests/`。`mod:validate` PASS（18 条未挂章节 warning，含本轮 6 条）。
>
> ---
>
> ## 上一条：2026-08-17（**lcq.stage_02 末尾再补 3 条隔离关改挂 event**）
>
> append-only：原隔离关 `lcq.stage_03` 的凝羽登场／紫溪太乙拦船／抵达无声蛇彝村，改挂可达关 `lcq.stage_02` 末尾为可玩拍：`ningyu_enters_gamble`(35)／`zixi_taiyi_intercept`(54)／`silent_sheyi_village`(59)。`manifest.axisSeqHi` 58→59。合同均为手写双步动作，未用 `advance_declared_objective`。祁远／谢艺不在本关 canon 名单，只写入正文，未挂 `relatedCharacterIds`。未改既有 event、未改 chapters、未跑 `build:single`，未改 `src/`、`tests/`。
>
> ---
>
> ## 上一条：2026-08-17（**lyl.lin_an_bridge 末尾补 7 条隔离关改挂 event**）
>
> append-only：原隔离关 `lyl.lin_an_black_sea`／`lyl.taiquan_expedition` 的临安支线（李师师婚事＋威远失镖＋林冲）改挂可达关 `lyl.lin_an_bridge` 末尾为可玩拍：`tail_li_shishi`(555)／`evade_huangchengsi`(556)／`libu_registration`(558)／`leifeng_pagoda_invite`(559)／`leifeng_repel_gao`(560)／`weiyuan_extortion`(557)／`ivory_visit_weiyuan`(563)。`manifest.axisSeqLo` 557→555。合同均为手写双步动作，未用 `advance_declared_objective`。李师师／林冲／俞子元／陆谦／李寅臣不在本关 canon 名单，只写入正文，未挂 `relatedCharacterIds`。未改既有 event、未改 chapters、未跑 `build:single`，未改 `src/`、`tests/`。
>
> ---
>
> ## 上一条：2026-08-17（**lyl.han_palace_endgame 末尾补 6 条隔离关改挂 event**）
>
> append-only：原隔离关 `lyl.luoyang_coup` 的拥立定陶王全过程六拍，改挂可达关 `lyl.han_palace_endgame` 末尾为可玩拍：`lvji_defiles_consort`(891)／`emperor_death_spreads`(894)／`arrange_escape_route`(895)／`changqiu_palace_defense`(897)／`bounty_and_hu_cavalry`(898)／`lvfengxian_breaks_line`(899)。`manifest.axisSeqLo` 896→891。合同均为手写双步动作，未用 `advance_declared_objective`。友通期／敖润／桓郁／吕奉先不在本关 canon 名单，只写入正文，未挂 `relatedCharacterIds`。未改既有 event、未改 chapters、未跑 `build:single`，未改 `src/`、`tests/`。`mod:validate` PASS（10 条未挂章节 warning，含本轮 6 条）。
>
> ---
>
> ## 上一条：2026-08-17（**lcq.stage_04b 再补 6 条：五原至进峒**）
>
> append-only：原隔离关 `lcq.stage_03`／`lcq.stage_05` 的冰蛊南行／劝住武二郎／峒眼线／古道废墟／随弥骨入峒／红苗受控，改挂可达关 `lcq.stage_04b_lingfei_baiyi_crisis` 末尾为可玩拍：`ice_gu_coercion`(42)／`persuade_wuerlang`(51)／`spot_dong_informant`(137)／`ruins_ghost_warriors`(143)／`enter_dong_with_migu`(154)／`hongmiao_controlled`(162)。`manifest.axisSeqLo` 88→42，`axisSeqHi` 158→162。合同均为手写双步动作，未用 `advance_declared_objective`。苏妲己／西门庆／古道废墟地点不在本关 canon 名单，只写入正文，未挂对应 id。未改既有 event、未改 chapters、未跑 `build:single`，未改 `src/`、`tests/`。`mod:validate` PASS（12 条未挂章节 warning，含本轮 6 条）。
>
> ---
>
> ## 上一条：2026-08-17（**lcq.stage_02 末尾再补 5 条隔离关改挂 event**）
>
> append-only：原隔离关 `lcq.stage_03` 的赌局卖身／六十金铢／撕契出城／铁索桥／黑石滩，改挂可达关 `lcq.stage_02` 末尾为可玩拍：`gamble_bond_signed`(37)／`charge_sudaji_fee`(38)／`free_ajiman`(40)／`iron_bridge_ambush`(50)／`rainforest_black_shoal`(58)。`manifest.axisSeqHi` 53→58。合同均为手写双步动作，未用 `advance_declared_objective`。阿姬曼／武二郎／云苍峰不在本关 canon 名单，只写入正文，未挂 `relatedCharacterIds`。未改既有 event、未改 chapters、未跑 `build:single`，未改 `src/`、`tests/`。`mod:validate` PASS（9 条未挂章节 warning，含本轮 5 条）。
>
> ---
>
> ## 上一条：2026-08-17（**lcq.stage_04b 末尾补 6 条隔离关改挂 event**）
>
> append-only：原隔离关 `lcq.stage_05` 的海神殿鲛人／谢艺述旧战／兵器化解／探峒约定／白纸达古／阁罗召碧姬，改挂可达关 `lcq.stage_04b_lingfei_baiyi_crisis` 末尾为可玩拍：`haishen_hall_merfolk`(124)／`xieyi_biling_war`(128)／`weapon_deal_with_geluo`(134)／`guiwangdong_coop_pact`(151)／`blank_letter_and_dagu`(156)／`geluo_summons_biji`(158)。`manifest.axisSeqHi` 122→158。合同均为手写双步动作，未用 `advance_declared_objective`。引用均在本关 canon 名单内。未改既有 event、未改 chapters、未跑 `build:single`，未改 `src/`、`tests/`。`mod:validate` PASS（6 条未挂章节 warning）。
>
> ---
>
> ## 上一条：2026-08-17（**lcq.stage_02 末尾补 3 条隔离关改挂 event**）
>
> append-only：原隔离关 `lcq.stage_03` 的南荒之约／武二郎入队／凝羽开价弑主，改挂可达关 `lcq.stage_02` 末尾为可玩拍：`sudaji_south_pact`(36)／`wuerlang_joins`(47)／`ningyu_regicide_offer`(53)。`manifest.axisSeqHi` 41→53。合同均为手写双步动作，未用 `advance_declared_objective`。武二郎／西门庆不在本关 canon 名单，只写入正文，未挂 `relatedCharacterIds`。未改既有 event、未改 chapters、未跑 `build:single`，未改 `src/`、`tests/`。
>
> ---
>
> ## 上一条：2026-08-17（**37 条 event 补写 36 条、三级报表、孤儿归类中**）
>
> **① event 补写**：节点指向的落点从"37 条不存在"补到只剩 1 条。事件层 **396 → 432**。
> 二级线 `new` 清零；主轴只剩 `enter_dong_recognize_biji`（挂隔离关 `lcq.stage_05`，等裁定）。
> 三批共 36 条由 Grok 写、Claude 逐条校对；序按 axisSeq 重排（修了 8 处回退）。
> ⚠ 校对抓到三处 Grok 引了**不在本关 canon 名单里**的 id（`guangyuan_hang`／`lin_cai_quan`／
> `zhang_shao_huang`）——**那三个 id 全库都真实存在**，校验器查的是本关，已去掉引用。
>
> **② 审核入口换成报表**：`node scripts/quest-report.mjs` → `docs/quest-report.html`，
> **从源码算、重跑即刷新**。三级同轴＋逐线展开每个 event 名＋逐角色线性列＋双喂/序回退/待写清单。
> 当前 135 节点／124 可走／1 待写／10 待扩；双喂 6、序回退 0；人物线已展开 8 条、待做 19 条。
>
> **③ 孤儿账**（本轮最重要的发现）：432 条里 **孤儿 272（63%）**，必须分两类看——
> **可达孤儿 186**（该分类归属，已分三批交 Grok 按 A 人物高光／B 场景子拍／C 二级线漏认／
> D 主轴漏认／E 背景 五档归类）／**隔离孤儿 86**（分类无意义，先决定那八个关怎么处置）。
> 混成一个数字会误导决策。
> 用户判词：「**event 的密度并不是太细，而是不足**」——凝羽的开价（seq 53「提出弑主并揭开寒气」，
> 在隔离关）、超级用户名单、秘境地下段、白湖赌局，都是该有而没有。
>
> **④ 已定口径**（写进代码注释与 backlog，勿回退）：**id 是键不是索引**（新 id 只写"发生了什么事"，
> 不带关号线名；已有 6 条 event 被两级共用，归属写进 id 就得对其余撒谎）；**锚＝你知道那件事的那一拍**；
> **扩写只标待扩**（正典有＝`new`／压根没有＝`pending` 且不给建议 id）；
> **血脉四候选互为替代**（要求二是"至少一名"，用 `bloodlineBranch` 分开）。
>
> **⑤ 待讨论（勿动手）**：backlog **P1-9** 节点只能挂一条路（推荐加 `alsoSatisfiedBy`，波及面为零）、
> **P1-10** 29% 的 objective 只写方法不写结果。
>
> **⚠ Grok 委派规律**（11 次调用的结论）：**具体编辑 8/9 成，判断与设计 0/2**。
> 问"有没有必要"、"怎么设计优雅"只会回一段步骤然后停。下放就下放执行：指令全内联、
> 数据预先算好、输出格式指定死；**让它去读任务书文件那种指令级间接必挂**（读数据文件没问题）。一律后台跑。
>
> 门禁：type-check clean、**737 条 732 过 0 红 5 skip**。
>
> ---
>
> ## 上一条：2026-08-17（**lcq.stage_02／03b 各补 1 条 event**）
>
> append-only：`lcq.stage_02` 末尾 `lcq.event.baihu_shangguan_escape`（seq 41；timeline 40–59 无「出馆」专拍，取 `#25·第23章·赎身` 五原逃离拍）；`lcq.stage_03b_snake_flower_bridge` 末尾 `lcq.event.zixi_intercept`（seq 54，`#35·第33章·武请`）。`stage_02` 的 `manifest.axisSeqHi` 36→41；`stage_03b` 的 `axisSeqLo` 收到 54（前缀拍低于原窗 61–67）。合同均为手写具体动作，未用 `advance_declared_objective`。未改既有 event、未改 chapters、未跑 `build:single`，未改 `src/`、`tests/`。`mod:validate` PASS（各 1 条未挂章节 warning）。
>
> ---
>
> ## 上一条：2026-08-17（**lcq.stage_08／09／10 末尾补 4 条 event**）
>
> append-only：`lcq.stage_08` `palm_oath_shanghou`(300)／`lcq.stage_09` `xiangfu_stance`(343，王茂弘亲访答立场；非宫变前 302)／`spoils_split`(334，用户约 335)／`lcq.stage_10` `yeying_seat_struggle`(391)。四条均在原轴窗内，未放宽 `axisSeqHi`。合同均为手写双步动作，未用 `advance_declared_objective`。未改既有 event、未改 chapters、未跑 `build:single`，未改 `src/`、`tests/`。`mod:validate` PASS（4 条未挂章节 warning）。
>
> ---
>
> ## 上一条：2026-08-17（**yange 四关各补 1 条 event**）
>
> 在 `lyg.changgan_begins`／`lyg.changgan_interlude`／`lyg.mijing_rumen`／`lyg.shituolin_endgame` 的 `scenario.events` append-only 各写 1 条：`changgan_fanseng_hunt`(1061)／`song_tongwen`(1134)／`mijing_superuser_roster`(1010)／`shituolin_endgame_title_daduhu`(1396)。番僧拍低于原窗，`manifest.axisSeqLo` 1066–1091 收到 1061。合同均为手写具体动作，未用 `advance_declared_objective`。未改既有 event、未改 chapters、未跑 `build:single`，未改 `src/`、`tests/`。
>
> ---
>
> ## 上一条：2026-08-17（**lyl.xiaoyingzhou_blacksea_trap 末尾补 4 条 event**）
>
> 在 `lyl.xiaoyingzhou_blacksea_trap` 的 `scenario.events` append-only 写入 4 条：`xiaoyingzhou_lin_takes_seat`(581)／`xiaoyingzhou_cement_truce`(618，取 613/618 成交拍)／`xiaoyingzhou_paper_plan`(575)／`xiaoyingzhou_paper_mint`(578)。水泥拍超出原窗，`manifest.axisSeqHi` 567–615 放宽到 618。合同均为手写具体动作，未用 `advance_declared_objective`。未改既有 event、未改 chapters、未跑 `build:single`，未改 `src/`、`tests/`。`mod:validate` PASS（4 条未挂章节 warning）。
>
> ---
>
> ## 上一条：2026-08-17（**lyl.han_palace_endgame 末尾补 3 条汉宫前因 event**）
>
> 在 `lyl.han_palace_endgame` 的 `scenario.events` append-only 写入 3 条：`han_jianyu_refused`(898，原隔离关 `luoyang_coup` `s06_05` 改挂本关)／`han_power_vacuum`(901)／`han_sponsor_dingtao`(902)。`manifest.axisSeqLo` 收到 898 以容纳回绝拍；`axisSeqHi` 仍 947。合同均为手写具体动作，未用 `advance_declared_objective`。未改既有 event、未改 chapters、未跑 `build:single`，未改 `src/`、`tests/`。`mod:validate` PASS（3 条未挂章节 warning）。
>
> ---
>
> ## 上一条：2026-08-17（**lcq.stage_07 末尾补 4 条二级线 event**）
>
> 在 `lcq.stage_07_qingyuan_jiankang` 的 `scenario.events` append-only 写入 4 条：`wangzhe_letter`(237)／`xiao_opens_resources`(276)／`shanghou_revealed`(222，原隔离关 stage_06)／`palace_haunting_rumor`(241)。`manifest.axisSeqHi` 已是 278，未放宽。合同均为手写具体动作，未用 `advance_declared_objective`。未改既有 event、未改 chapters、未跑 `build:single`，未改 `src/`、`tests/`。`mod:validate` PASS（4 条未挂章节 warning）。
>
> ---
>
> ## 上一条：2026-08-17（**lcq.stage_12 末尾补 3 条江州余波 event**）
>
> 在 `lcq.stage_12_jiangzhou_counterwar` 的 `scenario.events` append-only 写入 3 条：`pengyi_takeover`(534)／`jin_vacate_jiangzhou`(487)／`tuntian_post`(495)。`manifest.axisSeqHi` 仍为 550，未放宽。合同均为手写双步动作，未用 `advance_declared_objective`。未跑 `build:single`，未改 `src/`、`tests/`。
>
> ---
>
> ## 上一条：2026-08-17（**lcq.stage_05b 末尾补 5 条昭南高潮 event**）
>
> 在 `lcq.stage_05b` 的 `scenario.events` append-only 写入 5 条：`biling_bay_stance`(139)／`huamiao_coop_boundary`(150)／`ghost_king_swallowed`(205)／`slay_dragon`(211)／`tribes_pledge`(218)。`manifest.axisSeqHi` 放宽到 218。谢艺只写重伤交代、不写死。
>
> 门禁：`npm run mod:validate -- …/lcq.stage_05b.json` PASS（5 条未挂章节 warning，未改 chapters）；`npm run build:single` 全绿。
>
> ---
>
> ## 上一条：2026-08-16（**锚改成"知道"、主轴落 event、八条线重写完**）
>
> 本轮把二级线从"骨架"推到"可评审"，并纠正了一条贯穿全局的口径错误。
>
> **① 锚＝你知道那件事的那一拍**（用户裁定，收窄原规则）。原来「国家线锚地点、宗派线锚人」
> 判的是*你到了能知道的位置*：走进建康不等于知道宫里闹鬼，见到朱老头不等于知道"黑魔海"这个名字。
> 八条线全部改为事件锚；地点／人退为指引落点说明，不再参与判定。
> ⚠ 受数据限制：`beat 1399 : event 396 ≈ 3.5:1`，"知道"是 beat 层事实而锚只能落 event。
> 晋国（闹鬼 seq 241–242）与唐国（番僧猎杀穿越者 seq 1061）那一拍 event 层查无，
> 已各挂 `new` 节点排进待补，并用 `anchorEventPending` 声明暂用粗锚——**锚到不存在的 id 上线就永远打不开**。
>
> **② 坐标换成 `axisSeq`，不用关号**。关号是路由产物（8 关隔离静默跳过，"第 24 关"不是玩家看到的第 24 关），
> 且一关几十拍会把关内乱序整个吃掉。换坐标后：按关号只看出 1 条线有序问题，实际是 **7 条线 12 处回退**。
> 已修四处真回退（昭南入口排在调查前、星月湖旧案排在报丧后、宋国太皇太后排在高俅后、唐国顶点排在搜查宫中前），
> 并加门禁 `ready 节点按全书时间线序排列`。
>
> **③ 主轴落 event**（Grok 执行）：20 条节点补 `eventId`＋`status`，17 ready／3 new（三个隔离关节点）。
> 此前主轴在事件层认领 **0** 条，三级认领无从开始。
>
> **④ 八条线全部按 beat 级重写**，共 **109 节点**（✅／🆕／⏳ 三档）。高潮战另补 11 条现成 event——
> 先前每场仗只挂一条代表拍（黑魔海一场仗五拍只认领了中间那拍）。
>
> **⑤ 扩写与待补分清**（用户裁定）：「正典有、游戏没落地」＝`new`（该补 event）；
> 「正典压根没有」＝`pending`（未来待扩，本阶段不细化）。太乙扳倒掌教／黑魔海天命侯授名／晋国顶点
> 三处原先被我写成带完成判据的 `new`，等于把我们的设计伪装成待补的既有内容，已改回单条 pending。
>
> **门禁**：type-check clean、736 条 731 过 0 红 5 skip。
> ⚠ 测试运行器有约 **12%** 抖动（报 `Unable to deserialize cloned data`，随机换文件，非断言失败）；
> 三种调用形态对照 8 轮各 0/1/1，**不是 `--test-concurrency` 位置问题**，遇到复跑一次确认即可。
> ⚠ `npm test -- --test-concurrency=1` 会把标志放到 glob 之后；要真串行请写
> `node --test --test-concurrency=1 tests/*.test.mjs`。
>
> **未完**：39 条 🆕 event 待写；61 张机会卡待重写（用户评"质量偏低"）；
> P0-5 三级认领（主轴已可参与）；P0-4 移动概念；人物任务线初稿（Grok 连试四次未产出）。
>
> ---
>
> ## 上一条：2026-08-16（**八条二级线机会卡补齐：太乙／星月湖／毒宗／唐**）
>
> 用户裁定：二级线要做成可玩。上一轮汉／昭南／晋／宋 27 张已挂；本轮补剩下四条 ready 节点。
>
> **已交付（未 commit）**：给 12 个空卡 ready 节点挂了 **24 张**新机会卡（全库 37→61）。改的是 `mod-kit/generated/deepseek-v4-flash/{book}/stages/*.json`，已 `sync-builtin-mods`。卡都是真岔口，`rewardKey` 用 `permission.<book>.<faction>.<what>`。太乙后续（教御支持度／掌教归属／卓云君个人线）未动。
>
> | 线 | 本轮新卡 | 说明 |
> |---|---|---|
> | 太乙真宗 | 6 | 三节点各 2 张。九阳名分按对手交易写：认出处换支持 vs 只收银不落名 |
> | 星月湖 | 4 | `s03b_04` 已有昭南并路 2 张，不重挂。未做入营判据 |
> | 黑魔海／毒宗 | 6 | 未写天命侯名分。`s04_02` 现场无朱老头 related，按同列向导＋武二郎护列做岔口 |
> | 唐国 | 8 | 四节点各 2 张。未做入仕判据 |
>
> 仍不挂：汉国 `s01_09`（`local_condition`，再挂会打坏 R2-11E）。
>
> 门禁：`type-check` 全绿；`npm test -- --test-concurrency=1` 726 pass／5 skip／0 fail；改过的 11 个 stage `mod:validate` 全 PASS。
>
> 安装脚本（幂等）：`scripts/apply-secondary-line-opportunity-cards.mjs`（本轮增量 `add-secondary-line-opportunity-cards-sect-tang.mjs`）。
>
> ---
>
> ## 上一条：2026-08-16（**四条二级线机会卡：汉／昭南／晋／宋**）
>
> 用户裁定：二级线要做成可玩，不能只剩 objective＋完成键。本轮只动内容写完的四条国家／地区线。
>
> **已交付（未 commit）**：给 14 个 ready 节点挂了 **27 张**新机会卡（全库机会卡 10→37）。改的是 `mod-kit/generated/deepseek-v4-flash/{book}/stages/*.json`，已 `sync-builtin-mods`。卡都是真岔口（选 A／选 B 权限不同；忽略不受罚），`rewardKey` 用 `permission.<book>.<faction>.<what>`，人物只用权力层在场者。
>
> | 线 | 新卡 | 说明 |
> |---|---|---|
> | 汉国 | 9 新＋原有 2（`s01_05`） | `s01_09` 不挂：已有 `local_condition` 完成合同，再挂 worldActor 会打坏 R2-11E |
> | 昭南 | 6 | 选边因花苗／白夷无权力层在场人物，做成「云家中立 vs 先通报碧鲮」 |
> | 晋国 | 6 | |
> | 宋国 | 6 | 临安无贾师宪／林冲花名册，线报岔口挂在云苍峰商网上 |
>
> 门禁：`type-check` 全绿；`npm test` 726 pass／5 skip／0 fail（那 5 条 skip 仍是到场冻结与旧验收的旧账）。
>
> 安装脚本（幂等）：`scripts/apply-secondary-line-opportunity-cards.mjs`。
>
> ---
>
> ## 上一条：2026-08-16（**R3-10 主线轴 ＋ 二级线骨架，16 提交**）
>
> **今天的完成线**：world_sim 从"玩家问不出主线是什么" → 主轴可见 → 八条二级线有骨架、可进游戏测。
>
> | 层 | 状态 |
> |---|---|
> | 主线轴 | 15 关／20 节点／六层方向（层六锁）／两条完成要求 |
> | 二级线 | 8 条，入口锚（宗派锚人·国家锚地）＋ 待办指引 ＋ **41 节点骨架**（ready/new/pending 三档） |
> | 声望 | 全局引擎结算 ＋ 地区立足度派生 |
> | 到场冻结 | 10 条权力事件，玩家不在现场帝统不易主 |
> | UI | 侧栏「任务目标」（world_sim 形态）＋「可投的门路」 |
>
> **⚠ 三笔明账，别当已完成**：
> 1. **5 条 R2-10／R2-11 验收测试已 skip**，断言原样保留。它们与到场冻结正面冲突
>    （旧：不介入→到期场外结算；新：没到现场→根本不发生）。用户已说明确有一些 objective
>    需要时效、玩家没选择就该自动发生——**那批过滤做完后必须回头重判这 5 条**。
> 2. **移动概念未建**（见下方地基弱点）——用户裁定任务链完成后必须做。
> 3. **41 个节点里 15 个 pending 待扩**，逐条写在 `secondaryLines.ts` 的 `pendingExpansion`。
>    太乙 ⚠ 最多（掌教斗争大面积没落地），黑魔海缺的是玩家侧名分（「天命侯」全库 0 条 event）。
>
> **核心文档**：`docs/R3-10-BACKLOG-2026-08-16.md`（优先级）、
> `docs/R3-10-MAIN-QUEST-AXIS-DRAFT-2026-08-16.md`（主轴真值源）、
> `docs/R3-10-SECONDARY-LINES-2026-08-16.md`（八条线归属）、
> `docs/R3-10-HAN-QUESTLINE-2026-08-16.md`（汉国样板，其余七条照此形态）。
>
> ---
>
> ## 上一条：2026-08-16（**R3-10 主线轴与二级线入口，前 8 提交**）
>
> 起因是 R3-9 交接书 §6 的实测缺陷：world_sim 下玩家问「我怎么知道主线是什么」，
> 而该模式把长期方向整个关掉了——**从"不催"滑到了"不说"**。自由的应是推进节奏，不是方向感。
>
> **已交付**（`68ab0f2` → `86250ad`，门禁全绿：type-check clean／723 测试／build:single）：
>
> | 提交 | 内容 |
> |---|---|
> | `68ab0f2` | 主线轴：15 关／20 节点／六层长期方向（层六属试验场暗线，解锁前不进 prompt）／两条完成要求 |
> | `637a759` | 二级线重排：公会 3 ＋ 国家地区 4 ＋ 商队经营层独立成稿 |
> | `f2e1dc0` | 锦囊结案（MiniMax 全书重抽）＋「祭祀大阵」推断修正＋晋国从宋国拆出 |
> | `975e325` | 未了账按优先级铺开（`docs/R3-10-BACKLOG-2026-08-16.md`） |
> | `8f1907a` | 声望：全局累加改引擎结算 ＋ 地区立足度改派生量 |
> | `722be7e` | 广阳归晋（官方附录地图判定） |
> | `e1b3150` | 二级线入口锚：宗派锚人／国家锚地；主轴 3 条死节点复活 |
> | `da91787`／`1ff7e03`／`86250ad` | 入口指引改待办提示（不设确认手续）；昭南改锚商队 |
>
> **核心设计口径**（用户裁定 2026-08-16，后续不要推翻）：
> ① 二级线的发展**不能靠 LLM 自己发挥**，要稳定可靠、玩家随时能触发（上古卷轴式）；
> LLM 的发挥只留给小支线与流言。② **国家／地区线锚地点，宗派线锚人**（昭南破例，见下）。
> ③ 入口只作**待办提示**，不设"接受任务"手续——引擎把话说清楚，不替玩家签字。
>
> **⚠ 已交付功能的地基弱点（用户裁定：任务链完成后必须做）**：
> **没有"移动到某个城市／建筑"的概念**。位置格式虽是定死的三层
> （`大陆·世界地图地点·区域建筑`，`dataDefinitions.ts:22`），但玩家换地方不是一次"移动"，
> 只是 LLM 某一轮改写了 `角色.位置.描述` 这个字符串——没有出发、路途、到达，
> 也就无从校验、拦截或计时；解析器还只做子串最长匹配，不认三层结构；更没有可达性约束，
> 模型可以让玩家下一轮直接出现在长安。
> **后果**：`secondaryLines` 的国家线入口锚与 `lineCriticalFrozen` 的到场冻结，
> 可靠性上限就是模型写字符串的稳定性——**别以为地点判据是硬的**。
> 要补三件：移动成显式动作（出发地／目的地／耗时）、按三层结构解析、可达性校验。
> 详见 `docs/R3-10-BACKLOG-2026-08-16.md` P0-4。
>
> **⚠ 三条踩出来的纪律，务必遵守**：
> 1. **改剧本数据要动 `mod-kit/generated/.../{book}/stages/*.json`，不是 `src/modules/scenarioMods/builtins/data/`**
>    ——后者是生成物，`sync-builtin-mods.mjs`（`build:single` 的 prebuild）会覆盖。本轮有一次"提交了但下次构建就消失"的假修复。
> 2. **写文件／改数据不要和门禁并行**。本轮三次假失败（722→705／697）都是 `npm test` 的 glob 展开
>    与文件写入撞车，或 Grok 改 JSON 时并行跑测试。串行执行。
> 3. **归属判断只认事件层**（`scenario.events` 的 name／description／objective／axisBeat ＋ `worldSimulation`）。
>    `canon.characters`／`canon.factions`／`canon.locations` 是共享正典注入到每一关的，
>    拿在场当依据必错——本轮据此错了三次（虚高最高 16.5 倍）。**地理判断以官方附录地图
>    `shared-atlas/source-maps/` 五幅分帧为准。**
>
> **另两个坑**：`canonRail.DEFAULT_LINE_QUARANTINED_STAGE_IDS` 让默认路线静默跳过 8 关，
> 锚在这些关上的东西会静默失效（主轴曾因此死 3 条节点）；同一地点常有**孪生 id**，
> 选错就是死锚（临安 `lin_an`／`linan_city`、长安 `lyg.location.changan`、洛都 atlas 孪生均不可用）。
>
> **下一步**：八条线现在只有门、门后基本是空的（Grok 盘出 38 项待补，6 条阻塞可玩性）。
> beat 级重梳回来后按"⚠ 原著有、游戏没有"那一类补内容。stage 级已测主体关数：
> 南荒·昭南 6／汉国 4／宋国 3 成块可打穿；晋国 1／黑魔海 2／星月湖 1／太乙 1 是穿线型半成品。
> 最后更新：2026-08-16（**R3-10 数据错三批**：P2-4 三条征兆只改标题与同源 summary/omen、`sourceEventId` 不动；P1-1 广阳／晴州／宁州只改高置信 description、region 全不动；P1-3 媚娘有素材未入库，方案待复核、未改 JSON。不改 `src/` 运行时。门禁见本条执行记录。）
> 最后更新：2026-08-16（**R3-10 主轴 20 节点接入 prompt/UI**：`storyContext` worldMode `nextSection` 在长期方向之后、可切入点之前插入「本关主线节点」；`RightSidebar` world_sim 任务面板同步一行；二级线关卡整行省略、不暗示本关不重要。`tests/mainQuestAxis.test.mjs` 6 条，含全 37 关「层六绝不返回」红线。711/711、type-check、build:single 全绿。**未 commit**。）
> 最后更新：2026-08-15（**R3-9 好感体系落地，13 提交**：8 档阶梯＋三档姿态投影＋六处散落阈值统一；命令门禁（白名单/±15 净额/cap）；45 份角色专属姿态档案（主要女性 39/39 全覆盖）；13 人好感上限；在场门槛（点名不再等于召唤）；相识账本（持久化＋跨关继承，否定未相识者的投影身份）；滞回接线（**路线图 G1「1 点不翻脸」现已满足**）；共历事件好感结算＋结算进玩家可见状态流。Grok 独立二审 7 条全部核实修复。705/705、type-check、build:single 全绿，**⏸ 无第三方签核**。未落＝事件驱动降档（负向）／§4 受控词表／§6 关卡标定。交接与 Grok 并行任务书＝`docs/R3-9-HANDOFF-2026-08-15.md`，**并行任务硬约束：不得改动 `src/` 运行时**，以免打断游戏测试。）
> ⏸ **分工临时状态（2026-08-14 用户裁定）：Codex 暂不可用，本阶段只用 Claude / Grok 两方；签核位 = OPEN。Codex 恢复后回到既有三方分工，届时删除各处 ⏸ 标记即可（原文一律保留未改）。** 口径与纪律见下方同日「分工临时挂起」条与 `RELEASE-ROADMAP.md` 修订记录 2026-08-14 条。
> 最后更新：2026-08-14（**⏸ 分工临时挂起：Codex 不可用，签核位标记 OPEN**）：本条**覆盖** 2026-08-14「多模型扩量分工调整」与 2026-08-13「R3-9」两条中的 Codex 部分，**其余内容不变**。处置＝①整合、②自动化门禁（`type-check`／`canon:build`／`validate:all`／`build:single` 都是确定性脚本，谁跑结果都一样）由 Claude 接，须把命令与完整输出落进报告形成可复跑证据链；③**独立签核 `sourceGuardPassed` 无承接方，标记 OPEN**，用户要求"先标记、之后手工判断用哪个模型"，不设常驻代理。三条纪律：**(a) 签核缺位不得阻塞推进**——抓到 P0/P1 的主力历来是 Claude 独立二审（R2-10B、R3-10 G1 判 FAIL、R3-5 信任边界 P0），Codex 签核产出主要是证据链背书，缺席损失的是形式强度而非缺陷检出率；**(b) 独立性靠交叉审保住**——Grok 实现的由 Claude 审、Claude 起草的由 Grok 反向审，任一方不签自己那半的字；**(c) 报告须显式标注"无第三方签核"**，沿用 R3-8B"按现状采用、审定强度低于上一档、如实标注"的诚实惯例。选型备料（实测 OpenRouter `/models`）：`deepseek/deepseek-v4-pro` 存在（1M ctx，$1.168／$2.336 per M），`-0813` 便宜约 2.7 倍；但纯 API 模型只能看喂给它的材料、不能自跑门禁核对仓库，若选它应定名为"独立二审"而非"签核"。
> 最后更新：2026-08-14（**游戏测试前置条件已打通 + 选题错位闸门实测定案**：改过模组数据后进游戏要三步，缺一步就测到旧数据——① `launchctl kickstart -k gui/$(id -u)/com.xiantu.devserver` 重打包（验证抓 in-memory bundle 的 `curl /XianTu.js | grep`，新文案命中 1、修复前错位文案命中 0）；② **进一次"剧本模组"页**触发 `seedBuiltins()` 按 `builtinVersion` 重播种（首页加载不触发；该库原本停在 8/13、`world-sim.baseline` 0 条，现 357 条、模板文案 0）；③ **必须开新档**（存档内嵌建档那刻的 scenario 快照，旧档看不到新征兆；实测新建世界模式档内嵌 9 条全为精修文案）。创角第一步的叙事方式"六朝世界"是显式 opt-in，不选则走原著同行。**选题错位闸门实测定案**（报告=`docs/WORLD-SIM-OMEN-ALIGNMENT-AUDIT-EVAL-2026-08-14.md`）：确定性专名重合度否决（召回 4/6、误报 18/22）；Grok agent 只读审计可用——带标签集召回 6/6、干净数据误报 0/121、成本约 $2/批，但**交付不稳**（10 关有 1 关返回空、中间推理会抖动）。因交付缺口可机械检测（条数不符）而判断质量不可检测，形态定为：merge 后逐关审计，覆盖 fail-closed 重跑，misaligned 结论送人工回读而非直接拦批次。**尚未接入管线**。真实回合送达征兆未实测（用户自行选章开档测试）；自测角色／存档／活动指针已清理还原。）
> 最后更新：2026-08-14（**燕歌精修完成，三本书 357/357 全部收口**：聚焦复审 job `claude-2026-08-14T13-16-59-263Z-e40bd59f` **PASS**、无 P0／P1，独立复跑 focused 6/6 并用 `git diff --numstat` 确认改动只落在 `lyg.changgan_interlude` 数据与元数据，events／条件／时钟／锚点／其余 9 关／清羽云龙 251 条均未触碰。"选题错位而非杜撰人物"的定性被独立复核并扩展验证（囊瓦、磨勒、廖群玉、岳霏等同样不在 registry 但在本关 event 原文有出处）。复审所提 P2 为计数口径差异（22/7/7 对 16/4/4）——本文计数取燕歌批次之前的提交，刻意避免用待证文本自证，已在报告写明。覆盖率实测：清羽 159／云龙 92／燕歌 106 = 357/357 baseline 征兆全部精修，残留模板文案 0。**下一门=G2 正式 UI 验收（未开始）**；遗留技术债=征兆"选题错位"缺乏可自动化闸门。）
> 最后更新：2026-08-14（**燕歌二审 P0 已关闭，待聚焦复审**：二审 job `claude-2026-08-14T12-50-51-698Z-04429c2b` 判 FAIL——`lyg.changgan_interlude` 的 `_04`–`_09` 六条征兆写的是本关别的事件，其中 `_09` 把 `_10` 才该揭的白霓裳／王守澄一线提前摊开一拍。**对二审定性作了修正**：它据"人名不在 canon.characters"推向无源新事实，但复核改动前数据这些名字本关原本就有出处（王守澄 16 次、林娘子 4 次、贾师宪 4 次），实为选题错位而非杜撰。该关以 medium effort 整关重跑修复，10 条全对齐，48 处字段变化 0 处越界、events 未变。**错位范围已定界**：用专名重合度对全部 357 条（含已关门的清羽／云龙）分诊，22 条告警逐条回读，真错位 4 条全在该关，其余 18 条为误报，清羽／云龙无此缺陷、G1 不重开。P1（测试与生成期对"整段情节挪错位置"是盲区）属实，但该启发式实测召回 4/6、误报 18/22，不足以作闸门，登记技术债。根因是 low 档退化（另一关的 placeholder 凑数同源），`WORLD_SIM_EFFORT` 默认已改 medium。focused 6/6、`canon:build` 37 关／600 测试、`type-check`、`build:single`、`git diff --check` 全绿。）
> 最后更新：2026-08-14（**燕歌 world-sim 征兆精修已实现、待二审**：Grok 4.6 Build 逐关生成 10 关／106 条首稿，管线改为按批运行（`WORLD_SIM_BATCH`）、打包时装载全部 overlay 并对同一 situationId 被两批认领直接抛错；生成合同补入上一批二审换来的两条硬约束（全文中文／人名逐字一致／不得自造人名；揭秘型事件不得用肯定句提前说谜底）。**生成期发生真实拒收**：`lyg.shixiang_ambush` 在 low effort 下连续两次中途放弃、自造 placeholder 条目凑满 schema 定长（6/14、8/14 真内容），均被 merge fail-closed 拦下；提示词体积不是原因（该关 31KB 为第二小，最大 104KB 的 mijing_rumen 一次过），改 medium effort 后 14/14 无占位，全批成本 $1.42。结构化 diff：606 处字段变化、0 处越界，`scenario.events` 未变，定陶人工纵切工作树无改动；自查扫描禁用词 0、拉丁残留 0，讹名启发式 30 条候选逐条回查全部有据。测试面改为按批表驱动（251／106 双锚点 + 同一 situationId 不得被两批认领），并兑现上一批接口——严格闸门现覆盖 `situation.title/summary`，判据 `world-sim.baseline.` 前缀，人工纵切按 #154／#155 不受影响，已负向测试确认会红。focused 6/6、`canon:build` 37 关／600 测试、`type-check`、`build:single`、`git diff --check` 全绿。**独立剧情二审未做，G2 未开始**。报告=`docs/WORLD-SIM-REFINEMENT-YANGE-2026-08-14.md`。）
> 最后更新：2026-08-14（**清羽／云龙 world-sim 征兆精修二审门已关闭**：Claude 只读二审 job `claude-2026-08-14T00-45-55-262Z-fcdbe608` 判 FAIL，1 P0／2 P1／3 P2／1 P3；接手方逐条复核证据后已关闭全部实证项。P0=`fruit_conflict` 征兆用"正是／便是……阮香凝"提前把该 event 唯一玩家动作（确认凝姨身份）的谜底讲完，复核时把 `summary` 里的"凝姨即林娘子"一并纳入并改写为只写可观察摩擦。P1／P2=`银 ingots`、`高俅 encel?`、`内院 Curtain`、`江面 mult` 四处英文残留（全量扫描确认仅此四处），以及回归测试禁用词正则弱于生成期——现由共享模块 `scripts/world-sim-omen-guards.mjs` 统一，并补生成期原本缺失的拉丁残留闸门，收严前实测 37 关 omen 字段 0 命中、并经注入违规词的负向测试确认会红；测试面不扩到 `situation.summary`，因燕歌 11 关 107 条仍是未精修基线模板。**另修一条二审未发现的实证缺陷**：`s04_05` 四个字段把正典角色谢艺写成 registry 中不存在的"谢仪"（父提交 0 次命中，系本批引入）。P2-3 专名溯源闸门与 P3 措辞模板化只登记：两种候选闸门实测分别产出 14 条全假阳性与 4410 条噪声，不可用。修复后 focused 6/6、`canon:build` 37 关／600 测试、`type-check`、`build:single`、`git diff --check` 全绿；内置差异仅 5 个 stage 共 12 行表现字段 + manifest 哈希，registry 时间戳噪声已还原。裁定 #158。）
> 最后更新：2026-08-14（**清羽／云龙 world-sim 征兆精修已进入二审门**：本机 Grok 4.6 Build 按 stage 读取事件、地点、相关人物卡，完成两书 26 关／251 条标题、当前压力、可观察事实、候选传递者、环境兜底与正文插段首稿；Codex 新增可缓存、可拒收、可重跑的批处理脚本与 tracked overlay，逐条锁定原 `stageId + situationId + sourceEventId`，不改事件、条件、时钟、锚点、IF 或结果。人物候选只允许事件既有 relatedCharacterIds，messenger／environment 永久兜底；251/251 映射测试、37 关 schema 与 `canon:build` 600/600 已绿。Grok 自审因只返回 placeholder 已拒收，不计验收证据；下一门为固定提交上的 Claude 剧情二审，关闭 P0/P1/P2 后方可宣称两书精修完成。裁定 #158。）
> 最后更新：2026-08-14（**六朝世界模式全 37-stage baseline 已生成**：Grok Build 尝试执行但被本机 MCP 读取故障阻塞，Codex 依照同一合同边界收口为可重复脚本 `scripts/expand-world-sim-baseline.mjs`，为其余 36 个 stage 生成 357 个保守 situation/omen；定陶人工纵切原样保留。所有 37 个 builtin stage 均通过 validator，新增 all-stage 回归与既有 35 项 world-sim 聚焦测试全绿，`canon:validate`、`type-check`、37-stage mod validate 全绿。baseline 只保证可进入 `world_sim` 并继续游玩，不代表承重剧情已完成；Claude 逐关剧情／人物复核与真机验收仍是收尾门，裁定 #157。）
> 最后更新：2026-08-14（**baseline 征兆计时 P1 已收口**：Claude 二审发现自动生成局势借用全局 `stallTurns`，无关推进清零后可能饿死征兆；`c4b7612` 改为每个 situation 记录独立激活世界回合，并新增无关推进回归。全量 `canon:build` 37 关／599 测试、`type-check`、`build:single` 全绿；真机验收仍在进行。）
> 最后更新：2026-08-14（**固定提交真机窄复验完成**：Claude true-device job `claude-2026-08-13T18-03-03-070Z-c473b7b0` 在 `9a32dd1` 上 `sourceGuardPassed=true`、工作树干净；A 前置拥立征兆、A 刷新去重/无倒计时、C canon_companion 对照、D 旧 schema 回填均 PASS，B 郭解窗口在已有 B2 证据中正文已出现护送链异动，未再重复请求。唯一旧任务超时不作为最终证据；隔离 evidence 保存在 `.xiantu-server/g2-evidence/w1-omens-20260814/`。）
> 最后更新：2026-08-14（**多模型扩量分工调整**：六朝世界全 stage 扩量由本机 Grok Build 4.6 负责批量盘点、提案与实现首稿；Claude 负责承重剧情／人物一致性复核，并通过独立 true-device 通道承担正式 UI 试玩与 G2 验收；Codex 不再重复代跑人工试玩，只负责分批合并、正典保护、确定性自动化门禁，以及对 Claude `sourceGuardPassed`、运行证据和失败归因的最终签核。真机提交须待对应实现形成干净 Git 提交后进行，测试写入仅限隔离服务与 scratch 根。）
> 最后更新：2026-08-13（**六朝世界 G2 场外推进改为角色内消息送达，旧试玩档可直接续玩**：用户实测发现主阅读面仍在等待登基时，右栏已提前且重复显示郭解死讯。根因是世界发生／公开／玩家知情三账虽已分离，但表现层没有把知情回执送进主阅读面，同一推进批次又同时写“消息传来／世界自行推进”。现按用户裁定撤除曾拟议的 UI 局势倒计时与“局势转变”标签：未公开前只允许正文自然呈现岗哨、奔走、失联等征兆；知情门成立后由新增 `timeline.reveal.presentation` 以世界内渠道一次性送达主阅读面。首例为郭解“宫中黄门急报”与董卓“凉州军骑使密札”；右栏只作事后回看，同一 worldDelta 新旧档均去重。旧档 reconcile 只为缺失的事件快照补 `presentation`，不改 timeline 规则、世界回合、事件结果、关系或正文，已公开事件不倒带重演。裁定 #155；定点 34/34、`canon:build` 37 关/585 测试、`type-check`、`build:single` 全绿。）
> 最后更新：2026-08-13（**R3-9 关系姿态与差异化反应层已获用户批准，加入待构建队列**：复用现有 `社交.关系.<NPC>.好感度[-100,100]`，将角色画像／阶段人格的稳定底色与动态关系姿态分层；**关系只改变人物如何对待玩家，不改变人物是谁**。同一玩家动作在低／中／高好感下必须呈现不同的语气、解释倾向、信息披露、协助意愿与边界方式，但不得把高好感等同无条件服从，也不得让低好感覆盖正典人格、已知事实或私有知识门禁。G1 以吕雉为首个高／中／低 A/B/C 对照纵切，并至少补一名不同性格 NPC 证明机制可复用；关系姿态由本地确定性投影，LLM 只负责人物化渲染，关系值变化仍经现有结构化命令校验。分工：Claude 负责人物弧光／语域矩阵与剧情护栏，Grok 负责运行时实现及成人开启下的合规表现变体，Codex 负责整合、自动化门禁与正式 UI 同动作对照验收。路线图权威项见 `RELEASE-ROADMAP.md` R3-9。）
> 最后更新：2026-08-13（**六朝世界模式 G2 玩家试玩纵切完成并通过 Claude 聚焦复核**：主页“六朝世界试玩”一键建立固定、可重置的本机隔离角色，进入现有阅读面自由输入并显示世界局势；刷新后可继续，三项局势结束显示定陶王／郭解／董卓结果及三项评分、反馈复制。试玩 SaveData 与角色元数据均走 localOnly，远程元数据剔除试玩角色并保留试玩前活动指针，remote-first 启动仍合并本机试玩档；加载、保存、另存、导入／导出、修复、快照、备份、迁移、回滚和删除旁路均已收口。浏览器验证主页→新建→正常 UI→刷新→续玩，并证实自由输入进入真实叙事请求；当前测试机 API 流 90 秒未返回，已安全重置，不把外部叙事记成功。首轮 Claude job `claude-2026-08-13T13-40-23-502Z-30850501` 找到导入存档远端泄漏 P0，修复后聚焦 job `claude-2026-08-13T13-49-19-207Z-c4a5249c` PASS、无 P0/P1/P2、`sourceGuardPassed=true`。`canon:build` 37 关/580 测试、`type-check`、`build:single` 全绿；手册=`docs/WORLD-SIMULATION-MODE-G2-PLAYER-PLAYTEST-2026-08-13.md`；已留一个全新世界回合 0 的本机试玩档。）
> 最后更新：2026-08-13（**六朝世界模式 G1 可验证 Demo 完成并通过二审**：主页新增“六朝世界 Demo”，用生产 runtime 在纯内存中复现 `lyg.dingtao_beijing s01_05–07`；一键默认线 19 轮/0 LLM 完成三项场外结算且三个玩家 `done=false`，郭解与董卓两条固定成功仅生成待确认候选，玩家确认后才原子落正式 IF。创角第一步对带合同的 Mod 显式提供“原著同行（默认）/六朝世界”，仅新档可 opt-in。浏览器实测默认线与两条 IF 全通过，控制台零新增 error。Claude Demo 专项二审 `claude-2026-08-13T12-28-31-066Z-ef7a2dc5` 确认隔离/确认/兼容核心边界；其发现均已修复，聚焦复核 `claude-2026-08-13T12-49-51-083Z-2b373bca` 四项 PASS、无 P0/P1/P2，补充 P3 探索旁路也已 fail-closed。`canon:build` 37 关/578 测试、`type-check`、`build:single` 全绿；演示手册=`docs/WORLD-SIMULATION-MODE-G1-DEMO-2026-08-13.md`。）
> 最后更新：2026-08-13（**六朝世界模式 G1 隔离纵切完成并通过多模型复核**：新增显式 opt-in `storyMode=world_sim`、局势/硬锚点/可分叉结果/参考拍 schema 与 validator，首个 `lyg.dingtao_beijing s01_05–07` 纵切以定陶王继统为硬锚点，郭解/董卓死亡为默认期限，只有本地判定成功＋玩家确认才能复用两条已有生还 IF。LLM 在世界模式不能写剧本 flags；合同缺失或耗尽不回落 Rail；确认 IF 会关闭旧默认期限。Grok 六项设计意见已落实；Claude 首轮/两次聚焦 job=`claude-2026-08-13T11-43-07-560Z-26774040`、`claude-2026-08-13T11-59-11-634Z-986c2451`、`claude-2026-08-13T12-11-55-565Z-e9acd864`，最终 P0/P1/P2 PASS。A–F 与竞态回放、`canon:build` 37 关/573 测试、`type-check`、`build:single` 全绿。实现报告=`docs/WORLD-SIMULATION-MODE-G1-2026-08-13.md`；复核记录=`docs/WORLD-SIMULATION-MODE-G1-MULTI-MODEL-REVIEW-2026-08-13.md`。）
> 最后更新：2026-08-13（**六朝世界模式 G0 规格与燕歌定陶王纵切重分类已完成，待 G1 运行时实现**：用户批准将约束从逐拍 Canon Rail 下沉到世界因果层；现有玩法命名为兼容模式 `canon_companion`，旧档与默认行为不变，实验性 `world_sim` 以局势、NPC 决策、期限与稀疏锚点为中心。`lyg.dingtao_beijing` 的 `s01_05–07` 已重分类：定陶王政治继统是唯一硬锚点，郭解／董卓之死是有默认期限且可由既有生还 IF 替代的枢纽，原著逐拍只在结果成立后作表演素材。G0 未改 runtime、prompt、schema、canon JSON、内置 Mod 或用户存档；裁定 #154，规格=`docs/WORLD-SIMULATION-MODE-G0-2026-08-13.md`。`npm run canon:build` 37 关、558/558 全绿。）
> 最后更新：2026-08-10（**R2-17 G1A 已完成 Claude 二审修复，待真机验收**：首例 `lyg.mijing_rumen` 的 non-critical《阳武侯小史》流言与唯一主线锚点并列且可忽略；私下问小紫写 confirmed 王蕙著书／皇叔为附会，街巷听风只写 rumor，并只在 `s02_09` 消费叙事入口。首轮二审 job `claude-2026-08-10T08-07-32-690Z-d13aa6f8` PASS、无 P0；其 P1/P2/P3 已收口为全局合同：path dimension 与 spec 对齐，探索账本 ID 按 `event.id` 命名，跨关同 ID fail-closed，互斥只保留单一预检权威，重放不重复落账，事件审计顺序前移，认知抽屉拆为真实 mounted Vue 回归。`type-check`、`build:single`、`canon:build` 37 关及 558/558 测试全绿。`lcq.stage_05→06` 仍只作 G1B 候选，不提前确认母女关系、不全库裸灌。裁定 #152/#153；规格=`docs/R2-EPISTEMIC-EXPLORATION-DRAFT-2026-08-10.md`。）
> 最后更新：2026-08-03（**单机化清理 G4A：创角会话已固定为单机，门禁通过、待提交后二审**：G3 提交=`150731b`，Claude job `claude-2026-08-03T15-22-30-958Z-f47b8cdf` PASS、P0/P1 无，P2/P3 按用户要求只登记。G4A 移除云端角色会话模式、兑换码 AI 生成与各创角步骤的联机分支；创角 payload 固定 `单机`，本地自定义、剧本预制与 AI 推演保持可用。显式“获取云端素材”继续通过 `CloudDataSync`/`fetchAllCloudData` 保留，不恢复登录或联机角色会话。`type-check`、37 关 `canon:build`、552/552 测试与 `build:single` 全绿；报告=`docs/SINGLE-PLAYER-CREATION-G4A-2026-08-03.md`。）
> 上一次更新：2026-08-03（**单机化清理 G3：联机死代码与运行态收口已提交并二审 PASS**：提交=`150731b`；删除 13 个旧 view/panel/service/API 共 6,120 行叶节点，拆除联机 prompt、AI 穿越／离线代理注入与提示词只读条件，game-state 读写固定为单机运行态并保留位置坐标。`type-check`、37 关 `canon:build`、551/551 测试、`build:single` 与 bundle 字符串审计全绿；报告=`docs/SINGLE-PLAYER-DEAD-CODE-G3-2026-08-03.md`。）
> 上一次更新：2026-08-03（**单机化清理 G2：旧联机本地缓存可恢复迁移已实现并二审 PASS**：G1 提交=`ae68e96`；G2 提交=`66de7d1`。角色管理页提供显式“复制为单机角色”：来源只读本机 IndexedDB，兼容 `云端修行/存档` 旧 key，不校验 token、不联网补拉；目标为带来源标记的新单机角色与 `存档1`，重复执行复用同一副本，ID 冲突安全。写入失败可重试，原联机角色、旧存档 key 与缓存元数据不删除；新副本进入普通单机存档链。报告=`docs/SINGLE-PLAYER-LEGACY-MIGRATION-G2-2026-08-03.md`。）
> 上一次更新：2026-08-03（**单机化清理 G1：公共入口与运行时联机副作用已收口**：主页固定单机，新角色强制 `单机/存档1`；登录、账号中心、创意工坊、联机游历及未知旧路由均不可达；应用在线心跳、卸载 beacon、穿越日志补发/AI 上报、联机地图标记和主阅读面穿越态已移除。旧联机角色不删除、不联网、不预加载也不允许导入覆盖，先只读保留；本地 IndexedDB 存档、API 管理、`cloudDataSync` 与 devserver 链不动。新增 4 条单机壳/SFC 回归；`type-check`、37 关 `canon:build`、542/542 串行全量测试与 `build:single` 全绿。首次并行 `npm test` 的 Node runner 反序列化异常已由原失败文件 11/11 + 串行 542/542 证明为瞬时基础设施故障。报告=`docs/SINGLE-PLAYER-CLEANUP-G1-2026-08-03.md`。）
> 上一次更新：2026-08-03（**R3-5 命令门禁真机闭环 + 小紫父系单边扩量 G1/G2 二审完成**：真机 job `claude-2026-08-03T00-17-22-363Z-18507b54` 22/22 PASS；扩量提交 `016b381`、`83c3fe4`，`canon:build` 37 关、538/538 全绿。Claude 二审 job `claude-2026-08-03T00-55-22-791Z-0012ab70` 总体 PASS、无 P0/P1；用户决定 P2/P3 仅记技术债：主题窄化可能放松同 holder 其他 claim 的细节防编造、词表外全量表达可能漏答，以及 holder 字面命中/schema 注释/behaviorCue 自动校验三项观察。本轮不修。密档余项经可行性审计，暂无同时满足“命名 holder + holder/subject 同关 + 非待定证据”的新边，停止为凑量扩张。）
> 上一次更新：2026-08-02（**R3-5 第二轮 Claude 聚焦复审 P0 已修并经第三轮复审确认无 P0/P1/P2/P3**：job `claude-2026-08-02T12-15-39-089Z-ce802d53` 确认 #148 的 registry 别名闭包有效，但发现把 confirmed 退休同时用于正文与 `社交.关系` 命令会让秘密永久进入全局共享状态，绕过 holder 隔离并允许无证据扩写。裁定 #149 已更正为“共享别名编译器、不共享披露生命周期”：confirmed 后仅聚焦 holder 正文门禁退休，普通关系结构化写入不论玩家知情与否均永久拒绝；未来公开晋升只能由确定性事件 effect 完成。共享 helper 已改为 narrative-only 命名，回归已证明 confirmed 后正文允许而同内容结构化写入仍拒绝；`npm run canon:build` 37 关、538/538 测试全绿。第三轮 job `claude-2026-08-02T13-07-41-917Z-83a66ffa` 无分级问题。）
> 上一次更新：2026-08-02（**R3-5 Claude 独立二审 P0/P1 首轮修复**：二审 job `claude-2026-08-01T17-25-18-952Z-574c3741` 发现私有母女事实的手写 subjects 漏掉“紫妈妈／紫丫头／碧宛／碧奴”，且正文与命令两层复用同一不完整列表，导致别名可同时绕过。裁定 #148 改为 `subjectId/objectId → registry canonicalName + aliases` 的共享编译器，并新增真实别名×全部 predicate、正文／命令双通道矩阵；`npm run canon:build` 37 关、538/538 测试全绿。其误设的跨通道 confirmed 生命周期现已由 #149 更正。）
> 上一次更新：2026-08-01（**结构化响应／记忆总结失败隔离 G2 已关闭**：正式 UI 隔离角色从中期／长期 9/1 起跑，真实结构化正文成功提交并推进位置、时间；第 10 条中期记忆触发后台总结后进入确定性配置失败／取消路径，最终输入框恢复，中期／长期保持 10/1，正文未回滚、无提前删除或伪长期总结。API throw 由既有注入式自动化覆盖；两层证据共同关闭发测门禁。全局记忆配置已恢复 25/8，隔离角色复原后全局活动指针恢复为本轮开始前的 `[DEV] R3-5 私有知识短复验 / nonholder`，测试浏览器关闭。报告=`docs/STRUCTURED-RESPONSE-MEMORY-SUMMARY-G2-2026-08-01.md`。）
> 上一次更新：2026-08-01（**可见掷骰单一权威遗留项已清账**：共享状态曾把已完成主链误列为发测首选；现补 `FormattedText` SFC 编译 + Vue 组件实例渲染回归，实证历史模型骰点只降级为“旧叙事描述，不计入系统”，非骰点系统提示仍正常显示。可选但未注入默认生成链的 `CULTIVATION_SPEED_RULES` 也已删除旧成功率表、模型判定卡示例与预写失败后果，统一改为本地回执／行动门控。`npm run type-check`、37/37 关 schema、人工裁定执法、主轴／存档契约及 536/536 测试全部通过；未重启测试服、未动存档。）
> 上一次更新：2026-08-01（**R3-5 关系密档知情注入 B/C 异构小批量 G1 + G2 已关闭**：裁定 #146/#147 覆盖小紫／碧姬双向 holder、`s05_13` 事件后解锁与阮香凝持有的高智商身世梦话 rumor。DeepSeek V4 Flash 正式 UI 四路线最终 30 项审计通过；真机先后发现并修复“高俅养父被误写成亲爹”和“私有母女事实反写普通关系状态”两条旁路。统一模型命令入口现拒绝私有关联写入 `社交.关系`，而中性关系状态仍放行。`npm run type-check`、37/37 关 schema、人工裁定执法、主轴／存档契约及 535/535 测试全部通过；测试角色／槽与浏览器已清理、活动指针已恢复。异构批次已关，但其余密档尚未回填，milestone 仍为 `[~]`、全库扩量继续冻结。报告=`docs/R3-5-NPC-PRIVATE-KNOWLEDGE-HETEROGENEOUS-G1-2026-08-01.md`。图片资产线继续暂停。）
> 上一次更新：2026-07-31（**R3-5 关系密档知情注入 B/C 首个 G1 + G2 纵切通过**：裁定 #144/#145 仅解锁清羽 `stage_05→06` 的“谢艺知道碧姬星月湖旧身份链”，世界真值、NPC 私有知情与玩家知识三账隔离。531/531 自动化与 37 关构建全绿；Claude 真机 holder/non-holder 两路线 40/40 断言通过：谢艺的两份越界草稿均被原子门禁拒绝并落上下文化安全答复，小紫不获 claim、不坐实身份链，正文不反写知识／关系／flags，`sourceGuardPassed=true`。本项仍是 `[~]`，未批量回填密档；下一批做不同 holder、阶段后解锁与 rumor 三种异构样本。报告=`docs/R3-5-NPC-PRIVATE-KNOWLEDGE-BC-G1-2026-07-31.md`。图片资产线继续暂停。）
> 上一次更新：2026-07-31（**R2-16 确定性叙事事实回执 G1 + G2 已关闭**：事件级回执只有在匹配的本地动作结果完成并由引擎结算后才进入跨拍承接；完成前从通用 prompt state 剥离，且不进入合同 hash。`s04_02` 真机动作使 `worldTurn 0→1`、完成事件并向 `s04_03` 携带唯一“九名武士”回执；承接复跑顺带补掉“两具尸体”额外精确损失漏拦，最终仅保留定性表述。37 关、526/526 测试全绿；临时槽已清理，用户存档恢复。报告=`docs/R2-16-GROUNDED-FACT-RECEIPTS-G1-2026-07-31.md`。图片资产线按用户指示暂停。）
> 上一次更新：2026-07-30（**R2-14 跨拍叙事事实接地 G2 已关闭**：受控真实回合证明首稿的无来源精确损失被门禁拦截，重写稿安全落账；后续 MiniMax 请求属于事务提交后的辅助审计，未重放玩家动作。Codex 又通过正式 UI 连续两次载入同一存档，最新安全正文各仅出现一次，`worldTurn=9`、叙事 8 条、`s04_06.done=false` 与承接状态均稳定，存档 SHA 前后相同；源码、用户存档与角色列表已恢复，工作树干净。报告=`docs/R2-14-HANDOFF-FACT-GROUNDING-G1-2026-07-29.md`。）
> 上一次更新：2026-07-30（**立绘外观数据线：从零建成单一数据源并投影进运行时**，提交 `6b69325`→`cbf1e98`。①**官图反向回填**：EPUB 官方插图 93 张逐张人工识读，产出 49 人的可画维度（发型/服装/配色/配饰），此前 48 个有官图角色里 18 个在 appearance 库查无此人、服饰维度缺 12/30、配饰缺 25/30。②**原文补抽**：新脚本 `scripts/extract-portrait-visual-from-epub.mjs` 覆盖 84 个无官图角色——根因是旧抽取器的检索权重表身体词 21 个 vs 服饰词仅 5 个，`3×kwCount` 让情色段落占满 top40，模型根本看不到穿着句；新表分层加权（服装 6／配饰 5／发型 5／颜色 4／面容 3／体型 1／纯身体性征 0）后服饰覆盖 41%→68%，污染 0。③**分层**：`portrait-visual-master.json` v2（127 人，ready 65／partial 39／insufficient 23）拆 `identity`（发色/五官/体型＋永久标记＋真身特征，换装不变）与 `outfits[]`（服装/配饰/配色/器物/该套发式，scope=default｜stage:<id>｜unassigned）。④**投影进运行时**：118 人经 registry `staticProfile.visualIdentity/visualOutfits` 进 `characterResolver`，出【体貌】【装束】【真身特征】三条派生 note，第三条带可见性＋知情双门控。**⑤ 新增裁定 #141／#142**（碧姬名链＋蔑称补执行到数据层；图文冲突一律回原文裁定）。⑥ 补 7 张缺失角色卡（registry 308→315）。⑦ 美术方向改向 **PC-98 大像素立绘**（暂记不展开，前置是先定全局 16 色调色板）。验证：`type-check`／`npm test` 524 全绿（新增 6）／`canon:validate`／37 关 `mod:validate` 全 PASS。报告=`docs/PORTRAIT-VISUAL-DATA-2026-07-30.md`。）
> 上一次更新：2026-07-30（**R2-15 跨关主阅读面落点 G1 + G2 已关闭**：HEAD `8ac5eb5` 真机证明确定性启程 0 次 LLM，目标关 `opening.text`、右栏任务与固定动作同步切换并可重载；首个新关真实 prompt 带跨关承接边界。受控 SSE 单请求提交后 `worldTurn 1→2`、一次性展示态消费、合同仅初始化／推进一次，二次刷新仍显示最新正文且不发 LLM；续验源码守卫通过、临时槽和 Chrome 已清理。报告=`docs/R2-15-CROSS-STAGE-ENTRY-G1-2026-07-29.md`。）
> 上一次更新：2026-07-25（**UI 视觉优化一轮（模块 E 表现层）**：创建/加载/模式选择 6 项定点缺陷已修；主阅读面列宽 738→640px（40 汉字/行）、正文色 7→4 种；整体色板从 Tailwind 默认换为"六朝水墨"矿物色（石青/石绿/藤黄/朱砂/紫檀/宣纸/松烟），token 层重写 + 硬编码色批量收敛 2945 处，残留 Tailwind 主色 grep 计数 0。`type-check` 干净、`npm test` 504 全绿、8091 全流程实测（暗色+亮色）。**新写 UI 请用 `var(--color-*)`，别再引入 `#3b82f6/#f59e0b/#ef4444/#94a3b8` 这类 Tailwind 字面量**。已知残留：暗色下朱砂危险色文字 3.3–3.5:1、紫檀境界徽章 3.68:1（饱和朱砂在近黑底上到不了 4.5:1，需另开"文字浅调"token，未擅自加）。）
> 上一次更新：2026-07-22（R2-12 第二批：高风险前 25 张角色卡已完成证据分层，16 张确定性收口、9 张记录／待取证；12 张按原文序号修正开场投影，4 张关闭陈旧关系旗标，4 组完全重复关系链去重。第一批 Claude 二审发现的 4 个 P0 已修：原始成人 notes、赵合德归属、林娘子关系数组、太泉核心冲突漏关；P1 测试面已扩展，构建期未执行的重复 notes 实现已删除。当前完整 `canon:build` 501/501、37 关全绿，待合并提交后二审本轮总差异。报告=`docs/R2-12-CHARACTER-PHASE-QUALITY-2026-07-22.md`、`docs/R2-12-TOP25-CHARACTER-QUALITY-2026-07-22.md`。）
> Roadmap 清账（2026-07-22）：R2-10B/C/K/M 的历史中间态已按后续 G2 与 R2-11 证据关闭；旧并行分工表已替换为当前六类可认领模块，Canon TODO 的已完成／部分完成／真实未完成项亦已重新归类并同步 NAS。

> **多 agent 协作基线（用户裁定）**：本文件是本项目的共享进度、分工、交付与 Git 汇总权威；开始认领、完成交付或改变阶段状态时先读后更新。根目录 `CHANGELOG.md` 属原 repo 历史，不记录本协作线的状态。

> 2026-07-15 日终交接与晚间真机复测清单：`docs/DAY-END-2026-07-15.md`。最新高光小批量验收与外部测试卡见 `docs/R3-8-HIGHLIGHT-VERTICAL-SLICE-2026-07-16.md`。

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
| **正典裁定簿（改 canon/prompt 前必读）** | `…/character-canon/CANON-DECISIONS.md`（142 条人工裁定 + 执法标记）|
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

### 2.3 世界引擎 / 叙事层权威边界（**用户定的方向，改动前必读**）

**原则**：确定性调度决定「发生什么」，LLM 只负责「怎么讲」。

**最终目标**：让当前 396 个事件**都不再依赖 LLM 直接掌握世界真值**。
注意这不等于「让所有事件都自主场外跑完」——玩家亲历仍然要靠玩家玩出来，目标只是**真值的写入权归引擎**。

#### 已经收归引擎的（LLM 禁写，`src/utils/commandValidator.ts` FORBIDDEN_PATHS）

```
世界.状态.剧本模组.{worldTurn, worldPush, actorEngine, eventTimeline,
                    offscreenResolvedEventIds, chronicle, divergences, steeringCooldown}
角色.身份.称号            ← 里程碑奖励，只能由 milestoneRewards 授予
```

引擎能在**零 LLM 参与**下推进世界，已由真机证明（2026-07-20，R3 不介入 11 轮）：
`s01_05/s01_06/s01_07` 三个事件的硬截止到点、场外结算落账、回执生成、零权限授予全部由引擎完成，
三者 `done` 始终为 `false`、不进 `completedEventIds`，用独立标记 `…offscreen_resolved` 记账——
既推进了世界，又没有把这三拍伪记成玩家亲历。NPC 冲突裁定（`resolveNpcActionConflicts`）同理，
结果只进回执与 effects，从不碰 `done`。

#### 已完成的迁移面：事件 completion flag

它同样是世界真值（直接决定 `completedEventIds` → 回执 → 权限）。截至 R2-11W，
37 关共 396 个事件已全部收归本地引擎：389 个 `objective_action`、1 个 `local_condition`，
另 6 个由带确定性完成合同的机会卡推进。LLM 正文与命令均不构成完成证据。

`canonGuard.findScenarioFlagViolation` 管的是**资格**不是**属实**：
只能 `set`、只能写 `true`、路径须为 `flags.<event|chapter>.<id>.done`、事件须唯一可解析、
且必须落在 `getScenarioEventIdsAllowedForCompletion` 内（不得越级完成非当前章节/活跃事件）。
所有事件现在都带事件级或机会级确定性合同；`canonGuard` 会拒绝模型直写其完成 flag，
事件对账也不得跨越合同。模型只演出已经由本地动作／条件／时间线裁定的结果。

R2-11 当前覆盖 **396/396**：267 个结构明确事件受限迁移，122 个特殊／来源重建事件使用人工
`objective_action`，燕歌 `s01_09` 使用非机会卡本地判定；燕歌 `s01_05–08`、清羽左武军复盘与云龙
伊水押运使用机会卡行动序列。八个来源重建关共 88 个事件虽已合同化，仍全部保留 quarantine，
不得把“引擎可完成”误作“允许回接默认 Rail”。全局收口证据见
`docs/R2-11X-GLOBAL-CONTRACT-CLOSEOUT-2026-07-22.md`。

#### 实证代价（2026-07-20 G2 复验）

同一引擎、同一基准 `inputHash=397471a3`、同一批玩家输入，只换主叙事模型：

| 主叙事模型 | R1 诏令 / R2 入宫 |
|---|---|
| `deepseek/deepseek-v3.2` | 首轮即 `done=true`，各得唯一权限 |
| `MiniMax-M2.7-highspeed` | 7 轮内**发出剧本完成指令 0 条**（全程 30 条指令无一涉及剧本），机会卡到期作废，零权限 |

引擎每一步都正确执行既定合同，但玩家「认真选了一条路」的意图静默归零——
因为世界真值挂在模型的自觉性上。

#### 目标形态

把 LLM 从**写真值**降级为**提交证据**：叙事层报告玩家做了什么 → 引擎按完成合同独立裁定 →
引擎自己写 `done`，该路径进入 FORBIDDEN_PATHS。

首个纵切采用用户拍板的方案①：证据直接来自玩家本人输入，而非 LLM 转述；机会卡声明
`player_action_sequence`，每个成功回合最多推进一步。后续已按结构扩展为事件级 `objective_action`、
`local_condition` 与失败—准备—重试，最终覆盖全部 396 个事件。

**交互方向已实施（2026-07-21）**：追踪与执行已分离，
由引擎固定提供带 `opportunityId / stepId / actionId / timeCost` 的推进选项，与 LLM 自由选项合并；
具体政策选择进入状态，模糊自由文本不误推进。关键事件采用不受 `steeringCooldown` 冻结的绝对截止，
UI显示进度、剩余窗口与时间成本，截止按 `participated / partial / offscreen` 收束。设计与实施门禁见
`docs/R2-11-OPPORTUNITY-ACTION-UX-DESIGN-2026-07-20.md`。

**实施须知**：这是架构项，不是 G2 遗留缺陷。用户已选择方案①；相关背景与实证见
`docs/R2-10M-G2-REVERIFY-2026-07-20.md`，首个纵切见
`docs/R2-11-OPTION1-DETERMINISTIC-OPPORTUNITY-COMPLETION-2026-07-20.md`。

**R2-13 交互表现纵切（2026-07-26，G2 已通过）**：R2-11 的确定性合同继续是唯一真值入口，但不再向玩家暴露
“主线推进／主线判定”引擎术语。按钮标签由展示层从原动作派生固定动词与目标，无法分类时回落“行动”；
不改 390 份合同及其 hash。上一拍完成后只给下一轮 LLM 一个“余波→当前入口”的演出桥，跨关另用
确定性启程命令。线性多步合同每轮只演当前一步，按钮显示步骤号；事件级 `presentation` 只提供短目标、
自然预填句和合同外保留词，不参与合同 hash。跨拍使用两阶段承接：余波轮隐藏下一入口，铺垫后恢复，
但承接身份保留到玩家真正触发目标动作。2026-07-29 同源真机 6/6 回合证明三步边界、按钮／任务栏时序、
正文过渡、合同 hash、preparations 与本地完成权全部稳定，R2-13 G1 + G2 已关闭。余波正文补造精确
伤亡／货损数字另入 R2-14 事实接地，不回滚本项。详见
`docs/R2-13-FIXED-VERB-HANDOFF-DEMO-2026-07-26.md` 与 `docs/R2-13-FIXUP-HANDOFF-2026-07-26.md`。

### 2.4 应用（**关键：Webpack 不是 Vite**）

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
| **正典裁定簿 CANON-DECISIONS**（96 条人工裁定中央执法簿 + 溯源/执法标记，改 canon 前必读） | ✅ |
| **默认线正典轨道 Canon Rail**（未选 if 时沿原著主轴，确定性生成器接入 + 空轴/冲突硬门禁 + 冲突关隔离待复核，裁定 #58-65） | ✅ |
| **事件对账 + 主线死锁自愈**（哨兵触发/记忆窗口封顶/内嵌 think 剥离/bigram 证据接地，真机验收） | ✅ |
| **可见行动判定引擎 P0-P5**（本地确定性判定·预检·结算·行动余波·UI 回执，LLM 不重骰，裁定 #66-75） | ✅ |
| **判定闭环修复**（队列动作同样预检；双修/调息/疗伤命中修炼判定；恢复数值与临时状态仅由本地 resolution 写入，LLM 旧式判定标签/重复写入一律隔离） | ✅ |
| **判定测试辅助**（仅开发/测试服显示“大成功（测试）”；结果落盘带 `testOverride` 审计标记，生产构建不显示；预检卡完整展示六档后果） | ✅ |
| **Canon Rail 存档修复边界**（重置叙事/锚点时保留玩家关系标签、好感、关系卡记忆与 NPC 关系矩阵；`33333` 已从修复前备份回填关系状态，`c1c3892`） | ✅ |
| 主线 UI：objective 任务目标（37关205事件）+ 当前一拍显示 + 主/支线金色/灰色视觉区分 | ✅ |
| **续写结局蓝图 v2**（真值源，三幕脊椎 + 六国收束 + 终战=对抗策展系统）+ 剧透血缘关系密档层（裁定 #80-89） | ✅ |
| 角色 RAG 向量检索 + 内置瘦身（省 ~25%）；势力富化去重 66→58；BGM 音乐引擎 | ✅ |
| 单测 76 → **277 全绿** | ✅ |
| **UI 视觉一轮（六朝水墨色板 + 定点缺陷 + 主阅读面）**：token 层重写、硬编码色收敛 2945 处、列宽 40 字/行、正文色 7→4、6 项布局/语义/图标缺陷（详见顶部最后更新） | ✅ |

### 🔥 进行中 / 待落地

- 🎵 **BGM 活侠风参考批次（2026-08-01，Claude，暂告段落）**：参考《活侠传》补六朝配乐缺失的喜剧/烟火色域与「国乐 + 摇滚」编制——其高光曲骨架是摇滚乐队而非交响（玩家听感一手证据：电吉他在《某人的传说》《君所愿兮江湖行》被反复点名），我方原 `battle`/`climax` 是管弦当骨架、电吉他当调料，方向相反。MiniMax `music-2.6` 产出 6 首新曲 + climax 复抽 3 版，用户试听后**已接线 2 首**：`19-climax-huoxia-final-v2.mp3` → `climax` 变体池（决战·终局），`20-battle-huoxia-tight.mp3` → `battle` 变体池（斗法·紧凑高昂；源自 v1 裁掉 33.25s 引子，改名避免「climax 文件挂 battle 池」的困惑）。现有 13 首一首未动，未碰优先级链与事件映射；`type-check` 通过 / `npm test` 531 pass 0 fail / `build` 成功，打包 13 → 15。**通则（后续战斗曲适用）**：文字游戏战斗段很短，曲子须「引子 ≤ 8 秒、爆发在前 15 秒内进」，电影式慢堆叠结构在此失效——玩家听到的永远是前奏。**已知代价**：紧凑高昂那首进了 battle 随机池，普通伏击/乱战有概率轮到它，小场面若出戏需拆出单立 mood（`EVENT_MOOD_MAP` 只能映射到 mood、不能指定具体曲子）。**待办**：市井鼎沸/诙谐荒诞/说书戏台/狂放侠气/battle 变体共 5 首未试听未接线；`19-climax-v3-novocal-a/b` 待听。素材与设计稿 = NAS `XianTu-Mod-Kit/music/HUOXIA-REFERENCE-DESIGN.md`。

- ✅ **R2-14 跨拍叙事事实接地（2026-07-30，G1 + G2 已关闭）**：受控真实回合中，DeepSeek 首稿补造精确损失，门禁触发后由 DeepSeek 重写为定性表述并只提交一次；随后的 MiniMax 调用是已提交事务后的辅助审计，不是玩家动作重试。落账后 `worldTurn 8→9`、叙事 7→8，安全正文仅一条，承接正确消费。Codex 再经正式 UI 连续两次载入同一存档，最新正文、任务、承接与 `s04_06.done=false` 均稳定，存档 SHA 不变；旧存档中已有的 `伤七人` 未新增。源码守卫、用户存档恢复与工作树清理均通过。报告=`docs/R2-14-HANDOFF-FACT-GROUNDING-G1-2026-07-29.md`。

- ✅ **R2-15 跨关主阅读面落点（2026-07-30，G1 + G2 已通过）**：一次性、可重载的 `stageEntryPresentation` 让目标关 `opening.text` 在确定性启程后立即成为主阅读面，并给首个新关 prompt 提供承接边界；不调用 LLM、不写叙事历史／记忆、不改事件合同或 Canon Rail。HEAD `8ac5eb5` 真机纵切证明启程 0 次 LLM、opening／任务／动作同步与重载稳定；首个固定动作只发 1 次受控请求，`worldTurn 1→2`，展示态消费，合同 `attemptCount=1`，无重试、重复正文或重复落账，二次刷新保持。续验源码守卫通过，报告=`docs/R2-15-CROSS-STAGE-ENTRY-G1-2026-07-29.md`。

- ✅ **R2-16 确定性叙事事实回执（2026-07-31，G1 + G2 已通过）**：在 R2-14“无回执只能定性描述”之上补正向通道。事件级 `narrativeFactReceipts` 只有在匹配本地 `actionId + outcome` 且事件完成后才快照进 `lastSettledBeat`；完成前不会通过事件数据或动作尝试泄漏到 prompt，字段位于完成合同外、不改变 hash。清羽 `s04_02` 真机纵切完成事件并携带唯一“九名武士”回执；承接复跑发现并修复“量词 + 尸体”额外损失漏拦，最终正文保持定性。37 关、526/526 测试通过。报告=`docs/R2-16-GROUNDED-FACT-RECEIPTS-G1-2026-07-31.md`。

- 🧪 **小圈子内测开测准备(2026-07-17 晚,Claude)**:真机冒烟通过(新档创角 7 步向导→退败开局生成约 2.5 分钟→首轮行动落定,正文质量在线)。修复退败关开局时间倒挂(opening 文本在 s01_04 之后但 initialFlags 全未完成,首任务指向已发生的平叛;现 s01_01–04 预置 done,首任务=s01_05 到昭阳宫参与新帝登基;mod-kit 源+builtin 已同步,备份 `yange/stages-pre-initialflags-fix-backup/`,`canon:build` 290 全绿+`validate:all` 通过)。共享库启用关卡 4→10(清羽 1-4/燕歌前 3/云龙坠美+临安桥接+血誓,覆盖全部 5 条 R3-8 高光;库备份 `scenario_mod_library_v1.json.bak-2026-07-17`)。测试者指引=`docs/PLAYTEST-GUIDE-SMALL-CIRCLE-2026-07-17.md`。⚠️ 已知:`validate-shared-scenario-atlas.mjs` 期望 37 stageBindings 实为 18,exit 1 为既有失败与本轮无关;§4 门禁清单待刷新为 `canon:build`+`validate:all`。冒烟在共享后端留了样例档 2 个(char_1784297682217 / char_1784299311193,可删)。initialFlags 修复=`d340215`(用户已批)。遗留观察:①退败两次新档初始境界不一致(一级/气血150 vs 三级中/气血950,Step2 数值生成随机性待查) ②开局单次 API 失败重试后总耗时可到 ~8.5 分钟(常态 ~2.5 分钟,R2-1 重试兜住) ③用户 Windows Chrome 本地库 merge 时 local 优先,可能把新启用关翻回 disabled,发现模板少了就在剧本模组 UI 重新启用。下一决策点=入口关 29 条薄摘要 mini-enrich 是否开测前做(用户未拍板)。**测试反馈集中记 `docs/PLAYTEST-FEEDBACK-LEDGER.md`**(首晚收官 **21 条**:1 非问题/15 待修/1 设计课题/压轴 #21=剧情跑歪无法收束〔用户定性的核心可玩性问题〕;四大系统性根因=notes 摊平门控失效·年龄/境界通胀·世界引力数据 1/380·记忆清洗漏路径;新威胁模型=模型预训练自带六朝原著;身份/语域漂移家族三例)。**修复优先级已定稿 `docs/FIX-SPRINT-PRIORITIES.md`**;**P0 已于 2026-07-18 完成**(Claude 执行,commits 868a764/5b38a09/a4cd510/cc44ce2:年龄投影六朝压缩+小紫毒宗回归修复〔裁定#55〕+定陶王去元婴+逐轮记忆清洗+目标接地/选项POV/rail生死三守卫;308 单测全绿,真机验证新档 39 人 0 超寿元、郭靖 4 岁)。P1 提示词护栏包→P2 收束能力〔#21 总目标〕→P3 数据治理待启;3 项待用户裁定。⚠️ 注:退败模板当前被用户从启用集下架,PLAYTEST-GUIDE 第一轮玩法需同步调整。

- ✅ **R2-0V 可玩纵切已通过**：2026-07-15 用 DEV-only 单机三槽入口走正式 `importSave()` 与持久化回读，在 Chrome 完成正典／生还／失踪三路线游玩和重载。正典无分歧；生还落 `longrest` 并在后续草庐场景继续出现；失踪落 `missing`，持续搜寻与黑魔海联络线防卫同时进入正文/行动项。同步修复导入假阳性、90 秒副对账阻塞和明确事实二次误判。R2-0 全量门已打开；其余 IF/场外结算真机抽检并入全量阶段。
- ✅ **R2-0 全量系统层已完成**：账本、人物状态、IF 接轨、prompt 消费与下游事件投影不再限定谢艺样板；没有手写 variant 的全库事件会按相关人物分歧生成确定性承接目标并屏蔽冲突 Rail。世界引力改为事件级 `offscreenResolution` 数据合同，#96 星月湖战争已迁入权威 stage；右栏新增人物状态回执和跨关战役编年史。新增分支/其他世界事件结果属于后续内容数据增量，不再需要改 R2-0 引擎。报告=`docs/R2-0-FULL-IMPLEMENTATION-2026-07-15.md`。
- ✅ **R2-4 新玩家首小时已完成**（2026-07-15）：跨轮即兴目标已有结构化任务槽、读档 prompt 与右栏展示，并补高置信确定性叙事补账（显式命令优先、去重/上限/否定与短动作护栏）；切关 UI 与 story prompt 移除下一关名/内部 ID，改为角色可感知的启程契机。真实 Chrome 测试服从创建角色、选择《六朝清羽记》第 1 关到首段叙事、行动和任务完整跑通，刷新重进后正文、地点和任务均恢复；第二步生成曾自动重试一次且无半成品落盘。
- ✅ **R2-1 API onboarding 已完成**（2026-07-15）：网页端新增首次配置四步引导、默认 API 就绪状态与保存后连接测试；无效 key、余额耗尽、权限、限流和服务不可用分级报错。配置云同步从 fire-and-forget 改为持久化 latest-write-wins 串行队列，失败保留 pending 并在下次加载优先重试，UI 展示同步状态。开局分步生成新增单次输出预算与跨层统一重试上限（总调用≤4、总重试≤2；Step1/2 各最多一次），provider 截断不再进入 JSON 解析，Step2 两败由本地安全默认值接管；真机触发一次超长正文修复后以约 1470 字正文、总 3 次调用成功落盘。完整 `validate:all`（255 测试）通过。
- ✅ **R2-3 主轴/存档契约冻结已完成**（2026-07-16）：`SAVE-CONTRACT.json` 冻结 37 stage 的 stage/chapter/event ID 与既有 completion flag 路径；新增校验器覆盖 1399 轴节点、379 个全局唯一 event ID、脊柱/IF 引用和 stage 软绑定，并接入 `canon:build`。同步修复主轴节点计数、清羽重建脚本旧脊柱索引和友通期事件陈旧轴引用；后续主轴只改软绑定，不改老存档键。
- ✅ **R2-8 叙事—数据同步兜底已完成**（2026-07-16，Claude 二审 P1 已修）：位置、即兴目标和可选任务审计员既有闭环之上，人物状态补账采用“角色专属规则 + 身份无关通用模板”。任意既存关系 NPC（含临时角色）可按高置信通用伤势/恢复词写当局 `当前状态`；主要正典 NPC 本人状态专属层经 302 人 registry、37 关及正典资料盘点扩至 13 人，覆盖冰蛊、寒毒、离魂/闭关、易碎反噬、失魂瘫痪、精血枯竭、断肢失明及袁天罡鼻血预知自身凶险；另补阮香凝瞑寂的跨角色状态，只在明确施术且点名既存中术目标时写目标。主角程宗扬另补生死根动态阶段：死气积聚、杂质伤脉及明确炼化后的解除，只写本地保护的 `角色.效果`，不重复授予灵根/技能。所有路径均不创建身份、不覆盖显式状态、不写 registry/长期记忆/剧本 flags。盘点=`docs/R2-8-CANON-STATUS-AUDIT-2026-07-16.md`。
- ✅ **R2.5 可靠性尾项继续收口**（2026-07-16）：API 请求已改为调用级配置快照与独立取消信号；旧存档四类记忆数组会清理思维链、JSON 包装和模型任务说明，新总结入库及事件对账消费共用清洗规则；临时 `_reconcileDebug` 已停止写入并在读档时移除。纯 UI 重放因当前会话无可调用浏览器控制运行时，仍保留一次测试服人工复核。
- 🧪 **R3-8×R3-1 高光小批量工程闭环，待外部体验**（2026-07-17 更新）：MiniMax 三书重抽补强二裁全部完成（清羽 282 分片/677 决策、云龙 313/779、燕歌 223/532，各 3 条脱敏隔离），并确认新结果只作旧人物高光裁定的补强层。三书 5 条小批量为燕歌董卓/班超、清羽王哲/易虎、云龙林冲；只新增班超一个 `critical:false` 事件，其余均 enrich 既有 event，旧 ID、登基脊柱和董卓生还 IF 不变。首轮 Canon Rail 当拍完成 P1 已由 `be056e8` 修复并真机重验；随后班超真机又暴露长存档上下文超限、半预制合同被截断、非阻塞事件未召回、字符串 `"true"` 和临时角色田荣持久化风险。本轮通过 prompt 状态去重、主叙事 8192 输出上限、600 字高光硬合同、点名召回一个已激活可选事件、精确完成键布尔规范化、临时角色禁落状态及 `completionEvidence` 确定性落账收口。复验完整命中班超六拍并将其 flag 落为 true，主任务仍停留 `s01_08`，证明高光不抢轴。Claude 首轮二审 `claude-2026-07-17T07-54-09-213Z-e08f6e11` 的易虎 P0 经 EPUB 原著第52章逐字复核，确认易虎确被巨石击中后卷走，问题是旧 `qingyu.54.1` 漏掉牺牲；已同步修 axis/Rail 并以“他是我哥”替换模型误写的哭喊。同轮对账互斥及主轴 evidence 死数据、林冲旧档 fallback 与意图式误落均已收口。聚焦复审 `claude-2026-07-17T08-20-17-989Z-3603286e` 确认核心修复有效、可进入小圈子内测；其发现的易虎残留短摘要及军士人数歧义已修正，并补同轮回归门禁。班超 ID/完成键已写入 append-only `SAVE-CONTRACT`；`canon:build` 290/290、37 关、1399 轴节点/380 event IDs 与 production build PASS。内测卡=`docs/R3-8-HIGHLIGHT-VERTICAL-SLICE-2026-07-16.md`；工程小批量已具备外部小圈子交付条件，反馈前不启 242 条全量或续作 canon。
- ✅ **R1-3 内容合规终审已回收**（2026-07-14 Claude 完成，R1 全清）：隔离图零泄漏/幼态复查修复4项（云如瑶16→18=裁定#98）/脱敏抽查按边界收口（成人内容不动=裁定#43，红线仅未成年×性化）。报告=`character-canon/R1-3-合规终审-2026-07-14.md`。R0 依赖项：公开发行需补角色档案层 NSFW 门控。
- ✅ **R2-6 跨关记忆 A 已落地**（2026-07-14 Claude）：lyl+lyg 2498 条/约 40 跨书角色，落点=stage `profile.memories` 按关直写（切关合并注入，时间门控天然）；红线=不写分歧 fork 终局+知情图谱保守+无据不编造。详设=`character-canon/R2-6-跨关记忆A-试点-2026-07-14.md`。
- ✅ **R2-5 OOC 盘点+修复已完成**（2026-07-14/15 Claude，执法=裁定#99）：4 边角落地——灵根注入点名档案/静态设定字段（性别/灵根/种族/出生日期）指令写保护+负向测试/NPC 边强约束优先/档案记忆 cap5。三前例（凝羽灵根/谢艺性别/苏妲己契约）双侧闭环。盘点=`character-canon/R2-5-OOC盘点-2026-07-14.md`。
- **R2-2 存档修复绕写封堵**：已完成。`characterStore.executeTavernCommands` 已接入 canonGuard、格式/值校验，并在修复模式绝对拒绝 `世界.状态.剧本模组` 与 `系统.扩展.剧本模组` 的所有写入（含 flags）；修复专用 validator 仅放行 `set`。全路径审计发现 skeleton 模式曾绕开 `commandValidator`、值校验和字段清理，现已与 strict 共用同一模型命令校验入口，仅在执行时保留轻量结构修复。P1 已用真实函数级执行通路补测并经 Claude 复审关闭；复审结论＝无 P0/P1、建议合入（定向 19/19、type-check、全量 225、37 关 schema 通过）。
- **R2.5 对账 evidence 语义相关性**：已完成。对账输出新增 `matchedCore`，并由 validator 强制与当前事件、逐字 evidence、存档上下文三点一致；已覆盖“真实但无关的上下文证据”拒绝用例。`knownCharacterIds` 为空集时拒绝 `characterStates` 的边界已补测；Claude 复审结论＝无 P0/P1、建议合入。P2 建议将 `matchedCore` 最短长度由 2 收紧至 3–4 字，暂不改变现有兼容性（定向 19/19、type-check、全量 225、37 关 schema 通过）。
- **R2 IF 重审**：14 条预写 IF 已按“自由行动后的自动承接 + 玩家可见后果”复审：谢艺、小紫、苏妲己伏诛与燕歌英逝双枢纽已是当前 event-chain 纵切（角色状态须精确匹配才触发）；其余 10 条仍属 future-stage 或余波不足的设计资产，不再虚报可玩。详见 `docs/R2-IF-BRANCH-AUDIT-2026-07-13.md`。
- **R2 内容数据扩量 MiniMax 试产**（2026-07-15）：以 4 条低后果 IF 测试 M2.7 的“事件事实—可见余波—回流点”扩写；结构 4/4 合格，但正典验收 0 条可原样落库、3 条需人工收紧、1 条淘汰。结论是可用于受约束候选生成，不得直写正典；报告=`mod-kit/generated/minimax-m2.7/r2-content-expansion-pilot-2026-07-15/REPORT.md`。
- **qingyu 全本重抽**（`scripts/reextract-qingyu.mjs`）—— 第一本 extraction 早期质量最弱，major 密度 0.63/章 vs 后两本 1.26/1.95，存在欠产 batch（水战弧 10 章 0 事件等）。重抽预期 major 185→~350。⚠️ **这是地基级改动**：完成后 qingyu 主轴段重建 → seq 重编号 → 需重映射脊柱锚点 + if 线样章 anchor。**未落库**（产 `qingyu.reextract.DRAFT.json` 不覆盖现版）。
- **if 线收尾**：validate-if-branches 接进门禁 runner；用户后审 14 条内容；if schema 接 `attitudeToProtagonist`。
- **态度建模全本跑**：qingyu 试点通过；待扩 yunlong+yange（~15 条处子/破身约束），低置信标人工核。
- **角色高光/机趣落 beat（R3-8）**：旧双模型审计与 MiniMax 三书补强二裁均已完成；核武梗样板（`12c6d84`）之后，董卓/班超/王哲/易虎/林冲共 5 条工程小批量已落。**方法论/材料索引/优先级公式全录 `RELEASE-ROADMAP.md` R3-8**；外部反馈通过前不启动 242 条批量铺开。
- **R3-8 角色表演卡 MiniMax 预扫**（2026-07-18，只读、未裁定）：从三部 EPUB 角色名命中片段与现有角色卡抽样扫描小紫/秦桧/朱老头/月霜/吕雉/贾文和。结论＝方向有效但称谓幻觉、缺证反推、秘密关系扩写与阶段越界明显，模型草稿不得直写 canon；推荐小紫+贾文和先做两张可追溯证据卡。报告=`docs/R3-8-VOICE-CARD-MINIMAX-SCAN-2026-07-18.md`。
- **R2-9 收尾已认领**（2026-07-18，Codex）：用户批准按推荐方案推进。裁定口径＝即兴大弧线采用“分歧账本显式立牌”（小偏放任/中偏收编/大偏玩家选择回轨）；242 高光继续冻结；漂移标本档封存为只读回归样本。执行顺序＝P1 双路由护栏 → R2-0 世界引擎 2A 检测/主动回轨 → 2B 世界引力/主动回合 → P3 治理 → 小紫+贾文和表演卡纵切 → 整环真机验收。
- ✅ **R2-9 工程收口（2026-07-18，Codex）**：P1 12 条双路由叙事护栏+接地目标回报；P2 近 6 轮三指标偏离评分、中偏收编/大偏玩家选择、右栏“斩线回轨”、一次性收束桥、世界每 2–3 回合主动与失败加权；世界引力从 1→23/380（新增 22 条，严格限当前激活节点，跳过郭解/董卓等 IF 生死拍，备份=`stages-pre-r2-9-world-gravity-backup`）；P3 裁定 #55 硬 lint、天赋情境因子+UI 标注、1616 人物实例可复跑审计；R3-8 首批小紫+贾文和阶段化表演卡接入，点名决策场景“只汇报/等命令”会在分步/非分步路由最多退回重写一次。MiniMax 实测首稿失败、重写后主动落子，但仍会编具体事实，扫描/自测输出均不入 canon。审计报告=`docs/R2-9-DATA-GOVERNANCE-AUDIT-2026-07-18.md`；242 继续冻结，漂移档只读封存。本批未重启/改写在线测试服，待整环门禁后在离线窗口部署。Claude 整体二审所报 P1“分步末次表演校验失败清空正文”已修：只有尚可重试时清空首稿，末次保留正文进入 Step 2；326 测试、`canon:build`、`validate:all` 全绿。二审所报台账状态滞后亦已回填：#5/#13/#17 分别标明核心已完成及 deadline、确定性台词 lint、大规模 NPC 议程池的后续边界。
- ✅ **R2-9 补充收口（2026-07-19，台账 #23／裁定 #108）**：阮香凝“凝玉姬”、黑魔海玉姬/高层与潜伏暗桩身份明确为内部机密；共享双路由护栏现统一执行“角色档案后台真值≠场内人物知识”，并点名限制吕雉、霍子孟等无揭露证据 NPC 不得直接识别或审问。从三处生成/抽档源删除原典未确立的“十二玉姬”固定数量说法，`canon:build` 扩展禁词执法防回流。327 测试、37 关 schema、`validate:all` 与 production build 全绿；裁定簿 NAS 镜像已核同。
- ✅ **R2-9 #23 Claude 二审补洞（2026-07-19，裁定 #109）**：二审确认方向正确并指出门禁编排、v2 回流源及传播语义缺口。现已将裁定 lint 强制接入 `validate:all` 与 production `prebuild`，直扫生成/最终产物/生成脚本/v2 输入；清理旧源并留备份。机密身份规则允许基于可见异常怀疑盘问但禁止先知点破，已知者延续、未告知者不继承，阮香凝本人公开与玩家泄密分开，后者须玩家明确授权并承担政治/关系后果；新增游婵通用规则回归。结构化 `revealedTo/evidenceFlags` 按既定边界留关系密档知情引擎 B/C。`canon:build` 330/330、100 份裁定产物、`validate:all` 与 production build 全绿。
- 🆕 **第二轮小范围测试反馈（2026-07-19，台账 #24/#25）**：#24 已核实为“96 张官图与 schema 地基存在，但 stage 引用、资产 manifest、统一解析器及叙事/关系展示槽未闭环”，按 P1 先做 6–10 位主要角色纵切；#25 已核实为“本地关键词 preflight 与旧主叙事自行 `〔判定〕` 并存”，导致漏命中时正文直接给出结果，按 P0 先统一判定权威、明确掷骰前确认并补三入口/同义表达/新生风险/刷新重试回归。两项目前均已落档，尚未实施。
- 🆕 **第二轮动机反馈（2026-07-19，台账 #26）**：当前主线 UI 只有单行 objective，即兴目标入库与展示只剩 `{标题}`；#5 的回报也只在完成后临场决定，接取前没有“相关角色—为何现在—下一步—代价/收益—可能打开的未来”承诺。按 P1 先做当前关 3 位已登场主要角色的故事机会纵切，再与 #24 头像合成高代入的人物机会卡；不直接批量生成任务，避免把自由互动任务化。
- 🧪 **世界演员首段已接运行时（2026-07-19，裁定 #110）**：采用“通用骨架 + 单 stage 开关”，不重写全局。`lyg.event.s01_05` 现以登基前夜压力源调度董卓/贾文和/霍子孟三条议程；右栏展示世界征兆、两张机会卡、why now/下一步/风险收益及回执，追踪后进入行动队列。只有玩家亲历完成承重拍才幂等解锁贾文和谋议或霍子孟军情权限；场外推进不伪记亲历、不授奖。默认 `process_only`，三路均回定陶王登基，阮香凝和郭解/董卓后续生死节点不提前消费。备份=`yange/stages-pre-r2-10-world-actor-backup`；发测前又对齐源 stage、builtin 与测试包的 `world/manifest/opening` 三层入口，并补齐旧测试包缺失的世界演员合同，备份=`yange/stages-pre-r2-10-entry-alignment-backup`。首个玩家新档暴露 `initialFlags` 虽为真但 `completedEventIds` 未同步，UI 仍激活 `s01_01`；现已由通用初始化按完成合同投影初始已完成事件，回归钉死首锚=`s01_05`。`canon:build`、`validate:all`、335 测试与 production build 全绿；LaunchAgent 已重启，共享 Mod 库保持启用，浏览器真机确认入口显示“新帝登基前夜”。提案/验收=`docs/R2-10-WORLD-ACTOR-VERTICAL-SLICE-2026-07-19.md`；测试指引已刷新为“诏令/入宫/不介入”三路线。

- ✅ **R2-9 控制协议正文泄漏已修（2026-07-19，台账 #27）**：真机捕获 `【贾文和·高智行为硬合同】`、`【世界留钩】正文结尾必须……` 与孤立反引号。共享 R2-9 双路由规则现明确禁止复述内部协议；角色级合同去掉高回显标题；生成门禁把已知 prompt echo 判为可重试失败；流式展示与最终叙事/记忆入库共用窄范围清洗兜底，保留实际世界动静、正常环境与 NPC 心理标记。Claude 二审 job=`claude-2026-07-19T09-04-41-536Z-f2bd8809` 的补洞见下一条。
- 🛠️ **R2-9 协议泄漏 Claude P0 补洞（2026-07-19）**：二审任务超时但已登记 10 条发现；4 个 P0 已修：`splitInitStep1` 接回共享 R2-9 护栏并在开局 Step1 检测/重试协议泄漏；联机兜底日志与模型服务器日志统一清洗；补齐“可选介入窗口/角色表演卡”两类漏网标签；旧 `系统.历史.叙事` 回读清洗并防继续导出污染。剩余 P1/P2（loading 原始分片短闪、标签单一事实源、末次降级依赖兜底、流式半标签短闪、合法截断反引号碰撞）已留台账 #27，待后续批次。Claude 补丁级复审（2026-07-19）：方向与实现确认可交付；新增一条具体 P1＝检测清单比清洗清单宽（世界演员合同/世界回合/机会追踪/承重角色保护/Canon Rail 只检测不清洗），末次降级稿清洗后未复检泄漏即接受，建议清洗后复检一次并与"标签单一事实源"一并收口。
- 📐 **亲密档案层立项（2026-07-19，R3-8B，用户拍板）**：动机＝亲密关系女性角色差异化不足。intimacyProfile 挂角色人工正典档案、走表演卡谱系（storyContext 注入），**不进 NPC 决策内核**；四纪律＝①年龄硬门禁（validator 执法接 `canon:build`，按实际年龄非外貌原型）②亲密场景+成人开启双条件注入、标签低显著度且同步登记检测+清洗两份清单 ③揭示层级接好感阶段做解锁玩法 ④来源双轨（canon 有据直用 / authored 经用户审定），首批仅 6–12 名亲密线主要女角。**待用户圈选首批名单后起草**；验收＝去名字盲测能认出是谁。规格=`docs/R3-8-INTIMACY-PROFILE-SPEC-2026-07-19.md`。
- 🧪 **R2-10B 中间检查点：G1 通过（2026-07-19，后续 G2 已于 2026-07-21 关闭）**：同一 `inputHash=7681bd8e` fixture 无网络重放 R3→R1→R2，三线均在 worldTurn 10 正确结算；当时遗留的真实模型 G2 已由下方“R2-10B G2 真机验收关闭”完成，不再是当前待办。报告=`docs/R2-10B-NPC-DECISION-CORE-TRUE-DEVICE-ACCEPTANCE-2026-07-19.md`。
- 🧭 **R2-10C 世界时间合同 + `s01_06–08` 跨事件 G1 通过（2026-07-20，Codex）**：事件分 `canon_anchor/window/emergent`，以首次结构资格为零点执行 `notBefore/deadline`；发生、公开、玩家获知分别留痕，未获知场外事实从 prompt、世界线面板和编年史隐藏。`s01_06` 资格后 1 回合激活/第 6 回合截止，`s01_07` 当轮激活/第 5 回合截止，两者消息延迟 1 回合；`s01_08` 为无硬截止的秘密对话，worldTurn 20 仍不会伪造玩家已知。三事件各有独立决策核、局势白名单和机会，跨事件存档/hidden/零场外授权全绿。**下一批：态度→knowledge→effects 完整反馈环，再做冲突/反制/多回合生命周期。** 报告=`docs/R2-10C-WORLD-TIMELINE-AND-CROSS-EVENT-G1-2026-07-20.md`。
- ✅ **R2-10D 态度／知识／effects 反馈环 G1 通过（2026-07-20，Codex）**：`knowledgeFacts/requiresKnowledge` 在评分前执法角色知情边界；少维度 `-100..100` 态度进入阈值与归一化效用；`stateEffects` 只改变事件局部资源、当前承重角色态度和已声明知识。跨事件 `actorMemory` 仅继承态度与知识，资源仍局部初始化。统一二审后补齐 validator 对初值／阈值／关系 effect 的范围强制及旧档运行时钳位。`s01_06` 攻守知识解锁后续行动、`s01_08` 核验链不泄黑魔海机密、`s01_05→07` 贾文和退场次序经 JSON 重载改变候选集均已自动验证。报告=`docs/R2-10D-NPC-FEEDBACK-LOOP-G1-2026-07-20.md`。
- ✅ **R2-10E 行动冲突／反制／多回合生命周期 G1 通过（2026-07-20，Codex）**：`durationTurns` 已成为存档内 `activeAction`，严格经历 started/continuing/completed 且 effects 只落一次；同域相反 stance 或显式 counter 由效用分+power 本地裁定，败方 effects/知识/态度和生命周期不落账，更强反制可中断在途行动。统一二审后改为全局稳定强度顺序裁定，`blocked` 败方立即退出本轮，不能继续阻断第三方。`s01_06` 郭解护持 vs 剑玉姬破坏和护送 vs 封路为首批冲突，`s01_07/08` 验证协同行动与秘密来源生命周期。报告=`docs/R2-10E-NPC-CONFLICT-AND-LIFECYCLE-G1-2026-07-20.md`。
- ✅ **R2-10F 地区／势力／人物分层唤醒 G1 通过（2026-07-20，Codex）**：决策核现按 local-critical/faction/offscreen-critical/minor/group 五档预算唤醒；当前地点、在场人物、受影响势力、追踪点名、重大事件与 cadence 是确定性输入，`wakeAudit` 逐 actor 留因。在途行动优先唤醒；休眠 actor 不结算、不泄露。`s01_06–08` 数据及旧 core 兼容均已回归。**下一批：机会卡与长期 NPC 记忆。** 报告=`docs/R2-10F-LAYERED-WAKE-G1-2026-07-20.md`。
- ✅ **R2-10G 机会卡与长期 NPC 记忆 G1 通过（2026-07-20，Codex）**：机会由 actor/action/knowledge 确定性触发并完整记录出现、追踪、过期、参与或场外状态；UI/prompt 只显示当前可用卡。统一二审后，卡片首次追踪时间不可由切换刷新，六回合到点后 `tracked` 显式转 `expired` 并拒绝重追。NPC 的行动、冲突与玩家介入形成显著度封顶 12 条的长期经历，JSON 重载和跨事件保留；相关标签进入后续候选评分及回执。报告=`docs/R2-10G-OPPORTUNITY-AND-NPC-MEMORY-G1-2026-07-20.md`。
- ✅ **R2-10H 跨书异构扩量 G1 通过、统一二审已收口（2026-07-20，Codex）**：清羽 `lcq.s10_04` 用势力级 emergent 复盘补给/军机断点，云龙 `lyl.s05_09` 用本地级 window 调度押运遇劫；两书复用同一决策、唤醒、机会和记忆内核但独立声明局势与不变量。二审后验收改为真实 JSON 往返、连续三轮生产 runtime、整份存档字节串／哈希一致；清羽与云龙均独立断言零授权。评分对象按稳定 key 遍历，可选上下文按 JSON 语义归一，同一 inputHash 不再受插入顺序影响。**世界/NPC 引擎 G1 路线与统一二审均已收口；既有 G2/共享外测门禁不变。** 报告=`docs/R2-10H-CROSS-BOOK-SCALE-G1-2026-07-20.md`，二审收口=`docs/R2-10I-SECOND-REVIEW-CLOSURE-2026-07-20.md`。
- ✅ **R2-10K G2 误杀与角色卡覆盖修复（2026-07-20；后续复验已关闭）**：商贸比例／坊市路线误杀、疑问语境及已知组织名边界均修复；萨安／朱诺／弥骨三张硬缺卡已补。后续同源三路线 G2 已通过；19 名高置信补卡候选仅保留为内容质量队列。报告=`docs/R2-10L-MISSING-LOAD-BEARING-CHARACTER-AUDIT-2026-07-20.md`。
- ✅ **R2-10B 玩家知情账本 V1（2026-07-21，裁定 #121）**：显式 `playerKnowledge` 已与世界真值、NPC 知识分账，LLM 写路径封禁；随后同一 fixture 的 33 回合 G2 已确认已知姓名误杀归零，本项关闭。
- ✅ **R2-10B G2 真机验收关闭（2026-07-21，Codex + Claude）**：同源 R1/R2/R3 共 33 轮全部落定，参与合同、唯一权限／回执、R3 机会卡到期场外及引擎独占 `done` 均通过；已知姓名误杀为 0。角色怀疑 13/13 放行、身份坐实 8/8 拦截，“你我三人”与“各退一步”各 3/3 放行；新增五类兵力数量原句 5/5 拦截，四类普通人数／语义句及近邻变体 8/8 放行，关联、兵力、距离回归带 13/13。最终修复 `N人 + 马上／马车／马不停蹄／马前后` 的中文分词回归并纳入自动化；该项不再追加真机轮次。**R2-10B 已由 `[~]` 翻为 `[x]`，后续低频门禁措辞记已知项，不阻塞世界引擎架构主线。**
- 🛠️ **R2-11C 结构化机会推进动作 G1（2026-07-21，Codex）**：`s01_05` 已实现追踪／执行分离，追踪不再把整条路线塞进行动队列；主界面由本地合同固定插入带 `opportunityId/stepId/actionId/timeCost/contractHash` 的推进按钮，成功回合后才结算。安民／选材／定都的真实选择进入 `completionChoices`，旧按钮跨步骤、过期与合同热更均拒绝；自由文本继续作为兼容入口。下一步扩 `s01_06–08` 并补剩余窗口与 `partial` 收束。报告=`docs/R2-11C-STRUCTURED-OPPORTUNITY-ACTIONS-G1-2026-07-21.md`。
- ✅ **R2-11D 跨事件结构化动作与 partial 收束 G1（2026-07-21，Codex）**：结构化按钮已贯穿 `s01_05–08`；`s01_06` 护送交接、`s01_07` 未核实边警与两种联络线、`s01_08` 私密知识核验均不依赖 LLM 选项或关键词推进。右栏显示步骤进度与剩余重要行动次数；绝对截止按 `participated / partial / offscreen` 三分，partial 保留有效步骤、选择和 NPC 经历但不授完整权限。跨事件测试已并入 `test:g1:npc`。下一门转入本地判定型步骤与非机会卡 completion，不再机械扩关键词序列。报告=`docs/R2-11D-CROSS-EVENT-ACTIONS-AND-PARTIAL-G1-2026-07-21.md`。
- ✅ **R2-11E 非机会卡本地判定完成 G1（2026-07-21，Codex）**：首个无机会卡事件 `s01_09` 已接 `playerCompletionContract.local_condition`；主界面固定动作由程序按行动前存档判为 success／partial，模型只演出既定结果，模型命令执行前已锁定 outcome，`done` 继续由 runtime 独占写。完全忽略则在六回合绝对截止场外结算，Rail 不会卡死。合同热更拒绝、JSON 重载、LLM 越权与 validator 反例均有自动化。下一门把 outcome 接入 effects／关系／知识，并验证失败后准备与重试。报告=`docs/R2-11E-NON-OPPORTUNITY-LOCAL-COMPLETION-G1-2026-07-21.md`。
- ✅ **R2-11F 事件结果反馈闭环 G1（2026-07-21，Codex）**：`s01_09` 的 success／partial 已通过窄白名单合同反馈 NPC 态度、NPC 知识、玩家知识与长期经历；态度运行时钳位、知识幂等排序、记忆复用 12 条显著度淘汰，LLM 对这些状态无写入权。装载校验覆盖越界 delta 与未知 actor。R2-11 覆盖增至 5/380；下一门验证失败后准备／重试生命周期。报告=`docs/R2-11F-OUTCOME-FEEDBACK-G1-2026-07-21.md`。
- ✅ **R2-11G 失败—准备—重试生命周期 G1（2026-07-21，Codex）**：本地事件动作新增 `attempt / prepare` 与事件内 preparation key；failure 不结算、同轮只消费一个动作、准备本身不结算、重试只在准备后开放，状态经 JSON 重载保持且合同热更即清。`s01_09` 已验证贸然宣旨失败→核对名册印信→按程序重试成功，三段分别反馈态度、NPC 知识与长期经历；直接 success／partial 与六回合场外截止仍保留。报告=`docs/R2-11G-FAILURE-PREPARATION-RETRY-G1-2026-07-21.md`。
- ✅ **R2-11H 跨书完成合同扩量 G1（2026-07-21，Codex）**：清羽 `lcq.event.s10_04_left_army_review` 与云龙 `lyl.event.s05_09` 接入两步结构化完成合同，覆盖无截止 persistent emergent 与五回合 window 两种结构。两书复用既有局势反馈、NPC 多回合行动、分层唤醒、权限／回执幂等及 12 条长期记忆，不复制燕歌局势键；JSON 多轮逐字节重放、亲历唯一授权、场外零权限均有自动化。覆盖增至 7/380。报告=`docs/R2-11H-CROSS-BOOK-COMPLETION-SCALE-G1-2026-07-21.md`。
- ✅ **R2-11I 二审 P0/P1 关闭（2026-07-21，Codex）**：场外结算新增 `local_condition` 合同 hash+ready 所有权保护，玩家在绝对截止同回合成功时只记 participated，不再与 offscreen 抢写；清羽／云龙各补演员不在场、未点名、势力未受影响时的 sleeping→零 decision→JSON 逐字节 replay。报告=`docs/R2-11I-DEADLINE-OWNERSHIP-AND-WAKE-REVERIFY-2026-07-21.md`。
- ✅ **R2-11J 明确目标事件批量迁移（2026-07-21，Codex）**：新增 `objective_action` 合同，玩家选择引擎固定【主线推进】动作即完成声明目标，不暗做属性检定，LLM 禁写真值。幂等脚本仅迁移有 objective、唯一标准完成键、无 completionEvidence、非隔离关的事件，共 267 个（清羽122／云龙59／燕歌86），覆盖 7/380→274/380；三书各抽样验证命令拒绝、引擎完成和 JSON 逐字节重放。剩余=34 个非隔离特殊结构+72 个隔离关。报告=`docs/R2-11J-OBJECTIVE-ACTION-BULK-MIGRATION-2026-07-21.md`。
- ✅ **R2-11K 非隔离特殊事件迁移（2026-07-21，Codex）**：21 个登场事件采用“留在现场观察并回应”的展示动作，10 个无 objective 剧情拍逐项人工补目标，左武军／易虎／班超 3 个半预制高光拆成三步 preparation 链；修复 active 非关键合同因不属于 narrative anchor 而不显示／不落账的问题。覆盖 274/380→308/380；剩余 72 个全在八个隔离关，依裁定 #61/#62 先重建来源。报告=`docs/R2-11K-SPECIAL-EVENT-CONTRACTS-2026-07-21.md`。
- ✅ **R2-11M 隔离关首关来源重建 `lyl.luoyang_coup`（2026-07-21，Claude，裁定 #122/#123）**：双模型复核对本关均为 `insufficient_evidence`／JSON 截断，等于零可用模型证据，全部结论改由 EPUB 第 66 集《两宫交兵》逐章原文比对得出（章序与 `source-index.json` 逐条互验，8 个章名逐字命中）。核出四类确定性缺陷并落修：①轴 idx 278 错标——seq 890-893 实出自源 279《弑君》/280《凌辱》，而源 278《游宫》原文无任何死亡，已重标为 `yunlong.279.1/2/3` 与 `yunlong.280.1`，脊柱与 `lyl.if_youtongqi_rescued` 三处引用同批改；②`s06_01b` 与 `s06_01` 依赖方向与原文相反，已交换；③源 286《赏格》整章无覆盖致桓郁谈判与中垒军军司马叛投两条下游因果断头，已补非关键事件 `s06_04b` 并按 append-only 追加 `SAVE-CONTRACT`；④四个 objective 与原文矛盾（`s06_01` 主角其时已被困昭阳宫藻井、`s06_03` 武库陷落在下一章且主角从未去过、`s06_06` 吕奉先属吕氏平叛军与主角非同阵营、`s06_01b` 主角是目睹非潜入），已按原文重写——这四条正是批量脚本必须禁跑的实证：本关 7 个事件全都满足 `objective_action` 的机械筛选条件，脚本会照单全收并把错误目标固化成引擎动作。八拍一律人工撰写 `objective_action`（否决 `local_condition`：本关结局由脊柱固定，无原文依据支持属性阈值，硬造 `successWhen` 即「按事件名猜合同」）；`s06_05` 给出两条并列拒绝，正典结局相同。实施中发现并修掉一个真缺陷：补录拍无轴序且不进事件链时**整章会在它浮出前收束、永远玩不到**，已排进链并以「空存档整章重放八拍按序落账」钉死。`r2_11j` 的隔离关断言改为双重门禁（隔离关永不得出现 `advance_declared_objective`；只有 `sourceRebuiltStageIds` 内的已重建关允许带合同）。**重建不等于解除隔离：本关仍在 `DEFAULT_LINE_QUARANTINED_STAGE_IDS`。** `canon:build` 424 测试/37 关、`validate:all`、`test:g1:npc`、production build 全绿；R2-3 契约 1399 轴节点/37 关/381 事件 ID。报告=`docs/R2-11M-QUARANTINE-LUOYANG-COUP-SOURCE-MAP-2026-07-21.md`。**遗留观察**：`lyg.event.highlight_banchao_lamb_leg` 是同形态无轴序非链事件，是否同样不可达本轮未验证。
- ✅ **R2-11N 洛都政变人物投影校准（2026-07-21，Claude）**：`43e4380` 来源重建未触及人物层，八拍 `relatedCharacterIds` 已按 EPUB 第 66 集逐章（0359-0371）核对重校——只收映射章内实际在场行动者：s06_01 补回程宗扬/二赵/中行说/金蜜镝，s06_03 移除仅被提及的吕冀并补回救援线（徐璜/唐衡/左悺/蔡敬仲/赵飞燕/金蜜镝等），s06_04 补守卫战攻防双方（敖润/吴三桂/刘子骏/齐羽仙/卢景/云丹琉/左悺），s06_06 补泄密链与阙楼组（齐羽仙/蔡敬仲/吕戟/云丹琉/卢景）；**s06_04b 移除误挂班超**（《赏格》章班超仅场外提及，本人未出场；s06_02 通商里议事在场，保留）。11 名真实参与者按时间门控补入本关 `canon.characters`（敖润/齐羽仙/金蜜镝/徐璜/唐衡/中行说/高智商/吴三桂既有 id 沿用，左悺/刘子骏/吕戟新建 `lyl.character.*`；吕戟因 flag slug 末段避 `lv_ji` 碰撞取 `lv_ji_changshui`），三人按 R2-10L `stage-canon-gap-recovered` 先例补最小总卡（只用原文坐实事实）。中行说未回搬第三本「内宅总管」身份（时间门控）。修复脚本=`scripts/fix-luoyang-coup-character-projection.mjs`（幂等），回归=`tests/r2_11n_luoyang_coup_character_projection.test.mjs`（逐拍清单+班超双向断言+slug 防碰撞+注册表覆盖），备份=`yunlong/stages-pre-r2-11n-charfix-backup/`、`character-cards-v3.json.pre-r2-11n.bak`。`canon:build` 428 测试/37 关、`validate:all` 全绿；覆盖数字不变（316/381），本关仍在隔离名单。
- ✅ **R2-11O 洛都政变人物投影白名单化（2026-07-21，Claude，用户裁定）**：`2dcefdc` 的跨关整条目复制会把后期身份/经历/外貌带进早期时间线（金蜜镝凉州军阵披麻叩首外貌、中行说「内宅总管」归属、齐羽仙「玉姬之一」race 等），已改为**本关最小字段白名单投影**——11 个补入条目只含 `id/name/description/role/gender/affiliations/locationId/profile{origin(,notes)}`，静态档案由 canon:build 卡投影与运行时 registry 还原，realm/技能/物品等进度量一律不写；中行说「内宅总管」属燕歌行时区身份，`scripts/project-affiliations-to-stages.mjs` 新增**时间门控排除表**（`AFFILIATION_TIME_GATE_EXCLUSIONS`，逐条附依据）防投影回灌。修复脚本改为同 id 先删后写（自修复幂等），**备份永不覆盖原始快照**（`stages-pre-r2-11n-charfix-backup/` 与 `.pre-r2-11n.bak` 只在不存在时创建；快照已验证为 43 人、含班超误挂的原始态）。回归新增第六条：白名单字段结构断言 + 未来内容标记（内宅总管/凉州军/定陶王叩首/玉姬之一等）+ 中行说归属精确断言（开发中曾把「剑玉姬」误命中「玉姬」标记，已改精确为「玉姬之一」）。`canon:build` 437 测试/37 关、`validate:all` 全绿。
- ✅ **R2-11P 临安黑海关来源重建（2026-07-22，Codex + Claude 二审，裁定 #124）**：`lyl.lin_an_black_sea` 已从混入第 9–14 章与无来源推演的旧稿收回 EPUB 第 6–8 章《临安》《雷峰》《衙内》；15 个冻结 eventId 保持 append-only，按原文重写语义并串成唯一依赖链，只保留 `yunlong.6.1/8.1/8.2` 三条有据轴。opening/world background、15 人、10 势力、4 地点与逐人 affiliations 同步按时区收口；“凝姨”在角色卡投影、势力投影和运行时 registry 三处门控，不提前揭示真名、婚姻与黑魔海身份；旧 `mingqingsi_encounter` 后续章节高光 fallback 已删除。15 拍全部使用人工 `objective_action`，空档可顺序完成五章并逐字节重放；Character RAG `sourceHash` 改为覆盖最终 entries，stage-derived ID/`stagePresence` 变化会触发清库重建。覆盖 316/381→331/381，本关仍在 quarantine。`canon:build` 445 测试/37 关、`validate:all`、production build 全绿；Claude 二审无 P0/P1。二审 P3 已收口：删除重建脚本无效 `completionPath` 分支并补本条正文记录。**非阻断观察单独留档**：冯源显式角色卡门控仅作未来防御性增强，当前不是缺陷；后续隔离关不得照搬普通 completedEvent 的“场外插叙确认”模式，涉及真正机密实体时应优先使用 `offscreenResolution`。报告=`docs/R2-11P-QUARANTINE-LIN-AN-BLACK-SEA-SOURCE-MAP-2026-07-22.md`。
- ✅ **R2-11Q 历史误名“太泉探险”来源重建（2026-07-22，Codex + Claude 二审，裁定 #125）**：`lyl.taiquan_expedition` 的源窗口 12–14 与轴 563–566 实际均属临安《镖局》《宝刀》《处子》；旧稿的苍澜、太泉古阵、赤阳圣果、结盟与撤离无来源，且真正太泉已由后续三关覆盖。保留冻结 stage/event/chapter ID 与 completion path，五拍重写为江州军情、威远试探、屠龙刀伏击、林家疑云、西湖密谋；四条现有轴逐条复用，军情细拍不伪造轴。14 人、9 势力、1 地点收口；五名揭密敏感人物采用最小投影并做构建期／运行时时间门控，全体 affiliations 锁定。五拍人工合同及空档 JSON 回放通过；首次全量门禁修复 content 引用闭包与旧小紫 `contentAccess` 残片。Claude 二审无 P0/P1；P2 补回屠龙刀伏击现场参与判断的秦桧。**P3 记录**：惠远误挂本关阶段投影是父提交历史遗留，当前不在本关演员闭包、无运行时泄漏，留待正典表专项清理；registry/manifest 大 diff 已确认是 stagePresence 翻转后的机械重生成。覆盖 331/381→336/381，本关仍在 quarantine。`canon:build` 450 测试/37 关、`validate:all` 与 production build 全绿。报告=`docs/R2-11Q-QUARANTINE-TAIQUAN-EXPEDITION-SOURCE-MAP-2026-07-22.md`。
- ✅ **R2-11R 鬼王峒决战来源重建（2026-07-22，Codex + Claude 二审，裁定 #126）**：`lcq.stage_06` 六个冻结 ID 保留，按 EPUB 第112–124章纠正三处来源错误：鬼巫王被吞由下一章复述改绑 `qingyu.114.2`；龙神真正坠亡改绑 `qingyu.117.1`，谢艺拍仍严格保留裁定 #90 的 `s06_03 + qingyu.116.1 + lcq.if_xieyi_longrest`；冰蛊拍删除旧稿虚构的具体解法，改绑第124章明确确认的 `qingyu.126.2`。三个矛盾 objective 改为现场见证、围猎收束与承接小紫决断，`s06_04` 未弑母 IF 锚点不动。演员 42→13 且全部采用时点最小投影，构建期角色卡／势力投影与运行时 registry 三层门控；地点 58→2，关系按开场／事件引用闭合；六拍人工双步合同可从空档按序重放。Claude 两轮二审无 P0/P1；P1 已修：显式保存 `01→02→03` 可玩顺序并硬校验 critical ID，避免未来解除隔离时冻结轴 `210/211` 把谢艺拍倒排，同时不篡改裁定 #90。两项原 P2 已修：13 人 affiliation 锁与三层时间门、聚焦 prompt 泄漏回归；聚焦复审新增的测试证明力 P2 亦已收口，prompt 用例现点名并逐一断言全部 13 人。P3 单记：registry/manifest 为机械重生成，脚本本地双跑幂等且备份安全。覆盖 336/381→342/381，剩余四个隔离关共 39 事件；本关仍在 quarantine。`canon:build` 457 测试/37 关、`validate:all` 与 production build 全绿。报告=`docs/R2-11R-QUARANTINE-LCQ-STAGE-06-SOURCE-MAP-2026-07-22.md`。
- ✅ **R2-11S 白湖赌局至蛇彝村来源重建（2026-07-22，Codex + Claude 二审，裁定 #127）**：`lcq.stage_03` opening 从提前写入冰蛊、赌局后关系与南荒行程，收回到第18章中段“苏妲己已识破并扣押程宗扬”；十个冻结 ID 保留，重复绑定 `qingyu.33.1` 的 `s03_07/08` 拆正为铁索桥与劝住武二郎。旧稿在第33章即收束，漏掉下一关成立所需的第33–36章，故 append-only 新增 `s03_10` 太乙拦船、`s03_11` 雨林/黑石滩、`s03_12` 抵达蛇彝村；不提前宣告第37章后的袭击与灭村真相。九名演员采用第18章时点最小投影并做构建期／运行时时间门，全体 affiliations 锁定；13 拍人工双步合同可从空档重放至整章完成。Claude 二审无 P0/P1/P2；P3 仅记录 SAVE-CONTRACT 事件数组未按游玩顺序排列，不影响功能。事件总数 381→384，覆盖 342/381→355/384；本关仍在 quarantine。`canon:build` 463 测试/37 关、`validate:all` 与 production build 全绿。报告=`docs/R2-11S-QUARANTINE-LCQ-STAGE-03-SOURCE-MAP-2026-07-22.md`。
- 🛠️ **R2-11T 碧鲮湾至鬼王峒初探来源重建（2026-07-22，Codex + Claude 二审，裁定 #128/#129）**：`lcq.stage_05` opening 收回到第73章大潮后、第74章鲛人袭击前；十个冻结 ID 保留，重复与倒序轴绑定全部纠正。旧稿在第84章阴煞后提前收束，首稿 append-only 新增 `s05_10–15` 衔接至第92章；Claude 二审发现 P1＝漏掉 `qingyu.82.2` 蛇傀焚村与解救碧鲮族的关键因果，现 append-only 新增 `s05_16` 并插回小紫登场后、古道失散前。十四名演员采用时点最小投影，构建期卡／势力与运行时 registry 三层门控；17 拍人工双步合同可空档重放。P3 单记：第85章小魏支线和第86章工匠氛围拍不合同化，来源报告已明示；章节完成路径冻结校验偏弱沿用既有处理。事件总数 384→391，覆盖 355/384→372/391；剩余两个隔离关共 19 个旧事件，本关仍在 quarantine。补洞验证与聚焦复审进行中。报告=`docs/R2-11T-QUARANTINE-LCQ-STAGE-05-SOURCE-MAP-2026-07-22.md`。
- ✅ **R2-11U 长安佛门暗潮至水香楼余波来源重建（2026-07-22，Codex + Claude 二审，裁定 #130）**：`lyg.shixiang_ambush` opening 收回到第669章佛门公敌法旨后、杨玉环紫云楼示警前；删除水香楼邀捕、毒方刺客与女忍已到场等未来泄露。九个冻结 event ID、四个 chapter ID 和原 completion path 保留，append-only 补 `shixiang_s10–s14`，14 拍按 seq1093→1115 串行落为人工双步合同；三组重复轴与跨章倒序消失。演员由 66 人收口为 15 人时点投影，技能／功法／物品／境界与 content access 不回灌。source70、81.2、82.1 成人私密拍及 source75.1 除夕氛围拍不机械合同化。事件总数 391→396，覆盖 372/391→386/396；本关仍在 quarantine。Claude 二审无 P0/P1/P2；P3 单记：opening 以未经证实的传话略微预告首拍调查由头，但未预写结果、flag 或后续来源事实，暂留作叙事钩子。报告=`docs/R2-11U-QUARANTINE-LYG-SHIXIANG-AMBUSH-SOURCE-MAP-2026-07-22.md`。
- 🛠️ **R2-11V 甘露密谋至程宅战榜来源重建（2026-07-22，Codex + Claude 二审，裁定 #131）**：`lyg.ganlu_bian` opening 固定在 source126《滴漏》后，李昂后日诛宦计划作为已完成事实；旧 `sourceEnd=135` 与下一关重叠，现收回 source132《程宅战榜》，source133–135 凉州盟、招魂、小紫闭关全部归还下游。十个冻结 event ID、四个 chapter ID 与原 completion path 保留，按 seq1193→1202 加 source132 两个无现成轴细拍重写为十个串行人工合同；47 人收口为 14 人，构建期卡／affiliations／派生关系同步锁定。source127.2、128.3 成人拍及 source132 活扣、诊病旁支不机械合同化。二审 P1 已修：不动冻结 chapter completion path，按实际 eventIds 重写章节标题／摘要，使 `release_jingnian` 所在章明确包含“权宦追凶”，下一章准确对应甘露搅局与小紫问法。P3 单记：gitignored `lyg.ganlu_bian.sources.md` 仍是 source135 旧构建参考，不进入 runtime／测试／发布产物。覆盖 386/396→396/396；八个隔离关来源重建与合同化全部完成，但 quarantine 状态不变。报告=`docs/R2-11V-QUARANTINE-LYG-GANLU-BIAN-SOURCE-MAP-2026-07-22.md`。
- 🛠️ **R2-11W 三书精选机会卡扩写（2026-07-22，Codex，裁定 #132）**：全库机会卡 7→10，但继续禁止“一事件一卡”。清羽左武军复盘补小紫错位消息试探，云龙伊水押运补反伏击现场留证，燕歌董卓退场补贾文和撤离后勤；三张卡均由本事件真实 `decisionCore` actor/action 触发，默认局势至少有一项确定性入选行动可达。每张卡使用两步结构化行动，只授一次性复核／协调权限并写 NPC 记忆，不改变泄密真凶、金铢损失、董卓退场、边警真伪或任何 Canon Rail 结局。生成脚本二次运行三源文件哈希不变；`canon:build` 482 测试/37 关、`validate:all` 与 production build 全绿，待提交后 Claude 二审。报告=`docs/R2-11W-CURATED-OPPORTUNITY-CARDS-2026-07-22.md`。
- 🛠️ **R2-11X 全局事件合同收口审计（2026-07-22，Codex）**：37 关共 396 个事件，精确分布为 389 个 `objective_action`（267 受限机械迁移＋122 人工合同）、1 个 `local_condition`、6 个仅由机会合同完成的事件；10/10 机会卡有显式 trigger 与确定性完成合同。新增回归逐一模拟全部 396 个 LLM 完成写入并确认全部拒绝，同时确认 8 个来源重建关／88 个事件仍在 quarantine。首次全量 `npm test` 发生一次 Node test-runner 子进程反序列化版本瞬时错误，目标文件单跑 27/27、随后全量复跑 485/485，确认为 IPC 抖动而非代码断言失败。待两轮 Claude 二审收口后把 R2-11 工程里程碑翻为完成。报告=`docs/R2-11X-GLOBAL-CONTRACT-CLOSEOUT-2026-07-22.md`。
- ⏸️ **R2-11L 日终测试／Claude 交接（2026-07-21）**：生产代码停止在 `97c46dd` 后，用户先做游戏内测试。交接档固定今日三个提交、四类真机检查点、剩余八个隔离关的逐关来源重建顺序及禁止事项；后续 Claude 不得直接把 72 个旧事件批量合同化或回接默认 Rail。交接=`docs/R2-11L-DAY-END-TEST-AND-CLAUDE-HANDOFF-2026-07-21.md`。
- ✅ **R2-11B `s01_06–08` 跨事件确定性完成 G1（2026-07-21，Codex）**：迁移覆盖从 1/380 增至 4/380。`s01_06` 护持新君与 `s01_07` 承接边警均采用 `timeline_deadline`：玩家三步完成只登记 ready，郭解／董卓死亡仍须等程序绝对截止才落 `done`；`s01_08` 私下核验与认识论分层两步完成后立即结算，并以 `persistent` 保留无截止事件的唯一完成入口，避免卡片过期后永久卡轴。三线均不读取 LLM 正文/命令，模型直写被拒；JSON 重载、参与/场外竞争、唯一权限与 validator 缺截止／冲突过期反例已覆盖。报告=`docs/R2-11B-CROSS-EVENT-DETERMINISTIC-COMPLETION-G1-2026-07-21.md`。**下一门先做结构化推进选项、可见窗口与 `partial` 收束，再扩非机会卡事件；禁止继续机械复制关键词合同。**
- 📐 **世界/NPC 引擎设计参照系已落 roadmap（2026-07-19，用户拍板，Claude 执笔）**：`RELEASE-ROADMAP.md` R2-9 节末新增实现指引——确定性调度定"发生什么"、LLM 只管"怎么讲"（渲染层+提案层，红线＝LLM 永不直接回写权威状态）；文明6议程/三国志态度阈值/CK3阴谋/L4D Director/宿敌系统五条借鉴映射分别对接世界演员扩量、态度建模、机会卡形态、压力调度定位、分歧可见反馈；拒绝全量模拟/竞争AI/自由外交/每NPC独立agent。**Codex 后续做世界演员扩量或态度建模时须先读该节对齐。**

### 📋 列入「未来功能」

- 立绘 E-M2/M3/M4（上传存储 / 展示区 / AI 自动生成）。
- 燕歌行后续续写全新 canon（最大未来项，见 §5-F）。

### 🚫 已决定不修 / 待定

- D5 yange extraction 索引错位（纯展示位偏移，标记不修）。
- D2 阮香琳/蛇夫人/蛇奴 拆分、D3 尹馥兰/兰姑（身份层遗留，原文证据不足待人工裁定）。
- 6 条约束破戒后果需原文确认（碧姬/林娘子/虞紫薇/白仙儿/孙寿——原列「碧奴」是鬼王峒蔑称、「襄城君」与「孙寿」是同一人，均已按裁定 #141／#142 归并）。

---

## 4. 验证门禁（任何模块改完都必须过）

在真实工作目录跑：

```bash
npm run type-check          # TS 类型
npm run canon:build         # 当前项目级完整门；数量会增长，不依赖历史固定计数
npm run build:single        # 单机生产构建
git diff --check            # 补丁格式
```

另跑任务对应的聚焦测试；涉及共享 atlas 或 IF/spine 时再跑对应校验器。不要再使用本节早期的 18 关／186 用例固定数字判断当前基线。

改完 mod 数据后：`node scripts/sync-builtin-mods.mjs` → 同步 NAS `完善版剧本Mod/` → `launchctl kickstart -k …` 重启服。
- 「补漏不重做」是铁律：脚本一律 union/补空不覆盖、晚期内容时间门控、每步落 `stages-pre-*-backup/`。
- 已存档不回溯，UI/坐标类变更需新开局验证。

---

## 5. 历史可认领模块快照（2026-07-22；不再代表当前排序）

> 本节保留历史上下文，不得直接据此认领。当前任务编号、分级、验收与分工统一见 `docs/CURRENT-P-LEVEL-HANDOFF-2026-08-23.md`。

### A. 发测前门禁 ⭐ 当前首选
- ✅ **可见掷骰单一权威（2026-08-01 遗留清账完成）**：默认／分步 prompt 均退役无本地回执的 LLM `〔判定〕` 与计算公式，统一 preflight→确认→掷骰→回执；覆盖三入口、常见风险措辞与刷新／重试。`FormattedText` 组件实例渲染回归与休眠扩展规则清理均已补齐，不再作为待认领项。
- ✅ **结构化响应／记忆总结真机复测（2026-08-01 G2 关闭）**：真实正文提交后触发后台配置失败／取消，正文、位置与时间正常落账，中期／长期记忆保持 10/1；API throw 由注入式自动化覆盖。报告=`docs/STRUCTURED-RESPONSE-MEMORY-SUMMARY-G2-2026-08-01.md`。
- **发布对象裁定**：小圈子内测可直接进入发测；公开发布另需角色档案层 NSFW 门控。

### B. 单机化清理
- 🛠️ **G1 公共入口与运行时副作用已完成**：主页固定单机；登录／账号／创意工坊／联机游历路由与入口删除；在线心跳、穿越日志、联机地图/正文状态移除；旧联机角色只读保留，不触网。
- 🛠️ **G2 旧联机本地缓存可恢复迁移已完成**：只读本机 `云端修行/存档` 缓存，显式复制为带来源标记的新单机副本；幂等、冲突安全、失败可重试，来源角色和旧 key 不删。报告=`docs/SINGLE-PLAYER-LEGACY-MIGRATION-G2-2026-08-03.md`。
- 🛠️ **G3 联机死代码与运行态收口已实现**：引用图与旧生产 bundle 先证明 6,120 行叶节点不可达，再删除 view/panel/service/API；仍在 bundle 的联机 prompt、AI 穿越／离线代理注入与无调用 i18n 已移除。game-state 固定单机态，旧 schema/key/来源数据不动。报告=`docs/SINGLE-PLAYER-DEAD-CODE-G3-2026-08-03.md`。
- 🛠️ **G4A 创角会话单机化已实现**：创角 view/store/五步选择与预览不再存在联机会话、兑换码 AI 或云端角色模式；新角色 payload 固定单机。手动获取云端创角素材继续保留。报告=`docs/SINGLE-PLAYER-CREATION-G4A-2026-08-03.md`。
- **下一批**：逐函数删除角色 store 和 Save/GameVariable/Sect 中已无入口的旧联机加载、保存、回写与服务器权威条件；保留旧联机 profile/key 的只读展示和显式复制迁移，不得删除旧 IndexedDB key 或云端缓存元数据。
- 保留本地 `save-storage`、`cloudDataSync` 与 devserver 存档链；单独分支、可回滚。

### C. 角色与势力数据质量
- 合并后的角色卡／描述二审队列：11 个阶段身份转折已完成并进入 Claude 二审；高风险前 25 张已完成证据分层，16 张已修，剩余程宗扬／秦桧／泉玉姬／孙暖／云苍峰／仇士良／苏荔／殇侯／凝羽转入独立取证纵切。
- 主要角色 affiliation 噪声抽查、148 人窄范围富化重扫、19 名高置信补卡候选。
- 势力 additions 剩余二验、友通期等人工复核、里程碑奖励落点。

### D. 地点、记忆与写实系统
- 常驻地点／`locationId` 补档与更深地点风貌扫描；现有地点检索纵切已可用。
- 全局花名册仍待做；分层私有知情 B/C 已完成谢艺→碧姬首个 G1 + G2，以及不同 holder／事件后解锁／rumor 异构小批量 G1 + G2（裁定 #144–#147）；下一门是其余密档边的小批量回填，仍禁止全库直铺。R2-6 的跨关记忆 A 已完成。
- 技能完整效果表、跨国移动约束、商店／掉落国别选源与经济平衡。

### E. 表现层与内容扩量（须先看小圈子反馈）
- 五条枢纽高光与两张 Voice Card 做外部对照；通过后再定 242 条高光批量、立绘槽和 top 20–30 表演卡。
- 🧭 **R3-9 关系姿态与差异化反应层（已批准，待构建）**：先做吕雉低／中／高好感的同动作三路线，再用一名不同性格 NPC 复验通用性；**现有角色画像／阶段人格是不可被好感改写的底色**，关系只改变其对玩家的表达与投入程度。差异覆盖语气、解释、披露、协助意愿与边界表达，不直接改写引擎裁定结果。高好感不等于服从，低好感不等于机械敌对；阶段人格、底线、知识权限与世界事实始终优先。G1=确定性姿态投影+prompt/回归，G2=正式 UI 同动作 A/B/C 真机验收，并须证明三档去掉关系措辞后仍可辨认出同一角色；Claude 把控剧情、语域矩阵并执行独立真机验收，Grok 实现并补成人开启下的门控变体，Codex 负责整合、自动化门禁与验收证据签核，不重复代跑人工路线。**⏸ 2026-08-14 起 Codex 部分暂停（签核位 = OPEN，恢复后原分工自动生效、删标记即可）**：整合与门禁由 Claude 接并留完整输出，报告显式标注"无第三方签核"。G0 剧情矩阵已交付＝`docs/R3-9-AFFINITY-LADDER-SPEC-2026-08-14.md`（吕雉 + 贾文和对照矩阵、好感阶梯地基、关卡标定规则；六项待拍板见该文 §9）。
- 🛠️ **R3-10 六朝世界模式全 stage 扩量（W1 已完成，盘点中）**：事前征兆、事后消息、硬锚点／可分叉结果、旧档幂等与无 UI 倒计时已有定陶可运行样板；扩量先由 Grok 对 37 stage 产出 evidence-backed targets/proposals，再按燕歌定陶、清羽 `lcq.s10_04`、云龙 `lyl.s05_09` 三种异构结构小批量落地。证据不足一律 `needs_review`，不得为覆盖率猜锚点；Claude 负责承重剧情与人物一致性复核及正式 UI G2，Codex 负责正典保护、批次合并与确定性门禁。**⏸ 2026-08-14 起 Codex 部分暂停（签核位 = OPEN，恢复后原分工自动生效、删标记即可）**：正典保护、批次合并与门禁由 Claude 接并留完整输出，报告显式标注"无第三方签核"。
- ⏸️ 立绘**外观数据已就绪，图片资产线暂停**（2026-07-31 用户裁定）：单一数据源 `character-canon/portrait-visual-master.json`（127 人，identity/outfits 分层，ready 65／partial 39／insufficient 23），已投影进运行时 118 人。恢复时从 SAFE manifest + 展示 resolver + 3–4 位样板角色开始；已有官方插图优先，且出图前必须先定全局 16 色调色板（PC-98 大像素方向）。
- 亲密档案层等待用户圈选首批 6–12 名，继续执行年龄与双条件注入硬门禁。

### F. 燕歌续作与远期沙盒
- 先做第一幕“长安驱魂局”可玩纵切，再决定 141 ending 回填广度。
- 关系密档知情注入 B/C 已有清羽首个 G1 + G2，并完成异构小批量 G1 + G2；下一步只做其余密档边的小批量回填，再接续作纵切。无原文部分仍走多模型协同创作。
- 地区沙盒／平行选国保持远期 overlay，不写回正典。

---

## 6. 工作分工惯例（用户定的固定模式）

- **Grok 4.6 管主要代码实现、高 token 批次、聚焦测试与自查**；必须按窄批次实际落盘。
- **Claude 管独立只读二审和隔离真机核验**；不直接替自己写的实现签核。
- **Codex 管总体方向、范围合同、canon／知识边界、补丁审核、门禁与最终验收**；不与 Grok 争抢主体代码。
- DeepSeek／MiniMax 默认是游戏内容生成 provider 或经明确委托的批量材料模型，不作为当前代码 owner。DeepSeek 大块露骨原文易被审核返空、综合型约束易误判 unsupported，批量材料仍用“锚定章节窗口＋只要标签、不复述细节”的约束式分类。
- **人物卡 = 权威源**，别太歪（程宗扬曾被抽成"随和洒脱"，卡实为"务实/精明/有野心"）。
- 未经用户要求不擅自 git 提交、不擅自同步 NAS 成品区（草稿类先待审）。

---

## 7. 给新 agent 的最短上手路径

1. `cd` 进真实工作目录（§1），`git status --short` 与 `git log --oneline -5` 确认当前分支／工作区；不要依赖历史固定提交号判断基线。
2. 先读 `docs/CURRENT-P-LEVEL-HANDOFF-2026-08-23.md` 与本文顶端最新状态，只认领一个编号；涉及正典数据时再读 `CANON-DECISIONS.md`、`SAVE-CONTRACT.json`、`character-canon/CORE-DOCS-ROADMAP.md`／`TODO-待完成.md`。
3. 跑一遍 §4 门禁确认基线绿。
4. 认领模块前检查当前分支与他人改动；涉及 canon、核心 prompt 或冻结 ID 时先读裁定簿与 `SAVE-CONTRACT.json`，不得覆盖受保护字段。
5. 改完 → 门禁全过 → 同步内置/NAS → 重启服 → （必要时）Chrome MCP 连 Windows live 验证。
```
