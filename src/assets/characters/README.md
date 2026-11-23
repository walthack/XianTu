# 立绘（半身／全身／头像）

用户 2026-11-16 定：新的立绘、场景图、CG 都放在仓库 `src/assets/` 下，各一个子目录（与 `endings/` 并列）。本目录放立绘（半身／全身／头像）。

- 文件名约定：`characters/<角色id>/bust__<服装>__<表情>.<扩展名>、<角色id>/full__<服装>.<扩展名>、<角色id>/avatar.<扩展名>`
- 扩展名只用小写的 png／webp／jpg／jpeg。
- 放进来的图要在所属内容包的 `assets.json` 里登记才会被用到；登记的 `file` 从 `src/assets/` 起算（即以 `characters/` 开头）。格式与缺图回落见 `docs/handoffs/2026-10-11/CONTENT-PACK-CONTRACT.md`「图片挂位 assets」。
- 打包规则已加（用户 2026-11-21 同意，`webpack.config.js`，只管 characters／scenes／cg 三个目录）。新界面（`?ui=new`）立绘区已接：登记了全身或半身立绘、文件也在的角色显示图，其余显示剪影。`characterId` 要写人物总表里的 id（如 `lcq.character.duan_qiang`），界面会按 id 或名字对上。
- 2026-11-24：新立绘 31 人 67 张已在 `src/modules/contentPacks/packs/characters/assets.json` 登记（每人第一张是 `full__default.webp`，其余姿势是 `full__pose2.webp`、`full__pose3.webp`）。文件统一成 987×1400、透明底、脸在左右正中；立绘区按「铺满高度、左右裁掉」显示。**图片文件本身还没有进仓库**（仓库是公开的，放不放进来等用户定）；测试服是把文件直接拷进本目录用的，没有文件的地方照旧显示剪影。
