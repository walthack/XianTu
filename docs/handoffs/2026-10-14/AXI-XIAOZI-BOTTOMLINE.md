# 阿夕／小紫「底线」查证（只读，2026-10-14）

只读调查：没改代码和数据，没重建 registry，没提交。取证方式：`git log -S`、`git blame -L`、按提交逐版本读 `git show <hash>:…/character-registry.json` 比对 `principles`、读 docs、rg 全仓。基线 HEAD `af7aa6d9`；工作区 `character-registry.json` 有未提交改动，但与 HEAD 只差 version/hash 两行〔核：`git diff --stat`〕。行号为工作区读取时的行号，另有 agent 在改 `storyContext.ts`、`legacyNarratorPacket.ts` 等，可能漂移。

标注：〔核〕= 我读到／算到；〔推〕= 我的推断；〔未核〕= 没查。

## 0. 结论

| 对象 | 结论 | 一句话 |
|---|---|---|
| 阿夕 | **遗漏** | 131 个触及 registry 的提交里 `principles` 始终为 0；原文扫描只出 1 条低置信，被落地脚本的规则挡掉，之后没人接手 |
| 小紫 | **特殊处理，底线是被连带清空的副作用**（不是最初的遗漏） | 曾有 3 条且被用户亲自修正过；2026-10-04 第八批把整张真实人格卡搬进 `privateProfile`，底线跟着出了公开卡，而 `src` 没有任何代码读 `privateProfile`。我没找到「用户专门裁定小紫不要底线」的记录 |
| 小紫性格写在 `characterResolver.ts` | **违反**「数据在 registry/ledger，不在代码」 | 同文件两处字面量（`:364`、`:612`）；`:612` 与 registry 04b/05b 相位里的值逐字相同，是纯重复 |

用户前提核对：registry 里 tier=主要 的 172 人，160 人有 ≥1 条底线（4 人有 4 条），12 人没有。所以「其他主角有 1–3 条」大体成立，但缺底线的不止这两人：阿夕、小紫、赤凫、曼希丝、鬼金羊、段强、龙神、青面兽、孙暖、赵飞燕；郭靖、定陶王连 `principles` 键都没有〔核：python 读 registry〕。

## 1. 阿夕：遗漏

1. **registry 里从来没有**：按提交逐版本读 registry，131 个提交里阿夕 `principles` 都是 0〔核〕。当前 `staticProfile` 有 18 个键，`principles: []`；各关相位里 03b／04／04b／05／05b 都带键空值，07–12 关没有这个键〔核〕。
2. **两批底线落地都没碰到她**：
   - 第一批 `43b18785`（2026-07-04 15:08）`scripts/apply-bottomline-proposals.mjs`：只落 multimodel 提案里置信 ≥ medium 的，阿夕不在内（提交说明：「剩154无可用提案，另行原文扫描」）〔核〕。
   - 第二批 `cc6b4534`（同日 15:49）：`scripts/scan-bottomline.mjs` 扫了她，结果在 `mod-kit/generated/deepseek-v4-flash/character-canon/bottomline-scan/阿夕.json`（mtime 07-04 15:14）：`{"principles":["不犯大错：对族群有大害的事绝不参与"],"confidence":"低"}`〔核〕。`scripts/apply-bottomline-scan.mjs:17-18` 只落「高／中」，其余进 `lowconf` 写入 `REPORT-低置信待人工.md`〔核〕。她是低置信，所以没落。
   - 当前 `REPORT-低置信待人工.md` 只列 5 人，不含阿夕〔核〕：该文件被后来的重跑覆盖，所以「阿夕当时确实在待人工名单里」是〔推〕——依据是上面的规则加这份 JSON，不是读到旧报告。
3. **没有「刻意不给」的记录**：CANON-DECISIONS、`docs/handoffs/2026-10-04/*`、`COMPLIANCE-REQUIREMENTS.md` 里提到阿夕的条目（#54、#185、#189、#198，批次 6／10）都是年龄、性格措辞、指代修正，没有一条说她不设底线〔核：grep〕。同日的 `NPC-STAGE-PROFILE-GAPS.md:63` 已记「静态卡本身无底线 → 注册表无数据」，但归为「数据缺口」，没有负责人〔核〕。
4. **生成脚本没有跳过她**：`scripts/build-character-registry.mjs` 对 `cards` 全量循环，没有按名字跳过阿夕；唯一的按名特判是 `:105-106` 小紫的 `embedText`〔核〕。两个底线脚本里提到阿夕／小紫的只有 `apply-bottomline-scan.mjs:11` 的一句注释〔核〕。

## 2. 小紫：特殊处理（时间线）

| 时间 | 提交／文档 | 小紫 `principles` |
|---|---|---|
| 07-04 15:08 | `43b18785` 第一批提案 | 1 条（目标／性格误填） |
| 07-04 15:49 | `cc6b4534` 第二批扫描，`WEAK_OVERWRITE` 允许覆盖 | 3 条，置信「高」，内容是入队前敌对期嗜血（`bottomline-scan/小紫.json`） |
| 07-04 15:57 | `c6ac8339`「小紫底线修正(用户)」 | 3 条改为：恶作剧捉弄主角但入队后绝不真正加害程宗扬及自己人；对敌狠辣但自己人例外；自利为先却认死理护毒宗与同伙。`humanNotes` 记「扫描抓了入队前敌对期嗜血」 |
| 07-04 16:07 | `8e886a49` 方案C | 提交说明：「治本『小紫类反转角色敌对期被真底线泄漏』；**卡存真实(揭示后)底线不变**」。设计是卡里存真底线，由好感／关系门控决定是否喂给模型（`storyContext.ts:449-458`、`runtime.ts:3437-3463`） |
| 10-04 16:25 | `9c8730a5` 第八批 | 公开卡换成表面卡，`principles: []`；完整旧身份、性格、**底线**、目标、能力移入源卡 `privateProfile`；同一提交新增 `characterResolver.ts:598-621`（blame）与 `build-character-registry.mjs:105-106` |

依据：
- 第八批的裁定 #187（`CANON-DECISIONS.md:219`）和 `BATCH8-REGRESSION-ENDINGS-DISCLOSURE.md:26-34` 写的是「全书身份／真实性格移非公开源字段」，**文字里没出现「底线」**；`privateProfile.principles` 里确实带着用户修正过的那 3 条〔核：读 `character-cards-v3.json` 小紫条目〕。所以底线是随整张卡一起被带走的，我判为连带，不是单独裁定〔推〕。
- `privateProfile` 没有消费者：`src`、`scripts` 里只有 `tests/batch8DisclosureAndEndings.test.mjs:15` 断言它在运行时副本里是 `undefined`〔核〕。registry 不导出它是 #187 的设计。
- 后果〔核〕：小紫在所有关卡都没有【底线】备注和 `社交.关系.人格底线`（`characterResolver.ts:220` 与 `getRegistryBottomLine :524` 都读 `staticProfile.principles`）。注意 stage_07–12、燕歌、云龙各关里，小紫的公开卡仍是南荒表面卡（性格「天真俏皮／偶露古怪狠劲／对程宗扬好奇」）〔核：读各关 `builtins/data/*.json`〕。
- 目前没有「触犯底线」的扣分逻辑：`AFFINITY_LIMITS.bottomLineBreach` 全仓没有读取者〔核：rg〕，所以现在损失的是提示词里的底线备注和 UI 展示，不是结算。
- 不能直接把 `privateProfile.principles` 放回公开卡：第 3 条含「护着毒宗」，与 #188「毒宗师承南荒至 124 章不公开」冲突〔核：`CANON-DECISIONS.md:221`〕。需要另写「当期适用」版本（剧情策划）。

## 3. 有没有别名字段或别处特判承担底线

- **schema／ledger 没有**：`mod-kit/schema`、`mod-kit/entity-ledger`、`mod-kit/entity-catalog` 里 grep `principles|bottomLine|底线` 命中 0〔核〕。`overrides.json` 里阿夕、小紫两个实体只有 `naming` 一个业务字段〔核〕。
- **别处承担的是「姿态／声线」，不是底线**：
  - 小紫：`voiceCards.ts:12-27`（禁忌）只被 `storyContext.ts:27` 引用，即旧路径；`stanceProfiles.ts:54-` 有按好感分档的姿态。
  - 阿夕：`stanceProfiles.ts:559-570`（「骄傲先于恐惧」等）。
  - 模块路径：`npcCardLayer.ts:18` 引入 `formatRelationStance`，所以姿态文字应能进模块路径；我只核对了 import，没有跑出实际输出〔未核〕。
  - 这些都不进 `人格底线`，也不走 `projectBottomLinesToNpcs`。

## 4. 小紫性格硬编码是否违反原则

「实体按 id、数据在 ledger/registry 不在代码」拆开看：

- **按 id**：满足。判定是 `character.id === 'liuchao.character.xiao_zi'`（`characterResolver.ts:598`）。
- **数据不在代码**：不满足。
  - `:602-603` role／description、`:611` appearance、`:612` personality 是字面量。registry 的 04b、05b 相位里 `role／description／appearance／personality` 与这四处**逐字相同**〔核：python 比对〕，所以是重复，不是缺数据。
  - `:364` 另有一条不同文案的小紫性格字面量（「看上去天真灵动，笑语亲切，言行令旁人难以捉摸。」），只对 04b 生效；与 `:612` 文案不一致〔核〕。
  - `:615-617` 三句【已知身世】备注也是字面量。
  - 附带：`:609` 种族在代码里按披露门写「碧鲮族」，而 `builtins/data/lcq.stage_04b_…json:1957` 里 `race` 仍是「南荒人」〔核〕，即用代码覆盖数据。
- 缓和因素：这块是披露门，兼做旧档缓存清洗（BATCH8 §B：「移除未揭家世／全书性格」），重置 `profile` 本身必要。问题只在「重置成什么」取字面量而不是 registry 相位〔推：函数意图〕。
- 为什么没被棘轮抓住：`validate-ledger-ratchet.mjs` 只数 registry 人名在源码里的出现次数，`:612` 那串形容词里没有人名〔核：读脚本〕。

## 5. 最小修复（只描述，未实施）

**阿夕**（数据，无代码改动）
1. 剧情策划／用户依原文给 1–3 条，写入源卡 `character-cards-v3.json` 阿夕 `staticProfile.principles`，再 `node scripts/build-character-registry.mjs` 重建（registry 只能由脚本生成）。扫描候选只有那 1 条低置信，不足以直接落。
2. 只补静态卡只会在 stage_07 以后生效。南荒各关相位是带键空值，`phaseProfileValue`（`characterResolver.ts:141-149`）不会回落静态卡；要在南荒关出现，还需补相位值，这与乐明珠、凝羽的 O10「当期适用版本」是同一个待定问题（`NPC-STAGE-PROFILE-GAPS.md`）。
3. 合规：阿夕卡上有已标记字段（`goals`「享受性爱…」、`relationToProtagonist`「女奴/性伴侣」，`COMPLIANCE-REQUIREMENTS.md` R43／Q10）。新增 `principles` 不碰它们，但改这张卡之前须先过用户（清单「合规只标记、交用户」的规定），我不替用户决定。
4. 项目纪律：动 canon 数据前读裁定簿；`principles` 在裁定簿里没有执法标记〔推：grep 只命中 #114 一处提及碧姬〕；提交要 `npm run canon:build` 全绿，并在同一提交追加裁定条目。

**小紫**
1. 先问用户：公开层是否需要底线（按现有好感≥40／自己人门控）？需要的话，由剧情策划另写不含「毒宗」的当期版本，填源卡 `staticProfile.principles`（管后期关）和／或相位 `principles`（管南荒关）。不建议改代码去读 `privateProfile`（会破坏 #187 的隔离设计）。
2. 硬编码（代码，非冻结文件）：`syncNanhuangIdentityDisplay` 里 role／description／appearance／personality 改读 registry 相位（文件内已有 `byId`）；删掉 `:364` 那条；保留 race／notes／memories／affiliations 的披露逻辑，`:615-617` 文案日后进 ledger `reveals`。
3. 迁移时 `:611`「成年少女」等 C01 措辞原样保留（审计 §G 同样要求）。
4. 触及 `characterResolver.ts` 的小紫逻辑前，要读 #172、#174、#185、#187、#188、#191。我没跑测试；`BATCH10-COMPLIANCE-HARD-LINES.md:56` 提到 `batch8DisclosureAndEndings.test.mjs:18/25` 两项仍要求小紫「南荒人」，与第九批 B1「碧鲮族」冲突，动之前要先看它们的现状。

## 6. 附：HARDCODED-GUARDS-AUDIT 为什么没提小紫性格

结论：**没提**。该文档只两次碰到这块代码：`§2.E` 把 `characterResolver.ts:591` 当作又一份 stage 列表，`§2.G` 把 `:602-607` 当合规标记（「小紫 role/appearance 强制成年少女〔C01〕」）。`:612` 的性格数组、`:598-621` 作为「角色数据写进代码」，以及 `:364` 都没有列〔核：grep 文档〕。

原因（审计自述加我的判断）：
1. 口径是时序守卫：开头写「某阶段前不要做／说 xxx」；文末 `§5` 自认「A–F 表是我按『时序／披露／在场／stage』读出来的，不是穷举」。静态人设重复不是时序检查。
2. `§2.G` 只标合规、不评估，所以 `:602-607` 被收进 G 就不再按「硬编码」分析。
3. 同一块里的时序部分（`xiaoziDisclosure :558-572`、身份门 `:623-644`）都列了，所以审计者读过这一段，但没把相邻的静态字面量单列〔推〕。
4. 同日 `NPC-STAGE-PROFILE-GAPS.md:64` 注意到「代码硬写 3 条…603–613」，归为数据缺口，没有当作模块化违规〔核〕。
5. 棘轮盲区：它只数人名，形容词数组看不到；审计 `§1.1` 自己已说棘轮「只数人名」。

这条已写进 `HARDCODED-SETTINGS-INVENTORY.md` 前言和 1-01、1-02 两行。

## 7. 没查／不确定

- 源卡 `character-cards-v3.json` 在 `.gitignore:57`（`character-canon/*`）里，只有 3 个文件入库，所以源卡本身无法 `git blame`；registry 是它的生成物，我用 registry 的提交史反推。
- 阿夕当时是否真在待人工名单里：〔推〕，旧报告已被覆盖。
- 没有读 NAS 镜像，没运行 `canon:build` 或任何测试，没有跑游戏验证模型实际收到什么。
- `bottomline-scan/` 的待扫名单和覆盖名单来自 `/private/tmp/claude-501/…/scratchpad/*.json`（`scan-bottomline.mjs:17`、`apply-bottomline-scan.mjs:12`），文件已不存在，这两个脚本现在无法按原样重跑〔核〕。
- 我的中间产物写在 `/tmp/xt_principles_hist.txt`（仓库外，未删）。
