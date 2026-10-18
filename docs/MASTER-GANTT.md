# 六朝仙途 · 总甘特图

更新时间：2026-10-19（Asia/Singapore）；分支 `feat/fast-no-legacy`。

**权威进度入口（双件）**：本文件（时间线）+ 仓库根目录 [`PROJECT-STATUS.md`](../PROJECT-STATUS.md)（叙述与勾选总表）。  
勿另造第二份 status；`_newbot_tmp/PROJECT-TRACKER.md` 仅为草稿勾选，**非权威**。

基线快照：代码交付 HEAD `3b8c1be2` · 8097 包 SHA 前缀 `1f2c41525ce2` · numbers 三分包 `3b8c1be2`。

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

    section 进行中
    同拍共历                   :active, cal, 2026-10-19, 7d
    角色总表合入／补人         :active, cast, 2026-10-19, 7d
    已批未落扫描               :active, gap, 2026-10-19, 5d

    section 搁置
    战内逃跑（先不做）         :crit, flee, 2026-10-19, 1d

    section 待拍
    遇敌 + 连续战斗草案        :milestone, enc, 2026-10-19, 0d

    section 例行
    Sol 周一／周四 03:00 SGT   :active, sol, 2026-10-19, 14d
    PROJECT-STATUS 日更        :active, st, 2026-10-19, 14d
```

---

## 泳道说明（与 STATUS 对齐）

| 泳道 | 项 | STATUS 档 | 口径 |
|---|---|---|---|
| 已完成 | diagnostics / P0 / P1 / P2 | Done | 10-18 合入 `feat/fast-no-legacy`（见 git：`af020e5d`、`b59cee0f`、`7ea583a7` 等） |
| 已完成 | numbers 三分包 | Done | `3b8c1be2`；生成物与 `NUMBERS-AUTHORITY.md` |
| 已完成 | 真机 | Done | 8097 包 `1f2c41525ce2`；本轮产品口径通过 |
| 进行中 | 同拍共历 | In progress | 避免拍间历法分叉；设计/实现中 |
| 进行中 | 角色总表合入 | In progress | 总表补人／合入；对照约 333 条规模 |
| 进行中 | 已批未落扫描 | In progress / Approved-not-done | 扫 GAP／裁定；不另开第二 status |
| 搁置 | 逃跑 | Shelved | 用户已定先不做；仅预留 `flee` 名 |
| 待拍 | 遇敌 | Waiting-user | 随机遇敌 + 连续战斗草案待拍板 |
| 例行 | Sol | In progress（例行） | 周一、周四 03:00（Asia/Singapore） |
| 例行 | STATUS 日更 | 例行 | 只改本文件 + `PROJECT-STATUS.md`；甘特有变同步改 |

---

## 维护约定

1. 主线状态变更：先改 `PROJECT-STATUS.md` 进度总表，再改本甘特对应条（日期／done／active）。
2. 不在 `_newbot_tmp/` 再维护第二份权威进度；TRACKER 可留作草稿勾选。
3. 历史长文见 [`PROJECT-STATUS-ARCHIVE-2026-10-12.md`](../PROJECT-STATUS-ARCHIVE-2026-10-12.md)。
