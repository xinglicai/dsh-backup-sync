# dsh-backup-sync

DeepSeek Harness（DSH）的**备份/恢复插件**，两条独立链路：

1. **本机配置快照** —— 把整个 `$DSH_HOME` 的关键数据（会话、工作区数据、配置层）打成快照，换机/重装后一键还原。
2. **项目文件快照** —— 在会话顶部「备份」页签里，对当前开发项目做命名快照，改坏了随时回滚（整项目或单文件）。

备份目标三选一：**仅本地 / 百度网盘（MCP）/ WebDAV**。

---

## 功能

### 本机配置快照（设置 → 备份同步）

- 备份内容：`sessions/`（会话日志）、`storages/`（工作区注册与任务索引）、配置层（`settings.yaml`、`cordis.patch.yml`、本插件设置、各 profile 的 `cordis.patch.yml` / `package.json` / `pnpm-workspace.yaml`）
- 可选：`attachments/`（对话里上传的文件副本）、`.credentials.yaml`（含明文密钥，默认关）
- 每个快照带 `meta.json` 清单（路径/大小/修改时间），恢复前自动建 `…-pre-restore` 保险快照
- 时间显示为本地时间；列表支持 **推送到远端 / 恢复 / 打开文件夹 / 删除**
- 支持从任意目录 **导入已有快照**（含 `meta.json` 的快照目录），导入后可直接恢复

### 项目文件快照（会话顶部「备份」页签）

- **自动识别当前对话的项目**：按会话 id 反查 `storages/workspace.json` 的 `sessionIds` → 工作区路径；识别不到时回落到默认工作区，也可手动选目录
- **命名快照**：建议写成 `PRE-CHANGE: 改了什么`（冒号会自动转成 `-`，Windows 目录名合法）
- **整项目回滚**：默认 *overwrite*（覆盖+补齐，不动你新写的文件）；也可选 *exact*（严格还原，删除快照里不存在的文件）
- **单文件回滚**：点「文件」展开快照内容，逐个恢复；再点一次「收起」
- **回滚前自动保险快照**：`pre-restore-<时间戳>`
- **忽略规则**：默认跳过 `node_modules`、`.git`、`dist`、`build`、`.venv`、`target`、`__pycache__`、`*.log` 等 24 项，可在配置里追加
- 列表支持 **回滚 / 文件 / 推送 / 打开 / 删除**

### 备份目标

| 目标 | 说明 |
|---|---|
| 仅本地 | 只写本地磁盘，不推送；点推送会提示"仅本地模式" |
| 百度网盘（MCP） | 通过百度网盘 MCP 的 `upload_file` 上传；支持**设备码一键获取 Token**，含 `refresh_token` 自动续期 |
| WebDAV | Nextcloud / 坚果云 / 群晖等；逐文件 PUT，自动逐级 MKCOL |

> 百度 MCP 是**上传型**（只暴露 `upload_file`）：能推到网盘、能在网盘里看到，但**不能从网盘拉回**。要跨机取回，请用 WebDAV 后端。

---

## 安装

### 方式一：从源码链接安装（开发/本地）

```powershell
# 1) 克隆
git clone https://github.com/xinglicai/dsh-backup-sync.git "$env:USERPROFILE\.dsh\plugins-src\dsh-backup-sync"

# 2) 构建（需要 Node >= 22）
cd "$env:USERPROFILE\.dsh\plugins-src\dsh-backup-sync"
pnpm install --prod=false
pnpm build          # 产出 lib/index.js 与 lib/client.js

# 3) 链到桌面 profile
$deploy = "$env:USERPROFILE\.dsh\profiles\desktop\.dsh-plugins\dsh-backup-sync"
New-Item -ItemType Directory -Force -Path $deploy | Out-Null
Copy-Item lib,$deploy -Recurse -Force
Copy-Item package.json,cordis.patch.yml $deploy -Force

# 4) 用 link: 依赖接入 profile（避免 pnpm 下次 install 把目录 prune 掉）
cd "$env:USERPROFILE\.dsh\profiles\desktop"
# 在 package.json 的 dependencies 里加：
#   "@dsh-external/dsh-backup-sync": "link:.dsh-plugins/dsh-backup-sync"
# 在 dsh.profile.bundles 末尾加：
#   "@dsh-external/dsh-backup-sync"
pnpm install
```

重启 DSH 生效。

### 方式二：插件市场安装

在 DSH「插件」页搜索 `backup-sync`（若已上架），或在 profile 的 `package.json` 里加依赖后 `pnpm install`。

### 依赖

- DSH `0.2.1-rc.3`（peer 依赖按此版本对齐；旧版本需自行放宽 peer 范围）
- Node.js `>= 22`
- 百度网盘后端额外需要：本地 Python 3 + `mcp` 包（`pip install "mcp<2"`）与 `fileupload_tool.py`

---

## 配置

### 设置面板（设置 → 备份同步）

面板是可视化配置，写入 `$DSH_HOME/backup-sync.settings.json`（**不写入** profile 的 `cordis.patch.yml`）。

| 项 | 说明 |
|---|---|
| 备份到 | 百度网盘（MCP）/ WebDAV / 仅本地 |
| 本地快照目录 | 留空 = `$DSH_HOME/backups`（可点「选择…」挑目录） |
| AppKey / SecretKey | 百度开放平台「应用凭据」里的值，用于一键换 Token |
| ⚡ 一键获取 Token | 设备码流程：申请短码 → 浏览器确认 → 自动写入 `access_token` + `refresh_token` |
| 间隔（分钟） | 自动快照频率，`0` = 关闭 |
| 保留快照数 | 超出后自动清理最旧的，`0` = 不清理 |
| 备份会话日志 / 工作区数据 / 附件 / 凭据 | 备份范围开关 |
| 导入本地备份 | 选一个含 `meta.json` 的快照目录导入进快照库 |

### 配置键（cordis.patch.yml 的 `backup-sync` 行）

| 键 | 默认 | 说明 |
|---|---|---|
| `backupRoot` | `$DSH_HOME/backups` | 本地快照根目录 |
| `remoteKind` | `webdav` | `webdav` / `baidu` / `local` |
| `projectRemoteKind` | 继承 `remoteKind` | 项目快照的推送目标 |
| `includeSessions` | `true` | 备份 `sessions/` |
| `includeStorages` | `true` | 备份 `storages/` |
| `includeAttachments` | `false` | 备份 `attachments/` |
| `includeCredentials` | `false` | 备份 `.credentials.yaml` |
| `autoIntervalMinutes` | `0` | 自动备份间隔 |
| `autoKeep` | `10` | 保留快照数量 |
| `projects` | `[]` | 长期跟踪的项目目录（用于项目快照列表） |
| `projectIgnores` | `[]` | 项目快照的额外忽略 glob |
| `remote.baseUrl` / `username` / `password` | — | WebDAV 连接信息（密码建议走凭据 `WEBDAV_PASSWORD`） |
| `baidu.token` / `refreshToken` / `tokenExpiresAt` / `appKey` / `secretKey` / `dir` / `pythonPath` / `scriptPath` | — | 百度网盘后端 |

### 百度网盘 Token 的三种来源

1. **一键获取（推荐）**：设置页填 AppKey + SecretKey → 点「⚡ 一键获取 Token」→ 浏览器输入 8 位短码确认 → 自动保存（含 `refresh_token`，到期前 10 分钟自动续期）
2. **手工填**：高级设置里直接粘贴 `access_token`（无 refresh，30 天后失效）
3. **MCP 侧配置**：`~/.dsh/cordis.patch.yml` 里 `baidu-netdisk-upload`（stdio）与 `baidu-netdisk`（SSE）两处的 token

---

## 使用

### 备份/还原整机配置

```
设置 → 备份同步 → [立即创建快照]
              → 快照列表 → 恢复（勾选配置层时连 cordis.patch.yml 一起还原）
```

对应的斜杠命令：

```
/backup                     建快照（默认时间戳名）
/backup <名字>              建命名快照
/backup list                列出本地快照
/backup push <名字>         推送到远端
/backup restore <名字>      恢复（--all 连配置一起）
/backup prune <保留数>      清理旧快照
```

### 项目文件回滚

```
任意会话 → 顶部「备份」页签
  项目：default-workspace           ← 自动识别
  快照名：PRE-CHANGE: 改登录逻辑
  [📸 建快照]
  列表 → 回滚 / 文件 / 推送 / 打开 / 删除
```

改代码前的建议流程：

1. 建一张 `PRE-CHANGE: <要做什么>` 快照
2. 改代码、跑测试
3. 崩了 → 「回滚」回滚整项目；只想退一个文件 → 「文件」→ 该文件「恢复」

---

## 目录布局

```
<backupRoot>/                        默认 $DSH_HOME/backups
├─ snapshots/<快照名>/               整机配置快照
│   ├─ meta.json                     { files:[{path,size,mtimeMs}], createdAt(UTC), hostname }
│   ├─ sessions/  storages/  configs/
│   └─ attachments/  credentials/    可选
└─ projects/<项目键>/<快照名>/        项目快照（项目键 = 路径安全化，如 D--work--my-app）
    ├─ meta.json                     { projectPath, files[], ignores[] }
    └─ files/...                     项目文件副本（相对路径原样）
```

远端（百度网盘 / WebDAV）：

```
<网盘目录>/dsh-backup/<快照名>/…                     整机快照
<网盘目录>/dsh-backup/projects/<项目键>/<快照名>/…   项目快照
```

---

## HTTP API（面板背后的接口）

同源 `POST /backup-sync/api/<method>`，JSON body；设置页与会话页签都走它，也可供脚本/AI 调用：

| method | 作用 |
|---|---|
| `settings.get` / `settings.save` | 读/写可写设置层 |
| `snapshots.list` / `backup.create` / `backup.push` / `backup.restore` / `backup.prune` / `backup.remove` / `backup.import` | 整机快照生命周期 |
| `backup.open` / `project.open` | 在系统文件管理器打开备份目录 |
| `projects.list` / `project.snapshots` / `project.snapshot` / `project.files` / `project.restore` / `project.restoreFile` / `project.push` / `project.remove` | 项目快照生命周期 |
| `session.project` | 会话 id → 项目路径（读 `storages/workspace.json`） |
| `workspace.default` | 默认工作区路径 |
| `baidu.test` / `baidu.check` / `baidu.refresh` / `baidu.deviceStart` / `baidu.devicePoll` | 百度网盘 Token 与连通性 |
| `fs.list` | 目录浏览（供「选择…」用，只返回目录） |

AI 侧的"改前必照"可以这样接：

```bash
curl -s -X POST http://127.0.0.1:<port>/backup-sync/api/project.snapshot \
  -H 'content-type: application/json' \
  -d '{"path":"D:\\work\\my-app","name":"PRE-CHANGE: 改登录逻辑"}'
```

---

## 边界与注意事项

- **项目文件不参与 `restore --all`**：整机恢复只还原会话/工作区数据/配置，**不会**覆盖你的源码目录；项目回滚必须显式在会话页签点「回滚」。
- **百度网盘为上传型**：只推不拉；跨机取回请用 WebDAV。
- **忽略规则是简化 glob**：支持 `**/dir/**`、`dir/**`、`*.ext`、精确名；复杂 glob（如 `a/**/b`）不生效。
- **`.credentials.yaml` 默认不备份**（含明文密钥），需要时自行开启。
- **Token 存在 `backup-sync.settings.json` 明文**：该文件与 `cordis.patch.yml` 同权限级，注意保管。
- 恢复配置层后**需要重启 DSH** 才生效。

---

## 开发

```powershell
pnpm install
pnpm build         # esbuild/tsdown 打包 lib/index.js + lib/client.js
pnpm typecheck     # tsc --noEmit
```

仓库结构：

```
src/index.ts        宿主侧：路由 / API / 命令 / 自动备份
src/snapshot.ts     整机快照：创建/列举/恢复/清理
src/project.ts      项目快照：命名快照/忽略规则/回滚/单文件恢复
src/baidu.ts        百度网盘后端（stdio MCP 客户端）
src/baidu-oauth.ts  OAuth 设备码 / 授权码 / 刷新
src/webdav.ts       WebDAV 推送/拉取
src/settings.ts     可写设置层与校验
src/client/index.ts 设置面板 + 会话「备份」页签
```

---

## License

MIT
