/**
 * 百度网盘备份后端 —— 通过 MCP 协议驱动「百度网盘 MCP Server」。
 *
 * 传输：stdio（python fileupload_tool.py），消息为换行分隔的 JSON-RPC 2.0。
 * 该 MCP 只暴露一个工具 upload_file，因此本后端提供「推送归档」方向；
 * 远端枚举/下载需要远端 SSE 版 MCP（mcp-pan.baidu.com/sse），不在本后端范围。
 */
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { readdir, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { safeJoin, type SnapshotMeta } from './snapshot.ts'

export interface BaiduConfig {
  /** 百度网盘开放平台 Access Token。 */
  readonly token: string
  /** Python 解释器绝对路径（需已装 mcp 依赖，通常是插件的 venv）。 */
  readonly pythonPath: string
  /** fileupload_tool.py 绝对路径。 */
  readonly scriptPath: string
  /** 远端根目录（以 / 开头）；留空用默认目录。 */
  readonly dir?: string
}

export const DEFAULT_BAIDU_DIR = '/来自：mcp_server/dsh-backup'
const PROTOCOL_VERSION = '2024-11-05'
const START_TIMEOUT_MS = 30_000

interface RpcEnvelope {
  jsonrpc: '2.0'
  id?: number
  method?: string
  result?: unknown
  error?: { code: number; message: string; data?: unknown }
}

interface Pending {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

export class BaiduMcpError extends Error {
  constructor(message: string, readonly detail?: string) {
    super(message)
    this.name = 'BaiduMcpError'
  }
}

/** 单个 stdio MCP 会话；close() 后不可复用（每次推送新建一个，失败即丢弃）。 */
export class BaiduMcpSession {
  private child: ChildProcessWithoutNullStreams | undefined
  private buffer = ''
  private nextId = 1
  private readonly pending = new Map<number, Pending>()
  private stderrTail = ''
  private closed = false

  private constructor(private readonly config: BaiduConfig) {}

  static async open(config: BaiduConfig): Promise<BaiduMcpSession> {
    const session = new BaiduMcpSession(config)
    await session.start()
    return session
  }

  private start(): Promise<void> {
    const { pythonPath, scriptPath, token } = this.config
    if (pythonPath.trim() === '') throw new BaiduMcpError('未配置 Python 解释器路径')
    if (scriptPath.trim() === '') throw new BaiduMcpError('未配置 fileupload_tool.py 路径')

    const child = spawn(pythonPath, [scriptPath], {
      env: {
        ...process.env,
        BAIDU_NETDISK_ACCESS_TOKEN: token,
        PYTHONIOENCODING: 'utf-8',
        PYTHONUNBUFFERED: '1',
      },
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    this.child = child

    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => this.consume(chunk))
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk: string) => {
      this.stderrTail = (this.stderrTail + chunk).slice(-4000)
    })
    child.on('exit', (code) => {
      this.closed = true
      const detail = this.stderrTail.trim()
      for (const [, entry] of this.pending) {
        clearTimeout(entry.timer)
        entry.reject(new BaiduMcpError(`百度网盘 MCP 进程退出（code=${String(code)}）`, detail))
      }
      this.pending.clear()
    })
    child.on('error', (error) => {
      this.closed = true
      for (const [, entry] of this.pending) {
        clearTimeout(entry.timer)
        entry.reject(new BaiduMcpError(`启动百度网盘 MCP 失败：${error.message}`))
      }
      this.pending.clear()
    })

    return this.request('initialize', {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: 'dsh-backup-sync', version: '0.2.0' },
    }, START_TIMEOUT_MS)
      .then(() => {
        this.notify('notifications/initialized', {})
      })
      .catch((error: unknown) => {
        this.close()
        throw error
      })
  }

  private consume(chunk: string): void {
    this.buffer += chunk
    for (;;) {
      const newline = this.buffer.indexOf('\n')
      if (newline < 0) return
      const line = this.buffer.slice(0, newline).trim()
      this.buffer = this.buffer.slice(newline + 1)
      if (line === '') continue
      let envelope: RpcEnvelope
      try {
        envelope = JSON.parse(line) as RpcEnvelope
      } catch {
        continue
      }
      if (envelope.id === undefined) continue
      const entry = this.pending.get(envelope.id)
      if (entry === undefined) continue
      this.pending.delete(envelope.id)
      clearTimeout(entry.timer)
      if (envelope.error !== undefined) {
        entry.reject(new BaiduMcpError(`MCP 调用失败：${envelope.error.message}`, this.stderrTail.trim()))
      } else {
        entry.resolve(envelope.result)
      }
    }
  }

  private notify(method: string, params: unknown): void {
    const child = this.child
    if (child === undefined || this.closed) return
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`)
  }

  request(method: string, params: unknown, timeoutMs = 120_000): Promise<unknown> {
    const child = this.child
    if (child === undefined || this.closed) return Promise.reject(new BaiduMcpError('MCP 会话未建立或已关闭'))
    const id = this.nextId++
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new BaiduMcpError(`MCP 调用超时（${method}，${Math.round(timeoutMs / 1000)}s）`, this.stderrTail.trim()))
      }, timeoutMs)
      this.pending.set(id, { resolve, reject, timer })
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`)
    })
  }

  async listTools(): Promise<string[]> {
    const result = (await this.request('tools/list', {}, START_TIMEOUT_MS)) as
      | { tools?: Array<{ name?: string }> }
      | undefined
    return (result?.tools ?? []).map((tool) => String(tool.name ?? '')).filter((name) => name !== '')
  }

  async upload(localPath: string, remotePath: string, timeoutMs = 1_800_000): Promise<string> {
    const result = (await this.request('tools/call', {
      name: 'upload_file',
      arguments: { local_file_path: localPath, remote_path: remotePath },
    }, timeoutMs)) as { isError?: boolean; content?: Array<{ text?: string }> } | undefined
    const text = (result?.content ?? []).map((item) => item.text ?? '').join('\n').trim()
    if (result?.isError === true) throw new BaiduMcpError(`上传失败：${text === '' ? 'MCP 返回错误' : text}`, this.stderrTail.trim())
    return text
  }

  close(): void {
    this.closed = true
    const child = this.child
    this.child = undefined
    if (child !== undefined && child.exitCode === null) {
      try {
        child.stdin.end()
        child.kill()
      } catch {
        /* 进程已退出 */
      }
    }
  }
}

export interface BaiduPushResult {
  readonly uploaded: number
  readonly total: number
  readonly mode: 'nested' | 'flat'
  readonly warnings: readonly string[]
  readonly root: string
}

/**
 * 把本地快照推送到网盘。
 * 优先保留目录结构（`<dir>/<name>/<相对路径>`）；首个文件失败则退化为扁平命名，
 * 因为上传型 MCP 不提供 mkdir，目标子目录可能不存在。
 */
export async function pushSnapshotToBaidu(
  config: BaiduConfig,
  name: string,
  meta: SnapshotMeta,
  snapshotLocalDir: string,
  signal?: AbortSignal,
  onProgress?: (done: number, total: number, path: string) => void,
): Promise<BaiduPushResult> {
  const root = (config.dir?.trim() ?? '') === '' ? DEFAULT_BAIDU_DIR : config.dir!.trim().replace(/\/+$/, '')
  if (!root.startsWith('/')) throw new BaiduMcpError(`远端目录必须以 / 开头：${root}`)

  const session = await BaiduMcpSession.open(config)
  const warnings: string[] = []
  const total = meta.files.length + 1
  let uploaded = 0
  let mode: 'nested' | 'flat' = 'nested'

  const flatten = (rel: string): string => rel.replace(/[\\/]+/g, '__')

  try {
    for (const file of meta.files) {
      if (signal?.aborted === true) throw new BaiduMcpError('已取消')
      const local = safeJoin(snapshotLocalDir, file.path)
      const current = await stat(local)
      if (current.size !== file.size) throw new BaiduMcpError(`快照文件已变化，请重新创建快照：${file.path}`)

      const nestedPath = `${root}/${name}/${file.path}`
      try {
        if (mode === 'flat') throw new BaiduMcpError('flat')
        await session.upload(local, nestedPath)
      } catch (error) {
        if (mode === 'flat') throw error
        mode = 'flat'
        warnings.push(`目标目录不可写，改用扁平命名上传（${errorMessage(error)}）`)
        await session.upload(local, `${root}/${name}__${flatten(file.path)}`)
      }
      uploaded += 1
      onProgress?.(uploaded, total, file.path)
    }

    const metaLocal = safeJoin(snapshotLocalDir, 'meta.json')
    const metaPresent = await stat(metaLocal).then(() => true).catch(() => false)
    if (!metaPresent) await writeFile(metaLocal, `${JSON.stringify(meta, null, 2)}\n`, 'utf8')
    // 目录可写时 meta.json 归入快照目录；扁平模式或目录写入失败才退化到同级命名。
    if (mode === 'flat') {
      await session.upload(metaLocal, `${root}/${name}__meta.json`)
    } else {
      await session.upload(metaLocal, `${root}/${name}/meta.json`).catch(async () => {
        await session.upload(metaLocal, `${root}/${name}__meta.json`)
      })
    }
    onProgress?.(total, total, 'meta.json')
  } finally {
    session.close()
  }

  return { uploaded, total, mode, warnings, root }
}

/**
 * 把一个本地目录整棵推到网盘（项目快照用）：保留相对路径，逐文件 upload_file。
 * 首个文件失败则退化为扁平命名（上传型 MCP 不提供 mkdir）。
 */
export async function pushDirectoryToBaidu(
  config: BaiduConfig,
  remoteRoot: string,
  localRoot: string,
  signal?: AbortSignal,
  onProgress?: (done: number, total: number, path: string) => void,
): Promise<{ uploaded: number; total: number; mode: 'nested' | 'flat'; warnings: string[]; root: string }> {
  const root = remoteRoot.replace(/\/+$/, '')
  if (!root.startsWith('/')) throw new BaiduMcpError(`远端目录必须以 / 开头：${root}`)

  const items: string[] = []
  const walk = async (dir: string, rel: string): Promise<void> => {
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      const relPath = rel === '' ? entry.name : `${rel}/${entry.name}`
      if (entry.isDirectory()) await walk(join(dir, entry.name), relPath)
      else if (entry.isFile()) items.push(relPath)
    }
  }
  await walk(localRoot, '')

  const session = await BaiduMcpSession.open(config)
  const warnings: string[] = []
  let mode: 'nested' | 'flat' = 'nested'
  let uploaded = 0
  try {
    for (const rel of items) {
      if (signal?.aborted === true) throw new BaiduMcpError('已取消')
      const local = join(localRoot, rel)
      try {
        if (mode === 'flat') throw new BaiduMcpError('flat')
        await session.upload(local, `${root}/${rel}`)
      } catch (error) {
        if (mode === 'flat') throw error
        mode = 'flat'
        warnings.push(`目标目录不可写，改用扁平命名上传（${errorMessage(error)}）`)
        await session.upload(local, `${root}__${rel.replace(/[\\/]+/g, '__')}`)
      }
      uploaded += 1
      onProgress?.(uploaded, items.length, rel)
    }
  } finally {
    session.close()
  }
  return { uploaded, total: items.length, mode, warnings, root }
}

/** 连通性自检：启动 MCP、取工具清单、退出。 */
export async function testBaidu(config: BaiduConfig): Promise<{ tools: readonly string[]; hasToken: boolean }> {
  const session = await BaiduMcpSession.open(config)
  try {
    const tools = await session.listTools()
    return { tools, hasToken: config.token.trim() !== '' }
  } finally {
    session.close()
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof BaiduMcpError) return error.detail !== undefined && error.detail !== '' ? `${error.message} ${error.detail.slice(-200)}` : error.message
  if (error instanceof Error) return error.message
  return String(error)
}
