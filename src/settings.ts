/**
 * 可视化设置的可写层：patch 配置是只读基线，界面保存的改动写入
 * `$DSH_HOME/backup-sync.settings.json`，读取时覆盖在基线之上。
 * 这样无需改写 profile 的 cordis.patch.yml，也不会与 dsh 的配置编辑器互相踩踏。
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

export type RemoteKind = 'webdav' | 'baidu' | 'local'

export interface SettingsFile {
  backupRoot?: string
  includeAttachments?: boolean
  includeCredentials?: boolean
  /** 是否备份会话日志（$DSH_HOME/sessions），默认 true。 */
  includeSessions?: boolean
  /** 是否备份工作区数据（$DSH_HOME/storages），默认 true。 */
  includeStorages?: boolean
  /** 额外备份的项目目录绝对路径。 */
  projectPaths?: string[]
  /** 项目快照：长期跟踪的项目目录（面板里直接列快照）。 */
  projects?: string[]
  /** 项目快照的额外忽略 glob（叠加默认忽略）。 */
  projectIgnores?: string[]
  autoIntervalMinutes?: number
  autoKeep?: number
  remoteKind?: RemoteKind
  /** 项目快照的远端目标；缺省继承 remoteKind。 */
  projectRemoteKind?: RemoteKind
  remote?: { baseUrl?: string; username?: string; password?: string }
  baidu?: {
    token?: string
    pythonPath?: string
    scriptPath?: string
    dir?: string
    /** 应用凭据（OAuth client_id / client_secret），用于自动换取与续期 token。 */
    appKey?: string
    secretKey?: string
    refreshToken?: string
    /** access_token 过期时间戳（毫秒）。 */
    tokenExpiresAt?: number
  }
}

export function settingsFilePath(home: string): string {
  return join(home, 'backup-sync.settings.json')
}

export async function loadSettingsFile(home: string): Promise<SettingsFile> {
  try {
    const raw = await readFile(settingsFilePath(home), 'utf8')
    const parsed = JSON.parse(raw) as unknown
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as SettingsFile
    return {}
  } catch {
    return {}
  }
}

/** 深合并：settings 层覆盖 patch 层，缺失字段保持基线值。 */
export function mergeConfig<T extends Record<string, unknown>>(base: T, override: SettingsFile): T {
  const pick = <K extends keyof SettingsFile>(key: K): SettingsFile[K] | undefined =>
    override[key] === undefined ? undefined : override[key]
  return {
    ...base,
    ...(pick('backupRoot') === undefined ? {} : { backupRoot: pick('backupRoot') }),
    ...(pick('includeAttachments') === undefined ? {} : { includeAttachments: pick('includeAttachments') }),
    ...(pick('includeCredentials') === undefined ? {} : { includeCredentials: pick('includeCredentials') }),
    ...(pick('includeSessions') === undefined ? {} : { includeSessions: pick('includeSessions') }),
    ...(pick('includeStorages') === undefined ? {} : { includeStorages: pick('includeStorages') }),
    ...(pick('projectPaths') === undefined ? {} : { projectPaths: pick('projectPaths') }),
    ...(pick('projects') === undefined ? {} : { projects: pick('projects') }),
    ...(pick('projectIgnores') === undefined ? {} : { projectIgnores: pick('projectIgnores') }),
    ...(pick('autoIntervalMinutes') === undefined ? {} : { autoIntervalMinutes: pick('autoIntervalMinutes') }),
    ...(pick('autoKeep') === undefined ? {} : { autoKeep: pick('autoKeep') }),
    ...(pick('remoteKind') === undefined ? {} : { remoteKind: pick('remoteKind') }),
    ...(pick('projectRemoteKind') === undefined ? {} : { projectRemoteKind: pick('projectRemoteKind') }),
    ...(override.remote === undefined ? {} : { remote: { ...(base.remote as object | undefined ?? {}), ...override.remote } }),
    ...(override.baidu === undefined ? {} : { baidu: { ...(base.baidu as object | undefined ?? {}), ...override.baidu } }),
  } as T
}

export async function saveSettingsFile(home: string, next: SettingsFile): Promise<SettingsFile> {
  const path = settingsFilePath(home)
  await mkdir(dirname(path), { recursive: true })
  const sanitized = sanitize(next)
  await writeFile(path, `${JSON.stringify(sanitized, null, 2)}\n`, 'utf8')
  return sanitized
}

/** 只接受已知字段与标量类型，杜绝界面把任意结构写进配置文件。 */
export function sanitize(input: SettingsFile): SettingsFile {
  const out: SettingsFile = {}
  const text = (value: unknown): string | undefined =>
    typeof value === 'string' ? value.trim() : undefined
  const bool = (value: unknown): boolean | undefined =>
    typeof value === 'boolean' ? value : undefined
  const count = (value: unknown, min: number, max: number): number | undefined => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
    const rounded = Math.floor(value)
    return rounded < min || rounded > max ? undefined : rounded
  }

  const backupRoot = text(input.backupRoot)
  if (backupRoot !== undefined) out.backupRoot = backupRoot
  const includeAttachments = bool(input.includeAttachments)
  if (includeAttachments !== undefined) out.includeAttachments = includeAttachments
  const includeCredentials = bool(input.includeCredentials)
  if (includeCredentials !== undefined) out.includeCredentials = includeCredentials
  const includeSessions = bool(input.includeSessions)
  if (includeSessions !== undefined) out.includeSessions = includeSessions
  const includeStorages = bool(input.includeStorages)
  if (includeStorages !== undefined) out.includeStorages = includeStorages
  if (Array.isArray(input.projectPaths)) {
    const paths = input.projectPaths
      .filter((entry): entry is string => typeof entry === 'string')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0)
      .slice(0, 10)
    out.projectPaths = paths
  }
  if (Array.isArray(input.projects)) {
    out.projects = input.projects
      .filter((entry): entry is string => typeof entry === 'string')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0)
      .slice(0, 20)
  }
  if (Array.isArray(input.projectIgnores)) {
    out.projectIgnores = input.projectIgnores
      .filter((entry): entry is string => typeof entry === 'string')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0)
      .slice(0, 100)
  }
  const autoIntervalMinutes = count(input.autoIntervalMinutes, 0, 10_080)
  if (autoIntervalMinutes !== undefined) out.autoIntervalMinutes = autoIntervalMinutes
  const autoKeep = count(input.autoKeep, 0, 10_000)
  if (autoKeep !== undefined) out.autoKeep = autoKeep
  if (input.remoteKind === 'webdav' || input.remoteKind === 'baidu' || input.remoteKind === 'local') {
    out.remoteKind = input.remoteKind
  }
  if (input.projectRemoteKind === 'webdav' || input.projectRemoteKind === 'baidu' || input.projectRemoteKind === 'local') {
    out.projectRemoteKind = input.projectRemoteKind
  }

  if (input.remote !== undefined) {
    const remote: NonNullable<SettingsFile['remote']> = {}
    const baseUrl = text(input.remote.baseUrl)
    if (baseUrl !== undefined) remote.baseUrl = baseUrl
    const username = text(input.remote.username)
    if (username !== undefined) remote.username = username
    const password = typeof input.remote.password === 'string' ? input.remote.password : undefined
    if (password !== undefined) remote.password = password
    if (Object.keys(remote).length > 0) out.remote = remote
  }

  if (input.baidu !== undefined) {
    const baidu: NonNullable<SettingsFile['baidu']> = {}
    const token = typeof input.baidu.token === 'string' ? input.baidu.token.trim() : undefined
    if (token !== undefined) baidu.token = token
    const pythonPath = text(input.baidu.pythonPath)
    if (pythonPath !== undefined) baidu.pythonPath = pythonPath
    const scriptPath = text(input.baidu.scriptPath)
    if (scriptPath !== undefined) baidu.scriptPath = scriptPath
    const dir = text(input.baidu.dir)
    if (dir !== undefined) baidu.dir = dir
    const appKey = text(input.baidu.appKey)
    if (appKey !== undefined) baidu.appKey = appKey
    const secretKey = text(input.baidu.secretKey)
    if (secretKey !== undefined) baidu.secretKey = secretKey
    const refreshToken = text(input.baidu.refreshToken)
    if (refreshToken !== undefined) baidu.refreshToken = refreshToken
    const tokenExpiresAt = typeof input.baidu.tokenExpiresAt === 'number' && Number.isFinite(input.baidu.tokenExpiresAt)
      ? Math.floor(input.baidu.tokenExpiresAt)
      : undefined
    if (tokenExpiresAt !== undefined) baidu.tokenExpiresAt = tokenExpiresAt
    if (Object.keys(baidu).length > 0) out.baidu = baidu
  }

  return out
}
