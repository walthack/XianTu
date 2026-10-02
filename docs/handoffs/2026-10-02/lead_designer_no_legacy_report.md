# 清羽 demo 停用 legacy 修改报告（2026-10-02）

状态：代码已改完，等待用户测试。按用户最后补充，本轮没有运行全量/单测、tsc、smoke、构建或真机测试，没有启动临时服务，也没有操作8091、用户浏览器/GUI/launchd。新增的回归测试也尚未执行，不能称为PASS。自本报告交付后停止修改，测试期间由用户独占复测。

备份：/Users/clawbot/Desktop/pre_no_legacy_20261002_145250，逐文件保留修改前版本与git status/diff；未reset/checkout/stash/commit，未删文件，保留此前dirty改动。未改canon数据、生死合同、骰子结果、超时预算或API配置。

## 一、根因及实施范围

`s02_02`（左武军开战/王哲殉军）其实已在旧18事件白名单中，不能只补同名ID解决。旧模块入口还要求localOnly profile、开关/白湖离馆前事件窗、selected/resolved_text规划、固定场景验收；任一返回null就会进入完整legacy。真机约8.1万字及60s超时证据由用户提供，本轮没有自行复现，不能确定当时具体命中哪一道旧门禁。

此次根据已拍板方案：清羽短版标记 `清羽记开局.kind=qingyu-demo-v1` 和落地连续标记 `星月湖落地连续试玩.kind=xingyuehu-landing-through-v1` 两个demo入口都强制模块。短版是stage01/02；后续关卡如继续保持这些demo标记也统一适用，不再在白湖离馆后关闭模块。无事件硬编码白名单，不修改路线/事件数据；未扩到正式角色、无demo标记的普通存档或旧海神殿三幕试玩。

## 二、主要代码改动

- [src/modules/scenarioMods/modularTurn.ts:40](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/modularTurn.ts:40)：增加强制demo判定。demo忽略旧模块关闭开关，模块启用与回执选择不再依赖自然输入事件窗。开关读取本身仍保留，正式/范围外行为不变；UI旧开关虽然还能切，其值不能让demo进legacy。
- [src/utils/AIBidirectionalSystem.ts:683](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/utils/AIBidirectionalSystem.ts:683)：模块入口从当前引擎合法动作中核对eventId/actionId/source/contractHash，直接复用现有packet编译与克隆预结算；不再调用旧pilot规划/18场景验收来限制demo。不是只改回执标签：成功演出真正调用 `runGameModelModule('narrative')`，system材料上限10000字，不发送完整游戏存档或全套legacy提示词。
- 同入口：自由输入/交谈也走narrative模块，提供当前地点、在场人物、目标、最近两条各至多600字记忆；不伪造事件完成/玩家同意。模型正文必须含第二人称，并检查玩家自主权；有事件动作时继续使用既有边界/叙事合同检查与发布后的正典/道具守卫。
- 同入口：锦囊重复领取、五原移动/局部应对、机会/拒赌已有可靠固定正文时，在模块入口直接产生local回执，0次模型调用，仍由现有地方合同提交。没有固定正文则调用模块；local不是legacy fallback。
- [src/modules/scenarioMods/legacyNarratorPacket.ts:261](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/legacyNarratorPacket.ts:261)：预结算支持透传已经核验的judgementResolution；公开骰果不由模型改写，最终仍由processGmResponse一次提交。没有判定结果或动作过期则停下报错，不改骰。
- [src/utils/AIBidirectionalSystem.ts:687](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/utils/AIBidirectionalSystem.ts:687)：主处理器demo不尝试fast/legacy pilot/完整legacy；模块两稿失败、编译失败、材料超限全部 `DEMO_MODULE_FAILED` 早退，零事务提交。现有UI会显示错误并保留输入供手动重试，取消仍按既有生命周期释放。
- [src/utils/AIBidirectionalSystem.ts:1915](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/utils/AIBidirectionalSystem.ts:1915)：demo若误调用旧初始化入口则legacy检查立即阻断。正常demo继续用现有固定开场/切关正文，不增加初始化模型请求。

## 三、legacy检查及测试时如何看

[src/modules/scenarioMods/modularTurn.ts:43](/Users/clawbot/Documents/Codex/2026-06-21/xiantu/work/XianTu/src/modules/scenarioMods/modularTurn.ts:43)：demo只允许 `modular` / `local` 新回执，legacy/fast/card均打印 `[DEMO_LEGACY_BLOCKED]` 并抛出带同名错误的异常；appendModuleReceipt也做检查，历史旧回执不被删除。

主处理器在进入旧路由之前和提交事务之前检查；旧初始化也检查。因此不是等legacy请求发出去之后才记日志。成功demo回合打印 `[DEMO_MODULE_ONLY]`，包含path/eventId/promptChars，HUD回执应显示模块演出或本地结算。模块失败会保留 `[AI双向系统] AI生成失败` 原因及 `DEMO_MODULE_FAILED` 返回；失败回合不写假成功回执。

## 四、改了哪些事件

没有改事件JSON，也没有逐条扩白名单。以下是短版两关的全部25个声明事件（含支线/可选事件），现在任一当前合法结构化动作均适用模块入口；是否在短版路线实际出现仍由原引擎条件决定。

### lcq.stage_01

- `lcq.event.s01_01`
- `lcq.event.s01_02`
- `lcq.event.s01_03`
- `lcq.event.s01_04`
- `lcq.event.s01_05`
- `lcq.event.s01_06`
- `lcq.event.debut_yueshuang`

### lcq.stage_02

- `lcq.event.s02_01`
- `lcq.event.s02_02`
- `lcq.event.s02_03`
- `lcq.event.s02_04`
- `lcq.event.s02_05`
- `lcq.event.s02_06`
- `lcq.event.baihu_shangguan_escape`
- `lcq.event.sudaji_south_pact`
- `lcq.event.wuerlang_joins`
- `lcq.event.ningyu_regicide_offer`
- `lcq.event.gamble_bond_signed`
- `lcq.event.charge_sudaji_fee`
- `lcq.event.free_ajiman`
- `lcq.event.iron_bridge_ambush`
- `lcq.event.rainforest_black_shoal`
- `lcq.event.ningyu_enters_gamble`
- `lcq.event.zixi_taiyi_intercept`
- `lcq.event.silent_sheyi_village`

s02_02及之后的五原落奴、苏妲己赌约/谈期限/阿姬曼、白湖离馆、武二郎入队、凝羽弑君提议、铁桥遇袭/黑礁/子矽拦截/射艺村等，不再因未在18个场景列表或已离馆而进入legacy。长版后续stage03b、04、04b、05b、07同样读取各关当前合法动作，不再按旧场景ID筛除；本轮新增覆盖测试集中在短版25个声明事件，未声称长版97个新增/后续事件已验证。

## 五、还有哪些走不到模块

**在两个demo标记范围内没有设计上的事件名单排除项，但未运行测试，不能据此宣称25个事件已全部实测通过。** 以下情况会拦停，不会转legacy：

- 过期动作/合同hash不匹配、本地预结算未成立、判定尚未完成或不合法：提示重新选择/完成判定。
- 场景材料超过10000字、模型未配置、模块传输失败或两稿拒收：报DEMO_MODULE_FAILED，本轮不落账。没有扩超时，外部模型仍可能60s超时。
- world_sim偏离模式的动作本地合同不支持时可能被拦停，本轮未迁world_sim引擎；不拿它改写strict清羽剧情。
- 旧存档未带新数据：旧快照缺的动作仍不会凭空出现。本轮不升级旧events数据，建议新开档。
- 无这两个demo标记的正式存档/旧海神殿三幕版：不在本轮范围，legacy仍保留，不能称全项目legacy已删除。

固定local回合有时不会请求narrative模型，这是保留现有可靠正文的减法处理；它已从模块入口出回执并提交现有合同，不能将其误判为落回legacy。

## 六、测试变更与当前结果

用户接管测试，本轮全部未执行，以下只说明新增/更新的断言，不是测试结果：

- tests/modularTurn.test.mjs：demo全路线强制启用（旧开关false、离馆后仍启用），正式存档不变；legacy/fast/card回执拒绝且不写入。
- tests/baihuGambleRefusal.test.mjs：新增25个声明事件的合法动作模块编译/运输覆盖（每次system<10000、不含完整SaveData），重点s02_02和wuerlang_joins。
- 同文件新增真实processPlayerAction受控链路：s02_02成功发布并改变本地步骤；普通问句不自动订约；两次模块传输失败无第三次legacy请求/无事务/存档不变；旧fast=true及模块=false仍走模块。
- 4个旧legacy实现回归用例明确去掉demo标记，在范围外继续保护旧实现行为；demo不再期待截断失败也推进合同。现有地方/死亡/玩家主权等测试保留。
- 本轮没有更新旧smoke-module-framework.mjs，它仍含“两稿失败回落legacy”旧期望，**不可直接用其旧断言验收当前demo**。新受控回归以零回落为准；如用户需要该smoke，下一轮先改旧预期再跑。未删除fast/card文件或测试。

请用户先运行 `node --test --test-concurrency=1 tests/*.test.mjs`，以及tsc/构建检查，再新开清羽demo复测；旧并发运行器反序列化问题本轮未处理。真机重点：s02_02按步骤确实推进、随后五原与白湖连续性、闲聊问句不偷推进、失败输入保留、日志无DEMO_LEGACY_BLOCKED、HUD不再出现legacy。两条范围标记和25事件覆盖仅是静态实现/未执行测试，真实模型时延与稳定性待用户反馈。

代码已定稿，停止修改，等用户测试结果；未commit、未重启任何服务。
