# R3-10 交接：把任务线推到可玩 · 2026-08-16

> 面向下一轮（多半是 Grok 执行 ＋ Claude 收尾）。读完这一篇即可开工。
> 真值源：`src/modules/scenarioMods/mainQuestAxis.ts`、`secondaryLines.ts`。

## 1. 现状与缺口（实测，非估算）

| | |
|---|---:|
| ready　现在就走得到 | **86** |
| pending　未来待扩，**不影响可玩** | 10 |
| **需新增 event** | **39** |

主轴 24 条节点（主干 10 ＋ 血脉候选 ＋ 秘境），八条二级线 109 条。
事件层 396 条，被任一条链认领 **71** 条。

**"可玩"的判据只有一条**：玩家照着待办走，每一步都能落到真实 event 上。
所以缺的就是这 39 条——**不是设计没做完，是 event 没写**。
pending 那 10 条是"正典压根没有"的扩写，**不在本轮范围**，不要去写它们。

## 2. 39 条的分布（前 5 个关占一半）

```
 6  lcq.stage_05b                      2  lcq.stage_09_trade_and_escape
 4  lcq.stage_07_qingyuan_jiankang     2  lyl.taiquan_afterfall
 4  lyl.xiaoyingzhou_blacksea_trap     2  lyl.luoyang_cloud_secret
 3  lcq.stage_12_jiangzhou_counterwar  1  各：03b／08／10／lin_an_bridge／
 3  lyl.han_palace_endgame                changgan_begins／changgan_interlude／
 2  lyl.taiquan_sacred_fruit              shituolin_endgame／mijing_rumen
```

⚠ 另有 3 条主轴节点的 `stageId` 写的是**隔离关**（`lcq.stage_03`／`stage_05`／`stage_06`），
而建议 id 指向可达关（如 `s03b_baihu_caravan_south`）。**这三条要先把挂载关改成可达关**，
否则写出来也加载不到。它们有 `locationId` 兜底显示，但 event 必须落在可达关上。

## 3. 分四批，按玩家推进顺序

每批一个 Grok 任务，**一批只碰那几个 stage 文件**。

| 批 | 关 | 条数 | 解锁什么 |
|---|---|---:|---|
| **A** | `stage_03b`／`stage_05b` ＋ 修 3 条隔离挂载 | 7＋3 | 昭南决战、星月湖托付、黑魔海、主轴血脉开场 |
| **B** | `stage_07`／`08`／`09`／`10`／`12` | 11 | 晋国、汉国、太乙、星月湖中段 |
| **C** | `lin_an_bridge`／`xiaoyingzhou`／`sacred_fruit`／`afterfall`／`cloud_secret`／`han_palace_endgame` | 14 | 宋国、黑魔海顶点、太泉、汉国后段 |
| **D** | `changgan_begins`／`changgan_interlude`／`shituolin_endgame`／`mijing_rumen` | 4 | 唐国入口、超级用户名单 |

**A 批先做**：它同时解锁四条线的开场，且 `stage_05b` 一关就占 6 条。
做完 A 就能开一次真机自测（skill `xiantu-game-selftest`），验证"待办→事件"这条路通不通，
**不必等四批做完**。

## 4. 每批任务书必须写死的六条

### ① 改源，不改生成物
`src/modules/scenarioMods/builtins/data/*.json` 是**生成物**。
真源在 `mod-kit/generated/deepseek-v4-flash/{book}/stages/*.json`，
`sync-builtin-mods.mjs`（build:single 的 prebuild）从那里拷。
**改了 builtins 会被下一次同步冲掉**——本项目已经因此白干过一次（广阳那次）。

### ② append-only-frozen
多个关的 `manifest.eventIdContract` 是 `append-only-frozen`，
**新 event 只能追加，不得重编已有 id、不得插队改序**。有专门的 `r2_11*` 重建测试守着。

### ③ id 必须与节点表里的建议 id 一字不差
节点表里 `status: 'new'` 的那条写了什么 `eventId`，就用什么。
`tests/secondaryLineNodes.test.mjs` 与 `tests/mainQuestAxisEvents.test.mjs` 会逐条校验，
写成别的名字＝节点永远走不到。

### ④ 四字段要承载同一件情节事实
`name`／`description`／`objective`／`axisBeat` 四项要一致，并给 `axisSeq`。
`axisSeq` 取节点旁注里的正典 seq；没写的去 `story-timeline.json` 查，**不要自己编号**。
⚠ 已知库里有四字段互相矛盾的先例（`s07_09_hengtang_ambush`：name 写船队围墅、objective 写性奴设局），
**发现矛盾要指出，不要照抄一半**。

### ⑤ 序不能倒
新 event 的 `axisSeq` 必须让所在线的 ready 节点保持单调不减。
今天已因此抓出 4 处真回退（昭南入口排在调查前、星月湖旧案排在报丧后、
宋国太皇太后排在高俅后、唐国顶点排在搜查宫中前）。

### ⑥ 扩写不写
只写"正典有、游戏没落地"的。凡节点标 `pending` 的一律不碰。

## 5. 每批的验收（写进任务书，让它自己跑）

```bash
npm run type-check
node --test --test-concurrency=1 tests/*.test.mjs      # 标志必须在 glob 之前
npm run mod:validate                                    # 改过的 stage 必须 PASS
npm run build:single                                    # 触发 sync，确认改的是源不是生成物
```

⚠ `npm test -- --test-concurrency=1` 会把标志放到 glob **之后**，等于没串行。
⚠ 测试运行器有约 **12%** 抖动（报 `Unable to deserialize cloned data`，随机换文件，非断言失败）。
三种调用形态各跑 8 轮对照：前置 0/8、后置 1/8、不加 1/8——**不是标志位置的问题**。
遇到就单跑那个文件确认、整轮复跑一次，别当红。

## 6. Grok 调用：今天实测的成败模式

**能跑通的形态**（主轴落 20 个 eventId 那次）：

```bash
nohup /Users/clawbot/.grok/bin/grok --cwd "$PWD" \
  --permission-mode acceptEdits --max-turns 60 --effort medium \
  -p "$(cat /path/to/task.md)" > /tmp/grok.log 2>&1 &
```

**观察到的失败模式**（5 次里失败 4 次，均 exit 0 但零产出）：

- `--print` 读 stdin：参数根本不对，它要 `-p/--single`
- 任务书当命令行参数传（约 7KB）：多次零字节退出；而小 prompt 探针
  （`--output-format json`）能正常建文件并返回完整 JSON，`stopReason: end_turn`
- **让它自己扫全库会烧光轮次**：第一次人物线任务就是扫到一半没轮次了。
  **凡是能预先算好的数据（排行、id 清单、seq），Claude 先算好塞进任务书**——
  塞进去之后那次就成了
- 一次越界改了不该碰的测试文件（任务书写了"不改测试"仍改了）→ **交付后必须 `git diff` 逐文件核**

**纪律**：一律后台跑（`nohup ... &`），不要占住前台；前台跑曾把对话卡死。

## 7. 本轮已完成、不要重做的

- 主轴 24 条节点全部落 `eventId`＋`status`；血脉三候选用 `bloodlineBranch` 分开
- 八条二级线 109 节点，锚全部改成**事件锚**（"你知道那件事的那一拍"）
- 门禁新增：时间线序、锚事件、到场不开线、待补锚不成死线、主轴事件落点、pending 不挂 id
- 太泉与秘境同系统的关系已落进模块注释（核实／推断分开写）

## 8. 还挂着、但不阻塞可玩

- 61 张机会卡重写（用户评"质量偏低"）
- P0-5 三级认领（主轴已可参与；已知一处双喂待裁：剑玉姬真身 seq 614 被主轴与黑魔海同指）
- P0-4 移动概念
- 人物线初稿已产出（`docs/R3-10-CHARACTER-QUESTS-DRAFT-2026-08-16.md`，27 个 ✅ id 全部落库、
  0 编造），但形态是"角色自己的插入点串"，**缺"这个角色不在场则该 event 变样"那一层**——
  任务书已按新形态改好（`/tmp/xt-task22.md`），需重跑一轮增补
- 秘境地下段（seq 997 探井 → 1005 开青铜门 → 1011 墓室）事件层几乎空白，只有 1006 一条
