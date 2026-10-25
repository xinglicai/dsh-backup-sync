# dsh-backup-sync

Backup & restore plugin for **DeepSeek Harness (DSH)**, with two independent tracks:

1. **Machine config snapshots** — capture `$DSH_HOME` sessions, workspace data and the config layer; restore the whole installation after a reinstall or migration.
2. **Project file snapshots** — from the **Backup** tab in the conversation header, take named snapshots of the current project and roll back the whole project or a single file.

Targets: **local only / Baidu Netdisk (MCP) / WebDAV**.

## Features

- Config snapshots: `sessions/`, `storages/`, `settings.yaml`, `cordis.patch.yml`, this plugin's settings, per-profile `cordis.patch.yml` / `package.json` / `pnpm-workspace.yaml`; optional `attachments/` and `.credentials.yaml`
- Each snapshot carries a `meta.json` manifest; restore takes a `…-pre-restore` safety snapshot first
- Project snapshots: auto-detects the current conversation's workspace (via `storages/workspace.json`), named snapshots, default ignores (`node_modules`, `.git`, `dist`, `build`, `.venv`, `*.log`, …), full rollback (overwrite / exact) and single-file restore, safety snapshot before every rollback
- Baidu Netdisk token via **device-code one-click flow** (access + refresh token, auto-renew 10 minutes before expiry)
- Local time in all lists; buttons to push / restore / open the backup folder / delete

## Install

```powershell
git clone https://github.com/xinglicai/dsh-backup-sync.git "$env:USERPROFILE\.dsh\plugins-src\dsh-backup-sync"
cd "$env:USERPROFILE\.dsh\plugins-src\dsh-backup-sync"
pnpm install
pnpm build
```

Then add to `~/.dsh/profiles/desktop/package.json`:

```jsonc
{
  "dependencies": { "@dsh-external/dsh-backup-sync": "link:.dsh-plugins/dsh-backup-sync" },
  "dsh": { "profile": { "bundles": [ /* … */ "@dsh-external/dsh-backup-sync" ] } }
}
```

Copy `lib/`, `package.json`, `cordis.patch.yml` into `.dsh-plugins/dsh-backup-sync/`, run `pnpm install`, then restart DSH.

Requires DSH `0.2.1-rc.3` and Node.js `>= 22`. The Baidu backend additionally needs Python 3 with `pip install "mcp<2"` and `fileupload_tool.py`.

## Usage

- **Settings → 备份同步**: config backups, retention, scope switches, Baidu credentials, import, and the snapshot list (push / restore / open / delete).
- **Conversation header → 备份**: project snapshots for the current workspace — create, roll back, restore single files, push, open, delete.

Slash commands: `/backup [name]`, `/backup list`, `/backup push <name>`, `/backup restore <name> [--all]`, `/backup prune <n>`.

## Notes

- Project files are **never** touched by `restore --all`; project rollback is always explicit.
- The Baidu MCP is upload-only: it can push to the netdisk but cannot pull back. Use WebDAV for cross-machine retrieval.
- Baidu tokens are stored in plain text in `$DSH_HOME/backup-sync.settings.json`.
- Full Chinese documentation: [README.md](README.md).

## License

MIT
