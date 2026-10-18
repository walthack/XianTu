// 构建期信息（webpack.config.js 与 webpack.combat-trial.config.js 共用，经 DefinePlugin 注入）。
// BUILD_ID = git 短哈希-日期（工作区脏则加 -dirty）；git 不可用时回退 nogit-日期。
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')
const CATALOG_PATH = path.join(ROOT, 'src/modules/contentPacks/generated/catalog.json')

const pad = (n) => String(n).padStart(2, '0')
const formatDate = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`

/** sha 为空表示 git 不可用；dirty 仅在有 sha 时生效。 */
function formatBuildId({ sha, date, dirty = false }) {
  if (!sha) return `nogit-${date}`
  return `${sha}-${date}${dirty ? '-dirty' : ''}`
}

function gitOutput(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
}

/** git 不可用或不在仓库内时 sha 为空串。工作区脏只看已跟踪文件（忽略未跟踪的临时物）。 */
function readGitState(cwd = ROOT, run = gitOutput) {
  try {
    const sha = run(['rev-parse', '--short', 'HEAD'], cwd)
    if (!sha) return { sha: '', dirty: false }
    return { sha, dirty: run(['status', '--porcelain', '--untracked-files=no'], cwd).length > 0 }
  } catch {
    return { sha: '', dirty: false }
  }
}

function getBuildInfo({ cwd = ROOT, now = new Date(), run = gitOutput } = {}) {
  const { sha, dirty } = readGitState(cwd, run)
  return { buildId: formatBuildId({ sha, date: formatDate(now), dirty }), gitSha: sha || 'nogit' }
}

/** 读内容包目录的 version；读不到或不是非空字符串时回退 'unknown'。 */
function readContentPackVersion(catalogPath = CATALOG_PATH) {
  try {
    const version = JSON.parse(fs.readFileSync(catalogPath, 'utf8')).version
    return typeof version === 'string' && version ? version : 'unknown'
  } catch {
    return 'unknown'
  }
}

/** DefinePlugin 的键值（已 JSON.stringify）。 */
function buildDefines(options = {}) {
  const { buildId, gitSha } = getBuildInfo(options)
  return {
    BUILD_ID: JSON.stringify(buildId),
    GIT_SHA: JSON.stringify(gitSha),
    CONTENT_PACK_VERSION: JSON.stringify(readContentPackVersion(options.catalogPath)),
  }
}

module.exports = { formatBuildId, readGitState, getBuildInfo, readContentPackVersion, buildDefines }
