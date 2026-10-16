# P0/P1合包真机测试：Claude只读复核

- 复核对象：`docs/handoffs/2026-10-11/TRUE-DEVICE-TEST-PLAN-P0P1.md` 对应的隔离真机执行报告、7个 `browser-events*.json` 浏览器事件日志及所引用JSON证据。
- 复核方式：Claude Code只读独立复核；未复跑测试、未修改产品文件。
- 结论：**总体 PARTIAL，候选上限 `ISOLATED_CANDIDATE_PARTIAL`。** 复核不支持把F07第87章现象判定为产品FAIL，也不把该项提升为PASS。

## 发现

### H1 — F07第87章测试前置未成立，原FAIL归因无效

真实F07败局存档 `evidence/CF07-lose-full-save.json` 中有 `lcq.f07.escaped=true`；派生并导入UI的 `checkpoints/87-stop-at-action/F07-lose-to-87-before.raw.json` 中没有这个标记。虽然UI提交第二动作后观察到直接跳转 `geluo_summons_biji`，但测试实际没有满足逃兵条件盘问的前置，因此不能据此报告“产品跳过盘问”。将本项改为 **NOT_TESTED（夹具前置缺失）**；仍须查清来源档到派生档之间标记在哪一步丢失，再重新验证生产UI链路。

### M1 — F07第87章请求在UI turn结束后仍未结束

`browser-events-f0787.json` 中chat #14在UI turn完成后仍运行，并于约30秒后 `net::ERR_ABORTED`。不能把该turn的完成当作模型请求完成。

### M2 — 报告遗漏自然重跑和重提

- F08败局此前一次自然结果为胜（骰面19），随后才重跑到败局。
- F09败局共运行三次：第一轮第34请求abort；第二轮自然胜局（骰面4）；第三轮得到报告中的败局。
- F14胜局action1重提交一次，原因没有记录。

最终请求总数需保留所有尝试；这几次重跑和重提也应进入执行记录。

### M3 — 503被误算为完成

7个 `browser-events*.json` 合计99次chat start、91条chat-end、8条chat-fail。91条chat-end中只有90条HTTP 200；另1条是HTTP 503（`browser-events-f09third.json` chat #26，无有效输出，`finishReason=null`）。正确分类为 **90成功、1个503、8个abort**。

### M4 — 8个abort均符合约30秒客户端中止

按对应start/fail时间相减，8个 `net::ERR_ABORTED` 均发生在开始后约30.003–30.155秒。报告应把它们列为失败/中止请求，即便UI turn已结束。

### M5 — 性能统计需要更正并说明口径

旧报告使用的P95计算偏低。按成功响应、最近秩P95（nearest rank）和偶数样本中间两值均值：

| 样本 | 分母 | 中位数 | P95 | 最大值 |
|---|---:|---:|---:|---:|
| HTTP 200 chat latency | 90 | 7.698秒 | 28.540秒 | 52.581秒 |
| embedding latency | 66 | 328.5毫秒 | 699毫秒 | 837毫秒 |
| UI turn wall time | 48 | 8.789秒 | 53.051秒 | 85.209秒 |

48个UI turn里7个不低于30秒、3个不低于50秒。单次turn ready不表示其后台chat请求已结束。以上证据不构成整回合30秒SLA通过。

### M6 — F09“一阳持久化”证据说得过强

F09胜败结算的标题/结算内容显示一阳，支持该次结算闭合语义；存档状态没有结构化ledger，后续派生状态也未保留该HUD值。因此只能报告“结算显示一阳”，不能声称跨存档/转场持久化已验证。

### L1–L4 — 小项勘误

- F06后续两拍骰值应写为 `15A−5=10/DC15`、`8−8=0/DC15`。
- F06实际chat为#15–#22，共8次，其中B3占3次；progress原记11次应改正。
- 总量仅从7个 `browser-events*.json` 汇总；不要描述成读取所有 `*-events.json`。
- 持久服务PID 65144未重启有终端 `lsof` 检查支持；保存存储日志为16条拦截记录。报告应按日志能直接支持的范围表述，不从日志推导未记录的其他写入。

## 复核确认项与总判定

- D3的679字符固定结局逐字对照通过。
- 15个保护文件的守卫前后未变。
- F09胜败仅确认结算显示/闭合语义，不确认跨存档耐久性。
- 总体仍为 **PARTIAL**；F07第87章应保持未验证，需修正测试夹具或从来源到派生档定位前置丢失后再重测。
