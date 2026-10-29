# 地点国别裁定落地（2026-10-29）

来源：用户本轮裁定优先；`/workspace/narrative-drafts/2026-10-29-地点国别核对.md` 的明确国别其次。原著未写、待核且无用户裁定的条目不猜。

国别字段为 `locations.json` 的 `definition.country` / `stageVariants[stageId].country`。允许值定义在 `mod-kit/entity-catalog/validation.config.json:locationCountries`：晋、宋、汉、唐、秦、南荒、太泉、昭南、域外、中立边陲，以及仓库原有的晴州。字段可以省略，但填写时必须为词表值。国别/文化地域不等同于可选剧情线；本次不新增剧情线。

- 原53个未定条目补43个；五原城、白湖商馆及8个五原子地点均为中立边陲。
- 帝丘、昆吾、昭南归昭南；新增原目录缺失的麟趾 `liuchao.location.linzhi`，归昭南。南荒商路及南荒线地点保留南荒。
- 舞都原为汉，保留；舞都庄园、首阳山、舞阳侯府、凉州武馆按裁定填汉。罗马/马其顿军营填域外。
- 原 `lyg.location.shuixiang_lou` 的描述明确为靖恭坊长安分号，填唐；新增江州条目 `lcq.location.shuixiang_lou`，填宋。
- 原 `lyl.location.shangshenguan` 明确为北邙山洛都道观，填汉；新增长安条目 `lyg.location.shangshenguan`，填唐。
- 未发现上述两组存在混合变体或合并 aliases，因此原 ID、阶段引用保持；新条目独立 ID，互不设别名。新增三条无已知精确坐标，不复制另一城市坐标，不凭空挂到阶段。

保留空白的完整清单：

| id | 名称 |
|---|---|
| liuchao.location.guang_ming_guan | 光明观 |
| lcq.location.beast_camp | 兽蛮人营地 |
| liuchao.location.qishan | 歧山 |
| liuchao.location.boling | 泊陵 |
| liuchao.location.zhuoguang | 涿光 |
| liuchao.location.bailuojiang | 白龍江 |
| liuchao.location.mijing_wilderness | 秘境荒野 |
| lcq.location.grassland | 草原 |
| lyl.location.ant_hill | 蚁丘迷窟 |
| lyg.location.yanglu_menyuan | 阳禄门院废弃客栈 |

生成：`node scripts/build-entity-index.mjs`；`node scripts/project-builtin-location-countries.mjs` 复用 `projectLocationCountries`，在缺源树的副本只刷新已发布地点国别与 manifest 内容哈希。完整源树仍由 `sync-builtin-mods.mjs` 经 `canon-authority-overlay.mjs` 调用同一投影。overlay 无须手改。

验证结果见 PROJECT-STATUS.md 的 COUNTRY-20261029 记录。未进行浏览器/真人验收；新增地点无阶段挂载。未提交、推送或同步 NAS。
