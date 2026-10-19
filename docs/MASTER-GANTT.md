# 六朝仙途 · 总甘特图

更新时间：2026-10-19（Asia/Singapore）；分支 `feat/fast-no-legacy`。

**权威进度入口（双件）**：本文件（时间线）+ 仓库根目录 [`PROJECT-STATUS.md`](../PROJECT-STATUS.md)（叙述与勾选总表）。  
勿另造第二份 status；`_newbot_tmp/PROJECT-TRACKER.md` 仅为草稿勾选，**非权威**。

基线快照：tip `5837d7cb`（同伴助战＋F03/F13 威胁进度；8097 **未重建**）；前 tip `14c26037`（08e0 真机复测修复 `51347d23`／`213a0305`／`14c26037`；8097 新包 `ca414354432d`，**尚未真机复测**；前 `a0455dd4` F02 卡点底座修复，包 `08e0987da150`；`69936fe3` 方案 A 冻结门禁）· PID 65144 **未重启** · numbers `3b8c1be2`；遇敌已定体验三步（危区→检→遇敌叙事→开战）。

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
    真机通过（8097 ae75 旧包） :done, td, 2026-10-19, 1d
    同拍闸（共历×affinityBeat）:done, gate, 2026-10-19, 1d
    轻回执（1016z）            :done, rcpt, 2026-10-19, 1d
    回滚误伤总表（ee856f26）   :done, rb, 2026-10-19, 1d
    总表补档＋测修（a1/ae）    :done, fix, 2026-10-19, 1d
    冻结门禁方案 A（基线更新） :done, frz, 2026-10-19, 1d
    F02 卡点底座修复＋挂伤数据驱动 :done, f02fix, 2026-10-19, 1d
    08e0 复测修复＋级数存档为准＋敌人预设 :done, r08e0, 2026-10-19, 1d
    同伴助战＋护人戏威胁进度   :done, assist, 2026-10-19, 1d
    状态清单整改＋冰蛊         :done, stat, 2026-10-19, 1d

    section 待复测
    8097 新包 ca414354432d 真机复测 :active, rt, 2026-10-19, 2d

    section 进行中·底座
    同拍共历收口观察           :active, cal, 2026-10-19, 5d
    已批未落扫描               :active, gap, 2026-10-19, 5d

    section 进行中·内容（略低）
    角色总表合入／补人         :active, cast, 2026-10-19, 7d
    角色按拍卡扩展             :active, card, 2026-10-19, 10d

    section 搁置
    战内逃跑（先不做）         :crit, flee, 2026-10-19, 1d

    section 待拍
    遇敌草案（已定体验三步）    :milestone, enc, 2026-10-19, 0d
    F02 待拍（外伤（重）／苦撑／交涉／败局等） :milestone, f02d, 2026-10-19, 0d
    08e0 待拍（拍数上限判法／F06 败局路径／超时清伤等） :milestone, r08d, 2026-10-19, 0d
    助战待拍（8097 重建时机／F03 真机链路偏低／高胜率场未调） :milestone, asd, 2026-10-19, 0d
    状态待拍（神志不清 provisional／白名单剧情解除／麻古合规／0% 不输） :milestone, stad, 2026-10-19, 0d

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
| 已完成 | 真机 | Done | 底座 | 8097 包 `ae75ea0334f8`；本轮产品口径通过 |
| 已完成 | 同拍闸 | Done | 底座 | `3763e22e`；`settleSharedExperienceAffinity` ↔ `affinityBeatTaken` |
| 进行中·底座 | 同拍共历收口 | In progress | 底座 | 闸已落；边角／历法分叉跟扫描收口 |
| 进行中·底座 | 已批未落扫描 | In progress / Approved-not-done | 底座 | 扫 GAP／裁定；样板见 APPROVED-BACKLOG |
| 已完成 | 轻回执 | Done | 底座 | `ac32513d`；1016z；`lightReceipt` 默认 true；`free.receipt.affinity`；遇敌体验三步写入设计 |
| 已完成 | 回滚／补档／测修 | Done | 底座＋内容 | `ee856f26` 回滚（132→1）→ `a1e9ba66` append／stub → `ae76909a` 达古／overlay；tip=`69936fe3`（方案 A；前含 ae76909a） |
| 已完成 | 冻结门禁方案 A | Done | 底座 | 用户拍 A；`perfTelemetry` 允许 `3763e22e`／`781b656a` 有限 diff；对照 `63fdf031`／`cd3d3706`；不回滚、不迁出、不重启 8097；冻结用例绿 |
| 已完成 | F02 卡点底座修复 | Done | 底座 | `d2fa5334` 挂伤数据驱动（`combat.woundRules`）＋外伤（重）目录＋休整解伤；`8c003b12` 加价封顶；`9870e464` 偏离专名；`b991f58a` 出生年；`a0455dd4` 无交涉提示＋单测；8097 新包 `08e0987da150`，**新包尚未真机复测** |
| 已完成 | 08e0 真机复测修复 | Done | 底座 | `51347d23` 挂伤按档/交涉配置/本地补票；`213a0305` 拍数门禁 LCQ-SAV-020＋F13 同伴 woundRule；`14c26037` 级数以存档为准＋无名敌人 `combat.enemyPresets`＋受保护同行者不出防御行；8097 新包 `ca414354432d`，**新包尚未真机复测** |
| 已完成 | 同伴助战＋护人戏威胁进度 | Done | 底座 | `5837d7cb`；`numbers-assist.json`；F03/F13 `ally_threat` 威胁轨；F03 超时改判输；N=2000：F03 73.7%、F13 68.4%；**8097 未重建（可重建，待用户定）** |
| 待拍 | 助战待拍 | Waiting-user | — | 8097 重建时机；F03 真机链路加要素 30%（N=100 39%）低于模拟；≥75% 的必经战（F01/F02/F04–F09/F14）未调；群体与未配置同伴（np003、小威、卡瓦等）无助战效果 |
| 待拍 | 08e0 待拍 | Waiting-user | — | 拍数上限判法、F06 败局路径、超时清伤、F03 敌方无出手、幅度/抗性、叙事漂移、级差下限、败局结局 id、runtime.ts NPC 境界覆盖（冻结） |
| 待拍 | F02 待拍 | Waiting-user | — | 外伤（重）数值／自愈、F02 苦撑时钟或防守奖励与推荐文案、F02 交涉、F02 败局与结局 id 显示、寿元、±4/±12、初始背包三件；只记录未动 |
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
