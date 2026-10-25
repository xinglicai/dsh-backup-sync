/**
 * 项目快照 —— 复刻 vscode-local-snapshots 的核心模型：
 *   命名快照 + 集中存储 + 忽略规则 + 整项目/单文件恢复 + 恢复前保险快照
 *
 * 存储布局（不污染项目目录）：
 *   <backupRoot>/projects/<projectKey>/<name>/
 *     meta.json      —— projectPath / 文件清单(size,mtime) / 忽略规则
 *     files/...      —— 项目文件副本（相对路径保持原样）
 */
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { hostname } from 'node:os'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'

export const PROJECT_FORMAT_VERSION = 1

/** 默认忽略：构建产物、依赖、版本库内部、临时文件。glob 语义简化实现。 */
export const DEFAULT_IGNORES: readonly string[] = [
  '**/node_modules/**',
  '**/.git/**',
  '**/.hg/**',
  '**/.svn/**',
  '**/dist/**',
  '**/out/**',
  '**/build/**',
  '**/.next/**',
  '**/.nuxt/**',
  '**/.cache/**',
  '**/coverage/**',
  '**/target/**',
  '**/.venv/**',
  '**/venv/**',
  '**/__pycache__/**',
  '**/.idea/**',
  '**/.vscode/**',
  '**/.turbo/**',
  '**/Pods/**',
  '**/.dart_tool/**',
  '**/*.log',
  '**/*.tmp',
  '**/.DS_Store',
  '**/Thumbs.db',
]

export interface ProjectFile {
  readonly path: string
  readonly size: number
  readonly mtimeMs: number
}

export interface ProjectMeta {
  readonly formatVersion: number
  readonly name: string
  readonly projectPath: string
  readonly projectKey: string
  readonly createdAt: string
  readonly hostname: string
  readonly fileCount: number
  readonly totalBytes: number
  readonly ignores: readonly string[]
  readonly files: readonly ProjectFile[]
}

export interface ProjectSummary {
  readonly name: string
  readonly createdAt: string
  readonly hostname: string
  readonly fileCount: number
  readonly totalBytes: number
  readonly valid: boolean
}

/** 项目快照名：与 harness 快照同规则（宽松一点，允许中文以外的常规字符）。 */
const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._ -]{0,80}$/

/**
 * 把用户命名（可含 `PRE-CHANGE: xxx` 这类约定）转成合法的目录名：
 * Windows 不允许 : \ / * ? " < > |，这里统一替换成 `-`。
 */
export function sanitizeProjectName(raw: string): string {
  return raw
    .trim()
    .replace(/[:\\/*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
}

export function assertProjectName(name: string): void {
  if (!NAME_RE.test(name) || name.endsWith('.')) {
    throw new Error(`快照名非法：「${name}」——仅允许字母、数字、空格、点、下划线、短横线，且以字母或数字开头`)
  }
}

/** 项目路径 → 稳定的目录键（D:\a\b → D--a--b），避免不同盘/不同项目撞名。 */
export function projectKey(projectPath: string): string {
  const normalized = resolve(projectPath).replace(/[:\\/]+/g, '-').replace(/^-+|-+$/g, '')
  return normalized === '' ? 'root' : normalized.slice(0, 120)
}

export function projectsRoot(backupRoot: string): string {
  return join(backupRoot, 'projects')
}

export function projectStoreRoot(backupRoot: string, projectPath: string): string {
  return join(projectsRoot(backupRoot), projectKey(projectPath))
}

export function projectSnapshotDir(backupRoot: string, projectPath: string, name: string): string {
  return join(projectStoreRoot(backupRoot, projectPath), name)
}

interface IgnoreMatcher {
  readonly active: boolean
  matchDirectory(name: string, relPath: string): boolean
  matchFile(name: string, relPath: string): boolean
}

/**
 * 把 glob 风格的忽略规则编译成判定器：
 *   `**\/dir/**` 或 `dir/**` → 目录名
 *   `*.log`                  → 后缀/通配文件名
 *   其它                     → 精确名（文件或目录）
 */
export function makeIgnoreMatcher(patterns: readonly string[]): IgnoreMatcher {
  const dirs = new Set<string>()
  const exact = new Set<string>()
  const fileRes: RegExp[] = []
  const dirRes: RegExp[] = []

  const toRegExp = (glob: string): RegExp =>
    new RegExp('^' + glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$')

  for (const raw of patterns) {
    const pattern = raw.trim()
    if (pattern === '' || pattern.startsWith('#')) continue
    const cleaned = pattern.replace(/^\.?\//, '')
    const dirMatch = /^(?:\*\*\/)?([^/*]+)\/\*\*$/.exec(cleaned)
    if (dirMatch !== null) {
      dirs.add(dirMatch[1]!)
      continue
    }
    if (/[*?]/.test(basename(cleaned))) {
      const target = cleaned.includes('/') ? dirRes : fileRes
      target.push(toRegExp(basename(cleaned)))
      continue
    }
    exact.add(cleaned)
  }

  const matchBasename = (name: string, relPath: string): boolean =>
    exact.has(name) || exact.has(relPath.replace(/\\/g, '/')) || fileRes.some((re) => re.test(name))

  return {
    active: dirs.size + exact.size + fileRes.length + dirRes.length > 0,
    matchDirectory(name: string, relPath: string): boolean {
      if (dirs.has(name)) return true
      if (exact.has(name) || exact.has(relPath.replace(/\\/g, '/'))) return true
      return dirRes.some((re) => re.test(name))
    },
    matchFile(name: string, relPath: string): boolean {
      return matchBasename(name, relPath)
    },
  }
}

interface WalkResult {
  readonly files: ProjectFile[]
  readonly skipped: number
}

async function walkProject(
  root: string,
  current: string,
  matcher: IgnoreMatcher,
  files: ProjectFile[],
  state: { skipped: number },
): Promise<void> {
  const entries = await readdir(current, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    const absolute = join(current, entry.name)
    const rel = relative(root, absolute).split(sep).join('/')
    if (entry.isSymbolicLink()) {
      state.skipped += 1
      continue
    }
    if (entry.isDirectory()) {
      if (matcher.matchDirectory(entry.name, rel)) {
        state.skipped += 1
        continue
      }
      await walkProject(root, absolute, matcher, files, state)
      continue
    }
    if (!entry.isFile()) continue
    if (matcher.matchFile(entry.name, rel)) {
      state.skipped += 1
      continue
    }
    try {
      const info = await stat(absolute)
      files.push({ path: rel, size: info.size, mtimeMs: Math.round(info.mtimeMs) })
    } catch {
      state.skipped += 1
    }
  }
}

export interface CreateProjectOptions {
  /** 额外忽略规则（叠加在 DEFAULT_IGNORES 之上）。 */
  readonly ignores?: readonly string[]
  readonly signal?: AbortSignal
}

/** 对项目目录做一次完整快照；名字冲突时报错（用新名字避免覆盖）。 */
export async function createProjectSnapshot(
  backupRoot: string,
  projectPath: string,
  rawName: string,
  options: CreateProjectOptions = {},
): Promise<{ meta: ProjectMeta; skipped: number }> {
  const name = sanitizeProjectName(rawName)
  assertProjectName(name)
  const projectRoot = resolve(projectPath)
  if (!existsSync(projectRoot)) throw new Error(`项目目录不存在：${projectRoot}`)
  const info = await stat(projectRoot)
  if (!info.isDirectory()) throw new Error(`不是目录：${projectRoot}`)

  const dir = projectSnapshotDir(backupRoot, projectRoot, name)
  if (existsSync(dir)) throw new Error(`项目快照已存在：${name}`)

  const patterns = [...DEFAULT_IGNORES, ...(options.ignores ?? [])]
  const matcher = makeIgnoreMatcher(patterns)
  const state = { skipped: 0 }
  const walked: ProjectFile[] = []
  await walkProject(projectRoot, projectRoot, matcher, walked, state)

  const dest = join(dir, 'files')
  if (walked.length === 0) {
    throw new Error(
      `目录里没有可备份的文件：${projectRoot}\n（空目录，或所有文件都被忽略规则排除；确认路径选对了）`,
    )
  }
  try {
    await mkdir(dest, { recursive: true })
    for (const file of walked) {
      if (options.signal?.aborted === true) throw new Error('已取消')
      const from = join(projectRoot, file.path)
      const to = join(dest, file.path)
      await mkdir(dirname(to), { recursive: true })
      await cp(from, to, { force: true, dereference: true })
    }
    const meta: ProjectMeta = {
      formatVersion: PROJECT_FORMAT_VERSION,
      name,
      projectPath: projectRoot,
      projectKey: projectKey(projectRoot),
      createdAt: new Date().toISOString(),
      hostname: hostname(),
      fileCount: walked.length,
      totalBytes: walked.reduce((sum, file) => sum + file.size, 0),
      ignores: patterns,
      files: walked.sort((a, b) => a.path.localeCompare(b.path)),
    }
    await writeFile(join(dir, 'meta.json'), `${JSON.stringify(meta, null, 2)}\n`, 'utf8')
    return { meta, skipped: state.skipped }
  } catch (error) {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined)
    throw error
  }
}

export async function getProjectSnapshot(
  backupRoot: string,
  projectPath: string,
  rawName: string,
): Promise<ProjectMeta | undefined> {
  const name = sanitizeProjectName(rawName)
  const metaPath = join(projectSnapshotDir(backupRoot, projectPath, name), 'meta.json')
  try {
    return JSON.parse(await readFile(metaPath, 'utf8')) as ProjectMeta
  } catch {
    return undefined
  }
}

export async function listProjectSnapshots(
  backupRoot: string,
  projectPath: string,
): Promise<ProjectSummary[]> {
  const root = projectStoreRoot(backupRoot, projectPath)
  const entries = await readdir(root, { withFileTypes: true }).catch(() => [])
  const out: ProjectSummary[] = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const meta = await getProjectSnapshot(backupRoot, projectPath, entry.name)
    out.push({
      name: entry.name,
      createdAt: meta?.createdAt ?? '',
      hostname: meta?.hostname ?? '',
      fileCount: meta?.fileCount ?? 0,
      totalBytes: meta?.totalBytes ?? 0,
      valid: meta !== undefined,
    })
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

/** 列表里出现过的所有项目（用于面板显示历史项目）。 */
export async function listProjects(
  backupRoot: string,
): Promise<Array<{ key: string; projectPath: string; snapshots: number }>> {
  const root = projectsRoot(backupRoot)
  const entries = await readdir(root, { withFileTypes: true }).catch(() => [])
  const out: Array<{ key: string; projectPath: string; snapshots: number }> = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const dir = join(root, entry.name)
    const names = await readdir(dir, { withFileTypes: true }).catch(() => [])
    const snapshotDirs = names.filter((item) => item.isDirectory())
    let projectPath = ''
    for (const snapshot of snapshotDirs) {
      try {
        const meta = JSON.parse(await readFile(join(dir, snapshot.name, 'meta.json'), 'utf8')) as ProjectMeta
        projectPath = meta.projectPath
        break
      } catch {
        /* 跳过坏条目 */
      }
    }
    out.push({ key: entry.name, projectPath, snapshots: snapshotDirs.length })
  }
  return out
}

export interface RestoreProjectResult {
  readonly restored: number
  readonly removed: number
  readonly safeguard?: string
}

/**
 * 恢复到项目目录。
 *   mode='overwrite'（默认）：覆盖同路径文件、补上缺失文件，不动项目里多出来的文件。
 *   mode='exact'：额外删除快照里不存在的文件（真正的回滚，慎用）。
 */
export async function restoreProjectSnapshot(
  backupRoot: string,
  projectPath: string,
  rawName: string,
  options: { mode?: 'overwrite' | 'exact'; safeguard?: boolean } = {},
): Promise<RestoreProjectResult> {
  const name = sanitizeProjectName(rawName)
  const projectRoot = resolve(projectPath)
  const dir = projectSnapshotDir(backupRoot, projectRoot, name)
  const meta = await getProjectSnapshot(backupRoot, projectRoot, name)
  if (meta === undefined) throw new Error(`项目快照不存在或已损坏：${name}`)

  let safeguard: string | undefined
  if (options.safeguard !== false && existsSync(projectRoot)) {
    safeguard = `pre-restore-${new Date().toISOString().replace(/[:.]/g, '-')}`
    await createProjectSnapshot(backupRoot, projectRoot, safeguard)
  }

  const filesRoot = join(dir, 'files')
  let restored = 0
  for (const file of meta.files) {
    const from = join(filesRoot, file.path)
    const to = join(projectRoot, file.path)
    await mkdir(dirname(to), { recursive: true })
    await cp(from, to, { force: true, dereference: true })
    restored += 1
  }

  let removed = 0
  if (options.mode === 'exact') {
    const wanted = new Set(meta.files.map((file) => file.path))
    const matcher = makeIgnoreMatcher(meta.ignores)
    const collect = async (current: string): Promise<void> => {
      const entries = await readdir(current, { withFileTypes: true }).catch(() => [])
      for (const entry of entries) {
        const absolute = join(current, entry.name)
        const rel = relative(projectRoot, absolute).split(sep).join('/')
        if (entry.isSymbolicLink()) continue
        if (entry.isDirectory()) {
          if (matcher.matchDirectory(entry.name, rel)) continue
          await collect(absolute)
          continue
        }
        if (!entry.isFile()) continue
        if (matcher.matchFile(entry.name, rel)) continue
        if (wanted.has(rel)) continue
        await rm(absolute, { force: true })
        removed += 1
      }
    }
    await collect(projectRoot)
  }

  return { restored, removed, safeguard }
}

/** 单文件恢复：把快照里的一个文件写回项目。 */
export async function restoreProjectFile(
  backupRoot: string,
  projectPath: string,
  rawName: string,
  relPath: string,
): Promise<void> {
  const name = sanitizeProjectName(rawName)
  const projectRoot = resolve(projectPath)
  const meta = await getProjectSnapshot(backupRoot, projectRoot, name)
  if (meta === undefined) throw new Error(`项目快照不存在或已损坏：${name}`)
  const normalized = relPath.replace(/\\/g, '/')
  const hit = meta.files.find((file) => file.path === normalized)
  if (hit === undefined) throw new Error(`快照里没有这个文件：${relPath}`)
  const from = join(projectSnapshotDir(backupRoot, projectRoot, name), 'files', normalized)
  const to = join(projectRoot, normalized)
  await mkdir(dirname(to), { recursive: true })
  await cp(from, to, { force: true, dereference: true })
}

/** 只保留最近 keep 个（按 createdAt 倒序）。返回被删除的名字。 */
export async function pruneProjectSnapshots(
  backupRoot: string,
  projectPath: string,
  keep: number,
): Promise<string[]> {
  if (keep <= 0) return []
  const list = await listProjectSnapshots(backupRoot, projectPath)
  const removed: string[] = []
  for (const snapshot of list.slice(keep)) {
    await rm(projectSnapshotDir(backupRoot, projectPath, snapshot.name), { recursive: true, force: true }).catch(() => undefined)
    removed.push(snapshot.name)
  }
  return removed
}

/** 删除单个项目快照。 */
export async function removeProjectSnapshot(
  backupRoot: string,
  projectPath: string,
  rawName: string,
): Promise<void> {
  const name = sanitizeProjectName(rawName)
  await rm(projectSnapshotDir(backupRoot, projectPath, name), { recursive: true, force: true })
}
