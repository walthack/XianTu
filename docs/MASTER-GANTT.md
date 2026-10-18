# 六朝仙途 · 总甘特图

更新时间：2026-10-19（Asia/Singapore）；分支 `feat/fast-no-legacy`。

**权威进度入口（双件）**：本文件（时间线）+ 仓库根目录 [`PROJECT-STATUS.md`](../PROJECT-STATUS.md)（叙述与勾选总表）。  
勿另造第二份 status；`_newbot_tmp/PROJECT-TRACKER.md` 仅为草稿勾选，**非权威**。

基线快照：tip `ae76909a`（含 `3763e22e` 同拍 · `ac32513d` 轻回执＋遇敌三步 · `ee856f26` 回滚 · `a1e9ba66` 安全补档 · `ae76909a` 测修）· 8097 包 SHA 前缀 `1f2c41525ce2` · numbers 三分包 `3b8c1be2`；**全量剩冻结门禁 1 红**；遇敌已定体验三步（危区→检→遇敌叙事→开战）。

**优先级**：底座优先；内容（总表补人／角色按拍卡）可同步、优先级略低。

---

## Mermaid 甘特（主线）

```mermaid
gantt
    title 六朝仙途 · 主线总甘特（权威）
    dateFormat YYYY-MM-DD
    axisFormat %m-%d
    todayMarker on

    section 已完成
    diagnostics 合入           :done, diag, 2026-10-18, 1d
    baseline P0                :done, p0, 2026-10-18, 1d
    baseline P1（含 P0 merge） :done, p1, 2026-10-18, 1d
    baseline P2 merge          :done, p2, 2026-10-18, 1d
    numbers 三分包 + 6 条迁入  :done, num, 2026-10-19, 1d
    真机通过（8097 现包）      :done, td, 2026-10-19, 1d
    同拍闸（共历×affinityBeat）:done, gate, 2026-10-19, 1d
    轻回执（1016z）            :done, rcpt, 2026-10-19, 1d
    回滚误伤总表（ee856f26）   :done, rb, 2026-10-19, 1d
    总表补档＋测修（a1/ae）    :done, fix, 2026-10-19, 1d

    section 进行中·底座
    同拍共历收口观察           :active, cal, 2026-10-19, 5d
    已批未落扫描               :active, gap, 2026-10-19, 5d
    冻结门禁 1 红（待批）      :active, frz, 2026-10-19, 5d

    section 进行中·内容（略低）
    角色总表合入／补人         :active, cast, 2026-10-19, 7d
    角色按拍卡扩展             :active, card, 2026-10-19, 10d

    section 搁置
    战内逃跑（先不做）         :crit, flee, 2026-10-19, 1d

    section 待拍
    遇敌草案（已定体验三步）    :milestone, enc, 2026-10-19, 0d

    section 例行
    Sol 周一／周四 03:00 SGT   :active, sol, 2026-10-19, 14d
    PROJECT-STATUS 日更        :active, st, 2026-10-19, 14d
```

---

## 泳道说明（与 STATUS 对齐）

| 泳道 | 项 | STATUS 档 | 层 | 口径 |
|---|---|---|---|---|
| 已完成 | diagnostics / P0 / P1 / P2 | Done | 底座 | 10-18 合入 `feat/fast-no-legacy`（见 git：`af020e5d`、`b59cee0f`、`7ea583a7` 等） |
| 已完成 | numbers 三分包 | Done | 底座 | `3b8c1be2`；生成物与 `NUMBERS-AUTHORITY.md` |
| 已完成 | 真机 | Done | 底座 | 8097 包 `1f2c41525ce2`；本轮产品口径通过 |
| 已完成 | 同拍闸 | Done | 底座 | `3763e22e`；`settleSharedExperienceAffinity` ↔ `affinityBeatTaken` |
| 进行中·底座 | 同拍共历收口 | In progress | 底座 | 闸已落；边角／历法分叉跟扫描收口 |
| 进行中·底座 | 已批未落扫描 | In progress / Approved-not-done | 底座 | 扫 GAP／裁定；样板见 APPROVED-BACKLOG |
| 已完成 | 轻回执 | Done | 底座 | `ac32513d`；1016z；`lightReceipt` 默认 true；`free.receipt.affinity`；遇敌体验三步写入设计 |
| 已完成 | 回滚／补档／测修 | Done | 底座＋内容 | `ee856f26` 回滚（132→1）→ `a1e9ba66` append／stub → `ae76909a` 达古／overlay；tip=`ae76909a` |
| 进行中·底座 | 冻结门禁 1 红 | In progress | 底座 | 全量剩 `runtime.ts` 冻结差分；不回滚同拍闸、待批放行 |
| 进行中·内容 | 角色总表合入 | In progress | 内容 | 总表补人／合入（本轮已 append 阿伶／红苗族长）；可同步、略低 |
| 进行中·内容 | 角色按拍卡扩展 | 内容扩展待办 | 内容 | 身份／官爵／结缘转换等按拍卡；可同步、略低 |
| 搁置 | 逃跑 | Shelved | — | 用户已定先不做；仅预留 `flee` 名 |
| 待拍 | 遇敌 | Waiting-user | — | 已定体验三步：危区叙事→几率检→遇敌叙事→开战（禁检中直接开战）；其余数值／池仍待拍 |
| 例行 | Sol | In progress（例行） | — | 周一、周四 03:00（Asia/Singapore） |
| 例行 | STATUS 日更 | 例行 | — | 只改本文件 + `PROJECT-STATUS.md`；甘特有变同步改 |

---

## 维护约定

1. 主线状态变更：先改 `PROJECT-STATUS.md` 进度总表，再改本甘特对应条（日期／done／active）。
2. 不在 `_newbot_tmp/` 再维护第二份权威进度；TRACKER／APPROVED-BACKLOG 可留作草稿勾选。
3. 底座项与内容项分泳道；冲突时底座优先。
4. 历史长文见 [`PROJECT-STATUS-ARCHIVE-2026-10-12.md`](../PROJECT-STATUS-ARCHIVE-2026-10-12.md)。
