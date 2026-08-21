# 角色能力扫描 · Grok 二验（2026-08-20）

## 合同

二验只比较三类现有材料：

1. 当前 `character-registry.json` 的 `staticProfile.signatureAbilities`；
2. `boss-ability-scan/{人名}.json` 的 MiniMax 主抓产物（少量 DeepSeek fallback）；
3. `ABILITY-MATERIAL-SPLIT-2026-08-20.md` 的技法／器物／其他分类。

不读取 EPUB，不重新抽取原著。Grok 负责批量映射，Codex 复核后才允许落结果。

## 当前基线

- 161 人均有可解析扫描结果；当前角色卡共 367 条 `signatureAbilities`。
- 最新确定性审计：123 人无结构问题，38 人存在旧条目残留、拆并／标点漂移、重复、非法判词或当前卡本身的截断残片。
- 旧 `REPORT.md` 只汇总 2 人，不作为进度依据。

## 第一批：10 人

对象：玄萝、古格尔、高俅、徐敖、索元礼、鱼弘志、米远志、阿伽门侬、萨安、阿合马。

Grok 汇总：

| 映射类型 | 数量 |
|---|---:|
| `direct`：MiniMax `verifyExisting` 逐字同项 | 5 |
| `format_only`：标点、拆并、扩写或旧格式不同 | 20 |
| `partial`：只覆盖当前复合条目的一部分 | 4 |
| `missing`：MiniMax 两个字段都无对应 | 0 |
| 仍需 Codex 判断 | 17 |

### Codex 复核

- 这批不是“MiniMax 没抓到”，主要问题是当前角色卡与扫描时口径发生拆并／扩写。
- 古格尔、徐敖、米远志、阿伽门侬的长篇“战斗风格”只能判部分对应，不能把分件能力自动升级成整条已证实。
- 古格尔、鱼弘志、米远志等人的分件能力已在 MiniMax `abilities` 出现，但未进入旧 `verifyExisting`；可以作为二验候选，仍须 Codex 决定是否继承判词。
- 索元礼、萨安属于多个旧条目合并为一个当前条目，现有产物足以建立映射。
- 阿合马当前卡把 `木杖（用于惩治、拉筋、打人）` 错拆成三个数组项；不得把“拉筋”“打人）”作为独立能力验证，应先按 canon 纪律单独处理数据清理。
- 玄萝的“阳钧宗／阳钩宗”是一字冲突，不属于纯标点漂移，不能自动合并。

本批只形成二验记录，未修改 `character-registry.json` 或任何 canon 数据。
