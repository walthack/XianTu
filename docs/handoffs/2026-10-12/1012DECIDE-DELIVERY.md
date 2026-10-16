# 1012DECIDE 交付记录

用户2026-10-12 08:14裁定，分两个提交执行，不推送。第1阶段修复已发布，第2阶段仅诊断源码，**不进入当前8097**。热调候选不上、tuning.json不动。

## 1. 修复提交及8097包

- 提交：`2886f559a419d65d637d2e87cb362a3d84a3157d`。社交goal配置/既有social权重、F07合同hook事实跨关、九阳ID结构化回执、配套测试及权威状态/历史归档。私有目录与证据不入提交。
- 本轮发布前门禁：type-check、完整canon:build **1663过/0败/5跳**（214.0秒）、内容包过期、diff检查通过。沿用上一轮Claude Opus5.5代码复核；其范围为上述修复，不将其PASS套用于第2阶段新诊断代码。
- commit后用标准combat-trial配置在私有输出目录重建，webpack成功；仅替换生成的静态产物，未调用服务重启。配置clean=false，无清目录。
- **8097 combat-trial.js SHA-256**：`220531f211dfe2ea6c4048c86d01d593a9eb0706c5d35d43377a3c545ce3afb6`。与1012FIXLIST真实UI隔离候选逐字相同。
- 本机及LAN两个接口HTTP返回JS均与上述SHA一致：`http://192.168.50.51:8097/`、`http://192.168.50.164:8097/`。8097原PID65144、启动时间Oct4 21:56:33保持不变。
- 旧dist完整27文件保留于 `_newbot_tmp/1012decide/rollback-dist-20261012-before-code/`，旧JS SHA `9d9e13336e5e2c6522c2c7a33c85805909393109072c62942345701c0d3a48ae`。如获回滚指示，可原样覆盖恢复，继续使用当前服务，无需删文件或重启。本轮未实际回滚。
- 隔离保存/API文件15项前后守卫保持一致；tuning.json在部署目录原本不存在，本轮未创建或加载它。提交的热调JSON位于handoff目录，仅文档候选，不在发布目录。

## 2. 仅补诊断（独立提交，未部署）

记录每个实际模型传输尝试（重试/非流降级也分行）：

| 字段 | 含义 |
|---|---|
| module / turnId / generationId | 模块及诊断回合归属；generationId为调用者已有ID；无游戏回合/无生成ID的连接探测或部分embedding明确为null |
| background | 前台/后台；模块调度、后台memory/audit/index在调度时冻结归属，迟到不贴到新回合 |
| requestId / transport / startedAt | 每次实际传输独立ID，fetch/axios/TavernHelper及开始时点 |
| headersAt / firstContentAt | 平台观察到响应头、首个非空有效正文的毫秒时间；推理、SSE心跳与空白不算正文 |
| httpStatus / status / finishReason / endedAt | HTTP状态、传输完成/失败/取消/超时及服务端结束原因；endedAt只在传输Promise/流实际结束时记 |
| cancelRequestedAt / cancelSource | 发起取消的时点及来源（deadline、cancel_all、turn_cancel、scope_change、foreground_yield、natural_intent_cancel或外部caller）；不把未知来源猜成用户主动取消 |
| timeoutPhase / timeoutStage | 既有first_byte/total/idle阶段及await_headers/await_content/content_idle细分；不改变任何计时器 |

回合记录独立的`foregroundReadyAt`和`backgroundEndedAt`。前台ready后，尚未结束的旧请求仍在`inFlightRequests`；调度已封口且请求和后台任务全部结束，才发`background_drained`。五秒审计排程也先占观察名额，取消/跳过时释放，不改变原排程。记忆的待下一回合应用结果按原策略排队，drained不等同已在新回合提交这些结果。

### 观察边界、隐私和读取

- 请求/回合各保留最近500条内存快照；终结和取消发起事件在控制台用`[AI请求诊断]`输出，ready/drained用`[AI回合诊断]`。查看/导出：`window.__xiantuRequestDiagnostics.snapshot()`，可JSON.stringify后复制；刷新会清空内存，测试驱动应在刷新前导出或保留控制台日志。
- 只记录上述白名单字段，不存URL/headers/API Key/提示词/正文/原始错误，不写正式存档或API配置。模块诊断字段不发送给provider或TavernHelper。
- XHR在HEADERS_RECEIVED时观察；如果浏览器直到首段body才暴露headers，则这是平台观察时点，不伪造更早网络时间。节点非XHR适配器若不可观测，headersAt保留null。
- TavernHelper由宿主掌管网络，HTTP头不可观测；宿主流式的首正文不能可靠分离则记null，明确非流式返回才记录响应内容到达。不能把宿主生成结束时间伪称流式首正文。
- 没有新增超时、重试、流式降级、模型路由/输出上限/后台结算策略；原timer值、module policy和固定回归仍保留。不动runtime.ts、AIBidirectionalSystem.ts、核心prompt、合规或游戏数值。

### 验证

- 新诊断定向9项；连同模块路由/AI并发回归共21项通过。覆盖生产SSE解析、非正文排除、首包/idle超时、503独立尝试、取消源、旧/新回合隔离、前台遗留请求阻止假drain、XHR并发/异常恢复、host不可见时点与metadata不外传。
- 隔离真实Chromium+本机控制HTTP服务：XHR和SSE响应头分别比首正文早82ms；503无正文，取消源cancel_all；4实际请求/0pageerror；诊断快照无测试密钥/私有提示词/错误体，wire无diagnostics字段。它是受控网络验证，不是真模型性能、用户真机或SLA验收。
- 最终type-check、完整canon **1672过/0败/5跳**（215.9秒）、内容包过期/私有标准combat-trial构建/diff门禁通过，日志在 `_newbot_tmp/1012decide/`；诊断只进独立源码提交，不覆盖8097。

## 当前结论

用户现在可在上述8097入口复测社交/F07/九阳修复。整体仍PARTIAL：南荒一期发行终点未自然到达、F06数值候选未合格、完整30秒SLA及真人手感未验收。先收用户真机手感；热调及请求策略保持待裁定，不顺手实施。


## 改动文件及收口

- 日志实现：`src/services/requestLifecycleDiagnostics.ts`、`diagnosticTransport.ts`。
- 观察挂点：`aiService.ts`、`aiRequestDeadline.ts`、`moduleModelRuntime.ts`、`embeddingService.ts`、`eventReconcileService.ts`；请求策略原样保留。
- 回合/后台归属：`src/stores/uiStore.ts`、`src/components/dashboard/MainGamePanel.vue`、`src/services/modularTurnBackground.ts`、`backgroundAudit.ts`、`src/utils/backgroundMemoryWork.ts`；RAG服务仅增加可选诊断上下文透传，排程/写入规则不变。
- 取消来源：`src/modules/scenarioMods/naturalIntentRouter.ts`仅标记既有取消，不改候选/关键词/前置/结算。
- 验证：`tests/requestLifecycleDiagnostics.test.mjs`；21项定向包含9项新测试。第一次XHR受控浏览器用例只flush头而不发body，平台直到body才暴露headers，严格时差断言未过；原日志保留，随后用合法JSON前缀触发HEADERS_RECEIVED，复核通过，无产品补丁或隐藏失败。
- 独立诊断提交使用描述`feat: trace AI request and turn lifecycles without changing policy`；确切哈希以本线程回报或该Git记录为准，未执行推送。
- 第二阶段未改变8097产物；15正式存档/API文件哈希/大小/mtime前后相同。旧包保留、受控测试浏览器/服务已结束；无文件删除，无合规/热调实施。


## 后续裁定（1012DEPLOYTRACE，2026-10-12 09:02）

用户已另行授权部署af7aa6d9诊断到8097，部署完成；上文“诊断未部署”属于DECIDE当时的历史口径。当前SHA、保护与日志导出见[DEPLOYTRACE指引](1012DEPLOYTRACE-TESTER-GUIDE.md)及PROJECT-STATUS。超时/重试/模型策略及热调仍不动。
