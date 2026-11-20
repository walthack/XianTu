/**
 * 图片挂位（内容包 assets.json）里的 file → 打包后的网址。
 * file 相对 src/assets/，以 characters/、scenes/、cg/ 开头（见各目录 README）；打包规则在 webpack.config.js（只管这三个目录）。
 * 登记了但文件不在仓库里时返回空串，界面按缺图处理（立绘走剪影）。
 */
type ImageContext = { keys(): string[]; (key: string): unknown };

let contexts: Record<string, ImageContext> | null = null;
function imageContexts(): Record<string, ImageContext> {
  if (contexts) return contexts;
  try {
    contexts = {
      characters: require.context('./characters', true, /\.(png|webp|jpe?g)$/),
      scenes: require.context('./scenes', true, /\.(png|webp|jpe?g)$/),
      cg: require.context('./cg', true, /\.(png|webp|jpe?g)$/),
    };
  } catch { // lcq-allow: Node 测试环境没有 require.context，按没有图处理
    contexts = {};
  }
  return contexts;
}

export function packImageUrl(file: string): string {
  const slash = file.indexOf('/');
  const context = slash > 0 ? imageContexts()[file.slice(0, slash)] : undefined;
  const key = `./${file.slice(slash + 1)}`;
  if (!context || !context.keys().includes(key)) return '';
  const loaded = context(key) as string | { default?: string };
  return typeof loaded === 'string' ? loaded : String(loaded?.default || '');
}
