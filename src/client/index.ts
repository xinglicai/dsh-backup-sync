/**
 * 备份/恢复 + 跨机同步插件 —— browser 半区
 *
 * 设置页「备份同步」面板：
 *   - 备份位置：百度网盘（MCP）/ WebDAV
 *   - 百度网盘：填 AppKey + SecretKey → 点「一键获取 Token」→ 浏览器确认一次，
 *     插件用设备码流程自动取回 access_token + refresh_token 并落盘（之后自动续期）
 *   - 快照创建 / 推送 / 恢复 / 清理
 *
 * 数据面统一走 host 半区 POST /backup-sync/api（同源 fetch）。
 */
import * as React from 'react'

export const name = 'backup-sync-client'

export const inject = ['slots']

interface BaiduForm {
  token: string
  pythonPath: string
  scriptPath: string
  dir: string
  appKey: string
  secretKey: string
}

interface SettingsForm {
  backupRoot: string
  includeAttachments: boolean
  includeCredentials: boolean
  includeSessions: boolean
  includeStorages: boolean
  projectPaths: string[]
  projects: string[]
  autoIntervalMinutes: number
  autoKeep: number
  remoteKind: 'webdav' | 'baidu' | 'local'
  projectRemoteKind: 'webdav' | 'baidu' | 'local'
  remote: { baseUrl: string; username: string; password: string }
  baidu: BaiduForm
}

interface SnapshotRow {
  name: string
  createdAt: string
  valid: boolean
  hostname: string
  fileCount: number
  totalBytesLabel: string
}

interface TokenCheck {
  ok: boolean
  message: string
  netdiskName?: string
  errno?: number
}

const EMPTY: SettingsForm = {
  backupRoot: '',
  includeAttachments: false,
  includeCredentials: false,
  includeSessions: true,
  includeStorages: true,
  projectPaths: [],
  projects: [],
  autoIntervalMinutes: 0,
  autoKeep: 10,
  remoteKind: 'baidu',
  projectRemoteKind: 'local',
  remote: { baseUrl: '', username: '', password: '' },
  baidu: { token: '', pythonPath: '', scriptPath: '', dir: '/来自：mcp_server/dsh-backup', appKey: '', secretKey: '' },
}

const API_BASE = 'backup-sync/api/'

async function call<T>(method: string, body: unknown = {}): Promise<T> {
  const base = typeof document === 'undefined' ? 'http://127.0.0.1/' : document.baseURI
  const response = await fetch(new URL(API_BASE + method, base), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(body ?? {}),
  })
  const data = (await response.json().catch(() => ({ ok: false, error: `HTTP ${response.status}` }))) as {
    ok?: boolean
    error?: string
    message?: string
  }
  if (!response.ok || data.ok === false) throw new Error(String(data.error ?? data.message ?? `HTTP ${response.status}`))
  return data as T
}

const S = {
  wrap: { display: 'flex', flexDirection: 'column', gap: 14, padding: '4px 2px 24px 2px' } as React.CSSProperties,
  card: {
    border: '1px solid color-mix(in srgb, currentColor 14%, transparent)',
    borderRadius: 10,
    padding: '14px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  } as React.CSSProperties,
  cardTitle: { fontSize: 13, fontWeight: 600, opacity: 0.9, margin: 0 } as React.CSSProperties,
  hint: { fontSize: 12, lineHeight: 1.6, opacity: 0.62, margin: 0 } as React.CSSProperties,
  row: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' } as React.CSSProperties,
  label: { fontSize: 12, opacity: 0.72, minWidth: 104 } as React.CSSProperties,
  input: {
    flex: '1 1 240px',
    minWidth: 0,
    fontSize: 13,
    padding: '6px 9px',
    borderRadius: 7,
    border: '1px solid color-mix(in srgb, currentColor 20%, transparent)',
    background: 'color-mix(in srgb, currentColor 4%, transparent)',
    color: 'inherit',
    outline: 'none',
  } as React.CSSProperties,
  button: {
    fontSize: 13,
    padding: '6px 12px',
    borderRadius: 7,
    border: '1px solid color-mix(in srgb, currentColor 22%, transparent)',
    background: 'color-mix(in srgb, currentColor 8%, transparent)',
    color: 'inherit',
    cursor: 'pointer',
  } as React.CSSProperties,
  primary: {
    fontSize: 13,
    padding: '8px 16px',
    borderRadius: 7,
    border: '1px solid transparent',
    background: 'color-mix(in srgb, #4d6bfe 88%, transparent)',
    color: '#fff',
    cursor: 'pointer',
    fontWeight: 600,
  } as React.CSSProperties,
  code: {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: 20,
    letterSpacing: 3,
    padding: '8px 12px',
    borderRadius: 8,
    background: 'color-mix(in srgb, #4d6bfe 12%, transparent)',
    border: '1px solid color-mix(in srgb, #4d6bfe 40%, transparent)',
    userSelect: 'all' as const,
  },
  notice: (kind: 'ok' | 'err'): React.CSSProperties => ({
    fontSize: 12,
    lineHeight: 1.6,
    whiteSpace: 'pre-wrap',
    padding: '8px 10px',
    borderRadius: 7,
    border: `1px solid ${kind === 'ok' ? 'color-mix(in srgb, #2f9e44 45%, transparent)' : 'color-mix(in srgb, #e03131 45%, transparent)'}`,
    background: kind === 'ok'
      ? 'color-mix(in srgb, #2f9e44 10%, transparent)'
      : 'color-mix(in srgb, #e03131 10%, transparent)',
  }),
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: 12.5 },
  th: {
    textAlign: 'left' as const,
    padding: '6px 8px',
    opacity: 0.62,
    fontWeight: 500,
    borderBottom: '1px solid color-mix(in srgb, currentColor 14%, transparent)',
  },
  td: { padding: '6px 8px', borderBottom: '1px solid color-mix(in srgb, currentColor 8%, transparent)' },
}

function Field(props: {
  label: string
  value: string | number
  onChange: (value: string) => void
  type?: string
  placeholder?: string
}): React.ReactElement {
  return React.createElement(
    'label',
    { style: S.row },
    React.createElement('span', { style: S.label }, props.label),
    React.createElement('input', {
      style: S.input,
      type: props.type ?? 'text',
      value: String(props.value),
      placeholder: props.placeholder,
      onChange: (event: React.ChangeEvent<HTMLInputElement>) => props.onChange(event.target.value),
    }),
  )
}

function Toggle(props: { label: string; checked: boolean; onChange: (next: boolean) => void }): React.ReactElement {
  return React.createElement(
    'label',
    { style: { ...S.row, cursor: 'pointer' } },
    React.createElement('input', {
      type: 'checkbox',
      checked: props.checked,
      onChange: (event: React.ChangeEvent<HTMLInputElement>) => props.onChange(event.target.checked),
    }),
    React.createElement('span', { style: { fontSize: 12.5 } }, props.label),
  )
}

function formatBytesFrontend(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`
}

/** ISO 时间 → 本地时间（快照 createdAt 存的是 UTC，必须转本地再显示）。 */
function formatTime(input: string): string {
  if (input === '') return '—'
  const date = new Date(input)
  if (Number.isNaN(date.getTime())) return input
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

const PICKER_STYLE = {
  overlay: {
    position: 'fixed' as const,
    inset: 0,
    background: 'rgba(0,0,0,0.45)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
  },
  modal: {
    width: 560,
    maxWidth: '92vw',
    maxHeight: '82vh',
    overflow: 'auto',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 10,
    padding: '16px 18px',
    borderRadius: 12,
    background: 'var(--dsh-surface, #1e1f22)',
    color: 'var(--dsh-text, #e6e6e6)',
    border: '1px solid color-mix(in srgb, currentColor 18%, transparent)',
    boxShadow: '0 24px 64px rgba(0,0,0,0.45)',
  },
  entry: {
    textAlign: 'left' as const,
    fontSize: 13,
    padding: '5px 8px',
    borderRadius: 6,
    border: '1px solid transparent',
    background: 'transparent',
    color: 'inherit',
    cursor: 'pointer',
  },
}

/** 目录选择器：盘符 → 逐级进入 → 选择当前目录。 */
function DirectoryPicker(props: {
  title: string
  initial: string
  onPick: (path: string) => void
  onClose: () => void
}): React.ReactElement {
  const [path, setPath] = React.useState(props.initial)
  const [parent, setParent] = React.useState<string | null>(null)
  const [dirs, setDirs] = React.useState<Array<{ name: string; path: string }>>([])
  const [jump, setJump] = React.useState(props.initial)
  const [error, setError] = React.useState('')

  const load = async (target: string): Promise<void> => {
    try {
      const data = await call<{ path: string; parent: string | null; directories: Array<{ name: string; path: string }> }>(
        'fs.list',
        { path: target },
      )
      setPath(data.path)
      setParent(data.parent)
      setDirs(data.directories ?? [])
      setJump(data.path)
      setError('')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    }
  }

  React.useEffect(() => {
    void load(props.initial)
  }, [])

  return React.createElement(
    'div',
    {
      style: PICKER_STYLE.overlay,
      onMouseDown: (event: React.MouseEvent) => {
        if (event.target === event.currentTarget) props.onClose()
      },
    },
    React.createElement(
      'div',
      { style: PICKER_STYLE.modal },
      React.createElement(
        'div',
        { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
        React.createElement('strong', { style: { fontSize: 13 } }, props.title),
        React.createElement('button', { style: S.button, onClick: props.onClose }, '关闭'),
      ),
      React.createElement(
        'div',
        { style: S.row },
        React.createElement('input', {
          style: { ...S.input, flex: '1 1 240px' },
          value: jump,
          placeholder: '可直接粘贴绝对路径后回车',
          onChange: (event: React.ChangeEvent<HTMLInputElement>) => setJump(event.target.value),
          onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => {
            if (event.key === 'Enter') void load(jump)
          },
        }),
        React.createElement('button', { style: S.button, onClick: () => void load(jump) }, '跳转'),
        React.createElement('button', { style: S.button, onClick: () => void load('') }, '磁盘'),
      ),
      React.createElement('p', { style: S.hint }, path === '' ? '选择一个磁盘（或粘贴路径跳转）' : path),
      error === '' ? null : React.createElement('p', { style: { ...S.hint, color: '#e03131' } }, error),
      React.createElement(
        'div',
        { style: { display: 'flex', flexDirection: 'column', gap: 1, maxHeight: 320, overflow: 'auto' } },
        parent === null
          ? null
          : React.createElement('button', { style: PICKER_STYLE.entry, onClick: () => void load(parent) }, '⬆ 上一级'),
        ...dirs.map((dir) =>
          React.createElement('button', { key: dir.path, style: PICKER_STYLE.entry, onClick: () => void load(dir.path) }, `📁 ${dir.name}`)),
      ),
      React.createElement(
        'div',
        { style: { ...S.row, justifyContent: 'flex-end' } },
        React.createElement('button', { style: S.primary, disabled: path === '', onClick: () => props.onPick(path) }, '选择此目录'),
      ),
    ),
  )
}

/** 项目快照卡片：命名快照 / 整项目回滚 / 单文件回滚 / 删除。 */
function ProjectSnapshotsCard(props: {
  run: (label: string, action: () => Promise<string>) => Promise<void>
  pick: (initial: string, onPick: (path: string) => void) => void
  kind: 'webdav' | 'baidu' | 'local'
  onKind: (next: 'webdav' | 'baidu' | 'local') => void
}): React.ReactElement {
  const [path, setPath] = React.useState('')
  const [name, setName] = React.useState('')
  const [projects, setProjects] = React.useState<Array<{ path: string; snapshots: number }>>([])
  const [snapshots, setSnapshots] = React.useState<Array<{ name: string; createdAt: string; fileCount: number; totalBytes: number }>>([])
  const [openSnap, setOpenSnap] = React.useState('')
  const [files, setFiles] = React.useState<Array<{ path: string; size: number }>>([])
  const [busy, setBusy] = React.useState('')

  const wrap = (label: string, action: () => Promise<string>): Promise<void> => {
    setBusy(label)
    return props.run(label, action).finally(() => setBusy(''))
  }

  const loadProjects = async (): Promise<void> => {
    const data = await call<{ projects: Array<{ path: string; snapshots: number }> }>('projects.list')
    setProjects(data.projects ?? [])
  }

  const loadSnapshots = async (target: string): Promise<void> => {
    if (target.trim() === '') {
      setSnapshots([])
      return
    }
    const data = await call<{ snapshots: Array<{ name: string; createdAt: string; fileCount: number; totalBytes: number }> }>(
      'project.snapshots',
      { path: target },
    )
    setSnapshots(data.snapshots ?? [])
  }

  React.useEffect(() => {
    void loadProjects().catch(() => undefined)
  }, [])

  React.useEffect(() => {
    void loadSnapshots(path).catch(() => undefined)
  }, [path])

  const create = (): Promise<void> =>
    wrap('p-snap', async () => {
      if (path.trim() === '') throw new Error('先填写项目绝对路径')
      const data = await call<{ name: string; fileCount: number; totalBytesLabel: string; skipped: number }>(
        'project.snapshot',
        { path: path.trim(), name },
      )
      setName('')
      await loadSnapshots(path)
      await loadProjects()
      return `已建快照 ${data.name}：${data.fileCount} 文件 / ${data.totalBytesLabel}${data.skipped > 0 ? `（忽略 ${data.skipped} 项）` : ''}`
    })

  const restore = (snap: string): Promise<void> =>
    wrap(`p-restore:${snap}`, async () => {
      const data = await call<{ restored: number; removed: number; safeguard?: string }>('project.restore', { path: path.trim(), name: snap })
      await loadSnapshots(path)
      const guard = data.safeguard === undefined ? '' : `\n回滚前已建保险快照：${data.safeguard}`
      return `已回滚到 ${snap}：还原 ${data.restored} 文件${data.removed > 0 ? `，删除 ${data.removed}` : ''}${guard}`
    })

  const remove = (snap: string): Promise<void> =>
    wrap(`p-del:${snap}`, async () => {
      await call('project.remove', { path: path.trim(), name: snap })
      await loadSnapshots(path)
      if (openSnap === snap) setOpenSnap('')
      return `已删除快照 ${snap}`
    })

  const showFiles = (snap: string): Promise<void> =>
    wrap(`p-files:${snap}`, async () => {
      const data = await call<{ files: Array<{ path: string; size: number }> }>('project.files', { path: path.trim(), name: snap })
      setFiles(data.files ?? [])
      setOpenSnap(snap)
      return `快照 ${snap}：${(data.files ?? []).length} 个文件（点「恢复」可单文件回滚）`
    })

  const restoreFile = (snap: string, file: string): Promise<void> =>
    wrap(`p-file:${snap}`, async () => {
      await call('project.restoreFile', { path: path.trim(), name: snap, file })
      return `已恢复单文件：${file}`
    })

  const push = (snap: string): Promise<void> =>
    wrap(`p-push:${snap}`, async () => {
      const data = await call<{ text: string }>('project.push', { path: path.trim(), name: snap })
      return data.text ?? `已推送 ${snap}`
    })

  const disabled = busy !== ''

  return React.createElement(
    'div',
    { style: S.card },
    React.createElement('h3', { style: S.cardTitle }, '项目快照'),
    React.createElement(
      'div',
      { style: S.row },
      React.createElement('span', { style: S.label }, '备份到'),
      React.createElement(
        'select',
        {
          style: { ...S.input, flex: '0 0 200px' },
          value: props.kind,
          onChange: (event: React.ChangeEvent<HTMLSelectElement>) => {
            const next = event.target.value
            props.onKind(next === 'baidu' ? 'baidu' : next === 'webdav' ? 'webdav' : 'local')
          },
        },
        React.createElement('option', { value: 'local' }, '仅本地'),
        React.createElement('option', { value: 'baidu' }, '百度网盘（MCP）'),
        React.createElement('option', { value: 'webdav' }, 'WebDAV'),
      ),
    ),
    projects.length === 0
      ? null
      : React.createElement(
        'select',
        {
          style: { ...S.input, flex: '1 1 320px' },
          value: '',
          onChange: (event: React.ChangeEvent<HTMLSelectElement>) => {
            if (event.target.value !== '') setPath(event.target.value)
          },
        },
        React.createElement('option', { value: '' }, '选择已备份过的项目…'),
        ...projects.map((item) => React.createElement('option', { key: item.path, value: item.path }, `${item.path}（${item.snapshots} 个快照）`)),
      ),
    React.createElement(
      'div',
      { style: S.row },
      React.createElement('span', { style: S.label }, '项目路径'),
      React.createElement('input', {
        style: { ...S.input, flex: '1 1 300px' },
        value: path,
        placeholder: '点右侧「选择…」挑目录',
        onChange: (event: React.ChangeEvent<HTMLInputElement>) => setPath(event.target.value),
      }),
      React.createElement(
        'button',
        { style: S.button, disabled, onClick: () => props.pick(path, (picked: string) => setPath(picked)) },
        '选择…',
      ),
    ),
    React.createElement(Field, {
      label: '快照名',
      value: name,
      placeholder: '留空=时间戳；建议 PRE-CHANGE: 改登录逻辑',
      onChange: (value: string) => setName(value),
    }),
    React.createElement(
      'div',
      { style: S.row },
      React.createElement('button', { style: S.primary, disabled, onClick: () => void create() }, busy === 'p-snap' ? '快照中…' : '📸 建项目快照'),
      React.createElement(
        'button',
        { style: S.button, disabled, onClick: () => void wrap('p-refresh', async () => { await loadSnapshots(path); await loadProjects(); return '已刷新' }) },
        '刷新',
      ),
    ),
    React.createElement(
      'p',
      { style: S.hint },
      '默认忽略 node_modules / .git / dist / build / .venv / *.log 等；回滚前自动建 pre-restore 保险快照；默认只覆盖不删除文件。',
    ),
    snapshots.length === 0
      ? React.createElement('p', { style: S.hint }, '还没有项目快照')
      : React.createElement(
        'table',
        { style: S.table },
        React.createElement(
          'thead',
          null,
          React.createElement(
            'tr',
            null,
            ...['名称', '时间', '文件', '大小', '操作'].map((title) =>
              React.createElement('th', { key: title, style: S.th }, title)),
          ),
        ),
        React.createElement(
          'tbody',
          null,
          ...snapshots.map((snap) =>
            React.createElement(
              'tr',
              { key: snap.name },
              React.createElement('td', { style: S.td }, snap.name),
              React.createElement('td', { style: S.td }, snap.createdAt.replace('T', ' ').slice(0, 19)),
              React.createElement('td', { style: S.td }, String(snap.fileCount)),
              React.createElement('td', { style: S.td }, formatBytesFrontend(snap.totalBytes)),
              React.createElement(
                'td',
                { style: S.td },
                React.createElement(
                  'div',
                  { style: { display: 'flex', gap: 6 } },
                  React.createElement('button', { style: S.button, disabled, onClick: () => void restore(snap.name) }, '回滚项目'),
                  React.createElement('button', { style: S.button, disabled, onClick: () => void showFiles(snap.name) }, '文件'),
                  React.createElement(
                    'button',
                    { style: S.button, disabled: disabled || props.kind === 'local', onClick: () => void push(snap.name) },
                    busy === `p-push:${snap.name}` ? '推送中…' : '推送',
                  ),
                  React.createElement('button', { style: S.button, disabled, onClick: () => void remove(snap.name) }, '删除'),
                ),
              ),
            ),
          ),
        ),
      ),
    openSnap === ''
      ? null
      : React.createElement(
        'div',
        { style: { maxHeight: 240, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 4 } },
        ...files.slice(0, 300).map((file) =>
          React.createElement(
            'div',
            { key: file.path, style: { display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' } },
            React.createElement(
              'span',
              { style: { fontSize: 12, fontFamily: 'ui-monospace, Menlo, monospace', wordBreak: 'break-all' } },
              file.path,
            ),
            React.createElement(
              'button',
              { style: { ...S.button, padding: '2px 8px' }, disabled, onClick: () => void restoreFile(openSnap, file.path) },
              '恢复',
            ),
          ),
        ),
      ),
  )
}

/**
 * 会话顶部 Tab「备份」：管理**当前对话所属项目**的快照。
 * 项目路径优先由会话 id 反查（storages/workspace.json），也可手动选择。
 */
export function SessionBackupView(props?: { sessionId?: string }): React.ReactElement {
  const [projectPath, setProjectPath] = React.useState('')
  const [projectTitle, setProjectTitle] = React.useState('')
  const [kind, setKind] = React.useState<'webdav' | 'baidu' | 'local'>('local')
  const [allSettings, setAllSettings] = React.useState<Partial<SettingsForm> | null>(null)
  const [snapshots, setSnapshots] = React.useState<Array<{ name: string; createdAt: string; fileCount: number; totalBytes: number }>>([])
  const [snapName, setSnapName] = React.useState('')
  const [notice, setNotice] = React.useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [busy, setBusy] = React.useState('')
  const [picker, setPicker] = React.useState<{ initial: string; onPick: (path: string) => void } | null>(null)
  const [files, setFiles] = React.useState<Array<{ path: string; size: number }>>([])
  const [openSnap, setOpenSnap] = React.useState('')

  const report = (k: 'ok' | 'err', text: string): void => setNotice({ kind: k, text })
  const run = async (label: string, action: () => Promise<string>): Promise<void> => {
    setBusy(label)
    setNotice(null)
    try {
      report('ok', await action())
    } catch (error) {
      report('err', error instanceof Error ? error.message : String(error))
    } finally {
      setBusy('')
    }
  }

  const loadSnapshots = async (target: string): Promise<void> => {
    if (target.trim() === '') {
      setSnapshots([])
      return
    }
    const data = await call<{ snapshots: Array<{ name: string; createdAt: string; fileCount: number; totalBytes: number }> }>(
      'project.snapshots',
      { path: target },
    )
    setSnapshots(data.snapshots ?? [])
  }

  React.useEffect(() => {
    void (async () => {
      try {
        const data = await call<{ settings: Partial<SettingsForm> }>('settings.get')
        const incoming = data.settings ?? {}
        setAllSettings(incoming)
        const saved = incoming.projectRemoteKind ?? incoming.remoteKind
        setKind(saved === 'baidu' ? 'baidu' : saved === 'webdav' ? 'webdav' : 'local')
        const sessionId = props?.sessionId ?? ''
        if (sessionId !== '') {
          const resolved = await call<{ projectPath: string; title: string }>('session.project', { sessionId })
          if (resolved.projectPath !== '') {
            setProjectPath(resolved.projectPath)
            setProjectTitle(resolved.title)
            return
          }
        }
        // 会话映射缺失时退回默认工作区，避免面板空着
        const fallback = await call<{ projectPath: string; title: string }>('workspace.default')
        if (fallback.projectPath !== '') {
          setProjectPath(fallback.projectPath)
          setProjectTitle(fallback.title)
        }
      } catch {
        /* 首屏失败不阻塞手选 */
      }
    })()
  }, [])

  React.useEffect(() => {
    void loadSnapshots(projectPath).catch(() => undefined)
  }, [projectPath])

  const changeKind = (next: 'webdav' | 'baidu' | 'local'): void => {
    setKind(next)
    if (allSettings !== null) {
      setAllSettings({ ...allSettings, projectRemoteKind: next })
      void call('settings.save', { settings: { ...allSettings, projectRemoteKind: next } }).catch(() => undefined)
    }
  }

  const create = (): Promise<void> =>
    run('snap', async () => {
      if (projectPath.trim() === '') throw new Error('先选择项目目录')
      const data = await call<{ name: string; fileCount: number; totalBytesLabel: string; skipped: number }>('project.snapshot', {
        path: projectPath.trim(),
        name: snapName,
      })
      setSnapName('')
      await loadSnapshots(projectPath)
      return `已建快照 ${data.name}：${data.fileCount} 文件 / ${data.totalBytesLabel}${data.skipped > 0 ? `（忽略 ${data.skipped} 项）` : ''}`
    })

  const restore = (snap: string): Promise<void> =>
    run(`restore:${snap}`, async () => {
      const data = await call<{ restored: number; removed: number; safeguard?: string }>('project.restore', {
        path: projectPath.trim(),
        name: snap,
      })
      await loadSnapshots(projectPath)
      const guard = data.safeguard === undefined ? '' : `\n回滚前已建保险快照：${data.safeguard}`
      return `已回滚到 ${snap}：还原 ${data.restored} 文件${data.removed > 0 ? `，删除 ${data.removed}` : ''}${guard}`
    })

  const push = (snap: string): Promise<void> =>
    run(`push:${snap}`, async () => {
      const data = await call<{ text: string }>('project.push', { path: projectPath.trim(), name: snap })
      return data.text ?? `已推送 ${snap}`
    })

  const remove = (snap: string): Promise<void> =>
    run(`remove:${snap}`, async () => {
      await call('project.remove', { path: projectPath.trim(), name: snap })
      await loadSnapshots(projectPath)
      return `已删除快照 ${snap}`
    })

  const showFiles = (snap: string): Promise<void> =>
    run(`files:${snap}`, async () => {
      const data = await call<{ files: Array<{ path: string; size: number }> }>('project.files', { path: projectPath.trim(), name: snap })
      setFiles(data.files ?? [])
      setOpenSnap(snap)
      return `快照 ${snap}：${(data.files ?? []).length} 个文件`
    })

  /** 再点一次同一快照收起文件列表。 */
  const toggleFiles = (snap: string): Promise<void> => {
    if (openSnap === snap) {
      setOpenSnap('')
      setFiles([])
      setNotice(null)
      return Promise.resolve()
    }
    return showFiles(snap)
  }

  const openFolder = (snap: string): Promise<void> =>
    run(`open:${snap}`, async () => {
      const data = await call<{ path: string }>('project.open', { path: projectPath.trim(), name: snap })
      return `已打开备份文件夹：${data.path}`
    })

  const restoreFile = (snap: string, file: string): Promise<void> =>
    run('file', async () => {
      await call('project.restoreFile', { path: projectPath.trim(), name: snap, file })
      return `已恢复单文件：${file}`
    })

  const disabled = busy !== ''

  return React.createElement(
    'div',
    { style: S.wrap },
    React.createElement(
      'div',
      { style: S.card },
      React.createElement(
        'div',
        { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' } },
        React.createElement(
          'div',
          null,
          React.createElement('h3', { style: { ...S.cardTitle, fontSize: 14 } }, '当前对话的项目备份'),
          React.createElement(
            'p',
            { style: S.hint },
            projectTitle === '' ? '项目：未识别（可手动选择目录）' : `项目：${projectTitle}`,
          ),
        ),
        React.createElement(
          'div',
          { style: S.row },
          React.createElement('span', { style: { fontSize: 12, opacity: 0.72 } }, '备份到'),
          React.createElement(
            'select',
            {
              style: { ...S.input, flex: '0 0 170px' },
              value: kind,
              onChange: (event: React.ChangeEvent<HTMLSelectElement>) => {
                const next = event.target.value
                changeKind(next === 'baidu' ? 'baidu' : next === 'webdav' ? 'webdav' : 'local')
              },
            },
            React.createElement('option', { value: 'local' }, '仅本地'),
            React.createElement('option', { value: 'baidu' }, '百度网盘'),
            React.createElement('option', { value: 'webdav' }, 'WebDAV'),
          ),
        ),
      ),
      React.createElement(
        'div',
        { style: S.row },
        React.createElement('span', { style: S.label }, '项目路径'),
        React.createElement('input', {
          style: { ...S.input, flex: '1 1 280px' },
          value: projectPath,
          placeholder: '点「选择…」挑项目目录',
          onChange: (event: React.ChangeEvent<HTMLInputElement>) => setProjectPath(event.target.value),
        }),
        React.createElement(
          'button',
          { style: S.button, disabled, onClick: () => setPicker({ initial: projectPath, onPick: setProjectPath }) },
          '选择…',
        ),
      ),
      React.createElement(
        'div',
        { style: S.row },
        React.createElement('span', { style: S.label }, '快照名'),
        React.createElement('input', {
          style: { ...S.input, flex: '1 1 240px' },
          value: snapName,
          placeholder: '留空=时间戳；建议 PRE-CHANGE: 改了什么',
          onChange: (event: React.ChangeEvent<HTMLInputElement>) => setSnapName(event.target.value),
        }),
        React.createElement('button', { style: S.primary, disabled, onClick: () => void create() }, busy === 'snap' ? '快照中…' : '📸 建快照'),
        React.createElement(
          'button',
          { style: S.button, disabled, onClick: () => void run('refresh', async () => { await loadSnapshots(projectPath); return '已刷新' }) },
          '刷新',
        ),
      ),
      React.createElement(
        'p',
        { style: S.hint },
        '默认忽略 node_modules / .git / dist / build / .venv 等；回滚前自动建 pre-restore 保险快照；默认只覆盖不删文件。',
      ),
      notice === null ? null : React.createElement('div', { style: S.notice(notice.kind) }, notice.text),
    ),
    React.createElement(
      'div',
      { style: S.card },
      React.createElement('h3', { style: S.cardTitle }, `快照（${snapshots.length}）`),
      snapshots.length === 0
        ? React.createElement('p', { style: S.hint }, '还没有快照。建一张再改代码，随时能回滚。')
        : React.createElement(
          'table',
          { style: S.table },
          React.createElement(
            'thead',
            null,
            React.createElement(
              'tr',
              null,
              ...['名称', '时间', '文件', '大小', '操作'].map((title) =>
                React.createElement('th', { key: title, style: S.th }, title)),
            ),
          ),
          React.createElement(
            'tbody',
            null,
            ...snapshots.map((snap) =>
              React.createElement(
                'tr',
                { key: snap.name },
                React.createElement('td', { style: S.td }, snap.name),
                React.createElement('td', { style: S.td }, formatTime(snap.createdAt)),
                React.createElement('td', { style: S.td }, String(snap.fileCount)),
                React.createElement('td', { style: S.td }, formatBytesFrontend(snap.totalBytes)),
                React.createElement(
                  'td',
                  { style: S.td },
                  React.createElement(
                    'div',
                    { style: { display: 'flex', gap: 6, flexWrap: 'wrap' } },
                    React.createElement('button', { style: S.button, disabled, onClick: () => void restore(snap.name) }, '回滚'),
                    React.createElement(
                      'button',
                      { style: S.button, disabled, onClick: () => void toggleFiles(snap.name) },
                      openSnap === snap.name ? '收起' : '文件',
                    ),
                    React.createElement(
                      'button',
                      { style: S.button, disabled: disabled || kind === 'local', onClick: () => void push(snap.name) },
                      busy === `push:${snap.name}` ? '推送中…' : '推送',
                    ),
                    React.createElement('button', { style: S.button, disabled, onClick: () => void openFolder(snap.name) }, '打开'),
                    React.createElement('button', { style: S.button, disabled, onClick: () => void remove(snap.name) }, '删除'),
                  ),
                ),
              ),
            ),
          ),
        ),
      openSnap === ''
        ? null
        : React.createElement(
          'div',
          { style: { maxHeight: 260, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 3 } },
          ...files.slice(0, 300).map((file) =>
            React.createElement(
              'div',
              { key: file.path, style: { display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' } },
              React.createElement(
                'span',
                { style: { fontSize: 12, fontFamily: 'ui-monospace, Menlo, monospace', wordBreak: 'break-all' } },
                file.path,
              ),
              React.createElement(
                'button',
                { style: { ...S.button, padding: '2px 8px' }, disabled, onClick: () => void restoreFile(openSnap, file.path) },
                '恢复',
              ),
            ),
          ),
        ),
    ),
    picker === null
      ? null
      : React.createElement(DirectoryPicker, {
        title: '选择项目目录',
        initial: picker.initial,
        onPick: (picked: string) => {
          picker.onPick(picked)
          setPicker(null)
        },
        onClose: () => setPicker(null),
      }),
  )
}

export function BackupSyncSection(): React.ReactElement {
  const [form, setForm] = React.useState<SettingsForm>(EMPTY)
  const [settingsFile, setSettingsFile] = React.useState('')
  const [snapshots, setSnapshots] = React.useState<SnapshotRow[]>([])
  const [notice, setNotice] = React.useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [busy, setBusy] = React.useState('')
  const [tokenStatus, setTokenStatus] = React.useState('')
  const [advanced, setAdvanced] = React.useState(false)
  const [device, setDevice] = React.useState<{ userCode: string; url: string; qr: string } | null>(null)
  const [polling, setPolling] = React.useState(false)
  const [projectText, setProjectText] = React.useState('')
  const [importPath, setImportPath] = React.useState('')
  const [tab, setTab] = React.useState<'config' | 'project'>('project')
  const [picker, setPicker] = React.useState<{ title: string; initial: string; onPick: (path: string) => void } | null>(null)
  const [projectPath, setProjectPath] = React.useState('')
  const [projectName, setProjectName] = React.useState('')
  const [projectList, setProjectList] = React.useState<Array<{ path: string; snapshots: number; watched: boolean }>>([])
  const [projectSnapshots, setProjectSnapshots] = React.useState<Array<{ name: string; createdAt: string; fileCount: number; totalBytes: number; valid: boolean }>>([])
  const [openSnap, setOpenSnap] = React.useState('')
  const [snapFiles, setSnapFiles] = React.useState<Array<{ path: string; size: number }>>([])
  const timer = React.useRef<number | undefined>(undefined)

  const patch = (part: Partial<SettingsForm>): void => setForm((prev) => ({ ...prev, ...part }))
  const patchRemote = (part: Partial<SettingsForm['remote']>): void =>
    setForm((prev) => ({ ...prev, remote: { ...prev.remote, ...part } }))
  const patchBaidu = (part: Partial<BaiduForm>): void =>
    setForm((prev) => ({ ...prev, baidu: { ...prev.baidu, ...part } }))

  const report = (kind: 'ok' | 'err', text: string): void => setNotice({ kind, text })

  const pickDirectory = (initial: string, onPick: (path: string) => void): void => {
    setPicker({ title: '选择目录', initial: initial.trim() === '' ? '' : initial, onPick })
  }

  const hidden = (show: boolean): React.CSSProperties => (show ? {} : { display: 'none' })

  const run = async (label: string, action: () => Promise<string>): Promise<void> => {
    setBusy(label)
    setNotice(null)
    try {
      report('ok', await action())
    } catch (error) {
      report('err', error instanceof Error ? error.message : String(error))
    } finally {
      setBusy('')
    }
  }

  const tokenLine = (check: TokenCheck | undefined): string => {
    if (check === undefined) return ''
    const who = check.netdiskName === undefined ? '' : `（${check.netdiskName}）`
    return check.ok ? `Token 有效${who}` : `Token 无效：${check.message}`
  }

  const refreshSnapshots = async (): Promise<void> => {
    const data = await call<{ snapshots: SnapshotRow[] }>('snapshots.list')
    setSnapshots(data.snapshots ?? [])
  }

  const splitPaths = (raw: string): string[] =>
    raw.split(/[\r\n;]+/).map((entry) => entry.trim()).filter((entry) => entry !== '')

  const saveForm = async (): Promise<void> => {
    // 不再携带 projectPaths：项目备份已移到会话「备份」页签，避免把已有配置清空。
    await call('settings.save', { settings: form })
  }

  const reloadSettings = async (): Promise<void> => {
    const data = await call<{ settings: Partial<SettingsForm>; settingsFile: string }>('settings.get')
    const incoming = data.settings ?? {}
    setForm((prev) => ({
      ...prev,
      ...incoming,
      includeSessions: incoming.includeSessions ?? prev.includeSessions,
      includeStorages: incoming.includeStorages ?? prev.includeStorages,
      projectPaths: incoming.projectPaths ?? prev.projectPaths,
      projectRemoteKind: incoming.projectRemoteKind ?? prev.projectRemoteKind,
      remote: { ...EMPTY.remote, ...(incoming.remote ?? prev.remote) },
      baidu: { ...EMPTY.baidu, ...(incoming.baidu ?? prev.baidu) },
    }))
    setProjectText((incoming.projectPaths ?? []).join('\n'))
    setSettingsFile(data.settingsFile ?? '')
  }

  React.useEffect(() => {
    void (async () => {
      try {
        await reloadSettings()
        await refreshSnapshots()
      } catch (error) {
        report('err', `读取设置失败：${error instanceof Error ? error.message : String(error)}`)
      }
    })()
    return () => {
      if (timer.current !== undefined) window.clearInterval(timer.current)
    }
  }, [])

  /** 一键：申请设备码 → 打开授权页 → 轮询，成功后自动落盘。 */
  const startDevice = (): Promise<void> =>
    run('device', async () => {
      if (form.baidu.appKey.trim() === '') throw new Error('先填 AppKey')
      if (form.baidu.secretKey.trim() === '') throw new Error('先填 SecretKey')
      await saveForm()
      const data = await call<{ userCode: string; verificationUrl: string; qrcodeUrl: string; intervalSec: number }>(
        'baidu.deviceStart',
        {},
      )
      setDevice({ userCode: data.userCode, url: data.verificationUrl, qr: data.qrcodeUrl ?? '' })
      setPolling(true)
      try {
        window.open(data.verificationUrl, '_blank', 'noopener')
      } catch {
        /* 弹窗被拦时用户可点面板里的链接 */
      }
      if (timer.current !== undefined) window.clearInterval(timer.current)
      let ticks = 0
      timer.current = window.setInterval(() => {
        ticks += 1
        void (async () => {
          try {
            const polled = await call<{
              status: string
              check?: TokenCheck
              hasRefreshToken?: boolean
              message?: string
            }>('baidu.devicePoll', {})
            if (polled.status === 'pending') {
              setTokenStatus(`等待你在浏览器确认…（第 ${ticks} 次检查）`)
              return
            }
            if (timer.current !== undefined) window.clearInterval(timer.current)
            setPolling(false)
            setDevice(null)
            if (polled.status === 'success') {
              setTokenStatus(tokenLine(polled.check))
              await reloadSettings()
              report('ok', `Token 已自动获取并保存${polled.hasRefreshToken === true ? '（含 refresh_token，之后自动续期）' : ''}`)
            } else {
              report('err', polled.message ?? '授权未完成')
            }
          } catch (error) {
            if (timer.current !== undefined) window.clearInterval(timer.current)
            setPolling(false)
            report('err', error instanceof Error ? error.message : String(error))
          }
        })()
        if (ticks > 120) {
          if (timer.current !== undefined) window.clearInterval(timer.current)
          setPolling(false)
        }
      }, Math.max(3, data.intervalSec ?? 5) * 1000)
      return `已发起授权：请在打开的页面输入短码 ${data.userCode}（或扫码），确认后这里会自动拿到 Token`
    })

  const checkNow = (): Promise<void> =>
    run('check', async () => {
      const data = await call<{ check: TokenCheck }>('baidu.check')
      setTokenStatus(tokenLine(data.check))
      return tokenLine(data.check)
    })

  const refreshNow = (): Promise<void> =>
    run('refresh', async () => {
      const data = await call<{ check: TokenCheck }>('baidu.refresh')
      setTokenStatus(tokenLine(data.check))
      return data.check?.ok === true ? `已续期：${tokenLine(data.check)}` : `续期失败：${data.check?.message ?? '未知'}`
    })

  const testBaidu = (): Promise<void> =>
    run('test', async () => {
      await saveForm()
      const data = await call<{ tools: string[]; check: TokenCheck }>('baidu.test', {})
      setTokenStatus(tokenLine(data.check))
      return `百度网盘 MCP 连通，工具：${(data.tools ?? []).join(', ') || '（无）'}\n${tokenLine(data.check)}`
    })

  const save = (): Promise<void> =>
    run('save', async () => {
      await saveForm()
      await refreshSnapshots()
      return '设置已保存（立即生效）'
    })

  const createSnapshot = (): Promise<void> =>
    run('create', async () => {
      const data = await call<{ text: string }>('backup.create', {})
      await refreshSnapshots()
      return data.text ?? '快照已创建'
    })

  const pushSnapshot = (name: string): Promise<void> =>
    run(`push:${name}`, async () => {
      const data = await call<{ text: string }>('backup.push', { name })
      return data.text ?? `已推送 ${name}`
    })

  const restoreSnapshot = (name: string): Promise<void> =>
    run(`restore:${name}`, async () => {
      const data = await call<{ restored: string[]; skipped: string[]; safeguardName?: string }>('backup.restore', { name })
      const head = data.safeguardName === undefined ? '' : `保险快照：${data.safeguardName}\n`
      const skipped = (data.skipped ?? []).length > 0 ? `\n未恢复：${data.skipped.join('、')}` : ''
      return `${head}已恢复：${(data.restored ?? []).join('、') || '（无）'}${skipped}`
    })

  const prune = (): Promise<void> =>
    run('prune', async () => {
      const data = await call<{ removed: number }>('backup.prune', { keep: form.autoKeep })
      await refreshSnapshots()
      return `已清理 ${data.removed} 个旧快照`
    })

  const openSnapshotFolder = (name: string): Promise<void> =>
    run(`open:${name}`, async () => {
      const data = await call<{ path: string }>('backup.open', { name })
      return `已打开备份文件夹：${data.path}`
    })

  const removeSnapshot = (name: string): Promise<void> =>
    run(`remove:${name}`, async () => {
      await call('backup.remove', { name })
      await refreshSnapshots()
      return `已删除快照 ${name}`
    })

  const importBackup = (): Promise<void> =>
    run('import', async () => {
      if (importPath.trim() === '') throw new Error('填写要导入的快照目录路径（含 meta.json）')
      const data = await call<{ name: string; fileCount: number }>('backup.import', { path: importPath.trim() })
      await refreshSnapshots()
      return `已导入快照 ${data.name}（${data.fileCount} 文件），可在列表里直接「恢复」`
    })

  const disabled = busy !== '' || polling

  return React.createElement(
    'div',
    { style: S.wrap },
    // 设置页只负责：全局（整机配置）备份 + 备份参数；项目备份在会话顶部「备份」页签。
    React.createElement(
      'div',
      { style: { display: 'flex', alignItems: 'baseline', gap: 8, paddingBottom: 4, borderBottom: '1px solid color-mix(in srgb, currentColor 12%, transparent)' } },
      React.createElement('strong', { style: { fontSize: 13 } }, '本机配置快照'),
      React.createElement('span', { style: { fontSize: 12, opacity: 0.6 } }, '会话/工作区/配置；项目文件回滚在会话顶部「备份」页签'),
    ),
    React.createElement(
      'div',
      null,
      React.createElement(
        'div',
        { style: { ...S.card, marginTop: 10 } },
        React.createElement('h3', { style: S.cardTitle }, '备份位置'),
      React.createElement(
        'label',
        { style: S.row },
        React.createElement('span', { style: S.label }, '备份到'),
        React.createElement(
          'select',
          {
            style: { ...S.input, flex: '0 0 200px' },
            value: form.remoteKind,
            onChange: (event: React.ChangeEvent<HTMLSelectElement>) =>
              patch({ remoteKind: event.target.value === 'webdav' ? 'webdav' : 'baidu' }),
          },
          React.createElement('option', { value: 'baidu' }, '百度网盘（MCP）'),
          React.createElement('option', { value: 'webdav' }, 'WebDAV'),
          React.createElement('option', { value: 'local' }, '仅本地（不推送）'),
        ),
      ),
      React.createElement(
        'div',
        { style: S.row },
        React.createElement('span', { style: S.label }, '本地快照目录'),
        React.createElement('input', {
          style: { ...S.input, flex: '1 1 300px' },
          value: form.backupRoot,
          placeholder: '留空 = $DSH_HOME/backups',
          onChange: (event: React.ChangeEvent<HTMLInputElement>) => patch({ backupRoot: event.target.value }),
        }),
        React.createElement(
          'button',
          {
            style: S.button,
            onClick: () => pickDirectory(form.backupRoot, (picked: string) => {
              patch({ backupRoot: picked })
              void saveForm()
            }),
          },
          '选择…',
        ),
      ),
    ),

    form.remoteKind === 'baidu'
      ? React.createElement(
        'div',
        { style: S.card },
        React.createElement('h3', { style: S.cardTitle }, '百度网盘（MCP）'),
        React.createElement(Field, {
          label: 'AppKey',
          value: form.baidu.appKey,
          placeholder: '开放平台「应用凭据」里的 AppKey',
          onChange: (value: string) => patchBaidu({ appKey: value }),
        }),
        React.createElement(Field, {
          label: 'SecretKey',
          value: form.baidu.secretKey,
          type: 'password',
          placeholder: '开放平台「应用凭据」里的 SecretKey',
          onChange: (value: string) => patchBaidu({ secretKey: value }),
        }),
        React.createElement(
          'div',
          { style: S.row },
          React.createElement(
            'button',
            { style: S.primary, disabled, onClick: () => void startDevice() },
            busy === 'device' ? '申请中…' : polling ? '等待授权确认…' : '⚡ 一键获取 Token',
          ),
          tokenStatus === '' ? null : React.createElement('span', { style: { fontSize: 12, opacity: 0.75 } }, tokenStatus),
        ),
        device === null
          ? null
          : React.createElement(
            'div',
            { style: { ...S.card, background: 'color-mix(in srgb, currentColor 4%, transparent)' } },
            React.createElement(
              'p',
              { style: S.hint },
              '① 在打开的页面登录百度账号并确认，短码填下面这串（或直接扫码）：',
            ),
            React.createElement('div', { style: S.code }, device.userCode),
            React.createElement(
              'div',
              { style: S.row },
              React.createElement(
                'a',
                { href: device.url, target: '_blank', rel: 'noreferrer noopener', style: { color: '#4d6bfe', fontSize: 12.5 } },
                device.url,
              ),
              device.qr === ''
                ? null
                : React.createElement(
                  'a',
                  { href: device.qr, target: '_blank', rel: 'noreferrer noopener', style: { color: '#4d6bfe', fontSize: 12.5 } },
                  '扫码授权',
                ),
            ),
          ),
        React.createElement(
          'button',
          {
            style: { ...S.button, alignSelf: 'flex-start', background: 'transparent', border: 'none', paddingLeft: 0, opacity: 0.7 },
            onClick: () => setAdvanced((prev) => !prev),
          },
          advanced ? '▾ 收起高级设置' : '▸ 高级设置（网盘目录 / MCP 运行时 / 手工 Token）',
        ),
        advanced
          ? React.createElement(
            'div',
            { style: { display: 'flex', flexDirection: 'column', gap: 10 } },
            React.createElement(Field, {
              label: '网盘目录',
              value: form.baidu.dir,
              placeholder: '/来自：mcp_server/dsh-backup',
              onChange: (value: string) => patchBaidu({ dir: value }),
            }),
            React.createElement(Field, {
              label: 'Python',
              value: form.baidu.pythonPath,
              placeholder: 'C:\\...\\.venv\\Scripts\\python.exe',
              onChange: (value: string) => patchBaidu({ pythonPath: value }),
            }),
            React.createElement(Field, {
              label: 'MCP 脚本',
              value: form.baidu.scriptPath,
              placeholder: 'C:\\...\\fileupload_tool.py',
              onChange: (value: string) => patchBaidu({ scriptPath: value }),
            }),
            React.createElement(Field, {
              label: '手工 Token',
              value: form.baidu.token,
              type: 'password',
              placeholder: '一般不用填：一键获取会写入',
              onChange: (value: string) => patchBaidu({ token: value }),
            }),
            React.createElement(
              'div',
              { style: S.row },
              React.createElement('button', { style: S.button, disabled, onClick: () => void checkNow() }, '校验 Token'),
              React.createElement('button', { style: S.button, disabled, onClick: () => void refreshNow() }, '刷新 Token'),
              React.createElement('button', { style: S.button, disabled, onClick: () => void testBaidu() }, '测试 MCP 连接'),
            ),
          )
          : null,
        React.createElement(
          'p',
          { style: S.hint },
          'Token 与 refresh_token 存在 $DSH_HOME/backup-sync.settings.json；到期前 10 分钟自动续期，上传遇到失效会自动续期重试一次。',
        ),
      )
      : form.remoteKind === 'webdav'
      ? React.createElement(
        'div',
        { style: S.card },
        React.createElement('h3', { style: S.cardTitle }, 'WebDAV'),
        React.createElement(Field, {
          label: '地址',
          value: form.remote.baseUrl,
          placeholder: 'https://dav.example.com/remote.php/dav/files/user/dsh-backups',
          onChange: (value: string) => patchRemote({ baseUrl: value }),
        }),
        React.createElement(Field, {
          label: '用户名',
          value: form.remote.username,
          placeholder: '留空 = 凭据 WEBDAV_USERNAME',
          onChange: (value: string) => patchRemote({ username: value }),
        }),
        React.createElement(Field, {
          label: '密码',
          value: form.remote.password,
          type: 'password',
          placeholder: '留空 = 凭据 WEBDAV_PASSWORD',
          onChange: (value: string) => patchRemote({ password: value }),
        }),
      )
      : null,

    React.createElement(
      'div',
      { style: S.card },
      React.createElement('h3', { style: S.cardTitle }, '自动备份与范围'),
      React.createElement(Field, {
        label: '间隔（分钟）',
        value: form.autoIntervalMinutes,
        type: 'number',
        placeholder: '0 = 关闭',
        onChange: (value: string) => patch({ autoIntervalMinutes: Number(value) || 0 }),
      }),
      React.createElement(Field, {
        label: '保留快照数',
        value: form.autoKeep,
        type: 'number',
        placeholder: '0 = 不清理',
        onChange: (value: string) => patch({ autoKeep: Number(value) || 0 }),
      }),
      React.createElement(Toggle, {
        label: '备份会话日志（sessions）',
        checked: form.includeSessions,
        onChange: (next) => patch({ includeSessions: next }),
      }),
      React.createElement(Toggle, {
        label: '备份工作区数据（storages：工作区注册、任务索引）',
        checked: form.includeStorages,
        onChange: (next) => patch({ includeStorages: next }),
      }),
      React.createElement(Toggle, {
        label: '包含附件（attachments：聊天里上传的文件副本）',
        checked: form.includeAttachments,
        onChange: (next) => patch({ includeAttachments: next }),
      }),
      React.createElement(Toggle, {
        label: '包含凭据文件（.credentials.yaml，含明文密钥）',
        checked: form.includeCredentials,
        onChange: (next) => patch({ includeCredentials: next }),
      }),
      React.createElement(
        'p',
        { style: S.hint },
        '项目文件备份不在这里：打开任意会话，顶部「备份」页签管理当前对话项目的快照与回滚。',
      ),
    ),

    React.createElement(
      'div',
      { style: S.row },
      React.createElement('button', { style: S.primary, disabled, onClick: () => void save() }, busy === 'save' ? '保存中…' : '保存设置'),
      React.createElement('button', { style: S.button, disabled, onClick: () => void createSnapshot() }, busy === 'create' ? '创建中…' : '立即创建快照'),
      React.createElement('button', { style: S.button, disabled, onClick: () => void prune() }, '清理旧快照'),
      React.createElement(
        'button',
        {
          style: S.button,
          disabled,
          onClick: () => void run('refresh-list', async () => {
            await refreshSnapshots()
            return '列表已刷新'
          }),
        },
        '刷新列表',
      ),
    ),

    React.createElement(
      'div',
      { style: S.card },
      React.createElement('h3', { style: S.cardTitle }, `本地快照（${snapshots.length}）`),
      React.createElement(
        'div',
        { style: S.row },
        React.createElement('input', {
          style: { ...S.input, flex: '1 1 320px' },
          value: importPath,
          placeholder: '导入本地备份：快照目录绝对路径（含 meta.json，或网盘下载回来的目录）',
          onChange: (event: React.ChangeEvent<HTMLInputElement>) => setImportPath(event.target.value),
        }),
        React.createElement(
          'button',
          { style: S.button, onClick: () => pickDirectory(importPath, (picked: string) => setImportPath(picked)) },
          '选择…',
        ),
        React.createElement(
          'button',
          { style: S.button, disabled, onClick: () => void importBackup() },
          busy === 'import' ? '导入中…' : '导入本地备份',
        ),
      ),
      snapshots.length === 0
        ? React.createElement('p', { style: S.hint }, '暂无快照，点「立即创建快照」。')
        : React.createElement(
          'table',
          { style: S.table },
          React.createElement(
            'thead',
            null,
            React.createElement(
              'tr',
              null,
              React.createElement('th', { style: S.th }, '名称'),
              React.createElement('th', { style: S.th }, '创建时间'),
              React.createElement('th', { style: S.th }, '大小'),
              React.createElement('th', { style: S.th }, '操作'),
            ),
          ),
          React.createElement(
            'tbody',
            null,
            ...snapshots.map((row) =>
              React.createElement(
                'tr',
                { key: row.name },
                React.createElement('td', { style: S.td }, row.name),
                React.createElement('td', { style: S.td }, formatTime(row.createdAt)),
                React.createElement(
                  'td',
                  { style: S.td },
                  row.valid ? `${row.fileCount} 文件 / ${row.totalBytesLabel}` : '元数据缺失',
                ),
                React.createElement(
                  'td',
                  { style: S.td },
                  React.createElement(
                    'div',
                    { style: { display: 'flex', gap: 6, flexWrap: 'wrap' } },
                    React.createElement(
                      'button',
                      { style: S.button, disabled, onClick: () => void pushSnapshot(row.name) },
                      busy === `push:${row.name}` ? '推送中…' : '推送到远端',
                    ),
                    React.createElement(
                      'button',
                      { style: S.button, disabled, onClick: () => void restoreSnapshot(row.name) },
                      busy === `restore:${row.name}` ? '恢复中…' : '恢复',
                    ),
                    React.createElement(
                      'button',
                      { style: S.button, disabled, onClick: () => void openSnapshotFolder(row.name) },
                      '打开',
                    ),
                    React.createElement(
                      'button',
                      { style: S.button, disabled, onClick: () => void removeSnapshot(row.name) },
                      busy === `remove:${row.name}` ? '删除中…' : '删除',
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      settingsFile === '' ? null : React.createElement('p', { style: S.hint }, `配置文件：${settingsFile}`),
    ),
    ),
    notice === null ? null : React.createElement('div', { style: S.notice(notice.kind) }, notice.text),
    picker === null
      ? null
      : React.createElement(DirectoryPicker, {
        title: picker.title,
        initial: picker.initial,
        onPick: (picked: string) => {
          picker.onPick(picked)
          setPicker(null)
        },
        onClose: () => setPicker(null),
      }),
  )
}

export function apply(ctx: {
  slots: {
    inject(name: string, callback: () => () => void): void
    register(spec: Record<string, unknown>, component: unknown): () => void
  }
}): void {
  ctx.slots.inject('settings.section', () =>
    ctx.slots.register({
      name: 'settings.section',
      id: 'backup-sync',
      order: 120,
      label: () => '备份同步',
    }, BackupSyncSection))

  // 会话顶部 Tab：管理当前对话所属项目的备份
  ctx.slots.inject('conversation.view', () =>
    ctx.slots.register({
      name: 'conversation.view',
      id: 'backup',
      order: 100,
      label: () => '备份',
      // 框架按 sessionId 调用 inject，返回值作为组件 props —— 会话页签靠它识别当前工作区。
      inject: (sessionId: string) => ({ sessionId }),
    }, SessionBackupView))
}
