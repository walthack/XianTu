# 1012TESTCFG · 真机测试/复测固定开测规则

用户裁定：2026-10-12 22:16（Asia/Singapore）。本规则是所有真机测试、复测与真人试玩执行书的**首个模型开测步骤**，先于发送任何模型请求。执行书其他环境/存档/端口/权限守卫继续有效；本文不授权开新测试、修改正式配置、产品路由、超时/重试策略或重建8097。

## 0. 每次开测必须执行

1. **只读来源**：从当前仓库 `.xiantu-server/save-storage/user_config_api_management_v1.json` 读取正式配置；本机绝对路径 `/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/.xiantu-server/save-storage/user_config_api_management_v1.json`。先登记原文件哈希/大小/mtime，收尾核对。此文件目前外层为`id/data/timestamp`，实际API管理配置在`data`内，不要把外层当配置灌入。读不到、JSON无效、data结构不符即停并报告，不创建默认配置。
2. **只在私有profile改副本**：新建本轮专属测试浏览器profile，复制并改其内存配置后，使用启动前注入（如Playwright context.addInitScript）写入该profile的`localStorage['api_management_config']`，之后才加载游戏页。页面启动/刷新可能从后台重新读取配置：测试驱动必须在加载前隔离API配置同步，将相关读取在私有浏览器内返回改好的副本（保持接口外层格式），拦截配置写回；不能让正式后台原分配覆盖私有副本，也不能仅靠一次localStorage注入。注入后从页面store核对最终实际路由。禁止向正式浏览器/现有他人profile注入，禁止把副本上传回正式save-storage或通过正式API设置页面同步。组织者先完成配置，再交设备给真人测试者；测试者无需接触Key。
3. **固定main**：在私有副本的`apiAssignments`中，将`type='main'`固定到「minimax high speed」：`id=api_1782316385574_8wsfb6ors`、`model=MiniMax-M2.7-highspeed`。只使用正式配置里这个ID的原连接/凭据，要求其可用、enabled=true、模型精确匹配且必要URL/凭据齐全；不猜连接、不借其他Key、不用默认值补齐。
4. **测试禁用Jev/Deepseek**：二者按需付费，测试一律不用。只在私有副本核对`apiConfigs`的provider/model/name/url（不检查或输出Key），识别Jev（含jev-router及别名）和Deepseek（含OpenRouter deepseek/*）；把`apiAssignments`、`moduleAssignments`及其他实际路由分配中所有指向它们的apiId改为上述MiniMax ID。继承main的模块随固定main解析；其他继承路径也逐一核对。私有副本中禁用这些被禁连接，防止旧profile/回退再次选中；其余未被禁的配置、功能开关、embedding分配和请求策略保持原样。正文里旧“沿用后台main/随意换模型/Jev或Deepseek对照”不得用于新轮开测；过往结果保留历史模型名，不改写成MiniMax结果。
5. **首请求前两次核对**：先从已注入的页面实际API管理store/模块解析结果核对main的apiId与精确model，以及本轮将用的辅助/后台/embedding路由；报告先写安全清单`功能/模块、apiId、实际model、前台/后台、核对时间`。再在首个及后续模型请求的发送前拦截点只读取payload.model并核对，不打印请求体或header：main必须为MiniMax-M2.7-highspeed；任何Jev/Deepseek或gpt-4o默认回退请求必须拦截，不发送、不付费，并停下报告。Embedding等非main请求记录其正式批准模型，不强行改成聊天模型。
6. **失败即停**：正式配置不可读、MiniMax ID缺失/禁用/模型不匹配/连接不可用、路由仍指向禁用模型、实际model无法核实、或退回`gpt-4o`默认，均停止真实请求，写`BLOCKED_TEST_CONFIG`及缺失条件。不得以“先跑看看”发送默认值，不无限重试，不绕过当前测试授权。报告中配置前置通过不等于样本测试PASS。
7. **密钥保护**：密钥只进入私有profile或必要的权限0600、忽略目录私有运行文件；不进报告、截图、命令行参数、控制台、完整配置dump或Git。证据只列API ID/模型等安全元数据，记录替换的分配类型；正式原文件始终只读。多轮/新profile/刷新重新初始化/换槽导致配置重载时，都在下一次发送前复核，不能复用未经核实的默认值。

## 报告固定开头字段

- 配置来源：上述正式路径；读取成功/失败，原文件哈希/大小/mtime守卫前后结果。
- 私有profile：本轮目录；main实际apiId=`api_1782316385574_8wsfb6ors`、model=`MiniMax-M2.7-highspeed`。
- 其他实际路由及Jev/Deepseek替换：仅`usageType/moduleId、原apiId→新apiId、model`，禁止凭据。
- 首个请求发送前实际payload.model及所属功能：主请求为MiniMax-M2.7-highspeed，embedding单列；发生default/gpt-4o/禁用模型/不可核实则拦截并BLOCKED。
- 这是游戏请求模型配置；GPT-6 Luna/Claude/Grok等执行代理的模型身份不因此改变。

## 本轮文档覆盖清单

下列执行书/测试指引及含后续真机清单的交接文档均已加入自包含的固定开测条款。历史实测报告、只读二审结果及私有证据保留原样；后续用旧文档开新轮测试时，新增条款优先。此轮只改Markdown文档，不实际注入profile、不发模型请求、不改产品代码、不提交Git、不动8097。

- [KEY-BEAT-CARD-TRUE-DEVICE-TEST-2026-10-01.md](KEY-BEAT-CARD-TRUE-DEVICE-TEST-2026-10-01.md)
- [MODULE-FRAMEWORK-TRUE-DEVICE-TEST-2026-10-01.md](MODULE-FRAMEWORK-TRUE-DEVICE-TEST-2026-10-01.md)
- [MODULE-INTEGRATION-TRUE-DEVICE-2026-10-01.md](MODULE-INTEGRATION-TRUE-DEVICE-2026-10-01.md)
- [RUN5-GROK-TRUE-DEVICE-ACCEPTANCE-2026-09-30.md](RUN5-GROK-TRUE-DEVICE-ACCEPTANCE-2026-09-30.md)
- [DEMO-PLAY-GUIDE-AND-AGENT-OBSERVATION-2026-09-28.md](DEMO-PLAY-GUIDE-AND-AGENT-OBSERVATION-2026-09-28.md)
- [LANDING-TO-XINGYUEHU-PLAYTEST-2026-09-21.md](LANDING-TO-XINGYUEHU-PLAYTEST-2026-09-21.md)
- [PLAYTEST-GUIDE-SMALL-CIRCLE-2026-07-17.md](PLAYTEST-GUIDE-SMALL-CIRCLE-2026-07-17.md)
- [PLAYTEST-GUIDE-SMALL-CIRCLE-2026-10-10.md](PLAYTEST-GUIDE-SMALL-CIRCLE-2026-10-10.md)
- [WORLD-SIMULATION-MODE-G2-PLAYER-PLAYTEST-2026-08-13.md](WORLD-SIMULATION-MODE-G2-PLAYER-PLAYTEST-2026-08-13.md)
- [XINGYUEHU-B1-CLAUDE-TRUE-DEVICE-ACCEPTANCE-2026-09-14.md](XINGYUEHU-B1-CLAUDE-TRUE-DEVICE-ACCEPTANCE-2026-09-14.md)
- [R2-10B-NPC-DECISION-CORE-TRUE-DEVICE-ACCEPTANCE-2026-07-19.md](R2-10B-NPC-DECISION-CORE-TRUE-DEVICE-ACCEPTANCE-2026-07-19.md)
- [R2-11L-DAY-END-TEST-AND-CLAUDE-HANDOFF-2026-07-21.md](R2-11L-DAY-END-TEST-AND-CLAUDE-HANDOFF-2026-07-21.md)
- [STRUCTURED-RESPONSE-MEMORY-SUMMARY-G2-2026-08-01.md](STRUCTURED-RESPONSE-MEMORY-SUMMARY-G2-2026-08-01.md)
- [R3-9-AFFINITY-LADDER-SPEC-2026-08-14.md](R3-9-AFFINITY-LADDER-SPEC-2026-08-14.md)
- [R2-EPISTEMIC-EXPLORATION-DRAFT-2026-08-10.md](R2-EPISTEMIC-EXPLORATION-DRAFT-2026-08-10.md)
- [WORLD-SIMULATION-MODE-G0-2026-08-13.md](WORLD-SIMULATION-MODE-G0-2026-08-13.md)
- [NINGYU-FEEDBACK-REPAIRS-2026-10-01.md](NINGYU-FEEDBACK-REPAIRS-2026-10-01.md)
- [RUN5-REPAIRS-2026-10-01.md](RUN5-REPAIRS-2026-10-01.md)
- [KEY-BEAT-ADVANCE-CARD-CANDIDATES-2026-10-01.md](KEY-BEAT-ADVANCE-CARD-CANDIDATES-2026-10-01.md)
- [DAY-END-2026-07-15.md](DAY-END-2026-07-15.md)
- [ACCEPTANCE-EXECUTION-GPT6-LUNA.md](handoffs/2026-10-07/ACCEPTANCE-EXECUTION-GPT6-LUNA.md)
- [ACCEPTANCE-CONTINUATION-GPT6-LUNA.md](handoffs/2026-10-10/ACCEPTANCE-CONTINUATION-GPT6-LUNA.md)
- [P0-EXECUTION-PLAN.md](handoffs/2026-10-10/P0-EXECUTION-PLAN.md)
- [TRUE-DEVICE-TEST-PLAN-P0P1.md](handoffs/2026-10-11/TRUE-DEVICE-TEST-PLAN-P0P1.md)
- [1012DEPLOYTRACE-TESTER-GUIDE.md](handoffs/2026-10-12/1012DEPLOYTRACE-TESTER-GUIDE.md)
- [lead_designer_handoff_2026-10-02_retest.md](handoffs/2026-10-02/lead_designer_handoff_2026-10-02_retest.md)
- [FAST-NARRATIVE-DEMO-BASELINE-AND-CONTRACT-2026-08-23.md](FAST-NARRATIVE-DEMO-BASELINE-AND-CONTRACT-2026-08-23.md)

- [R2-0V-XIEYI-VERTICAL-SLICE.md](R2-0V-XIEYI-VERTICAL-SLICE.md)

配套状态记录同步更新：[PROJECT-STATUS.md](../PROJECT-STATUS.md)、[PLANNING-ROUNDS.md](PLANNING-ROUNDS.md)。
