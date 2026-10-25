/**
 * 备份/恢复 + 跨机同步插件 —— host 半区（@dsh-external/dsh-backup-sync）
 *
 * 命令组 /backup：
 *   /backup [name]                    —— 创建本地快照（默认时间戳名）
 *   /backup list                      —— 列出本地 + 远端快照
 *   /backup push <name>               —— 推送到远端（后端由 remoteKind 决定：webdav / baidu）
 *   /backup pull <name> [--force]     —— 从 WebDAV 拉取快照到本地（不自动恢复）
 *   /backup restore <name> [--all]    —— 从本地快照恢复
 *   /backup prune [keep]              —— 保留最近 keep 个本地快照
 *   /backup remote-prune <name>       —— 删除远端同名快照（WebDAV）
 *   /backup baidu-test                —— 自检百度网盘 MCP 连通性
 *
 * 设置页可视化：设置面板「备份同步」通过 POST /backup-sync/api 读写本插件配置；
 * 界面保存的改动写入 $DSH_HOME/backup-sync.settings.json，覆盖 patch 基线。
 */
import type { Context } from '@deepseek-ai/cordis'
import type { CommandInvocation } from '@deepseek-ai/dsh-commands'
import type {} from '@deepseek-ai/dsh-workspace'
import type {} from '@deepseek-ai/dsh-session-persistence'
import type {} from '@deepseek-ai/dsh-session'
// timer 插件的类型增补（ctx.interval）依赖此导入生效。
import type {} from '@deepseek-ai/cordis-plugin-timer'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import { credentialRef, type ResolvedCredential } from '@deepseek-ai/dsh-credentials'
import { join, basename, dirname, resolve } from 'node:path'
import { cp, mkdir, readFile, writeFile, readdir, stat, rm } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import {
  createSnapshot, listSnapshots, getSnapshot, restoreSnapshot, pruneSnapshots,
  defaultSnapshotName, snapshotDir, errorMessage, totalBytes, assertSnapshotName,
  type SnapshotSummary,
} from './snapshot.ts'
import {
  pushSnapshot, pullSnapshot, listRemoteSnapshots, removeRemoteSnapshot, pushDirectoryToWebDav,
  WebDavError, type WebDavConfig,
} from './webdav.ts'
import { pushSnapshotToBaidu, pushDirectoryToBaidu, testBaidu, DEFAULT_BAIDU_DIR } from './baidu.ts'
import { authorizeUrl, checkToken, devicePoll, deviceStart, exchangeCode, refreshToken, REFRESH_MARGIN_MS } from './baidu-oauth.ts'
import { loadSettingsFile, mergeConfig, saveSettingsFile, settingsFilePath, type SettingsFile } from './settings.ts'
import {
  createProjectSnapshot, listProjectSnapshots, listProjects, removeProjectSnapshot,
  restoreProjectFile, restoreProjectSnapshot, getProjectSnapshot, pruneProjectSnapshots,
  projectSnapshotDir, sanitizeProjectName, projectKey, projectStoreRoot,
} from './project.ts'
import type { WorkspaceRegistry } from '@deepseek-ai/dsh-workspace'

export const name = 'backup-sync'

export const inject = ['commands', 'credentials', 'timer', 'workspaceRegistry', 'sessionPersistence', 'sessions', 'connection', 'webServer']

/** WebDAV 远端配置。username/password 留空时从凭据引用 WEBDAV_USERNAME / WEBDAV_PASSWORD 解析。 */
export interface RemoteConfig {
  /** WebDAV 根地址，如 https://dav.example.com/remote.php/dav/files/user/dsh-backups。 */
  readonly baseUrl?: string
  readonly username?: string
  readonly password?: string
}

/** 百度网盘 MCP 后端配置。 */
export interface BaiduSettings {
  /** 百度网盘开放平台 Access Token（界面可视化配置）。 */
  readonly token?: string
  /** Python 解释器绝对路径（装了 mcp 依赖的 venv）。 */
  readonly pythonPath?: string
  /** fileupload_tool.py 绝对路径。 */
  readonly scriptPath?: string
  /** 网盘内的备份根目录，以 / 开头。 */
  readonly dir?: string
  /** 应用凭据 AppKey（OAuth client_id）。 */
  readonly appKey?: string
  /** 应用凭据 SecretKey（OAuth client_secret）。 */
  readonly secretKey?: string
  /** 刷新令牌；存在时 token 到期自动续期。 */
  readonly refreshToken?: string
  /** access_token 过期时间戳（毫秒）。 */
  readonly tokenExpiresAt?: number
}

export interface Config {
  /** 本地快照根目录；空 = $DSH_HOME/backups。 */
  readonly backupRoot?: string
  /** 是否备份 $DSH_HOME/attachments（体积大，默认关）。 */
  readonly includeAttachments?: boolean
  /** 是否备份 $DSH_HOME/.credentials.yaml（含明文密钥，默认关）。 */
  readonly includeCredentials?: boolean
  /** 自动备份间隔（分钟）；0 = 关闭。 */
  readonly autoIntervalMinutes?: number
  /** 备份后保留的最近快照数；0 = 从不清理。 */
  readonly autoKeep?: number
  /** 是否备份会话日志（默认 true）。 */
  readonly includeSessions?: boolean
  /** 是否备份工作区数据（默认 true）。 */
  readonly includeStorages?: boolean
  /** 额外备份的项目目录绝对路径。 */
  readonly projectPaths?: readonly string[]
  /** 长期跟踪的项目（面板里直接列项目快照）。 */
  readonly projects?: readonly string[]
  /** 项目快照额外忽略 glob。 */
  readonly projectIgnores?: readonly string[]
  /** 远端后端；local = 只建本地快照。 */
  readonly remoteKind?: 'webdav' | 'baidu' | 'local'
  /** 项目快照的远端目标；缺省继承 remoteKind。 */
  readonly projectRemoteKind?: 'webdav' | 'baidu' | 'local'
  readonly remote?: RemoteConfig
  readonly baidu?: BaiduSettings
}

const SIZE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB']

function formatBytes(bytes: number): string {
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < SIZE_UNITS.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${SIZE_UNITS[unit]}`
}

function formatTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** 快照内部节名 → 用户可读的中文标签。 */
const SECTION_LABELS: Record<string, string> = {
  sessions: '会话日志',
  storages: '工作区数据',
  'configs/settings.yaml': '设置',
  'configs/cordis.patch.yml': '全局配置',
  'configs/profiles': '各 profile 配置',
}

function sectionLabel(rel: string): string {
  return SECTION_LABELS[rel] ?? rel
}

function summarizeLine(snapshot: SnapshotSummary): string {
  const stamp = snapshot.valid
    ? `${formatTime(snapshot.createdAt)}  ${snapshot.hostname}  ${snapshot.fileCount} 文件 / ${formatBytes(snapshot.totalBytes)}`
    : '元数据缺失，无法显示详情（可重新创建）'
  return `  ${snapshot.name}  ${stamp}`
}

/** 已知子命令；其余输入一律视为自定义快照名。 */
const SUBCOMMANDS = new Set(['create', 'list', 'push', 'pull', 'restore', 'prune', 'remote-prune', 'sweep-archives', 'baidu-test'])

function tokens(rawInput: string): string[] {
  return rawInput.trim().split(/\s+/).filter((token) => token.length > 0)
}

interface HttpRequestLike {
  method?: string
  url?: string
  on(event: 'data', listener: (chunk: unknown) => void): void
  on(event: 'end', listener: () => void): void
  on(event: 'error', listener: (error: unknown) => void): void
}

interface HttpResponseLike {
  writeHead(status: number, headers: Record<string, string>): void
  end(body?: string): void
}

async function readJsonBody(req: HttpRequestLike): Promise<Record<string, unknown>> {
  const chunks: string[] = []
  await new Promise<void>((resolve, reject) => {
    req.on('data', (chunk) => chunks.push(String(chunk)))
    req.on('end', () => resolve())
    req.on('error', (error) => reject(error instanceof Error ? error : new Error(String(error))))
  })
  const raw = chunks.join('').trim()
  if (raw === '') return {}
  const parsed = JSON.parse(raw) as unknown
  return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}
}

function writeJson(res: HttpResponseLike, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(body))
}

export function apply(ctx: Context, config: Config = {}): void {
  const home = resolveDshHome()
  const base = config as unknown as Record<string, unknown>

  /** 生效配置 = patch 基线 + 设置页写入的可写层。 */
  let effective: Config = config

  const state = (): {
    backupRoot: string
    includeAttachments: boolean
    includeCredentials: boolean
    includeSessions: boolean
    includeStorages: boolean
    projectPaths: readonly string[]
    projects: readonly string[]
    projectIgnores: readonly string[]
    autoKeep: number
    remoteKind: 'webdav' | 'baidu' | 'local'
    projectRemoteKind: 'webdav' | 'baidu' | 'local'
    remote: RemoteConfig | undefined
    baidu: BaiduSettings | undefined
  } => {
    const backupRoot = (effective.backupRoot?.trim() ?? '') === '' ? join(home, 'backups') : effective.backupRoot!.trim()
    const kind: 'webdav' | 'baidu' | 'local' =
      effective.remoteKind === 'baidu' ? 'baidu' : effective.remoteKind === 'local' ? 'local' : 'webdav'
    const projectKind: 'webdav' | 'baidu' | 'local' =
      effective.projectRemoteKind === 'baidu'
        ? 'baidu'
        : effective.projectRemoteKind === 'webdav'
          ? 'webdav'
          : effective.projectRemoteKind === 'local'
            ? 'local'
            : kind
    return {
      backupRoot,
      includeAttachments: effective.includeAttachments ?? false,
      includeCredentials: effective.includeCredentials ?? false,
      includeSessions: effective.includeSessions !== false,
      includeStorages: effective.includeStorages !== false,
      projectPaths: (effective.projectPaths ?? []).filter((entry) => typeof entry === 'string' && entry.trim() !== ''),
      projects: (effective.projects ?? []).filter((entry) => typeof entry === 'string' && entry.trim() !== ''),
      projectIgnores: (effective.projectIgnores ?? []).filter((entry) => typeof entry === 'string' && entry.trim() !== ''),
      autoKeep: effective.autoKeep ?? 10,
      remoteKind: kind,
      projectRemoteKind: projectKind,
      remote: effective.remote,
      baidu: effective.baidu,
    }
  }

  const reloadSettings = async (): Promise<void> => {
    const stored = await loadSettingsFile(home)
    effective = mergeConfig(base, stored) as unknown as Config
  }

  const credentialValue = async (refName: string, fallback: string | undefined): Promise<string | undefined> => {
    if (fallback !== undefined && fallback !== '') return fallback
    const resolved: ResolvedCredential | undefined = await ctx.credentials.resolve(credentialRef(refName))
    return resolved?.value
  }

  const remoteConfigured = (): boolean => {
    const { remote } = state()
    return remote?.baseUrl !== undefined && remote.baseUrl.trim() !== ''
  }

  const remoteAuth = async (): Promise<WebDavConfig> => {
    const { remote } = state()
    if (!remoteConfigured() || remote === undefined) {
      throw new Error('未配置远端：请在设置页填写 WebDAV 地址（remote.baseUrl）')
    }
    const username = (await credentialValue('WEBDAV_USERNAME', remote.username)) ?? ''
    const password = (await credentialValue('WEBDAV_PASSWORD', remote.password)) ?? ''
    return { baseUrl: remote.baseUrl!, username, password }
  }

  /** 只把 baidu 段的某些字段写回可写层，并立刻重载生效配置。 */
  const persistBaidu = async (patch: NonNullable<SettingsFile['baidu']>): Promise<void> => {
    const stored = await loadSettingsFile(home)
    await saveSettingsFile(home, { ...stored, baidu: { ...stored.baidu, ...patch } })
    await reloadSettings()
  }

  const baiduApp = (): { appKey: string; secretKey: string } => {
    const { baidu } = state()
    return { appKey: (baidu?.appKey ?? '').trim(), secretKey: (baidu?.secretKey ?? '').trim() }
  }

  /**
   * 取可用的 access_token：
   *   - 为空 → 有 refresh_token 就自动换，否则报错并提示去一键授权；
   *   - 临近过期（10 分钟内）或 force → 用 refresh_token 续期并回写；
   *   - 续期失败但手上还有旧 token → 交给后续请求去暴露真实错误。
   */
  const ensureBaiduToken = async (force = false): Promise<string> => {
    const { baidu } = state()
    const current = ((await credentialValue('BAIDU_NETDISK_ACCESS_TOKEN', baidu?.token)) ?? '').trim()
    const refresh = (baidu?.refreshToken ?? '').trim()
    const expiresAt = baidu?.tokenExpiresAt ?? 0
    const nearExpiry = expiresAt > 0 && expiresAt - Date.now() < REFRESH_MARGIN_MS
    if (!force && current !== '' && !nearExpiry) return current
    if (refresh === '') {
      if (current !== '' && !force) return current
      throw new Error('百度 Token 为空或已失效：请在「备份同步」设置页点「生成授权链接」完成一次授权，之后会自动续期')
    }
    const app = baiduApp()
    if (app.appKey === '' || app.secretKey === '') throw new Error('自动续期需要 AppKey 与 SecretKey：请在设置页填写')
    try {
      const next = await refreshToken(app, refresh)
      await persistBaidu({
        token: next.accessToken,
        refreshToken: next.refreshToken ?? refresh,
        tokenExpiresAt: next.expiresAt,
      })
      ctx.logger.info('backup-sync: 百度网盘 token 已自动续期')
      return next.accessToken
    } catch (error) {
      if (current !== '' && !force) return current
      throw error
    }
  }

  /** 百度网盘后端参数：token 缺省时回落到凭据引用 BAIDU_NETDISK_ACCESS_TOKEN。 */
  const baiduAuth = async (force = false): Promise<{ token: string; pythonPath: string; scriptPath: string; dir?: string }> => {
    const { baidu } = state()
    const token = await ensureBaiduToken(force)
    const pythonPath = (baidu?.pythonPath ?? '').trim()
    const scriptPath = (baidu?.scriptPath ?? '').trim()
    if (pythonPath === '' || scriptPath === '') throw new Error('未配置百度网盘 MCP 运行时：请填写 Python 解释器与 fileupload_tool.py 路径')
    return { token, pythonPath, scriptPath, dir: baidu?.dir }
  }

  const createBackup = async (name: string, signal?: AbortSignal): Promise<string> => {
    const current = state()
    const { meta, warnings } = await createSnapshot(current.backupRoot, home, name, {
      includeAttachments: current.includeAttachments,
      includeCredentials: current.includeCredentials,
      includeSessions: current.includeSessions,
      includeStorages: current.includeStorages,
      projectPaths: current.projectPaths,
    }, signal)
    const lines = [
      `已创建快照 ${meta.name}：${meta.files.length} 文件 / ${formatBytes(totalBytes(meta.files))}`,
      `  位置：${snapshotDir(current.backupRoot, meta.name)}`,
    ]
    for (const warning of warnings) lines.push(`  警告：${warning}`)
    const pruned = await pruneSnapshots(current.backupRoot, current.autoKeep)
    if (pruned.length > 0) lines.push(`  已清理 ${pruned.length} 个旧快照（按保留策略）`)
    return lines.join('\n')
  }

  /**
   * 清理失效归档：归档列表（archivedSessionIds）不校验会话日志是否存在，
   * 会话日志被删除/恢复覆盖后会产生"幽灵归档"。逐个校验，缺失则取消归档。
   */
  const sweepArchives = async (): Promise<number> => {
    const archived = [...ctx.workspaceRegistry.archivedSessionIds]
    if (archived.length === 0) return 0
    const registry = ctx.workspaceRegistry as WorkspaceRegistry & { unarchiveSession?(sessionId: string): Promise<void> }
    if (typeof registry.unarchiveSession !== 'function') {
      throw new Error('当前 dsh 版本不支持取消归档（需要含 workspace.unarchiveSession 的版本）')
    }
    let known: Set<string> | undefined
    let removed = 0
    for (const id of archived) {
      let exists = ctx.sessions.get(id) !== undefined
      if (!exists) {
        if (known === undefined) {
          try {
            const headers = await ctx.sessionPersistence.list()
            known = new Set(headers.map((header) => header.id))
          } catch (error) {
            ctx.logger.warn('backup-sync: 校验归档会话失败，跳过：%s', errorMessage(error))
            return 0
          }
        }
        exists = known.has(id)
      }
      if (!exists) {
        await registry.unarchiveSession(id)
        removed += 1
      }
    }
    return removed
  }

  /** 把底层错误翻译成用户可读信息。 */
  const userFacing = (error: unknown): string => {
    if (error instanceof WebDavError) {
      const code = error.status
      if (code === 401 || code === 403) {
        return '远端认证失败：请检查用户名/密码（或 WEBDAV_USERNAME / WEBDAV_PASSWORD 凭据）'
      }
      if (code === 404) return '远端路径不存在：请检查配置中的 WebDAV 地址'
      if (code === 413) return '远端拒绝上传（可能空间不足），请清理远端空间后重试'
      return `远端请求失败（HTTP ${code ?? '未知'}）`
    }
    const raw = errorMessage(error)
    if (raw.includes('ENOENT')) return `本地文件读取失败（路径不存在或已被移动）：${raw.slice(0, 120)}`
    return `操作失败：${raw}`
  }

  /** 推送快照到当前选定的远端后端。 */
  const pushToRemote = async (name: string, signal?: AbortSignal): Promise<string> => {
    const current = state()
    const meta = await getSnapshot(current.backupRoot, name)
    if (meta === undefined) throw new Error(`本地快照不存在：${name}（可用 /backup list 查看）`)
    if (current.remoteKind === 'local') {
      return `快照 ${name} 已保存在本地（仅本地模式，未推送）。\n要同步到云端，请在设置里把「备份到」改为百度网盘或 WebDAV 后再推。`
    }
    if (current.remoteKind === 'baidu') {
      const runPush = async (force: boolean): Promise<{ uploaded: number; root: string; mode: string; warnings: readonly string[] }> =>
        pushSnapshotToBaidu(await baiduAuth(force), name, meta, snapshotDir(current.backupRoot, name), signal)
      let result
      try {
        result = await runPush(false)
      } catch (error) {
        // token 失效（如 20017 / 401）：强制续期一次再试
        if (!/token|20017|401|31021|expired/i.test(errorMessage(error))) throw error
        result = await runPush(true)
      }
      const parts = [`已推送快照 ${name} 到百度网盘：${result.uploaded} 文件上传（${result.root}/${name}）`]
      if (result.mode === 'flat') parts.push('目录不可写，已改用扁平命名')
      for (const warning of result.warnings) parts.push(`  警告：${warning}`)
      parts.push('注意：上传型 MCP 不提供远端枚举/下载，恢复请使用本地快照')
      return parts.join('\n')
    }
    const config = await remoteAuth()
    const { uploaded, skipped, removed } = await pushSnapshot(config, name, meta, snapshotDir(current.backupRoot, name), signal)
    const parts = [`已推送快照 ${name} 到 WebDAV：${uploaded} 文件上传`]
    if (skipped > 0) parts.push(`${skipped} 文件跳过（未变化）`)
    if (removed > 0) parts.push(`清理远端残留 ${removed} 个`)
    return parts.join('，')
  }

  const command = async (invocation: CommandInvocation): Promise<{ kind: 'success'; text: string } | { kind: 'error'; text: string }> => {
    try {
      await reloadSettings()
      const args = tokens(invocation.rawInput)
      const sub = args[0] ?? ''
      const signal = invocation.signal

      if (sub === '' || sub === 'create') {
        const name = args[1] ?? defaultSnapshotName()
        return { kind: 'success', text: await createBackup(name, signal) }
      }
      if (!SUBCOMMANDS.has(sub)) {
        return { kind: 'success', text: await createBackup(sub, signal) }
      }

      if (sub === 'list') {
        const current = state()
        const lines: string[] = []
        const local = await listSnapshots(current.backupRoot)
        if (local.length === 0) {
          lines.push('本地快照：无（发送 /backup 即可创建）')
        } else {
          lines.push(`本地快照（${local.length}）：`)
          for (const snapshot of local) lines.push(summarizeLine(snapshot))
        }
        if (current.remoteKind === 'local') {
          lines.push('远端：未启用（仅本地模式，快照只保存在本地磁盘）')
        } else if (current.remoteKind === 'baidu') {
          lines.push(`远端后端：百度网盘（${current.baidu?.dir ?? '/来自：mcp_server/dsh-backup'}）— 上传型 MCP，不提供远端列表`)
        } else if (remoteConfigured()) {
          try {
            const config = await remoteAuth()
            const names = await listRemoteSnapshots(config, signal)
            lines.push(names.length === 0
              ? '远端快照：无'
              : `远端快照（${names.length}）：\n${names.map((n) => `  ${n}`).join('\n')}`)
          } catch (error) {
            lines.push(`远端快照：读取失败（${userFacing(error)}）`)
          }
        } else {
          lines.push('远端：未配置（可在设置页「备份同步」里填写）')
        }
        return { kind: 'success', text: lines.join('\n') }
      }

      if (sub === 'push') {
        const name = args[1] ?? ''
        if (name === '') return { kind: 'error', text: '用法：/backup push <快照名>' }
        assertSnapshotName(name)
        return { kind: 'success', text: await pushToRemote(name, signal) }
      }

      if (sub === 'pull') {
        const name = args[1] ?? ''
        if (name === '') return { kind: 'error', text: '用法：/backup pull <快照名> [--force]' }
        assertSnapshotName(name)
        if (state().remoteKind === 'baidu') {
          return { kind: 'error', text: '百度网盘后端不支持下载：上传型 MCP 只提供上传。请用 WebDAV 后端同步，或用网盘客户端取回快照。' }
        }
        const force = args.includes('--force')
        const config = await remoteAuth()
        const current = state()
        const { meta, downloaded, removed } = await pullSnapshot(config, name, snapshotDir(current.backupRoot, name), signal, force)
        const lines = [
          `已同步快照 ${name}：${downloaded} 文件下载 / ${removed} 文件清理（共 ${meta.files.length} 文件 / ${formatBytes(totalBytes(meta.files))}）`,
          `  位置：${snapshotDir(current.backupRoot, name)}`,
          '下一步：/backup restore <快照名> 恢复数据',
        ]
        return { kind: 'success', text: lines.join('\n') }
      }

      if (sub === 'restore') {
        const name = args[1] ?? ''
        if (name === '') return { kind: 'error', text: '用法：/backup restore <快照名> [--all]' }
        assertSnapshotName(name)
        const all = args.includes('--all')
        const current = state()
        const { restored, skipped, warnings, safeguardName } = await restoreSnapshot(current.backupRoot, home, name, {
          all,
          safeguard: true,
        }, signal)
        const lines: string[] = []
        if (safeguardName !== undefined) {
          lines.push(`恢复前已对现状建保险快照：${safeguardName}`)
        }
        lines.push(`已恢复：${restored.map(sectionLabel).join('、')}`)
        if (skipped.length > 0) lines.push(`未恢复：${skipped.map(sectionLabel).join('、')}`)
        for (const warning of warnings) lines.push(`  警告：${warning}`)
        if (all) {
          lines.push('配置层已还原（设置与各 profile 配置将回退为快照时的状态），请重启 dsh 生效')
        }
        try {
          const swept = await sweepArchives()
          if (swept > 0) lines.push(`已清理 ${swept} 个失效归档（会话日志已不存在）`)
        } catch (error) {
          lines.push(`  警告：清理失效归档失败（${errorMessage(error)}）`)
        }
        return { kind: 'success', text: lines.join('\n') }
      }

      if (sub === 'sweep-archives') {
        const swept = await sweepArchives()
        const total = ctx.workspaceRegistry.archivedSessionIds.length
        return { kind: 'success', text: swept === 0
          ? `归档列表正常（${total} 个会话，无失效条目）`
          : `已清理 ${swept} 个失效归档（剩余 ${total} 个）` }
      }

      if (sub === 'baidu-test') {
        const auth = await baiduAuth()
        const { tools } = await testBaidu(auth)
        return { kind: 'success', text: `百度网盘 MCP 连通：工具 ${tools.join(', ') || '（无）'}` }
      }

      if (sub === 'prune') {
        const keepArg = args[1]
        if (keepArg !== undefined && !/^\d+$/.test(keepArg)) {
          return { kind: 'error', text: `保留数非法：${keepArg}` }
        }
        const current = state()
        const keep = keepArg !== undefined ? parseInt(keepArg, 10) : current.autoKeep
        const removed = await pruneSnapshots(current.backupRoot, keep)
        const remaining = (await listSnapshots(current.backupRoot)).length
        return { kind: 'success', text: removed.length === 0
          ? `无需清理（保留 ${keep} 个，当前共 ${remaining} 个）`
          : `已清理 ${removed.length} 个旧快照（剩余 ${remaining} 个，可用 /backup list 查看）` }
      }

      if (sub === 'remote-prune') {
        const name = args[1] ?? ''
        if (name === '') return { kind: 'error', text: '用法：/backup remote-prune <快照名>' }
        assertSnapshotName(name)
        if (state().remoteKind === 'baidu') {
          return { kind: 'error', text: '百度网盘后端不支持远端删除：请在网盘客户端删除对应目录。' }
        }
        const config = await remoteAuth()
        await removeRemoteSnapshot(config, name, signal)
        return { kind: 'success', text: `已删除远端快照：${name}` }
      }

      return { kind: 'error', text: `未知子命令：${sub}\n用法：\n  /backup [快照名]        创建快照\n  /backup list             列出本地与远端快照\n  /backup push <快照名>    推送到远端（WebDAV / 百度网盘）\n  /backup pull <快照名> [--force]  从 WebDAV 同步快照\n  /backup restore <快照名> [--all] 从快照恢复数据\n  /backup baidu-test       自检百度网盘 MCP\n  /backup prune [保留数]   清理旧快照\n  /backup remote-prune <快照名>   删除 WebDAV 远端快照\n  /backup sweep-archives   清理失效的会话归档` }
    } catch (error) {
      return { kind: 'error', text: userFacing(error) }
    }
  }

  ctx.effect(() => ctx.commands.register({
    name: 'backup',
    description: '备份/恢复与跨机同步：本地快照、WebDAV / 百度网盘推送、恢复与保留清理',
    input: { hint: '[<快照名>|list|push <快照名>|pull <快照名> [--force]|restore <快照名> [--all]|baidu-test|prune [保留数]|sweep-archives]' },
    handler: command,
  }), 'backup-sync: /backup')

  // ---- 设置页 API（可视化界面读写配置 / 触发备份） ----
  type WebServer = { register(spec: unknown): () => void }
  type Connection = { requestRejection(req: unknown): unknown }
  const webServer = (ctx as unknown as { webServer: WebServer }).webServer
  const connection = (ctx as unknown as { connection: Connection }).connection

  /** 单例设备码授权：填写 AppKey/SecretKey 后一键申请、轮询、自动落盘。 */
  let pendingDevice: { deviceCode: string; expiresAt: number } | undefined

  const requireProjectPath = (payload: Record<string, unknown>): string => {
    const path = typeof payload.path === 'string' ? payload.path.trim() : ''
    if (path === '') throw new Error('缺少项目路径（path）')
    return path
  }

  /** 在系统文件管理器里打开一个已存在的目录。 */
  const openDirectory = (target: string): void => {
    if (!existsSync(target)) throw new Error(`目录不存在：${target}`)
    const child = process.platform === 'win32'
      ? spawn('explorer.exe', [target], { detached: true, stdio: 'ignore' })
      : process.platform === 'darwin'
        ? spawn('open', [target], { detached: true, stdio: 'ignore' })
        : spawn('xdg-open', [target], { detached: true, stdio: 'ignore' })
    child.on('error', () => undefined)
    child.unref()
  }

  const api: Record<string, (payload: Record<string, unknown>) => Promise<unknown>> = {
    'settings.get': async () => {
      await reloadSettings()
      const current = state()
      return {
        ok: true,
        settingsFile: settingsFilePath(home),
        home,
        settings: {
          backupRoot: current.backupRoot,
          includeAttachments: current.includeAttachments,
          includeCredentials: current.includeCredentials,
          includeSessions: current.includeSessions,
          includeStorages: current.includeStorages,
          projectPaths: [...current.projectPaths],
          projects: [...current.projects],
          projectIgnores: [...current.projectIgnores],
          autoIntervalMinutes: effective.autoIntervalMinutes ?? 0,
          autoKeep: current.autoKeep,
          remoteKind: current.remoteKind,
          projectRemoteKind: current.projectRemoteKind,
          remote: {
            baseUrl: current.remote?.baseUrl ?? '',
            username: current.remote?.username ?? '',
            password: current.remote?.password ?? '',
          },
          baidu: {
            token: current.baidu?.token ?? '',
            pythonPath: current.baidu?.pythonPath ?? '',
            scriptPath: current.baidu?.scriptPath ?? '',
            dir: current.baidu?.dir ?? '/来自：mcp_server/dsh-backup',
            appKey: current.baidu?.appKey ?? '',
            secretKey: current.baidu?.secretKey ?? '',
            hasRefreshToken: (current.baidu?.refreshToken ?? '') !== '',
            tokenExpiresAt: current.baidu?.tokenExpiresAt ?? 0,
          },
        },
      }
    },
    'settings.save': async (payload) => {
      const incoming = (payload.settings ?? payload) as SettingsFile
      const saved = await saveSettingsFile(home, incoming)
      await reloadSettings()
      return { ok: true, saved }
    },
    'baidu.authorizeUrl': async () => {
      await reloadSettings()
      const { appKey } = baiduApp()
      if (appKey === '') throw new Error('先填写 AppKey（应用凭据页的 AppKey）')
      return { ok: true, url: authorizeUrl(appKey) }
    },
    /** 一键自动获取：申请设备码，返回给用户确认的短码与链接。 */
    'baidu.deviceStart': async () => {
      await reloadSettings()
      const app = baiduApp()
      if (app.appKey === '') throw new Error('先填写 AppKey')
      const started = await deviceStart(app.appKey)
      pendingDevice = { deviceCode: started.deviceCode, expiresAt: started.expiresAt }
      return {
        ok: true,
        userCode: started.userCode,
        verificationUrl: started.verificationUrl,
        qrcodeUrl: started.qrcodeUrl ?? '',
        intervalSec: started.intervalSec,
        expiresAt: started.expiresAt,
      }
    },
    /** 轮询设备码授权结果；成功后自动写入 access_token / refresh_token。 */
    'baidu.devicePoll': async () => {
      await reloadSettings()
      if (pendingDevice === undefined) throw new Error('没有进行中的授权：先点「一键获取 Token」')
      if (Date.now() > pendingDevice.expiresAt) {
        pendingDevice = undefined
        return { ok: false, status: 'expired', message: '设备码已过期，请重新点一次' }
      }
      const app = baiduApp()
      if (app.appKey === '' || app.secretKey === '') throw new Error('自动获取需要 AppKey 与 SecretKey')
      const result = await devicePoll(app, pendingDevice.deviceCode)
      if (result.done && result.tokens !== undefined) {
        await persistBaidu({
          token: result.tokens.accessToken,
          refreshToken: result.tokens.refreshToken,
          tokenExpiresAt: result.tokens.expiresAt,
        })
        pendingDevice = undefined
        const check = await checkToken(result.tokens.accessToken)
        return {
          ok: true,
          status: 'success',
          expiresAt: result.tokens.expiresAt ?? 0,
          hasRefreshToken: (result.tokens.refreshToken ?? '') !== '',
          check,
        }
      }
      if (result.pending) return { ok: true, status: 'pending' }
      pendingDevice = undefined
      return { ok: false, status: 'error', message: result.message ?? '授权失败' }
    },
    'baidu.exchange': async (payload) => {
      await reloadSettings()
      const app = baiduApp()
      if (app.appKey === '' || app.secretKey === '') throw new Error('先填写 AppKey 与 SecretKey')
      const code = typeof payload.code === 'string' ? payload.code.trim() : ''
      const next = await exchangeCode(app, code)
      await persistBaidu({
        token: next.accessToken,
        refreshToken: next.refreshToken,
        tokenExpiresAt: next.expiresAt,
      })
      const check = await checkToken(next.accessToken)
      return {
        ok: true,
        expiresAt: next.expiresAt ?? 0,
        hasRefreshToken: (next.refreshToken ?? '') !== '',
        check,
      }
    },
    'baidu.refresh': async () => {
      await reloadSettings()
      const token = await ensureBaiduToken(true)
      const check = await checkToken(token)
      return { ok: true, check }
    },
    'baidu.check': async () => {
      await reloadSettings()
      const token = await ensureBaiduToken(false)
      return { ok: true, check: await checkToken(token) }
    },
    'baidu.test': async () => {
      await reloadSettings()
      const auth = await baiduAuth()
      const check = await checkToken(auth.token)
      const result = await testBaidu(auth)
      return { ok: true, tools: result.tools, hasToken: result.hasToken, check }
    },
    'snapshots.list': async () => {
      await reloadSettings()
      const current = state()
      const snapshots = await listSnapshots(current.backupRoot)
      return {
        ok: true,
        backupRoot: current.backupRoot,
        snapshots: snapshots.map((snapshot) => ({
          name: snapshot.name,
          createdAt: snapshot.createdAt,
          valid: snapshot.valid,
          hostname: snapshot.hostname,
          fileCount: snapshot.fileCount,
          totalBytes: snapshot.totalBytes,
          totalBytesLabel: formatBytes(snapshot.totalBytes),
        })),
      }
    },
    'backup.create': async (payload) => {
      await reloadSettings()
      const name = typeof payload.name === 'string' && payload.name.trim() !== '' ? payload.name.trim() : defaultSnapshotName()
      const text = await createBackup(name)
      return { ok: true, name, text }
    },
    'backup.push': async (payload) => {
      await reloadSettings()
      const name = typeof payload.name === 'string' ? payload.name.trim() : ''
      if (name === '') throw new Error('缺少快照名')
      assertSnapshotName(name)
      const text = await pushToRemote(name)
      return { ok: true, text }
    },
    'backup.restore': async (payload) => {
      await reloadSettings()
      const name = typeof payload.name === 'string' ? payload.name.trim() : ''
      if (name === '') throw new Error('缺少快照名')
      assertSnapshotName(name)
      const all = payload.all === true
      const current = state()
      const result = await restoreSnapshot(current.backupRoot, home, name, { all, safeguard: true })
      return { ok: true, restored: result.restored, skipped: result.skipped, safeguardName: result.safeguardName }
    },
    'backup.prune': async (payload) => {
      await reloadSettings()
      const current = state()
      const keep = typeof payload.keep === 'number' ? payload.keep : current.autoKeep
      const removed = await pruneSnapshots(current.backupRoot, keep)
      return { ok: true, removed: removed.length }
    },
    'backup.import': async (payload) => {
      await reloadSettings()
      const raw = typeof payload.path === 'string' ? payload.path.trim() : ''
      if (raw === '') throw new Error('缺少导入路径')
      const source = resolve(raw)
      if (!existsSync(source)) throw new Error(`路径不存在：${source}`)
      if (!existsSync(join(source, 'meta.json'))) {
        throw new Error(`不是有效的快照目录（缺少 meta.json）：${source}\n提示：如果你的备份是压缩包，先解压到某个目录再导入`)
      }
      const current = state()
      const name = typeof payload.name === 'string' && payload.name.trim() !== '' ? payload.name.trim() : basename(source)
      assertSnapshotName(name)
      const dest = snapshotDir(current.backupRoot, name)
      if (existsSync(dest)) throw new Error(`同名快照已存在：${name}（可改名后导入）`)
      await mkdir(dirname(dest), { recursive: true })
      await cp(source, dest, { recursive: true, force: false, errorOnExist: true })
      // 目录名与 meta.name 必须一致：导入常伴随改名，否则列表/推送会错位。
      const metaPath = join(dest, 'meta.json')
      try {
        const parsed = JSON.parse(await readFile(metaPath, 'utf8')) as { name?: string }
        if (parsed.name !== name) {
          parsed.name = name
          await writeFile(metaPath, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8')
        }
      } catch (error) {
        throw new Error(`快照的 meta.json 无法解析，导入已中止：${errorMessage(error)}`)
      }
      const meta = await getSnapshot(current.backupRoot, name)
      return { ok: true, name, fileCount: meta?.files.length ?? 0, backupRoot: current.backupRoot }
    },

    // ---- 项目快照（复刻 vscode-local-snapshots 的命名快照模型） ----
    'projects.list': async () => {
      await reloadSettings()
      const current = state()
      const known = await listProjects(current.backupRoot)
      const merged = new Map<string, { path: string; snapshots: number; watched: boolean }>()
      for (const entry of known) {
        if (entry.projectPath === '') continue
        merged.set(entry.projectPath.toLowerCase(), { path: entry.projectPath, snapshots: entry.snapshots, watched: false })
      }
      for (const path of current.projects) {
        const key = path.toLowerCase()
        const prev = merged.get(key)
        merged.set(key, { path, snapshots: prev?.snapshots ?? 0, watched: true })
      }
      return { ok: true, projects: [...merged.values()] }
    },
    'project.snapshots': async (payload) => {
      await reloadSettings()
      const current = state()
      const path = requireProjectPath(payload)
      return { ok: true, projectPath: path, snapshots: await listProjectSnapshots(current.backupRoot, path) }
    },
    'project.snapshot': async (payload) => {
      await reloadSettings()
      const current = state()
      const path = requireProjectPath(payload)
      const rawName = typeof payload.name === 'string' && payload.name.trim() !== ''
        ? payload.name.trim()
        : `snap-${new Date().toISOString().replace(/[:.]/g, '-')}`
      const { meta, skipped } = await createProjectSnapshot(current.backupRoot, path, rawName, {
        ignores: current.projectIgnores,
      })
      const pruned = await pruneProjectSnapshots(current.backupRoot, path, current.autoKeep)
      // 返回落盘后的真实名字（冒号等非法字符已替换），前端后续调用才不会错位。
      const name = sanitizeProjectName(rawName)
      return {
        ok: true,
        name,
        fileCount: meta.fileCount,
        totalBytes: meta.totalBytes,
        totalBytesLabel: formatBytes(meta.totalBytes),
        skipped,
        pruned: pruned.length,
        location: projectSnapshotDir(current.backupRoot, path, name),
      }
    },
    'project.files': async (payload) => {
      await reloadSettings()
      const current = state()
      const path = requireProjectPath(payload)
      const name = typeof payload.name === 'string' ? payload.name.trim() : ''
      const meta = await getProjectSnapshot(current.backupRoot, path, name)
      if (meta === undefined) throw new Error(`项目快照不存在：${name}`)
      return { ok: true, name, projectPath: meta.projectPath, files: meta.files.slice(0, 2000), truncated: meta.files.length > 2000 }
    },
    'project.restore': async (payload) => {
      await reloadSettings()
      const current = state()
      const path = requireProjectPath(payload)
      const name = typeof payload.name === 'string' ? payload.name.trim() : ''
      if (name === '') throw new Error('缺少快照名（name）')
      const result = await restoreProjectSnapshot(current.backupRoot, path, name, {
        mode: payload.mode === 'exact' ? 'exact' : 'overwrite',
        safeguard: payload.safeguard !== false,
      })
      return { ok: true, ...result }
    },
    'project.restoreFile': async (payload) => {
      await reloadSettings()
      const current = state()
      const path = requireProjectPath(payload)
      const name = typeof payload.name === 'string' ? payload.name.trim() : ''
      const file = typeof payload.file === 'string' ? payload.file.trim() : ''
      if (file === '') throw new Error('缺少文件路径（file）')
      await restoreProjectFile(current.backupRoot, path, name, file)
      return { ok: true, file }
    },
    'project.remove': async (payload) => {
      await reloadSettings()
      const current = state()
      const path = requireProjectPath(payload)
      const name = typeof payload.name === 'string' ? payload.name.trim() : ''
      await removeProjectSnapshot(current.backupRoot, path, name)
      return { ok: true, name }
    },
    /** 把项目快照推送到所选远端（百度网盘 / WebDAV）。 */
    'project.push': async (payload) => {
      await reloadSettings()
      const current = state()
      const path = requireProjectPath(payload)
      const name = sanitizeProjectName(typeof payload.name === 'string' ? payload.name.trim() : '')
      if (name === '') throw new Error('缺少快照名')
      const meta = await getProjectSnapshot(current.backupRoot, path, name)
      if (meta === undefined) throw new Error(`项目快照不存在：${name}`)
      if (current.projectRemoteKind === 'local') {
        return { ok: true, text: `快照 ${name} 已保存在本地（仅本地模式，未推送）。把「备份到」改成百度网盘或 WebDAV 后再推。` }
      }
      const localDir = projectSnapshotDir(current.backupRoot, path, name)
      const remoteBase = `${projectKey(path)}/${name}`

      if (current.projectRemoteKind === 'baidu') {
        const auth = await baiduAuth()
        const base = ((auth.dir ?? '').trim() === '' ? DEFAULT_BAIDU_DIR : auth.dir!.trim()).replace(/\/+$/, '')
        const result = await pushDirectoryToBaidu(auth, `${base}/projects/${remoteBase}`, localDir)
        const parts = [`已推送项目快照 ${name} 到百度网盘：${result.uploaded} 文件（${result.root}）`]
        if (result.mode === 'flat') parts.push('目录不可写，已改用扁平命名')
        for (const warning of result.warnings) parts.push(`  警告：${warning}`)
        return { ok: true, text: parts.join('\n') }
      }

      const config = await remoteAuth()
      const dirUrl = `${config.baseUrl.replace(/\/+$/, '')}/dsh-backup/projects/${remoteBase}`
      const result = await pushDirectoryToWebDav(config, dirUrl, localDir)
      return { ok: true, text: `已推送项目快照 ${name} 到 WebDAV：${result.uploaded}/${result.total} 文件` }
    },

    // ---- 打开备份文件夹 ----
    'backup.remove': async (payload) => {
      await reloadSettings()
      const current = state()
      const name = typeof payload.name === 'string' ? payload.name.trim() : ''
      if (name === '') throw new Error('缺少快照名（name）')
      assertSnapshotName(name)
      const target = snapshotDir(current.backupRoot, name)
      if (!existsSync(target)) throw new Error(`快照不存在：${name}`)
      await rm(target, { recursive: true, force: true })
      return { ok: true, name }
    },
    'backup.open': async (payload) => {
      await reloadSettings()
      const current = state()
      const name = typeof payload.name === 'string' ? payload.name.trim() : ''
      const target = name === '' ? current.backupRoot : snapshotDir(current.backupRoot, name)
      openDirectory(target)
      return { ok: true, path: target }
    },
    'project.open': async (payload) => {
      await reloadSettings()
      const current = state()
      const path = requireProjectPath(payload)
      const name = sanitizeProjectName(typeof payload.name === 'string' ? payload.name.trim() : '')
      const target = name === '' ? projectStoreRoot(current.backupRoot, path) : projectSnapshotDir(current.backupRoot, path, name)
      openDirectory(target)
      return { ok: true, path: target }
    },

    // ---- 会话所属项目反查（会话 Tab「备份」用） ----
    'workspace.default': async () => {
      try {
        const raw = await readFile(join(home, 'storages', 'workspace.json'), 'utf8')
        const parsed = JSON.parse(raw) as {
          global?: { defaultWorkspaceId?: string }
          tables?: { workspaces?: Record<string, { path?: string; title?: string; updatedAt?: string }> }
        }
        const workspaces = parsed.tables?.workspaces ?? {}
        const defaultId = parsed.global?.defaultWorkspaceId ?? ''
        const preferred = defaultId !== '' ? workspaces[defaultId] : undefined
        if (preferred !== undefined && (preferred.path ?? '') !== '') {
          return { ok: true, projectPath: String(preferred.path), title: String(preferred.title ?? '') }
        }
        const newest = Object.values(workspaces)
          .filter((entry) => (entry.path ?? '') !== '')
          .sort((a, b) => String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? '')))[0]
        return { ok: true, projectPath: String(newest?.path ?? ''), title: String(newest?.title ?? '') }
      } catch {
        return { ok: true, projectPath: '', title: '' }
      }
    },
    'session.project': async (payload) => {
      const sessionId = typeof payload.sessionId === 'string' ? payload.sessionId.trim() : ''
      if (sessionId === '') return { ok: true, projectPath: '', title: '' }
      try {
        const raw = await readFile(join(home, 'storages', 'workspace.json'), 'utf8')
        const parsed = JSON.parse(raw) as {
          tables?: { workspaces?: Record<string, { path?: string; title?: string; sessionIds?: string[] }> }
        }
        const workspaces = parsed.tables?.workspaces ?? {}
        for (const entry of Object.values(workspaces)) {
          if (Array.isArray(entry.sessionIds) && entry.sessionIds.includes(sessionId)) {
            return { ok: true, projectPath: String(entry.path ?? ''), title: String(entry.title ?? '') }
          }
        }
      } catch {
        /* 读不到就回落为空，前端用目录选择器 */
      }
      return { ok: true, projectPath: '', title: '' }
    },

    // ---- 目录浏览（设置页「选择目录」用，只返回目录） ----
    'fs.list': async (payload) => {
      const raw = typeof payload.path === 'string' ? payload.path.trim() : ''
      if (raw === '') {
        const drives: Array<{ name: string; path: string }> = []
        for (let code = 65; code <= 90; code += 1) {
          const letter = `${String.fromCharCode(code)}:\\`
          if (existsSync(letter)) drives.push({ name: letter, path: letter })
        }
        return { ok: true, path: '', parent: null, directories: drives }
      }
      const target = resolve(raw)
      const info = await stat(target).catch(() => undefined)
      if (info === undefined) throw new Error(`路径不存在：${target}`)
      if (!info.isDirectory()) throw new Error(`不是目录：${target}`)
      const entries = await readdir(target, { withFileTypes: true }).catch(() => [])
      const directories = entries
        .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
        .filter((entry) => entry.name !== 'node_modules')
        .map((entry) => ({ name: entry.name, path: join(target, entry.name) }))
        .sort((a, b) => a.name.localeCompare(b.name))
      const parent = dirname(target) === target ? '' : dirname(target)
      return { ok: true, path: target, parent, directories }
    },
  }

  ctx.effect(() => webServer.register({
    kind: 'prefix',
    path: '/backup-sync/api',
    handler: async (req: HttpRequestLike, res: HttpResponseLike) => {
      const rejection = connection.requestRejection(req as unknown)
      if (rejection !== undefined) {
        writeJson(res, 403, { ok: false, error: 'forbidden' })
        return
      }
      if ((req.method ?? '').toUpperCase() !== 'POST') {
        writeJson(res, 405, { ok: false, error: 'method not allowed' })
        return
      }
      const pathname = new URL(req.url ?? '/', 'http://dsh.internal').pathname
      const method = pathname.startsWith('/backup-sync/api/') ? pathname.slice('/backup-sync/api/'.length) : ''
      if (method === '' || method.includes('/')) {
        writeJson(res, 404, { ok: false, error: 'unknown method' })
        return
      }
      const handlerFor = Object.hasOwn(api, method) ? api[method] : undefined
      if (handlerFor === undefined) {
        writeJson(res, 404, { ok: false, error: `unknown method "${method}"` })
        return
      }
      try {
        const payload = await readJsonBody(req)
        writeJson(res, 200, await handlerFor(payload))
      } catch (error) {
        writeJson(res, 500, { ok: false, error: userFacing(error) })
      }
    },
  }), 'backup-sync: /backup-sync/api routes')

  // ---- 自动备份 ----
  const autoMinutes = config.autoIntervalMinutes ?? 0
  if (autoMinutes > 0) {
    let running = false
    ctx.effect(() => ctx.interval(async () => {
      if (running) return
      running = true
      try {
        await reloadSettings()
        const current = state()
        const interval = effective.autoIntervalMinutes ?? 0
        if (interval <= 0) return
        const name = defaultSnapshotName()
        await createSnapshot(current.backupRoot, home, name, {
          includeAttachments: current.includeAttachments,
          includeCredentials: current.includeCredentials,
        })
        await pruneSnapshots(current.backupRoot, current.autoKeep)
        ctx.logger.info('backup-sync: 自动快照 %s 完成', name)
      } catch (error) {
        ctx.logger.warn('backup-sync: 自动快照失败：%s', errorMessage(error))
      } finally {
        running = false
      }
    }, autoMinutes * 60 * 1000), 'backup-sync: auto-backup')
    ctx.logger.info('backup-sync: 自动备份已启用（每 %d 分钟，保留 %d 个）', autoMinutes, config.autoKeep ?? 10)
  }
}
