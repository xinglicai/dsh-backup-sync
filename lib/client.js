window.__ModuleLoader__.load({ id: '@dsh-external/dsh-backup-sync', factory: (require) => { var module = { exports: {} }; var exports = module.exports;
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name2 in all)
    __defProp(target, name2, { get: all[name2], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// ../../../.dsh/plugins-src/dsh-backup-sync/src/client/index.ts
var index_exports = {};
__export(index_exports, {
  BackupSyncSection: () => BackupSyncSection,
  SessionBackupView: () => SessionBackupView,
  apply: () => apply,
  inject: () => inject,
  name: () => name
});
module.exports = __toCommonJS(index_exports);
var React = __toESM(require("react"), 1);
var name = "backup-sync-client";
var inject = ["slots"];
var EMPTY = {
  backupRoot: "",
  includeAttachments: false,
  includeCredentials: false,
  includeSessions: true,
  includeStorages: true,
  projectPaths: [],
  projects: [],
  autoIntervalMinutes: 0,
  autoKeep: 10,
  remoteKind: "baidu",
  projectRemoteKind: "local",
  remote: { baseUrl: "", username: "", password: "" },
  baidu: { token: "", pythonPath: "", scriptPath: "", dir: "/\u6765\u81EA\uFF1Amcp_server/dsh-backup", appKey: "", secretKey: "" }
};
var API_BASE = "backup-sync/api/";
async function call(method, body = {}) {
  const base = typeof document === "undefined" ? "http://127.0.0.1/" : document.baseURI;
  const response = await fetch(new URL(API_BASE + method, base), {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(body ?? {})
  });
  const data = await response.json().catch(() => ({ ok: false, error: `HTTP ${response.status}` }));
  if (!response.ok || data.ok === false) throw new Error(String(data.error ?? data.message ?? `HTTP ${response.status}`));
  return data;
}
var S = {
  wrap: { display: "flex", flexDirection: "column", gap: 14, padding: "4px 2px 24px 2px" },
  card: {
    border: "1px solid color-mix(in srgb, currentColor 14%, transparent)",
    borderRadius: 10,
    padding: "14px 16px",
    display: "flex",
    flexDirection: "column",
    gap: 10
  },
  cardTitle: { fontSize: 13, fontWeight: 600, opacity: 0.9, margin: 0 },
  hint: { fontSize: 12, lineHeight: 1.6, opacity: 0.62, margin: 0 },
  row: { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" },
  label: { fontSize: 12, opacity: 0.72, minWidth: 104 },
  input: {
    flex: "1 1 240px",
    minWidth: 0,
    fontSize: 13,
    padding: "6px 9px",
    borderRadius: 7,
    border: "1px solid color-mix(in srgb, currentColor 20%, transparent)",
    background: "color-mix(in srgb, currentColor 4%, transparent)",
    color: "inherit",
    outline: "none"
  },
  button: {
    fontSize: 13,
    padding: "6px 12px",
    borderRadius: 7,
    border: "1px solid color-mix(in srgb, currentColor 22%, transparent)",
    background: "color-mix(in srgb, currentColor 8%, transparent)",
    color: "inherit",
    cursor: "pointer"
  },
  primary: {
    fontSize: 13,
    padding: "8px 16px",
    borderRadius: 7,
    border: "1px solid transparent",
    background: "color-mix(in srgb, #4d6bfe 88%, transparent)",
    color: "#fff",
    cursor: "pointer",
    fontWeight: 600
  },
  code: {
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: 20,
    letterSpacing: 3,
    padding: "8px 12px",
    borderRadius: 8,
    background: "color-mix(in srgb, #4d6bfe 12%, transparent)",
    border: "1px solid color-mix(in srgb, #4d6bfe 40%, transparent)",
    userSelect: "all"
  },
  notice: (kind) => ({
    fontSize: 12,
    lineHeight: 1.6,
    whiteSpace: "pre-wrap",
    padding: "8px 10px",
    borderRadius: 7,
    border: `1px solid ${kind === "ok" ? "color-mix(in srgb, #2f9e44 45%, transparent)" : "color-mix(in srgb, #e03131 45%, transparent)"}`,
    background: kind === "ok" ? "color-mix(in srgb, #2f9e44 10%, transparent)" : "color-mix(in srgb, #e03131 10%, transparent)"
  }),
  table: { width: "100%", borderCollapse: "collapse", fontSize: 12.5 },
  th: {
    textAlign: "left",
    padding: "6px 8px",
    opacity: 0.62,
    fontWeight: 500,
    borderBottom: "1px solid color-mix(in srgb, currentColor 14%, transparent)"
  },
  td: { padding: "6px 8px", borderBottom: "1px solid color-mix(in srgb, currentColor 8%, transparent)" }
};
function Field(props) {
  return React.createElement(
    "label",
    { style: S.row },
    React.createElement("span", { style: S.label }, props.label),
    React.createElement("input", {
      style: S.input,
      type: props.type ?? "text",
      value: String(props.value),
      placeholder: props.placeholder,
      onChange: (event) => props.onChange(event.target.value)
    })
  );
}
function Toggle(props) {
  return React.createElement(
    "label",
    { style: { ...S.row, cursor: "pointer" } },
    React.createElement("input", {
      type: "checkbox",
      checked: props.checked,
      onChange: (event) => props.onChange(event.target.checked)
    }),
    React.createElement("span", { style: { fontSize: 12.5 } }, props.label)
  );
}
function formatBytesFrontend(bytes) {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}
function formatTime(input) {
  if (input === "") return "\u2014";
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return input;
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}
var PICKER_STYLE = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.45)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9999
  },
  modal: {
    width: 560,
    maxWidth: "92vw",
    maxHeight: "82vh",
    overflow: "auto",
    display: "flex",
    flexDirection: "column",
    gap: 10,
    padding: "16px 18px",
    borderRadius: 12,
    background: "var(--dsh-surface, #1e1f22)",
    color: "var(--dsh-text, #e6e6e6)",
    border: "1px solid color-mix(in srgb, currentColor 18%, transparent)",
    boxShadow: "0 24px 64px rgba(0,0,0,0.45)"
  },
  entry: {
    textAlign: "left",
    fontSize: 13,
    padding: "5px 8px",
    borderRadius: 6,
    border: "1px solid transparent",
    background: "transparent",
    color: "inherit",
    cursor: "pointer"
  }
};
function DirectoryPicker(props) {
  const [path, setPath] = React.useState(props.initial);
  const [parent, setParent] = React.useState(null);
  const [dirs, setDirs] = React.useState([]);
  const [jump, setJump] = React.useState(props.initial);
  const [error, setError] = React.useState("");
  const load = async (target) => {
    try {
      const data = await call(
        "fs.list",
        { path: target }
      );
      setPath(data.path);
      setParent(data.parent);
      setDirs(data.directories ?? []);
      setJump(data.path);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  };
  React.useEffect(() => {
    void load(props.initial);
  }, []);
  return React.createElement(
    "div",
    {
      style: PICKER_STYLE.overlay,
      onMouseDown: (event) => {
        if (event.target === event.currentTarget) props.onClose();
      }
    },
    React.createElement(
      "div",
      { style: PICKER_STYLE.modal },
      React.createElement(
        "div",
        { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } },
        React.createElement("strong", { style: { fontSize: 13 } }, props.title),
        React.createElement("button", { style: S.button, onClick: props.onClose }, "\u5173\u95ED")
      ),
      React.createElement(
        "div",
        { style: S.row },
        React.createElement("input", {
          style: { ...S.input, flex: "1 1 240px" },
          value: jump,
          placeholder: "\u53EF\u76F4\u63A5\u7C98\u8D34\u7EDD\u5BF9\u8DEF\u5F84\u540E\u56DE\u8F66",
          onChange: (event) => setJump(event.target.value),
          onKeyDown: (event) => {
            if (event.key === "Enter") void load(jump);
          }
        }),
        React.createElement("button", { style: S.button, onClick: () => void load(jump) }, "\u8DF3\u8F6C"),
        React.createElement("button", { style: S.button, onClick: () => void load("") }, "\u78C1\u76D8")
      ),
      React.createElement("p", { style: S.hint }, path === "" ? "\u9009\u62E9\u4E00\u4E2A\u78C1\u76D8\uFF08\u6216\u7C98\u8D34\u8DEF\u5F84\u8DF3\u8F6C\uFF09" : path),
      error === "" ? null : React.createElement("p", { style: { ...S.hint, color: "#e03131" } }, error),
      React.createElement(
        "div",
        { style: { display: "flex", flexDirection: "column", gap: 1, maxHeight: 320, overflow: "auto" } },
        parent === null ? null : React.createElement("button", { style: PICKER_STYLE.entry, onClick: () => void load(parent) }, "\u2B06 \u4E0A\u4E00\u7EA7"),
        ...dirs.map((dir) => React.createElement("button", { key: dir.path, style: PICKER_STYLE.entry, onClick: () => void load(dir.path) }, `\u{1F4C1} ${dir.name}`))
      ),
      React.createElement(
        "div",
        { style: { ...S.row, justifyContent: "flex-end" } },
        React.createElement("button", { style: S.primary, disabled: path === "", onClick: () => props.onPick(path) }, "\u9009\u62E9\u6B64\u76EE\u5F55")
      )
    )
  );
}
function SessionBackupView(props) {
  const [projectPath, setProjectPath] = React.useState("");
  const [projectTitle, setProjectTitle] = React.useState("");
  const [kind, setKind] = React.useState("local");
  const [allSettings, setAllSettings] = React.useState(null);
  const [snapshots, setSnapshots] = React.useState([]);
  const [snapName, setSnapName] = React.useState("");
  const [notice, setNotice] = React.useState(null);
  const [busy, setBusy] = React.useState("");
  const [picker, setPicker] = React.useState(null);
  const [files, setFiles] = React.useState([]);
  const [openSnap, setOpenSnap] = React.useState("");
  const report = (k, text) => setNotice({ kind: k, text });
  const run = async (label, action) => {
    setBusy(label);
    setNotice(null);
    try {
      report("ok", await action());
    } catch (error) {
      report("err", error instanceof Error ? error.message : String(error));
    } finally {
      setBusy("");
    }
  };
  const loadSnapshots = async (target) => {
    if (target.trim() === "") {
      setSnapshots([]);
      return;
    }
    const data = await call(
      "project.snapshots",
      { path: target }
    );
    setSnapshots(data.snapshots ?? []);
  };
  React.useEffect(() => {
    void (async () => {
      try {
        const data = await call("settings.get");
        const incoming = data.settings ?? {};
        setAllSettings(incoming);
        const saved = incoming.projectRemoteKind ?? incoming.remoteKind;
        setKind(saved === "baidu" ? "baidu" : saved === "webdav" ? "webdav" : "local");
        const sessionId = props?.sessionId ?? "";
        if (sessionId !== "") {
          const resolved = await call("session.project", { sessionId });
          if (resolved.projectPath !== "") {
            setProjectPath(resolved.projectPath);
            setProjectTitle(resolved.title);
            return;
          }
        }
        const fallback = await call("workspace.default");
        if (fallback.projectPath !== "") {
          setProjectPath(fallback.projectPath);
          setProjectTitle(fallback.title);
        }
      } catch {
      }
    })();
  }, []);
  React.useEffect(() => {
    void loadSnapshots(projectPath).catch(() => void 0);
  }, [projectPath]);
  const changeKind = (next) => {
    setKind(next);
    if (allSettings !== null) {
      setAllSettings({ ...allSettings, projectRemoteKind: next });
      void call("settings.save", { settings: { ...allSettings, projectRemoteKind: next } }).catch(() => void 0);
    }
  };
  const create = () => run("snap", async () => {
    if (projectPath.trim() === "") throw new Error("\u5148\u9009\u62E9\u9879\u76EE\u76EE\u5F55");
    const data = await call("project.snapshot", {
      path: projectPath.trim(),
      name: snapName
    });
    setSnapName("");
    await loadSnapshots(projectPath);
    return `\u5DF2\u5EFA\u5FEB\u7167 ${data.name}\uFF1A${data.fileCount} \u6587\u4EF6 / ${data.totalBytesLabel}${data.skipped > 0 ? `\uFF08\u5FFD\u7565 ${data.skipped} \u9879\uFF09` : ""}`;
  });
  const restore = (snap) => run(`restore:${snap}`, async () => {
    const data = await call("project.restore", {
      path: projectPath.trim(),
      name: snap
    });
    await loadSnapshots(projectPath);
    const guard = data.safeguard === void 0 ? "" : `
\u56DE\u6EDA\u524D\u5DF2\u5EFA\u4FDD\u9669\u5FEB\u7167\uFF1A${data.safeguard}`;
    return `\u5DF2\u56DE\u6EDA\u5230 ${snap}\uFF1A\u8FD8\u539F ${data.restored} \u6587\u4EF6${data.removed > 0 ? `\uFF0C\u5220\u9664 ${data.removed}` : ""}${guard}`;
  });
  const push = (snap) => run(`push:${snap}`, async () => {
    const data = await call("project.push", { path: projectPath.trim(), name: snap });
    return data.text ?? `\u5DF2\u63A8\u9001 ${snap}`;
  });
  const remove = (snap) => run(`remove:${snap}`, async () => {
    await call("project.remove", { path: projectPath.trim(), name: snap });
    await loadSnapshots(projectPath);
    return `\u5DF2\u5220\u9664\u5FEB\u7167 ${snap}`;
  });
  const showFiles = (snap) => run(`files:${snap}`, async () => {
    const data = await call("project.files", { path: projectPath.trim(), name: snap });
    setFiles(data.files ?? []);
    setOpenSnap(snap);
    return `\u5FEB\u7167 ${snap}\uFF1A${(data.files ?? []).length} \u4E2A\u6587\u4EF6`;
  });
  const toggleFiles = (snap) => {
    if (openSnap === snap) {
      setOpenSnap("");
      setFiles([]);
      setNotice(null);
      return Promise.resolve();
    }
    return showFiles(snap);
  };
  const openFolder = (snap) => run(`open:${snap}`, async () => {
    const data = await call("project.open", { path: projectPath.trim(), name: snap });
    return `\u5DF2\u6253\u5F00\u5907\u4EFD\u6587\u4EF6\u5939\uFF1A${data.path}`;
  });
  const restoreFile = (snap, file) => run("file", async () => {
    await call("project.restoreFile", { path: projectPath.trim(), name: snap, file });
    return `\u5DF2\u6062\u590D\u5355\u6587\u4EF6\uFF1A${file}`;
  });
  const disabled = busy !== "";
  return React.createElement(
    "div",
    { style: S.wrap },
    React.createElement(
      "div",
      { style: S.card },
      React.createElement(
        "div",
        { style: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" } },
        React.createElement(
          "div",
          null,
          React.createElement("h3", { style: { ...S.cardTitle, fontSize: 14 } }, "\u5F53\u524D\u5BF9\u8BDD\u7684\u9879\u76EE\u5907\u4EFD"),
          React.createElement(
            "p",
            { style: S.hint },
            projectTitle === "" ? "\u9879\u76EE\uFF1A\u672A\u8BC6\u522B\uFF08\u53EF\u624B\u52A8\u9009\u62E9\u76EE\u5F55\uFF09" : `\u9879\u76EE\uFF1A${projectTitle}`
          )
        ),
        React.createElement(
          "div",
          { style: S.row },
          React.createElement("span", { style: { fontSize: 12, opacity: 0.72 } }, "\u5907\u4EFD\u5230"),
          React.createElement(
            "select",
            {
              style: { ...S.input, flex: "0 0 170px" },
              value: kind,
              onChange: (event) => {
                const next = event.target.value;
                changeKind(next === "baidu" ? "baidu" : next === "webdav" ? "webdav" : "local");
              }
            },
            React.createElement("option", { value: "local" }, "\u4EC5\u672C\u5730"),
            React.createElement("option", { value: "baidu" }, "\u767E\u5EA6\u7F51\u76D8"),
            React.createElement("option", { value: "webdav" }, "WebDAV")
          )
        )
      ),
      React.createElement(
        "div",
        { style: S.row },
        React.createElement("span", { style: S.label }, "\u9879\u76EE\u8DEF\u5F84"),
        React.createElement("input", {
          style: { ...S.input, flex: "1 1 280px" },
          value: projectPath,
          placeholder: "\u70B9\u300C\u9009\u62E9\u2026\u300D\u6311\u9879\u76EE\u76EE\u5F55",
          onChange: (event) => setProjectPath(event.target.value)
        }),
        React.createElement(
          "button",
          { style: S.button, disabled, onClick: () => setPicker({ initial: projectPath, onPick: setProjectPath }) },
          "\u9009\u62E9\u2026"
        )
      ),
      React.createElement(
        "div",
        { style: S.row },
        React.createElement("span", { style: S.label }, "\u5FEB\u7167\u540D"),
        React.createElement("input", {
          style: { ...S.input, flex: "1 1 240px" },
          value: snapName,
          placeholder: "\u7559\u7A7A=\u65F6\u95F4\u6233\uFF1B\u5EFA\u8BAE PRE-CHANGE: \u6539\u4E86\u4EC0\u4E48",
          onChange: (event) => setSnapName(event.target.value)
        }),
        React.createElement("button", { style: S.primary, disabled, onClick: () => void create() }, busy === "snap" ? "\u5FEB\u7167\u4E2D\u2026" : "\u{1F4F8} \u5EFA\u5FEB\u7167"),
        React.createElement(
          "button",
          { style: S.button, disabled, onClick: () => void run("refresh", async () => {
            await loadSnapshots(projectPath);
            return "\u5DF2\u5237\u65B0";
          }) },
          "\u5237\u65B0"
        )
      ),
      React.createElement(
        "p",
        { style: S.hint },
        "\u9ED8\u8BA4\u5FFD\u7565 node_modules / .git / dist / build / .venv \u7B49\uFF1B\u56DE\u6EDA\u524D\u81EA\u52A8\u5EFA pre-restore \u4FDD\u9669\u5FEB\u7167\uFF1B\u9ED8\u8BA4\u53EA\u8986\u76D6\u4E0D\u5220\u6587\u4EF6\u3002"
      ),
      notice === null ? null : React.createElement("div", { style: S.notice(notice.kind) }, notice.text)
    ),
    React.createElement(
      "div",
      { style: S.card },
      React.createElement("h3", { style: S.cardTitle }, `\u5FEB\u7167\uFF08${snapshots.length}\uFF09`),
      snapshots.length === 0 ? React.createElement("p", { style: S.hint }, "\u8FD8\u6CA1\u6709\u5FEB\u7167\u3002\u5EFA\u4E00\u5F20\u518D\u6539\u4EE3\u7801\uFF0C\u968F\u65F6\u80FD\u56DE\u6EDA\u3002") : React.createElement(
        "table",
        { style: S.table },
        React.createElement(
          "thead",
          null,
          React.createElement(
            "tr",
            null,
            ...["\u540D\u79F0", "\u65F6\u95F4", "\u6587\u4EF6", "\u5927\u5C0F", "\u64CD\u4F5C"].map((title) => React.createElement("th", { key: title, style: S.th }, title))
          )
        ),
        React.createElement(
          "tbody",
          null,
          ...snapshots.map(
            (snap) => React.createElement(
              "tr",
              { key: snap.name },
              React.createElement("td", { style: S.td }, snap.name),
              React.createElement("td", { style: S.td }, formatTime(snap.createdAt)),
              React.createElement("td", { style: S.td }, String(snap.fileCount)),
              React.createElement("td", { style: S.td }, formatBytesFrontend(snap.totalBytes)),
              React.createElement(
                "td",
                { style: S.td },
                React.createElement(
                  "div",
                  { style: { display: "flex", gap: 6, flexWrap: "wrap" } },
                  React.createElement("button", { style: S.button, disabled, onClick: () => void restore(snap.name) }, "\u56DE\u6EDA"),
                  React.createElement(
                    "button",
                    { style: S.button, disabled, onClick: () => void toggleFiles(snap.name) },
                    openSnap === snap.name ? "\u6536\u8D77" : "\u6587\u4EF6"
                  ),
                  React.createElement(
                    "button",
                    { style: S.button, disabled: disabled || kind === "local", onClick: () => void push(snap.name) },
                    busy === `push:${snap.name}` ? "\u63A8\u9001\u4E2D\u2026" : "\u63A8\u9001"
                  ),
                  React.createElement("button", { style: S.button, disabled, onClick: () => void openFolder(snap.name) }, "\u6253\u5F00"),
                  React.createElement("button", { style: S.button, disabled, onClick: () => void remove(snap.name) }, "\u5220\u9664")
                )
              )
            )
          )
        )
      ),
      openSnap === "" ? null : React.createElement(
        "div",
        { style: { maxHeight: 260, overflow: "auto", display: "flex", flexDirection: "column", gap: 3 } },
        ...files.slice(0, 300).map(
          (file) => React.createElement(
            "div",
            { key: file.path, style: { display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" } },
            React.createElement(
              "span",
              { style: { fontSize: 12, fontFamily: "ui-monospace, Menlo, monospace", wordBreak: "break-all" } },
              file.path
            ),
            React.createElement(
              "button",
              { style: { ...S.button, padding: "2px 8px" }, disabled, onClick: () => void restoreFile(openSnap, file.path) },
              "\u6062\u590D"
            )
          )
        )
      )
    ),
    picker === null ? null : React.createElement(DirectoryPicker, {
      title: "\u9009\u62E9\u9879\u76EE\u76EE\u5F55",
      initial: picker.initial,
      onPick: (picked) => {
        picker.onPick(picked);
        setPicker(null);
      },
      onClose: () => setPicker(null)
    })
  );
}
function BackupSyncSection() {
  const [form, setForm] = React.useState(EMPTY);
  const [settingsFile, setSettingsFile] = React.useState("");
  const [snapshots, setSnapshots] = React.useState([]);
  const [notice, setNotice] = React.useState(null);
  const [busy, setBusy] = React.useState("");
  const [tokenStatus, setTokenStatus] = React.useState("");
  const [advanced, setAdvanced] = React.useState(false);
  const [device, setDevice] = React.useState(null);
  const [polling, setPolling] = React.useState(false);
  const [projectText, setProjectText] = React.useState("");
  const [importPath, setImportPath] = React.useState("");
  const [tab, setTab] = React.useState("project");
  const [picker, setPicker] = React.useState(null);
  const [projectPath, setProjectPath] = React.useState("");
  const [projectName, setProjectName] = React.useState("");
  const [projectList, setProjectList] = React.useState([]);
  const [projectSnapshots, setProjectSnapshots] = React.useState([]);
  const [openSnap, setOpenSnap] = React.useState("");
  const [snapFiles, setSnapFiles] = React.useState([]);
  const timer = React.useRef(void 0);
  const patch = (part) => setForm((prev) => ({ ...prev, ...part }));
  const patchRemote = (part) => setForm((prev) => ({ ...prev, remote: { ...prev.remote, ...part } }));
  const patchBaidu = (part) => setForm((prev) => ({ ...prev, baidu: { ...prev.baidu, ...part } }));
  const report = (kind, text) => setNotice({ kind, text });
  const pickDirectory = (initial, onPick) => {
    setPicker({ title: "\u9009\u62E9\u76EE\u5F55", initial: initial.trim() === "" ? "" : initial, onPick });
  };
  const hidden = (show) => show ? {} : { display: "none" };
  const run = async (label, action) => {
    setBusy(label);
    setNotice(null);
    try {
      report("ok", await action());
    } catch (error) {
      report("err", error instanceof Error ? error.message : String(error));
    } finally {
      setBusy("");
    }
  };
  const tokenLine = (check) => {
    if (check === void 0) return "";
    const who = check.netdiskName === void 0 ? "" : `\uFF08${check.netdiskName}\uFF09`;
    return check.ok ? `Token \u6709\u6548${who}` : `Token \u65E0\u6548\uFF1A${check.message}`;
  };
  const refreshSnapshots = async () => {
    const data = await call("snapshots.list");
    setSnapshots(data.snapshots ?? []);
  };
  const splitPaths = (raw) => raw.split(/[\r\n;]+/).map((entry) => entry.trim()).filter((entry) => entry !== "");
  const saveForm = async () => {
    await call("settings.save", { settings: form });
  };
  const reloadSettings = async () => {
    const data = await call("settings.get");
    const incoming = data.settings ?? {};
    setForm((prev) => ({
      ...prev,
      ...incoming,
      includeSessions: incoming.includeSessions ?? prev.includeSessions,
      includeStorages: incoming.includeStorages ?? prev.includeStorages,
      projectPaths: incoming.projectPaths ?? prev.projectPaths,
      projectRemoteKind: incoming.projectRemoteKind ?? prev.projectRemoteKind,
      remote: { ...EMPTY.remote, ...incoming.remote ?? prev.remote },
      baidu: { ...EMPTY.baidu, ...incoming.baidu ?? prev.baidu }
    }));
    setProjectText((incoming.projectPaths ?? []).join("\n"));
    setSettingsFile(data.settingsFile ?? "");
  };
  React.useEffect(() => {
    void (async () => {
      try {
        await reloadSettings();
        await refreshSnapshots();
      } catch (error) {
        report("err", `\u8BFB\u53D6\u8BBE\u7F6E\u5931\u8D25\uFF1A${error instanceof Error ? error.message : String(error)}`);
      }
    })();
    return () => {
      if (timer.current !== void 0) window.clearInterval(timer.current);
    };
  }, []);
  const startDevice = () => run("device", async () => {
    if (form.baidu.appKey.trim() === "") throw new Error("\u5148\u586B AppKey");
    if (form.baidu.secretKey.trim() === "") throw new Error("\u5148\u586B SecretKey");
    await saveForm();
    const data = await call(
      "baidu.deviceStart",
      {}
    );
    setDevice({ userCode: data.userCode, url: data.verificationUrl, qr: data.qrcodeUrl ?? "" });
    setPolling(true);
    try {
      window.open(data.verificationUrl, "_blank", "noopener");
    } catch {
    }
    if (timer.current !== void 0) window.clearInterval(timer.current);
    let ticks = 0;
    timer.current = window.setInterval(() => {
      ticks += 1;
      void (async () => {
        try {
          const polled = await call("baidu.devicePoll", {});
          if (polled.status === "pending") {
            setTokenStatus(`\u7B49\u5F85\u4F60\u5728\u6D4F\u89C8\u5668\u786E\u8BA4\u2026\uFF08\u7B2C ${ticks} \u6B21\u68C0\u67E5\uFF09`);
            return;
          }
          if (timer.current !== void 0) window.clearInterval(timer.current);
          setPolling(false);
          setDevice(null);
          if (polled.status === "success") {
            setTokenStatus(tokenLine(polled.check));
            await reloadSettings();
            report("ok", `Token \u5DF2\u81EA\u52A8\u83B7\u53D6\u5E76\u4FDD\u5B58${polled.hasRefreshToken === true ? "\uFF08\u542B refresh_token\uFF0C\u4E4B\u540E\u81EA\u52A8\u7EED\u671F\uFF09" : ""}`);
          } else {
            report("err", polled.message ?? "\u6388\u6743\u672A\u5B8C\u6210");
          }
        } catch (error) {
          if (timer.current !== void 0) window.clearInterval(timer.current);
          setPolling(false);
          report("err", error instanceof Error ? error.message : String(error));
        }
      })();
      if (ticks > 120) {
        if (timer.current !== void 0) window.clearInterval(timer.current);
        setPolling(false);
      }
    }, Math.max(3, data.intervalSec ?? 5) * 1e3);
    return `\u5DF2\u53D1\u8D77\u6388\u6743\uFF1A\u8BF7\u5728\u6253\u5F00\u7684\u9875\u9762\u8F93\u5165\u77ED\u7801 ${data.userCode}\uFF08\u6216\u626B\u7801\uFF09\uFF0C\u786E\u8BA4\u540E\u8FD9\u91CC\u4F1A\u81EA\u52A8\u62FF\u5230 Token`;
  });
  const checkNow = () => run("check", async () => {
    const data = await call("baidu.check");
    setTokenStatus(tokenLine(data.check));
    return tokenLine(data.check);
  });
  const refreshNow = () => run("refresh", async () => {
    const data = await call("baidu.refresh");
    setTokenStatus(tokenLine(data.check));
    return data.check?.ok === true ? `\u5DF2\u7EED\u671F\uFF1A${tokenLine(data.check)}` : `\u7EED\u671F\u5931\u8D25\uFF1A${data.check?.message ?? "\u672A\u77E5"}`;
  });
  const testBaidu = () => run("test", async () => {
    await saveForm();
    const data = await call("baidu.test", {});
    setTokenStatus(tokenLine(data.check));
    return `\u767E\u5EA6\u7F51\u76D8 MCP \u8FDE\u901A\uFF0C\u5DE5\u5177\uFF1A${(data.tools ?? []).join(", ") || "\uFF08\u65E0\uFF09"}
${tokenLine(data.check)}`;
  });
  const save = () => run("save", async () => {
    await saveForm();
    await refreshSnapshots();
    return "\u8BBE\u7F6E\u5DF2\u4FDD\u5B58\uFF08\u7ACB\u5373\u751F\u6548\uFF09";
  });
  const createSnapshot = () => run("create", async () => {
    const data = await call("backup.create", {});
    await refreshSnapshots();
    return data.text ?? "\u5FEB\u7167\u5DF2\u521B\u5EFA";
  });
  const pushSnapshot = (name2) => run(`push:${name2}`, async () => {
    const data = await call("backup.push", { name: name2 });
    return data.text ?? `\u5DF2\u63A8\u9001 ${name2}`;
  });
  const restoreSnapshot = (name2) => run(`restore:${name2}`, async () => {
    const data = await call("backup.restore", { name: name2 });
    const head = data.safeguardName === void 0 ? "" : `\u4FDD\u9669\u5FEB\u7167\uFF1A${data.safeguardName}
`;
    const skipped = (data.skipped ?? []).length > 0 ? `
\u672A\u6062\u590D\uFF1A${data.skipped.join("\u3001")}` : "";
    return `${head}\u5DF2\u6062\u590D\uFF1A${(data.restored ?? []).join("\u3001") || "\uFF08\u65E0\uFF09"}${skipped}`;
  });
  const prune = () => run("prune", async () => {
    const data = await call("backup.prune", { keep: form.autoKeep });
    await refreshSnapshots();
    return `\u5DF2\u6E05\u7406 ${data.removed} \u4E2A\u65E7\u5FEB\u7167`;
  });
  const openSnapshotFolder = (name2) => run(`open:${name2}`, async () => {
    const data = await call("backup.open", { name: name2 });
    return `\u5DF2\u6253\u5F00\u5907\u4EFD\u6587\u4EF6\u5939\uFF1A${data.path}`;
  });
  const removeSnapshot = (name2) => run(`remove:${name2}`, async () => {
    await call("backup.remove", { name: name2 });
    await refreshSnapshots();
    return `\u5DF2\u5220\u9664\u5FEB\u7167 ${name2}`;
  });
  const importBackup = () => run("import", async () => {
    if (importPath.trim() === "") throw new Error("\u586B\u5199\u8981\u5BFC\u5165\u7684\u5FEB\u7167\u76EE\u5F55\u8DEF\u5F84\uFF08\u542B meta.json\uFF09");
    const data = await call("backup.import", { path: importPath.trim() });
    await refreshSnapshots();
    return `\u5DF2\u5BFC\u5165\u5FEB\u7167 ${data.name}\uFF08${data.fileCount} \u6587\u4EF6\uFF09\uFF0C\u53EF\u5728\u5217\u8868\u91CC\u76F4\u63A5\u300C\u6062\u590D\u300D`;
  });
  const disabled = busy !== "" || polling;
  return React.createElement(
    "div",
    { style: S.wrap },
    // 设置页只负责：全局（整机配置）备份 + 备份参数；项目备份在会话顶部「备份」页签。
    React.createElement(
      "div",
      { style: { display: "flex", alignItems: "baseline", gap: 8, paddingBottom: 4, borderBottom: "1px solid color-mix(in srgb, currentColor 12%, transparent)" } },
      React.createElement("strong", { style: { fontSize: 13 } }, "\u672C\u673A\u914D\u7F6E\u5FEB\u7167"),
      React.createElement("span", { style: { fontSize: 12, opacity: 0.6 } }, "\u4F1A\u8BDD/\u5DE5\u4F5C\u533A/\u914D\u7F6E\uFF1B\u9879\u76EE\u6587\u4EF6\u56DE\u6EDA\u5728\u4F1A\u8BDD\u9876\u90E8\u300C\u5907\u4EFD\u300D\u9875\u7B7E")
    ),
    React.createElement(
      "div",
      null,
      React.createElement(
        "div",
        { style: { ...S.card, marginTop: 10 } },
        React.createElement("h3", { style: S.cardTitle }, "\u5907\u4EFD\u4F4D\u7F6E"),
        React.createElement(
          "label",
          { style: S.row },
          React.createElement("span", { style: S.label }, "\u5907\u4EFD\u5230"),
          React.createElement(
            "select",
            {
              style: { ...S.input, flex: "0 0 200px" },
              value: form.remoteKind,
              onChange: (event) => patch({ remoteKind: event.target.value === "webdav" ? "webdav" : "baidu" })
            },
            React.createElement("option", { value: "baidu" }, "\u767E\u5EA6\u7F51\u76D8\uFF08MCP\uFF09"),
            React.createElement("option", { value: "webdav" }, "WebDAV"),
            React.createElement("option", { value: "local" }, "\u4EC5\u672C\u5730\uFF08\u4E0D\u63A8\u9001\uFF09")
          )
        ),
        React.createElement(
          "div",
          { style: S.row },
          React.createElement("span", { style: S.label }, "\u672C\u5730\u5FEB\u7167\u76EE\u5F55"),
          React.createElement("input", {
            style: { ...S.input, flex: "1 1 300px" },
            value: form.backupRoot,
            placeholder: "\u7559\u7A7A = $DSH_HOME/backups",
            onChange: (event) => patch({ backupRoot: event.target.value })
          }),
          React.createElement(
            "button",
            {
              style: S.button,
              onClick: () => pickDirectory(form.backupRoot, (picked) => {
                patch({ backupRoot: picked });
                void saveForm();
              })
            },
            "\u9009\u62E9\u2026"
          )
        )
      ),
      form.remoteKind === "baidu" ? React.createElement(
        "div",
        { style: S.card },
        React.createElement("h3", { style: S.cardTitle }, "\u767E\u5EA6\u7F51\u76D8\uFF08MCP\uFF09"),
        React.createElement(Field, {
          label: "AppKey",
          value: form.baidu.appKey,
          placeholder: "\u5F00\u653E\u5E73\u53F0\u300C\u5E94\u7528\u51ED\u636E\u300D\u91CC\u7684 AppKey",
          onChange: (value) => patchBaidu({ appKey: value })
        }),
        React.createElement(Field, {
          label: "SecretKey",
          value: form.baidu.secretKey,
          type: "password",
          placeholder: "\u5F00\u653E\u5E73\u53F0\u300C\u5E94\u7528\u51ED\u636E\u300D\u91CC\u7684 SecretKey",
          onChange: (value) => patchBaidu({ secretKey: value })
        }),
        React.createElement(
          "div",
          { style: S.row },
          React.createElement(
            "button",
            { style: S.primary, disabled, onClick: () => void startDevice() },
            busy === "device" ? "\u7533\u8BF7\u4E2D\u2026" : polling ? "\u7B49\u5F85\u6388\u6743\u786E\u8BA4\u2026" : "\u26A1 \u4E00\u952E\u83B7\u53D6 Token"
          ),
          tokenStatus === "" ? null : React.createElement("span", { style: { fontSize: 12, opacity: 0.75 } }, tokenStatus)
        ),
        device === null ? null : React.createElement(
          "div",
          { style: { ...S.card, background: "color-mix(in srgb, currentColor 4%, transparent)" } },
          React.createElement(
            "p",
            { style: S.hint },
            "\u2460 \u5728\u6253\u5F00\u7684\u9875\u9762\u767B\u5F55\u767E\u5EA6\u8D26\u53F7\u5E76\u786E\u8BA4\uFF0C\u77ED\u7801\u586B\u4E0B\u9762\u8FD9\u4E32\uFF08\u6216\u76F4\u63A5\u626B\u7801\uFF09\uFF1A"
          ),
          React.createElement("div", { style: S.code }, device.userCode),
          React.createElement(
            "div",
            { style: S.row },
            React.createElement(
              "a",
              { href: device.url, target: "_blank", rel: "noreferrer noopener", style: { color: "#4d6bfe", fontSize: 12.5 } },
              device.url
            ),
            device.qr === "" ? null : React.createElement(
              "a",
              { href: device.qr, target: "_blank", rel: "noreferrer noopener", style: { color: "#4d6bfe", fontSize: 12.5 } },
              "\u626B\u7801\u6388\u6743"
            )
          )
        ),
        React.createElement(
          "button",
          {
            style: { ...S.button, alignSelf: "flex-start", background: "transparent", border: "none", paddingLeft: 0, opacity: 0.7 },
            onClick: () => setAdvanced((prev) => !prev)
          },
          advanced ? "\u25BE \u6536\u8D77\u9AD8\u7EA7\u8BBE\u7F6E" : "\u25B8 \u9AD8\u7EA7\u8BBE\u7F6E\uFF08\u7F51\u76D8\u76EE\u5F55 / MCP \u8FD0\u884C\u65F6 / \u624B\u5DE5 Token\uFF09"
        ),
        advanced ? React.createElement(
          "div",
          { style: { display: "flex", flexDirection: "column", gap: 10 } },
          React.createElement(Field, {
            label: "\u7F51\u76D8\u76EE\u5F55",
            value: form.baidu.dir,
            placeholder: "/\u6765\u81EA\uFF1Amcp_server/dsh-backup",
            onChange: (value) => patchBaidu({ dir: value })
          }),
          React.createElement(Field, {
            label: "Python",
            value: form.baidu.pythonPath,
            placeholder: "C:\\...\\.venv\\Scripts\\python.exe",
            onChange: (value) => patchBaidu({ pythonPath: value })
          }),
          React.createElement(Field, {
            label: "MCP \u811A\u672C",
            value: form.baidu.scriptPath,
            placeholder: "C:\\...\\fileupload_tool.py",
            onChange: (value) => patchBaidu({ scriptPath: value })
          }),
          React.createElement(Field, {
            label: "\u624B\u5DE5 Token",
            value: form.baidu.token,
            type: "password",
            placeholder: "\u4E00\u822C\u4E0D\u7528\u586B\uFF1A\u4E00\u952E\u83B7\u53D6\u4F1A\u5199\u5165",
            onChange: (value) => patchBaidu({ token: value })
          }),
          React.createElement(
            "div",
            { style: S.row },
            React.createElement("button", { style: S.button, disabled, onClick: () => void checkNow() }, "\u6821\u9A8C Token"),
            React.createElement("button", { style: S.button, disabled, onClick: () => void refreshNow() }, "\u5237\u65B0 Token"),
            React.createElement("button", { style: S.button, disabled, onClick: () => void testBaidu() }, "\u6D4B\u8BD5 MCP \u8FDE\u63A5")
          )
        ) : null,
        React.createElement(
          "p",
          { style: S.hint },
          "Token \u4E0E refresh_token \u5B58\u5728 $DSH_HOME/backup-sync.settings.json\uFF1B\u5230\u671F\u524D 10 \u5206\u949F\u81EA\u52A8\u7EED\u671F\uFF0C\u4E0A\u4F20\u9047\u5230\u5931\u6548\u4F1A\u81EA\u52A8\u7EED\u671F\u91CD\u8BD5\u4E00\u6B21\u3002"
        )
      ) : form.remoteKind === "webdav" ? React.createElement(
        "div",
        { style: S.card },
        React.createElement("h3", { style: S.cardTitle }, "WebDAV"),
        React.createElement(Field, {
          label: "\u5730\u5740",
          value: form.remote.baseUrl,
          placeholder: "https://dav.example.com/remote.php/dav/files/user/dsh-backups",
          onChange: (value) => patchRemote({ baseUrl: value })
        }),
        React.createElement(Field, {
          label: "\u7528\u6237\u540D",
          value: form.remote.username,
          placeholder: "\u7559\u7A7A = \u51ED\u636E WEBDAV_USERNAME",
          onChange: (value) => patchRemote({ username: value })
        }),
        React.createElement(Field, {
          label: "\u5BC6\u7801",
          value: form.remote.password,
          type: "password",
          placeholder: "\u7559\u7A7A = \u51ED\u636E WEBDAV_PASSWORD",
          onChange: (value) => patchRemote({ password: value })
        })
      ) : null,
      React.createElement(
        "div",
        { style: S.card },
        React.createElement("h3", { style: S.cardTitle }, "\u81EA\u52A8\u5907\u4EFD\u4E0E\u8303\u56F4"),
        React.createElement(Field, {
          label: "\u95F4\u9694\uFF08\u5206\u949F\uFF09",
          value: form.autoIntervalMinutes,
          type: "number",
          placeholder: "0 = \u5173\u95ED",
          onChange: (value) => patch({ autoIntervalMinutes: Number(value) || 0 })
        }),
        React.createElement(Field, {
          label: "\u4FDD\u7559\u5FEB\u7167\u6570",
          value: form.autoKeep,
          type: "number",
          placeholder: "0 = \u4E0D\u6E05\u7406",
          onChange: (value) => patch({ autoKeep: Number(value) || 0 })
        }),
        React.createElement(Toggle, {
          label: "\u5907\u4EFD\u4F1A\u8BDD\u65E5\u5FD7\uFF08sessions\uFF09",
          checked: form.includeSessions,
          onChange: (next) => patch({ includeSessions: next })
        }),
        React.createElement(Toggle, {
          label: "\u5907\u4EFD\u5DE5\u4F5C\u533A\u6570\u636E\uFF08storages\uFF1A\u5DE5\u4F5C\u533A\u6CE8\u518C\u3001\u4EFB\u52A1\u7D22\u5F15\uFF09",
          checked: form.includeStorages,
          onChange: (next) => patch({ includeStorages: next })
        }),
        React.createElement(Toggle, {
          label: "\u5305\u542B\u9644\u4EF6\uFF08attachments\uFF1A\u804A\u5929\u91CC\u4E0A\u4F20\u7684\u6587\u4EF6\u526F\u672C\uFF09",
          checked: form.includeAttachments,
          onChange: (next) => patch({ includeAttachments: next })
        }),
        React.createElement(Toggle, {
          label: "\u5305\u542B\u51ED\u636E\u6587\u4EF6\uFF08.credentials.yaml\uFF0C\u542B\u660E\u6587\u5BC6\u94A5\uFF09",
          checked: form.includeCredentials,
          onChange: (next) => patch({ includeCredentials: next })
        }),
        React.createElement(
          "p",
          { style: S.hint },
          "\u9879\u76EE\u6587\u4EF6\u5907\u4EFD\u4E0D\u5728\u8FD9\u91CC\uFF1A\u6253\u5F00\u4EFB\u610F\u4F1A\u8BDD\uFF0C\u9876\u90E8\u300C\u5907\u4EFD\u300D\u9875\u7B7E\u7BA1\u7406\u5F53\u524D\u5BF9\u8BDD\u9879\u76EE\u7684\u5FEB\u7167\u4E0E\u56DE\u6EDA\u3002"
        )
      ),
      React.createElement(
        "div",
        { style: S.row },
        React.createElement("button", { style: S.primary, disabled, onClick: () => void save() }, busy === "save" ? "\u4FDD\u5B58\u4E2D\u2026" : "\u4FDD\u5B58\u8BBE\u7F6E"),
        React.createElement("button", { style: S.button, disabled, onClick: () => void createSnapshot() }, busy === "create" ? "\u521B\u5EFA\u4E2D\u2026" : "\u7ACB\u5373\u521B\u5EFA\u5FEB\u7167"),
        React.createElement("button", { style: S.button, disabled, onClick: () => void prune() }, "\u6E05\u7406\u65E7\u5FEB\u7167"),
        React.createElement(
          "button",
          {
            style: S.button,
            disabled,
            onClick: () => void run("refresh-list", async () => {
              await refreshSnapshots();
              return "\u5217\u8868\u5DF2\u5237\u65B0";
            })
          },
          "\u5237\u65B0\u5217\u8868"
        )
      ),
      React.createElement(
        "div",
        { style: S.card },
        React.createElement("h3", { style: S.cardTitle }, `\u672C\u5730\u5FEB\u7167\uFF08${snapshots.length}\uFF09`),
        React.createElement(
          "div",
          { style: S.row },
          React.createElement("input", {
            style: { ...S.input, flex: "1 1 320px" },
            value: importPath,
            placeholder: "\u5BFC\u5165\u672C\u5730\u5907\u4EFD\uFF1A\u5FEB\u7167\u76EE\u5F55\u7EDD\u5BF9\u8DEF\u5F84\uFF08\u542B meta.json\uFF0C\u6216\u7F51\u76D8\u4E0B\u8F7D\u56DE\u6765\u7684\u76EE\u5F55\uFF09",
            onChange: (event) => setImportPath(event.target.value)
          }),
          React.createElement(
            "button",
            { style: S.button, onClick: () => pickDirectory(importPath, (picked) => setImportPath(picked)) },
            "\u9009\u62E9\u2026"
          ),
          React.createElement(
            "button",
            { style: S.button, disabled, onClick: () => void importBackup() },
            busy === "import" ? "\u5BFC\u5165\u4E2D\u2026" : "\u5BFC\u5165\u672C\u5730\u5907\u4EFD"
          )
        ),
        snapshots.length === 0 ? React.createElement("p", { style: S.hint }, "\u6682\u65E0\u5FEB\u7167\uFF0C\u70B9\u300C\u7ACB\u5373\u521B\u5EFA\u5FEB\u7167\u300D\u3002") : React.createElement(
          "table",
          { style: S.table },
          React.createElement(
            "thead",
            null,
            React.createElement(
              "tr",
              null,
              React.createElement("th", { style: S.th }, "\u540D\u79F0"),
              React.createElement("th", { style: S.th }, "\u521B\u5EFA\u65F6\u95F4"),
              React.createElement("th", { style: S.th }, "\u5927\u5C0F"),
              React.createElement("th", { style: S.th }, "\u64CD\u4F5C")
            )
          ),
          React.createElement(
            "tbody",
            null,
            ...snapshots.map(
              (row) => React.createElement(
                "tr",
                { key: row.name },
                React.createElement("td", { style: S.td }, row.name),
                React.createElement("td", { style: S.td }, formatTime(row.createdAt)),
                React.createElement(
                  "td",
                  { style: S.td },
                  row.valid ? `${row.fileCount} \u6587\u4EF6 / ${row.totalBytesLabel}` : "\u5143\u6570\u636E\u7F3A\u5931"
                ),
                React.createElement(
                  "td",
                  { style: S.td },
                  React.createElement(
                    "div",
                    { style: { display: "flex", gap: 6, flexWrap: "wrap" } },
                    React.createElement(
                      "button",
                      { style: S.button, disabled, onClick: () => void pushSnapshot(row.name) },
                      busy === `push:${row.name}` ? "\u63A8\u9001\u4E2D\u2026" : "\u63A8\u9001\u5230\u8FDC\u7AEF"
                    ),
                    React.createElement(
                      "button",
                      { style: S.button, disabled, onClick: () => void restoreSnapshot(row.name) },
                      busy === `restore:${row.name}` ? "\u6062\u590D\u4E2D\u2026" : "\u6062\u590D"
                    ),
                    React.createElement(
                      "button",
                      { style: S.button, disabled, onClick: () => void openSnapshotFolder(row.name) },
                      "\u6253\u5F00"
                    ),
                    React.createElement(
                      "button",
                      { style: S.button, disabled, onClick: () => void removeSnapshot(row.name) },
                      busy === `remove:${row.name}` ? "\u5220\u9664\u4E2D\u2026" : "\u5220\u9664"
                    )
                  )
                )
              )
            )
          )
        ),
        settingsFile === "" ? null : React.createElement("p", { style: S.hint }, `\u914D\u7F6E\u6587\u4EF6\uFF1A${settingsFile}`)
      )
    ),
    notice === null ? null : React.createElement("div", { style: S.notice(notice.kind) }, notice.text),
    picker === null ? null : React.createElement(DirectoryPicker, {
      title: picker.title,
      initial: picker.initial,
      onPick: (picked) => {
        picker.onPick(picked);
        setPicker(null);
      },
      onClose: () => setPicker(null)
    })
  );
}
function apply(ctx) {
  ctx.slots.inject("settings.section", () => ctx.slots.register({
    name: "settings.section",
    id: "backup-sync",
    order: 120,
    label: () => "\u5907\u4EFD\u540C\u6B65"
  }, BackupSyncSection));
  ctx.slots.inject("conversation.view", () => ctx.slots.register({
    name: "conversation.view",
    id: "backup",
    order: 100,
    label: () => "\u5907\u4EFD",
    // 框架按 sessionId 调用 inject，返回值作为组件 props —— 会话页签靠它识别当前工作区。
    inject: (sessionId) => ({ sessionId })
  }, SessionBackupView));
}
return module.exports; } });
