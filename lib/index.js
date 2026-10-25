// ../../../.dsh/plugins-src/dsh-backup-sync/src/index.ts
import { resolveDshHome } from "@deepseek-ai/dsh-home-paths";
import { credentialRef } from "@deepseek-ai/dsh-credentials";
import { join as join6, basename as basename4, dirname as dirname5, resolve as resolve3 } from "node:path";
import { cp as cp3, mkdir as mkdir5, readFile as readFile5, writeFile as writeFile6, readdir as readdir5, stat as stat5, rm as rm4 } from "node:fs/promises";
import { spawn as spawn2 } from "node:child_process";
import { existsSync as existsSync4 } from "node:fs";

// ../../../.dsh/plugins-src/dsh-backup-sync/src/snapshot.ts
import { mkdir, cp, readdir, readFile, writeFile, stat, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { hostname } from "node:os";
import { basename, dirname, join, resolve, sep } from "node:path";
var FORMAT_VERSION = 1;
var PROJECT_IGNORE = /* @__PURE__ */ new Set([
  "node_modules",
  ".git",
  ".hg",
  ".svn",
  "dist",
  "build",
  "out",
  ".next",
  ".nuxt",
  "target",
  ".venv",
  "venv",
  "__pycache__",
  ".idea",
  ".vscode",
  ".cache",
  "coverage",
  ".turbo",
  ".gradle",
  ".mvn",
  "bin",
  "obj",
  "Pods",
  ".dart_tool"
]);
var SNAPSHOT_NAME = /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9_-])?$/;
function defaultSnapshotName(now = /* @__PURE__ */ new Date()) {
  return now.toISOString().replace(/[:.]/g, "-");
}
function snapshotsDir(backupRoot) {
  return join(backupRoot, "snapshots");
}
function snapshotDir(backupRoot, name2) {
  return join(snapshotsDir(backupRoot), name2);
}
function assertSnapshotName(name2) {
  if (!SNAPSHOT_NAME.test(name2)) {
    throw new Error(`\u5FEB\u7167\u540D "${name2}" \u975E\u6CD5\uFF1A\u4EC5\u5141\u8BB8\u5B57\u6BCD\u3001\u6570\u5B57\u3001\u70B9\u3001\u77ED\u6A2A\u7EBF\u4E0E\u4E0B\u5212\u7EBF\uFF0C\u4E14\u987B\u4EE5\u5B57\u6BCD\u6216\u6570\u5B57\u5F00\u5934`);
  }
}
function homeDataDirs(includeAttachments) {
  const dirs = ["sessions", "storages"];
  if (includeAttachments) dirs.push("attachments");
  return dirs;
}
var CONFIG_FILES = ["settings.yaml", "cordis.patch.yml", "backup-sync.settings.json"];
var PROFILE_CONFIG_FILES = ["cordis.patch.yml", "package.json", "pnpm-workspace.yaml"];
function totalBytes(files) {
  let sum = 0;
  for (const file of files) sum += file.size;
  return sum;
}
function serializeMeta(meta) {
  return `${JSON.stringify(meta, null, 2)}
`;
}
async function collectFiles(root, rel = "", warnings = []) {
  const dir = join(root, rel);
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (rel === "" && entry.name === "meta.json") continue;
    const relPath = rel === "" ? entry.name : `${rel}/${entry.name}`;
    if (entry.isDirectory()) {
      files.push(...await collectFiles(root, relPath, warnings));
    } else if (entry.isFile()) {
      try {
        const s = await stat(join(root, relPath));
        files.push({ path: relPath, size: s.size, mtimeMs: Math.round(s.mtimeMs) });
      } catch (error) {
        warnings.push(`\u8DF3\u8FC7 ${relPath}\uFF08\u6587\u4EF6\u5728\u6536\u96C6\u65F6\u6D88\u5931\uFF09\uFF1A${errorMessage(error)}`);
      }
    }
  }
  return files;
}
async function copyTree(src, dest, rel, warnings) {
  if (!existsSync(src)) return;
  await mkdir(dest, { recursive: true });
  try {
    await cp(src, dest, { recursive: true, force: true, dereference: true });
  } catch (error) {
    warnings.push(`\u590D\u5236 ${rel} \u5931\u8D25\uFF0C\u5DF2\u5C1D\u8BD5\u9010\u6587\u4EF6\u590D\u5236\uFF1A${errorMessage(error)}`);
    const entries = await readdir(src, { withFileTypes: true });
    for (const entry of entries) {
      const from = join(src, entry.name);
      const to = join(dest, entry.name);
      try {
        if (entry.isDirectory()) await copyTree(from, to, `${rel}/${entry.name}`, warnings);
        else if (entry.isFile()) {
          await mkdir(dirname(to), { recursive: true });
          await cp(from, to, { force: true, dereference: true });
        }
      } catch (perFile) {
        warnings.push(`\u590D\u5236 ${rel}/${entry.name} \u5931\u8D25\uFF1A${errorMessage(perFile)}`);
      }
    }
  }
}
function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
async function copyProjectTree(src, dest, rel, warnings) {
  if (!existsSync(src)) return;
  await mkdir(dest, { recursive: true });
  const entries = await readdir(src, { withFileTypes: true }).catch((error) => {
    warnings.push(`\u8BFB\u53D6 ${rel} \u5931\u8D25\uFF1A${errorMessage(error)}`);
    return [];
  });
  for (const entry of entries) {
    const from = join(src, entry.name);
    const to = join(dest, entry.name);
    if (entry.isSymbolicLink()) {
      warnings.push(`\u8DF3\u8FC7\u7B26\u53F7\u94FE\u63A5 ${rel}/${entry.name}`);
      continue;
    }
    if (entry.isDirectory()) {
      if (PROJECT_IGNORE.has(entry.name)) continue;
      await copyProjectTree(from, to, `${rel}/${entry.name}`, warnings);
      continue;
    }
    if (!entry.isFile()) continue;
    try {
      await mkdir(dirname(to), { recursive: true });
      await cp(from, to, { force: true, dereference: true });
    } catch (error) {
      warnings.push(`\u590D\u5236 ${rel}/${entry.name} \u5931\u8D25\uFF1A${errorMessage(error)}`);
    }
  }
}
async function createSnapshot(backupRoot, dshHome, name2, options, signal) {
  assertSnapshotName(name2);
  const dir = snapshotDir(backupRoot, name2);
  if (existsSync(dir)) {
    throw new Error(`\u5FEB\u7167\u5DF2\u5B58\u5728\uFF1A${name2}\uFF08${dir}\uFF09`);
  }
  const throwIfAborted = () => {
    if (signal?.aborted === true) throw new Error("\u5DF2\u53D6\u6D88");
  };
  const warnings = [];
  const sections = [];
  const wantSessions = options.includeSessions !== false;
  const wantStorages = options.includeStorages !== false;
  for (const rel of homeDataDirs(options.includeAttachments)) {
    if (rel === "sessions" && !wantSessions) continue;
    if (rel === "storages" && !wantStorages) continue;
    const source = join(dshHome, rel);
    if (!existsSync(source)) continue;
    sections.push({ rel, source, dest: join(dir, rel) });
  }
  for (const projectPath of options.projectPaths ?? []) {
    const source = resolve(projectPath.trim());
    if (source === "" || !existsSync(source)) {
      warnings.push(`\u9879\u76EE\u76EE\u5F55\u4E0D\u5B58\u5728\uFF0C\u5DF2\u8DF3\u8FC7\uFF1A${projectPath}`);
      continue;
    }
    const label = basename(source);
    sections.push({ rel: `workspace/${label}`, source, dest: join(dir, "workspace", label), project: true });
  }
  if (options.includeCredentials) {
    const credentialsSrc = join(dshHome, ".credentials.yaml");
    if (existsSync(credentialsSrc)) {
      sections.push({
        rel: "credentials",
        source: credentialsSrc,
        dest: join(dir, "credentials", ".credentials.yaml")
      });
    }
  }
  const configs = [];
  for (const rel of CONFIG_FILES) {
    if (existsSync(join(dshHome, rel))) configs.push(rel);
  }
  const profilesSrc = join(dshHome, "profiles");
  if (existsSync(profilesSrc)) {
    const profiles = await readdir(profilesSrc, { withFileTypes: true });
    for (const profile of profiles) {
      if (!profile.isDirectory() || profile.name === "node_modules") continue;
      for (const file of PROFILE_CONFIG_FILES) {
        if (existsSync(join(profilesSrc, profile.name, file))) {
          configs.push(`profiles/${profile.name}/${file}`);
        }
      }
    }
  }
  try {
    for (const section of sections) {
      throwIfAborted();
      if (section.project === true) await copyProjectTree(section.source, section.dest, section.rel, warnings);
      else await copyTree(section.source, section.dest, section.rel, warnings);
    }
    for (const rel of configs) {
      throwIfAborted();
      const dest = join(dir, "configs", rel);
      await mkdir(dirname(dest), { recursive: true });
      try {
        await cp(join(dshHome, rel), dest, { force: true, dereference: true });
      } catch (error) {
        warnings.push(`\u914D\u7F6E\u590D\u5236\u5931\u8D25 ${rel}\uFF1A${errorMessage(error)}`);
      }
    }
    const files = (await collectFiles(dir, "", warnings)).map((file) => ({
      ...file,
      mtimeMs: Math.round(file.mtimeMs)
    }));
    const meta = {
      formatVersion: FORMAT_VERSION,
      name: name2,
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      hostname: hostname(),
      includeAttachments: options.includeAttachments,
      files: files.sort((a, b) => a.path.localeCompare(b.path))
    };
    await writeFile(join(dir, "meta.json"), serializeMeta(meta));
    return { meta, warnings };
  } catch (error) {
    try {
      await rm(dir, { recursive: true, force: true });
    } catch (cleanupError) {
      warnings.push(`\u6E05\u7406\u534A\u6210\u54C1\u5FEB\u7167\u5931\u8D25 ${name2}\uFF1A${errorMessage(cleanupError)}`);
    }
    throw error;
  }
}
function summarize(dir, meta) {
  return {
    name: meta?.name ?? basename(dir),
    createdAt: meta?.createdAt ?? "",
    hostname: meta?.hostname ?? "",
    fileCount: meta?.files.length ?? 0,
    totalBytes: meta === void 0 ? 0 : totalBytes(meta.files),
    valid: meta !== void 0
  };
}
async function getSnapshot(backupRoot, name2) {
  try {
    return JSON.parse(await readFile(join(snapshotDir(backupRoot, name2), "meta.json"), "utf8"));
  } catch {
    return void 0;
  }
}
async function listSnapshots(backupRoot) {
  if (!existsSync(snapshotsDir(backupRoot))) return [];
  const dirs = await readdir(snapshotsDir(backupRoot), { withFileTypes: true });
  const summaries = [];
  for (const dir of dirs) {
    if (!dir.isDirectory() || dir.name === "node_modules") continue;
    summaries.push(summarize(join(snapshotsDir(backupRoot), dir.name), await getSnapshot(backupRoot, dir.name)));
  }
  return summaries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
async function pruneSnapshots(backupRoot, keep) {
  if (keep <= 0) return [];
  const snapshots = await listSnapshots(backupRoot);
  const stale = snapshots.slice(keep);
  const removed = [];
  for (const snapshot of stale) {
    await rm(snapshotDir(backupRoot, snapshot.name), { recursive: true, force: true });
    removed.push(snapshot.name);
  }
  return removed;
}
async function restoreSnapshot(backupRoot, dshHome, name2, options, signal) {
  assertSnapshotName(name2);
  const meta = await getSnapshot(backupRoot, name2);
  if (meta === void 0) {
    throw new Error(`\u672C\u5730\u5FEB\u7167\u4E0D\u5B58\u5728\uFF1A${name2}\uFF08\u53EF\u7528 /backup pull <name> \u4ECE\u8FDC\u7AEF\u62C9\u53D6\uFF09`);
  }
  let safeguardName;
  if (options.safeguard) {
    safeguardName = `${defaultSnapshotName()}-pre-restore`;
    await createSnapshot(backupRoot, dshHome, safeguardName, {
      includeAttachments: meta.includeAttachments,
      includeCredentials: false
    });
  }
  const warnings = [];
  const restored = [];
  const skipped = [];
  const src = snapshotDir(backupRoot, name2);
  const sections = [
    { rel: "sessions", dest: join(dshHome, "sessions"), essential: true, file: false },
    { rel: "storages", dest: join(dshHome, "storages"), essential: true, file: false }
  ];
  if (options.all) {
    for (const rel of CONFIG_FILES) {
      sections.push({ rel: `configs/${rel}`, dest: join(dshHome, rel), essential: false, file: true });
    }
    const profilesSrc = join(src, "configs", "profiles");
    if (existsSync(profilesSrc)) {
      sections.push({ rel: "configs/profiles", dest: join(dshHome, "profiles"), essential: false, file: false });
    }
  }
  for (const section of sections) {
    if (signal?.aborted === true) throw new Error("\u5DF2\u53D6\u6D88");
    const from = join(src, section.rel);
    if (!existsSync(from)) {
      if (section.essential) skipped.push(section.rel);
      continue;
    }
    const before = warnings.length;
    if (section.file) {
      await mkdir(dirname(section.dest), { recursive: true });
      try {
        await cp(from, section.dest, { force: true, dereference: true });
      } catch (error) {
        warnings.push(`\u590D\u5236 ${section.rel} \u5931\u8D25\uFF1A${errorMessage(error)}`);
      }
    } else {
      await copyTree(from, section.dest, section.rel, warnings);
    }
    if (warnings.length === before) {
      restored.push(section.rel);
    } else {
      skipped.push(section.rel);
    }
  }
  return { restored, skipped, warnings, safeguardName };
}
function safeJoin(dir, rel) {
  const joined = resolve(join(dir, ...rel.split("/")));
  const root = resolve(dir) + sep;
  if (joined !== resolve(dir) && !joined.startsWith(root)) {
    throw new Error(`\u975E\u6CD5\u5FEB\u7167\u8DEF\u5F84\uFF1A${rel}`);
  }
  return joined;
}

// ../../../.dsh/plugins-src/dsh-backup-sync/src/webdav.ts
import { createReadStream } from "node:fs";
import { mkdir as mkdir2, writeFile as writeFile2, rm as rm2, lstat, stat as stat2, utimes, readFile as readFile2, readdir as readdir2 } from "node:fs/promises";
import { existsSync as existsSync2 } from "node:fs";
import { basename as basename2, dirname as dirname2, join as join2 } from "node:path";
import { Readable } from "node:stream";
var WebDavError = class extends Error {
  status;
  constructor(message, status) {
    super(message);
    this.name = "WebDavError";
    this.status = status;
  }
};
var REMOTE_PREFIX = "dsh-backup";
function remoteRoot(baseUrl) {
  return `${baseUrl.replace(/\/+$/, "")}/${REMOTE_PREFIX}`;
}
function snapshotUrl(base, name2) {
  return `${remoteRoot(base)}/${encodeURIComponent(name2)}/`;
}
function fileUrl(base, name2, rel) {
  return `${snapshotUrl(base, name2)}${rel.split("/").map(encodeURIComponent).join("/")}`;
}
function authHeaders(config) {
  const username = config.username?.trim();
  if (!username) return {};
  return { Authorization: `Basic ${Buffer.from(`${username}:${config.password ?? ""}`).toString("base64")}` };
}
async function request(method, url, config, body, signal, headers = {}, streamBody = false) {
  const init = {
    method,
    headers: {
      ...authHeaders(config),
      ...headers
    },
    body,
    signal,
    duplex: streamBody ? "half" : void 0
  };
  const response = await fetch(url, init);
  if (response.ok) return response;
  const detail = (await response.text().catch(() => "")).slice(0, 200);
  throw new WebDavError(
    `WebDAV ${method} \u5931\u8D25\uFF08HTTP ${response.status}\uFF09${detail !== "" ? `\uFF1A${detail}` : ""}`,
    response.status
  );
}
async function ensureDir(url, config, signal) {
  const segments = new URL(url).pathname.split("/").filter((segment) => segment.length > 0);
  let current = `${new URL(url).origin}`;
  for (const segment of segments) {
    current += `/${segment}`;
    try {
      await request("MKCOL", current, config, void 0, signal);
    } catch (error) {
      if (error instanceof WebDavError && error.status === 405) continue;
      throw error;
    }
  }
}
async function peekRemoteSnapshot(config, name2, signal) {
  let response;
  try {
    response = await request("GET", fileUrl(config.baseUrl, name2, "meta.json"), config, void 0, signal);
  } catch (error) {
    if (error instanceof WebDavError && (error.status === 404 || error.status === 405)) return void 0;
    throw error;
  }
  try {
    return JSON.parse(await response.text());
  } catch (error) {
    throw new Error(`\u8FDC\u7AEF\u5FEB\u7167 ${name2} \u7684\u6E05\u5355\u65E0\u6548\uFF1A${errorMessage(error)}`);
  }
}
async function pushSnapshot(config, name2, meta, snapshotLocalDir, signal) {
  assertSnapshotName(name2);
  await ensureDir(snapshotUrl(config.baseUrl, name2), config, signal);
  const remoteMeta = await peekRemoteSnapshot(config, name2, signal);
  const remoteFiles = /* @__PURE__ */ new Map();
  if (remoteMeta !== void 0) {
    for (const file of remoteMeta.files) remoteFiles.set(file.path, file);
  }
  let uploaded = 0;
  let skipped = 0;
  for (const file of meta.files) {
    if (signal?.aborted === true) throw new Error("\u5DF2\u53D6\u6D88");
    const remote = remoteFiles.get(file.path);
    if (remote !== void 0 && remote.size === file.size && remote.mtimeMs === file.mtimeMs) {
      skipped += 1;
      continue;
    }
    const local = safeJoin(snapshotLocalDir, file.path);
    const current = await stat2(local).catch(() => void 0);
    if (current === void 0) throw new Error(`\u5FEB\u7167\u6587\u4EF6\u5DF2\u4E0D\u5B58\u5728\uFF0C\u8BF7\u91CD\u65B0\u521B\u5EFA\u5FEB\u7167\uFF1A${file.path}`);
    if (current.size !== file.size || Math.abs(current.mtimeMs - file.mtimeMs) > 2) {
      throw new Error(`\u5FEB\u7167\u6587\u4EF6\u5DF2\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u521B\u5EFA\u5FEB\u7167\uFF1A${file.path}`);
    }
    const stream = Readable.toWeb(createReadStream(local));
    await request("PUT", fileUrl(config.baseUrl, name2, file.path), config, stream, signal, {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(file.size)
    }, true);
    uploaded += 1;
  }
  await request(
    "PUT",
    fileUrl(config.baseUrl, name2, "meta.json"),
    config,
    `${JSON.stringify(meta, null, 2)}
`,
    signal,
    { "Content-Type": "application/json" }
  );
  let removed = 0;
  if (remoteMeta !== void 0) {
    const wanted = new Set(meta.files.map((file) => file.path));
    for (const stale of remoteMeta.files) {
      if (signal?.aborted === true) throw new Error("\u5DF2\u53D6\u6D88");
      if (wanted.has(stale.path)) continue;
      await request("DELETE", fileUrl(config.baseUrl, name2, stale.path), config, void 0, signal);
      removed += 1;
    }
  }
  return { uploaded, skipped, removed };
}
async function pullSnapshot(config, name2, snapshotLocalDir, signal, force = false) {
  assertSnapshotName(name2);
  const meta = await peekRemoteSnapshot(config, name2, signal);
  if (meta === void 0) {
    throw new Error(`\u8FDC\u7AEF\u5FEB\u7167\u4E0D\u5B58\u5728\uFF1A${name2}\uFF08\u53EF\u5148 /backup push ${name2} \u4E0A\u4F20\uFF09`);
  }
  const localMetaPath = join2(snapshotLocalDir, "meta.json");
  let localMeta;
  if (!force) {
    localMeta = await readLocalMeta(localMetaPath);
  }
  if (force && existsSync2(snapshotLocalDir)) {
    await rm2(snapshotLocalDir, { recursive: true, force: true });
  }
  await mkdir2(snapshotLocalDir, { recursive: true });
  const remoteFiles = new Map(meta.files.map((file) => [file.path, file]));
  let downloaded = 0;
  for (const file of meta.files) {
    if (signal?.aborted === true) throw new Error("\u5DF2\u53D6\u6D88");
    const local = safeJoin(snapshotLocalDir, file.path);
    const existing = await lstat(local).catch(() => void 0);
    if (existing?.isSymbolicLink()) {
      await rm2(local, { force: true });
    }
    if (!force && localMeta !== void 0 && existing?.isFile()) {
      const same = localMeta.files.find((f) => f.path === file.path);
      if (same !== void 0 && same.size === file.size && Math.abs(same.mtimeMs - file.mtimeMs) < 2) {
        continue;
      }
    }
    await mkdir2(dirname2(local), { recursive: true });
    const response = await request("GET", fileUrl(config.baseUrl, name2, file.path), config, void 0, signal);
    await writeFile2(local, Buffer.from(await response.arrayBuffer()));
    await utimes(local, new Date(file.mtimeMs), new Date(file.mtimeMs));
    downloaded += 1;
  }
  let removed = 0;
  if (!force && localMeta !== void 0 && existsSync2(snapshotLocalDir)) {
    for (const localPath of await walkLocalFiles(snapshotLocalDir)) {
      if (signal?.aborted === true) throw new Error("\u5DF2\u53D6\u6D88");
      if (remoteFiles.has(localPath)) continue;
      await rm2(safeJoin(snapshotLocalDir, localPath), { force: true });
      removed += 1;
    }
  }
  await writeFile2(localMetaPath, `${JSON.stringify(meta, null, 2)}
`, "utf8");
  return { meta, downloaded, removed };
}
async function readLocalMeta(localMetaPath) {
  try {
    return JSON.parse(await readFile2(localMetaPath, "utf8"));
  } catch {
    return void 0;
  }
}
async function walkLocalFiles(root) {
  const files = [];
  const walk = async (dir, rel) => {
    for (const entry of await readdir2(dir, { withFileTypes: true })) {
      if (entry.name === "meta.json") continue;
      const relPath = rel === "" ? entry.name : `${rel}/${entry.name}`;
      if (entry.isDirectory()) await walk(join2(dir, entry.name), relPath);
      else if (entry.isFile()) files.push(relPath);
    }
  };
  await walk(root, "");
  return files;
}
function joinUrl(dirUrl, rel) {
  const base = dirUrl.replace(/\/+$/, "");
  return `${base}/${rel.split("/").map((segment) => encodeURIComponent(segment)).join("/")}`;
}
async function pushDirectoryToWebDav(config, remoteDirUrl, localRoot, signal) {
  const files = await walkLocalFiles(localRoot);
  const items = existsSync2(join2(localRoot, "meta.json")) ? [...files, "meta.json"] : files;
  let uploaded = 0;
  for (const rel of items) {
    if (signal?.aborted === true) throw new Error("\u5DF2\u53D6\u6D88");
    const local = join2(localRoot, rel);
    const info = await stat2(local);
    const url = joinUrl(remoteDirUrl, rel);
    const parent = url.slice(0, url.lastIndexOf("/"));
    await ensureDir(`${parent}/`, config, signal);
    const stream = Readable.toWeb(createReadStream(local));
    await request("PUT", url, config, stream, signal, {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(info.size)
    }, true);
    uploaded += 1;
  }
  return { uploaded, total: items.length };
}
async function listRemoteSnapshots(config, signal) {
  const root = `${remoteRoot(config.baseUrl)}/`;
  const response = await request("PROPFIND", root, config, void 0, signal, {
    Depth: "1",
    "Content-Type": "application/xml"
  });
  const xml = await response.text();
  const names = /* @__PURE__ */ new Set();
  for (const href of xml.matchAll(/<(?:d:)?href>([^<]+)<\/(?:d:)?href>/g)) {
    const raw = href[1];
    const decoded = safeDecode(raw);
    const candidate = decoded.endsWith("/") ? decoded.slice(0, -1) : decoded;
    const name2 = basename2(candidate);
    if (name2 !== "" && name2 !== REMOTE_PREFIX && SNAPSHOT_NAME.test(name2)) {
      names.add(name2);
    }
  }
  return [...names].sort();
}
async function removeRemoteSnapshot(config, name2, signal) {
  assertSnapshotName(name2);
  await request("DELETE", snapshotUrl(config.baseUrl, name2), config, void 0, signal);
}
function safeDecode(raw) {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

// ../../../.dsh/plugins-src/dsh-backup-sync/src/baidu.ts
import { spawn } from "node:child_process";
import { readdir as readdir3, stat as stat3, writeFile as writeFile3 } from "node:fs/promises";
import { join as join3 } from "node:path";
var DEFAULT_BAIDU_DIR = "/\u6765\u81EA\uFF1Amcp_server/dsh-backup";
var PROTOCOL_VERSION = "2024-11-05";
var START_TIMEOUT_MS = 3e4;
var BaiduMcpError = class extends Error {
  constructor(message, detail) {
    super(message);
    this.detail = detail;
    this.name = "BaiduMcpError";
  }
};
var BaiduMcpSession = class _BaiduMcpSession {
  constructor(config) {
    this.config = config;
  }
  child;
  buffer = "";
  nextId = 1;
  pending = /* @__PURE__ */ new Map();
  stderrTail = "";
  closed = false;
  static async open(config) {
    const session = new _BaiduMcpSession(config);
    await session.start();
    return session;
  }
  start() {
    const { pythonPath, scriptPath, token } = this.config;
    if (pythonPath.trim() === "") throw new BaiduMcpError("\u672A\u914D\u7F6E Python \u89E3\u91CA\u5668\u8DEF\u5F84");
    if (scriptPath.trim() === "") throw new BaiduMcpError("\u672A\u914D\u7F6E fileupload_tool.py \u8DEF\u5F84");
    const child = spawn(pythonPath, [scriptPath], {
      env: {
        ...process.env,
        BAIDU_NETDISK_ACCESS_TOKEN: token,
        PYTHONIOENCODING: "utf-8",
        PYTHONUNBUFFERED: "1"
      },
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"]
    });
    this.child = child;
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => this.consume(chunk));
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      this.stderrTail = (this.stderrTail + chunk).slice(-4e3);
    });
    child.on("exit", (code) => {
      this.closed = true;
      const detail = this.stderrTail.trim();
      for (const [, entry] of this.pending) {
        clearTimeout(entry.timer);
        entry.reject(new BaiduMcpError(`\u767E\u5EA6\u7F51\u76D8 MCP \u8FDB\u7A0B\u9000\u51FA\uFF08code=${String(code)}\uFF09`, detail));
      }
      this.pending.clear();
    });
    child.on("error", (error) => {
      this.closed = true;
      for (const [, entry] of this.pending) {
        clearTimeout(entry.timer);
        entry.reject(new BaiduMcpError(`\u542F\u52A8\u767E\u5EA6\u7F51\u76D8 MCP \u5931\u8D25\uFF1A${error.message}`));
      }
      this.pending.clear();
    });
    return this.request("initialize", {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "dsh-backup-sync", version: "0.2.0" }
    }, START_TIMEOUT_MS).then(() => {
      this.notify("notifications/initialized", {});
    }).catch((error) => {
      this.close();
      throw error;
    });
  }
  consume(chunk) {
    this.buffer += chunk;
    for (; ; ) {
      const newline = this.buffer.indexOf("\n");
      if (newline < 0) return;
      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      if (line === "") continue;
      let envelope;
      try {
        envelope = JSON.parse(line);
      } catch {
        continue;
      }
      if (envelope.id === void 0) continue;
      const entry = this.pending.get(envelope.id);
      if (entry === void 0) continue;
      this.pending.delete(envelope.id);
      clearTimeout(entry.timer);
      if (envelope.error !== void 0) {
        entry.reject(new BaiduMcpError(`MCP \u8C03\u7528\u5931\u8D25\uFF1A${envelope.error.message}`, this.stderrTail.trim()));
      } else {
        entry.resolve(envelope.result);
      }
    }
  }
  notify(method, params) {
    const child = this.child;
    if (child === void 0 || this.closed) return;
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method, params })}
`);
  }
  request(method, params, timeoutMs = 12e4) {
    const child = this.child;
    if (child === void 0 || this.closed) return Promise.reject(new BaiduMcpError("MCP \u4F1A\u8BDD\u672A\u5EFA\u7ACB\u6216\u5DF2\u5173\u95ED"));
    const id = this.nextId++;
    return new Promise((resolve4, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new BaiduMcpError(`MCP \u8C03\u7528\u8D85\u65F6\uFF08${method}\uFF0C${Math.round(timeoutMs / 1e3)}s\uFF09`, this.stderrTail.trim()));
      }, timeoutMs);
      this.pending.set(id, { resolve: resolve4, reject, timer });
      child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}
`);
    });
  }
  async listTools() {
    const result = await this.request("tools/list", {}, START_TIMEOUT_MS);
    return (result?.tools ?? []).map((tool) => String(tool.name ?? "")).filter((name2) => name2 !== "");
  }
  async upload(localPath, remotePath, timeoutMs = 18e5) {
    const result = await this.request("tools/call", {
      name: "upload_file",
      arguments: { local_file_path: localPath, remote_path: remotePath }
    }, timeoutMs);
    const text = (result?.content ?? []).map((item) => item.text ?? "").join("\n").trim();
    if (result?.isError === true) throw new BaiduMcpError(`\u4E0A\u4F20\u5931\u8D25\uFF1A${text === "" ? "MCP \u8FD4\u56DE\u9519\u8BEF" : text}`, this.stderrTail.trim());
    return text;
  }
  close() {
    this.closed = true;
    const child = this.child;
    this.child = void 0;
    if (child !== void 0 && child.exitCode === null) {
      try {
        child.stdin.end();
        child.kill();
      } catch {
      }
    }
  }
};
async function pushSnapshotToBaidu(config, name2, meta, snapshotLocalDir, signal, onProgress) {
  const root = (config.dir?.trim() ?? "") === "" ? DEFAULT_BAIDU_DIR : config.dir.trim().replace(/\/+$/, "");
  if (!root.startsWith("/")) throw new BaiduMcpError(`\u8FDC\u7AEF\u76EE\u5F55\u5FC5\u987B\u4EE5 / \u5F00\u5934\uFF1A${root}`);
  const session = await BaiduMcpSession.open(config);
  const warnings = [];
  const total = meta.files.length + 1;
  let uploaded = 0;
  let mode = "nested";
  const flatten = (rel) => rel.replace(/[\\/]+/g, "__");
  try {
    for (const file of meta.files) {
      if (signal?.aborted === true) throw new BaiduMcpError("\u5DF2\u53D6\u6D88");
      const local = safeJoin(snapshotLocalDir, file.path);
      const current = await stat3(local);
      if (current.size !== file.size) throw new BaiduMcpError(`\u5FEB\u7167\u6587\u4EF6\u5DF2\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u521B\u5EFA\u5FEB\u7167\uFF1A${file.path}`);
      const nestedPath = `${root}/${name2}/${file.path}`;
      try {
        if (mode === "flat") throw new BaiduMcpError("flat");
        await session.upload(local, nestedPath);
      } catch (error) {
        if (mode === "flat") throw error;
        mode = "flat";
        warnings.push(`\u76EE\u6807\u76EE\u5F55\u4E0D\u53EF\u5199\uFF0C\u6539\u7528\u6241\u5E73\u547D\u540D\u4E0A\u4F20\uFF08${errorMessage2(error)}\uFF09`);
        await session.upload(local, `${root}/${name2}__${flatten(file.path)}`);
      }
      uploaded += 1;
      onProgress?.(uploaded, total, file.path);
    }
    const metaLocal = safeJoin(snapshotLocalDir, "meta.json");
    const metaPresent = await stat3(metaLocal).then(() => true).catch(() => false);
    if (!metaPresent) await writeFile3(metaLocal, `${JSON.stringify(meta, null, 2)}
`, "utf8");
    if (mode === "flat") {
      await session.upload(metaLocal, `${root}/${name2}__meta.json`);
    } else {
      await session.upload(metaLocal, `${root}/${name2}/meta.json`).catch(async () => {
        await session.upload(metaLocal, `${root}/${name2}__meta.json`);
      });
    }
    onProgress?.(total, total, "meta.json");
  } finally {
    session.close();
  }
  return { uploaded, total, mode, warnings, root };
}
async function pushDirectoryToBaidu(config, remoteRoot2, localRoot, signal, onProgress) {
  const root = remoteRoot2.replace(/\/+$/, "");
  if (!root.startsWith("/")) throw new BaiduMcpError(`\u8FDC\u7AEF\u76EE\u5F55\u5FC5\u987B\u4EE5 / \u5F00\u5934\uFF1A${root}`);
  const items = [];
  const walk = async (dir, rel) => {
    const entries = await readdir3(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const relPath = rel === "" ? entry.name : `${rel}/${entry.name}`;
      if (entry.isDirectory()) await walk(join3(dir, entry.name), relPath);
      else if (entry.isFile()) items.push(relPath);
    }
  };
  await walk(localRoot, "");
  const session = await BaiduMcpSession.open(config);
  const warnings = [];
  let mode = "nested";
  let uploaded = 0;
  try {
    for (const rel of items) {
      if (signal?.aborted === true) throw new BaiduMcpError("\u5DF2\u53D6\u6D88");
      const local = join3(localRoot, rel);
      try {
        if (mode === "flat") throw new BaiduMcpError("flat");
        await session.upload(local, `${root}/${rel}`);
      } catch (error) {
        if (mode === "flat") throw error;
        mode = "flat";
        warnings.push(`\u76EE\u6807\u76EE\u5F55\u4E0D\u53EF\u5199\uFF0C\u6539\u7528\u6241\u5E73\u547D\u540D\u4E0A\u4F20\uFF08${errorMessage2(error)}\uFF09`);
        await session.upload(local, `${root}__${rel.replace(/[\\/]+/g, "__")}`);
      }
      uploaded += 1;
      onProgress?.(uploaded, items.length, rel);
    }
  } finally {
    session.close();
  }
  return { uploaded, total: items.length, mode, warnings, root };
}
async function testBaidu(config) {
  const session = await BaiduMcpSession.open(config);
  try {
    const tools = await session.listTools();
    return { tools, hasToken: config.token.trim() !== "" };
  } finally {
    session.close();
  }
}
function errorMessage2(error) {
  if (error instanceof BaiduMcpError) return error.detail !== void 0 && error.detail !== "" ? `${error.message} ${error.detail.slice(-200)}` : error.message;
  if (error instanceof Error) return error.message;
  return String(error);
}

// ../../../.dsh/plugins-src/dsh-backup-sync/src/baidu-oauth.ts
var TOKEN_ENDPOINT = "https://openapi.baidu.com/oauth/2.0/token";
var AUTHORIZE_ENDPOINT = "https://openapi.baidu.com/oauth/2.0/authorize";
var UINFO_ENDPOINT = "https://pan.baidu.com/rest/2.0/xpan/nas";
var DEFAULT_SCOPE = "basic,netdisk";
function authorizeUrl(appKey, scope = DEFAULT_SCOPE) {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: appKey,
    redirect_uri: "oob",
    scope
  });
  return `${AUTHORIZE_ENDPOINT}?${params.toString()}`;
}
async function requestToken(query) {
  const url = `${TOKEN_ENDPOINT}?${new URLSearchParams(query).toString()}`;
  const response = await fetch(url);
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`\u767E\u5EA6 token \u63A5\u53E3\u8FD4\u56DE\u975E JSON\uFF08HTTP ${response.status}\uFF09\uFF1A${text.slice(0, 160)}`);
  }
  if (body.error !== void 0 || body.access_token === void 0) {
    const detail = body.error_description ?? body.error ?? `HTTP ${response.status}`;
    throw new Error(`\u767E\u5EA6 token \u63A5\u53E3\u62D2\u7EDD\uFF1A${detail}`);
  }
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresAt: body.expires_in === void 0 ? void 0 : Date.now() + body.expires_in * 1e3,
    scope: body.scope
  };
}
function exchangeCode(app, code, scope = DEFAULT_SCOPE) {
  const trimmed = code.trim();
  if (trimmed === "") throw new Error("\u6388\u6743\u7801\u4E3A\u7A7A");
  return requestToken({
    grant_type: "authorization_code",
    code: trimmed,
    client_id: app.appKey,
    client_secret: app.secretKey,
    redirect_uri: "oob",
    scope
  });
}
function refreshToken(app, token, scope = DEFAULT_SCOPE) {
  const trimmed = token.trim();
  if (trimmed === "") throw new Error("refresh_token \u4E3A\u7A7A");
  return requestToken({
    grant_type: "refresh_token",
    refresh_token: trimmed,
    client_id: app.appKey,
    client_secret: app.secretKey,
    scope
  });
}
async function checkToken(accessToken) {
  const token = accessToken.trim();
  if (token === "") return { ok: false, message: "token \u4E3A\u7A7A" };
  try {
    const response = await fetch(`${UINFO_ENDPOINT}?method=uinfo&access_token=${encodeURIComponent(token)}`);
    const text = await response.text();
    const body = JSON.parse(text);
    if (body.errno !== void 0 && body.errno !== 0) {
      return {
        ok: false,
        errno: body.errno,
        message: body.show_msg ?? `errno ${body.errno}`
      };
    }
    return { ok: true, message: "token \u6709\u6548", netdiskName: body.netdisk_name ?? body.baidu_name };
  } catch (error) {
    return { ok: false, message: `\u6821\u9A8C\u8BF7\u6C42\u5931\u8D25\uFF1A${error instanceof Error ? error.message : String(error)}` };
  }
}
var REFRESH_MARGIN_MS = 10 * 60 * 1e3;
var DEVICE_ENDPOINT = "https://openapi.baidu.com/oauth/2.0/device/code";
async function deviceStart(appKey, scope = DEFAULT_SCOPE) {
  const key = appKey.trim();
  if (key === "") throw new Error("AppKey \u4E3A\u7A7A");
  const query = new URLSearchParams({ response_type: "device_code", client_id: key, scope });
  const response = await fetch(`${DEVICE_ENDPOINT}?${query.toString()}`);
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`\u8BBE\u5907\u7801\u63A5\u53E3\u8FD4\u56DE\u975E JSON\uFF08HTTP ${response.status}\uFF09\uFF1A${text.slice(0, 160)}`);
  }
  if (body.device_code === void 0 || body.user_code === void 0) {
    throw new Error(`\u8BBE\u5907\u7801\u7533\u8BF7\u5931\u8D25\uFF1A${body.error_description ?? body.error ?? `HTTP ${response.status}`}`);
  }
  const expiresIn = body.expires_in ?? 300;
  return {
    deviceCode: body.device_code,
    userCode: body.user_code,
    verificationUrl: body.verification_url ?? "https://openapi.baidu.com/device",
    qrcodeUrl: body.qrcode_url,
    intervalSec: Math.max(2, body.interval ?? 5),
    expiresAt: Date.now() + expiresIn * 1e3
  };
}
async function devicePoll(app, deviceCode) {
  const query = new URLSearchParams({
    grant_type: "device_token",
    code: deviceCode,
    client_id: app.appKey,
    client_secret: app.secretKey
  });
  const response = await fetch(`${TOKEN_ENDPOINT}?${query.toString()}`);
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return { done: false, pending: true, message: `token \u63A5\u53E3\u8FD4\u56DE\u975E JSON\uFF08HTTP ${response.status}\uFF09` };
  }
  if (body.access_token !== void 0) {
    return {
      done: true,
      pending: false,
      tokens: {
        accessToken: body.access_token,
        refreshToken: body.refresh_token,
        expiresAt: body.expires_in === void 0 ? void 0 : Date.now() + body.expires_in * 1e3,
        scope: body.scope
      }
    };
  }
  if (body.error === "authorization_pending" || body.error === "slow_down") {
    return { done: false, pending: true };
  }
  return { done: false, pending: false, message: body.error_description ?? body.error ?? "\u6388\u6743\u5931\u8D25" };
}

// ../../../.dsh/plugins-src/dsh-backup-sync/src/settings.ts
import { mkdir as mkdir3, readFile as readFile3, writeFile as writeFile4 } from "node:fs/promises";
import { dirname as dirname3, join as join4 } from "node:path";
function settingsFilePath(home) {
  return join4(home, "backup-sync.settings.json");
}
async function loadSettingsFile(home) {
  try {
    const raw = await readFile3(settingsFilePath(home), "utf8");
    const parsed = JSON.parse(raw);
    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    return {};
  } catch {
    return {};
  }
}
function mergeConfig(base, override) {
  const pick = (key) => override[key] === void 0 ? void 0 : override[key];
  return {
    ...base,
    ...pick("backupRoot") === void 0 ? {} : { backupRoot: pick("backupRoot") },
    ...pick("includeAttachments") === void 0 ? {} : { includeAttachments: pick("includeAttachments") },
    ...pick("includeCredentials") === void 0 ? {} : { includeCredentials: pick("includeCredentials") },
    ...pick("includeSessions") === void 0 ? {} : { includeSessions: pick("includeSessions") },
    ...pick("includeStorages") === void 0 ? {} : { includeStorages: pick("includeStorages") },
    ...pick("projectPaths") === void 0 ? {} : { projectPaths: pick("projectPaths") },
    ...pick("projects") === void 0 ? {} : { projects: pick("projects") },
    ...pick("projectIgnores") === void 0 ? {} : { projectIgnores: pick("projectIgnores") },
    ...pick("autoIntervalMinutes") === void 0 ? {} : { autoIntervalMinutes: pick("autoIntervalMinutes") },
    ...pick("autoKeep") === void 0 ? {} : { autoKeep: pick("autoKeep") },
    ...pick("remoteKind") === void 0 ? {} : { remoteKind: pick("remoteKind") },
    ...pick("projectRemoteKind") === void 0 ? {} : { projectRemoteKind: pick("projectRemoteKind") },
    ...override.remote === void 0 ? {} : { remote: { ...base.remote ?? {}, ...override.remote } },
    ...override.baidu === void 0 ? {} : { baidu: { ...base.baidu ?? {}, ...override.baidu } }
  };
}
async function saveSettingsFile(home, next) {
  const path = settingsFilePath(home);
  await mkdir3(dirname3(path), { recursive: true });
  const sanitized = sanitize(next);
  await writeFile4(path, `${JSON.stringify(sanitized, null, 2)}
`, "utf8");
  return sanitized;
}
function sanitize(input) {
  const out = {};
  const text = (value) => typeof value === "string" ? value.trim() : void 0;
  const bool = (value) => typeof value === "boolean" ? value : void 0;
  const count = (value, min, max) => {
    if (typeof value !== "number" || !Number.isFinite(value)) return void 0;
    const rounded = Math.floor(value);
    return rounded < min || rounded > max ? void 0 : rounded;
  };
  const backupRoot = text(input.backupRoot);
  if (backupRoot !== void 0) out.backupRoot = backupRoot;
  const includeAttachments = bool(input.includeAttachments);
  if (includeAttachments !== void 0) out.includeAttachments = includeAttachments;
  const includeCredentials = bool(input.includeCredentials);
  if (includeCredentials !== void 0) out.includeCredentials = includeCredentials;
  const includeSessions = bool(input.includeSessions);
  if (includeSessions !== void 0) out.includeSessions = includeSessions;
  const includeStorages = bool(input.includeStorages);
  if (includeStorages !== void 0) out.includeStorages = includeStorages;
  if (Array.isArray(input.projectPaths)) {
    const paths = input.projectPaths.filter((entry) => typeof entry === "string").map((entry) => entry.trim()).filter((entry) => entry.length > 0).slice(0, 10);
    out.projectPaths = paths;
  }
  if (Array.isArray(input.projects)) {
    out.projects = input.projects.filter((entry) => typeof entry === "string").map((entry) => entry.trim()).filter((entry) => entry.length > 0).slice(0, 20);
  }
  if (Array.isArray(input.projectIgnores)) {
    out.projectIgnores = input.projectIgnores.filter((entry) => typeof entry === "string").map((entry) => entry.trim()).filter((entry) => entry.length > 0).slice(0, 100);
  }
  const autoIntervalMinutes = count(input.autoIntervalMinutes, 0, 10080);
  if (autoIntervalMinutes !== void 0) out.autoIntervalMinutes = autoIntervalMinutes;
  const autoKeep = count(input.autoKeep, 0, 1e4);
  if (autoKeep !== void 0) out.autoKeep = autoKeep;
  if (input.remoteKind === "webdav" || input.remoteKind === "baidu" || input.remoteKind === "local") {
    out.remoteKind = input.remoteKind;
  }
  if (input.projectRemoteKind === "webdav" || input.projectRemoteKind === "baidu" || input.projectRemoteKind === "local") {
    out.projectRemoteKind = input.projectRemoteKind;
  }
  if (input.remote !== void 0) {
    const remote = {};
    const baseUrl = text(input.remote.baseUrl);
    if (baseUrl !== void 0) remote.baseUrl = baseUrl;
    const username = text(input.remote.username);
    if (username !== void 0) remote.username = username;
    const password = typeof input.remote.password === "string" ? input.remote.password : void 0;
    if (password !== void 0) remote.password = password;
    if (Object.keys(remote).length > 0) out.remote = remote;
  }
  if (input.baidu !== void 0) {
    const baidu = {};
    const token = typeof input.baidu.token === "string" ? input.baidu.token.trim() : void 0;
    if (token !== void 0) baidu.token = token;
    const pythonPath = text(input.baidu.pythonPath);
    if (pythonPath !== void 0) baidu.pythonPath = pythonPath;
    const scriptPath = text(input.baidu.scriptPath);
    if (scriptPath !== void 0) baidu.scriptPath = scriptPath;
    const dir = text(input.baidu.dir);
    if (dir !== void 0) baidu.dir = dir;
    const appKey = text(input.baidu.appKey);
    if (appKey !== void 0) baidu.appKey = appKey;
    const secretKey = text(input.baidu.secretKey);
    if (secretKey !== void 0) baidu.secretKey = secretKey;
    const refreshToken2 = text(input.baidu.refreshToken);
    if (refreshToken2 !== void 0) baidu.refreshToken = refreshToken2;
    const tokenExpiresAt = typeof input.baidu.tokenExpiresAt === "number" && Number.isFinite(input.baidu.tokenExpiresAt) ? Math.floor(input.baidu.tokenExpiresAt) : void 0;
    if (tokenExpiresAt !== void 0) baidu.tokenExpiresAt = tokenExpiresAt;
    if (Object.keys(baidu).length > 0) out.baidu = baidu;
  }
  return out;
}

// ../../../.dsh/plugins-src/dsh-backup-sync/src/project.ts
import { cp as cp2, mkdir as mkdir4, readdir as readdir4, readFile as readFile4, rm as rm3, stat as stat4, writeFile as writeFile5 } from "node:fs/promises";
import { existsSync as existsSync3 } from "node:fs";
import { hostname as hostname2 } from "node:os";
import { basename as basename3, dirname as dirname4, join as join5, relative, resolve as resolve2, sep as sep2 } from "node:path";
var PROJECT_FORMAT_VERSION = 1;
var DEFAULT_IGNORES = [
  "**/node_modules/**",
  "**/.git/**",
  "**/.hg/**",
  "**/.svn/**",
  "**/dist/**",
  "**/out/**",
  "**/build/**",
  "**/.next/**",
  "**/.nuxt/**",
  "**/.cache/**",
  "**/coverage/**",
  "**/target/**",
  "**/.venv/**",
  "**/venv/**",
  "**/__pycache__/**",
  "**/.idea/**",
  "**/.vscode/**",
  "**/.turbo/**",
  "**/Pods/**",
  "**/.dart_tool/**",
  "**/*.log",
  "**/*.tmp",
  "**/.DS_Store",
  "**/Thumbs.db"
];
var NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._ -]{0,80}$/;
function sanitizeProjectName(raw) {
  return raw.trim().replace(/[:\\/*?"<>|]+/g, "-").replace(/\s+/g, " ").trim().slice(0, 80);
}
function assertProjectName(name2) {
  if (!NAME_RE.test(name2) || name2.endsWith(".")) {
    throw new Error(`\u5FEB\u7167\u540D\u975E\u6CD5\uFF1A\u300C${name2}\u300D\u2014\u2014\u4EC5\u5141\u8BB8\u5B57\u6BCD\u3001\u6570\u5B57\u3001\u7A7A\u683C\u3001\u70B9\u3001\u4E0B\u5212\u7EBF\u3001\u77ED\u6A2A\u7EBF\uFF0C\u4E14\u4EE5\u5B57\u6BCD\u6216\u6570\u5B57\u5F00\u5934`);
  }
}
function projectKey(projectPath) {
  const normalized = resolve2(projectPath).replace(/[:\\/]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized === "" ? "root" : normalized.slice(0, 120);
}
function projectsRoot(backupRoot) {
  return join5(backupRoot, "projects");
}
function projectStoreRoot(backupRoot, projectPath) {
  return join5(projectsRoot(backupRoot), projectKey(projectPath));
}
function projectSnapshotDir(backupRoot, projectPath, name2) {
  return join5(projectStoreRoot(backupRoot, projectPath), name2);
}
function makeIgnoreMatcher(patterns) {
  const dirs = /* @__PURE__ */ new Set();
  const exact = /* @__PURE__ */ new Set();
  const fileRes = [];
  const dirRes = [];
  const toRegExp = (glob) => new RegExp("^" + glob.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".") + "$");
  for (const raw of patterns) {
    const pattern = raw.trim();
    if (pattern === "" || pattern.startsWith("#")) continue;
    const cleaned = pattern.replace(/^\.?\//, "");
    const dirMatch = /^(?:\*\*\/)?([^/*]+)\/\*\*$/.exec(cleaned);
    if (dirMatch !== null) {
      dirs.add(dirMatch[1]);
      continue;
    }
    if (/[*?]/.test(basename3(cleaned))) {
      const target = cleaned.includes("/") ? dirRes : fileRes;
      target.push(toRegExp(basename3(cleaned)));
      continue;
    }
    exact.add(cleaned);
  }
  const matchBasename = (name2, relPath) => exact.has(name2) || exact.has(relPath.replace(/\\/g, "/")) || fileRes.some((re) => re.test(name2));
  return {
    active: dirs.size + exact.size + fileRes.length + dirRes.length > 0,
    matchDirectory(name2, relPath) {
      if (dirs.has(name2)) return true;
      if (exact.has(name2) || exact.has(relPath.replace(/\\/g, "/"))) return true;
      return dirRes.some((re) => re.test(name2));
    },
    matchFile(name2, relPath) {
      return matchBasename(name2, relPath);
    }
  };
}
async function walkProject(root, current, matcher, files, state) {
  const entries = await readdir4(current, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const absolute = join5(current, entry.name);
    const rel = relative(root, absolute).split(sep2).join("/");
    if (entry.isSymbolicLink()) {
      state.skipped += 1;
      continue;
    }
    if (entry.isDirectory()) {
      if (matcher.matchDirectory(entry.name, rel)) {
        state.skipped += 1;
        continue;
      }
      await walkProject(root, absolute, matcher, files, state);
      continue;
    }
    if (!entry.isFile()) continue;
    if (matcher.matchFile(entry.name, rel)) {
      state.skipped += 1;
      continue;
    }
    try {
      const info = await stat4(absolute);
      files.push({ path: rel, size: info.size, mtimeMs: Math.round(info.mtimeMs) });
    } catch {
      state.skipped += 1;
    }
  }
}
async function createProjectSnapshot(backupRoot, projectPath, rawName, options = {}) {
  const name2 = sanitizeProjectName(rawName);
  assertProjectName(name2);
  const projectRoot = resolve2(projectPath);
  if (!existsSync3(projectRoot)) throw new Error(`\u9879\u76EE\u76EE\u5F55\u4E0D\u5B58\u5728\uFF1A${projectRoot}`);
  const info = await stat4(projectRoot);
  if (!info.isDirectory()) throw new Error(`\u4E0D\u662F\u76EE\u5F55\uFF1A${projectRoot}`);
  const dir = projectSnapshotDir(backupRoot, projectRoot, name2);
  if (existsSync3(dir)) throw new Error(`\u9879\u76EE\u5FEB\u7167\u5DF2\u5B58\u5728\uFF1A${name2}`);
  const patterns = [...DEFAULT_IGNORES, ...options.ignores ?? []];
  const matcher = makeIgnoreMatcher(patterns);
  const state = { skipped: 0 };
  const walked = [];
  await walkProject(projectRoot, projectRoot, matcher, walked, state);
  const dest = join5(dir, "files");
  if (walked.length === 0) {
    throw new Error(
      `\u76EE\u5F55\u91CC\u6CA1\u6709\u53EF\u5907\u4EFD\u7684\u6587\u4EF6\uFF1A${projectRoot}
\uFF08\u7A7A\u76EE\u5F55\uFF0C\u6216\u6240\u6709\u6587\u4EF6\u90FD\u88AB\u5FFD\u7565\u89C4\u5219\u6392\u9664\uFF1B\u786E\u8BA4\u8DEF\u5F84\u9009\u5BF9\u4E86\uFF09`
    );
  }
  try {
    await mkdir4(dest, { recursive: true });
    for (const file of walked) {
      if (options.signal?.aborted === true) throw new Error("\u5DF2\u53D6\u6D88");
      const from = join5(projectRoot, file.path);
      const to = join5(dest, file.path);
      await mkdir4(dirname4(to), { recursive: true });
      await cp2(from, to, { force: true, dereference: true });
    }
    const meta = {
      formatVersion: PROJECT_FORMAT_VERSION,
      name: name2,
      projectPath: projectRoot,
      projectKey: projectKey(projectRoot),
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      hostname: hostname2(),
      fileCount: walked.length,
      totalBytes: walked.reduce((sum, file) => sum + file.size, 0),
      ignores: patterns,
      files: walked.sort((a, b) => a.path.localeCompare(b.path))
    };
    await writeFile5(join5(dir, "meta.json"), `${JSON.stringify(meta, null, 2)}
`, "utf8");
    return { meta, skipped: state.skipped };
  } catch (error) {
    await rm3(dir, { recursive: true, force: true }).catch(() => void 0);
    throw error;
  }
}
async function getProjectSnapshot(backupRoot, projectPath, rawName) {
  const name2 = sanitizeProjectName(rawName);
  const metaPath = join5(projectSnapshotDir(backupRoot, projectPath, name2), "meta.json");
  try {
    return JSON.parse(await readFile4(metaPath, "utf8"));
  } catch {
    return void 0;
  }
}
async function listProjectSnapshots(backupRoot, projectPath) {
  const root = projectStoreRoot(backupRoot, projectPath);
  const entries = await readdir4(root, { withFileTypes: true }).catch(() => []);
  const out = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const meta = await getProjectSnapshot(backupRoot, projectPath, entry.name);
    out.push({
      name: entry.name,
      createdAt: meta?.createdAt ?? "",
      hostname: meta?.hostname ?? "",
      fileCount: meta?.fileCount ?? 0,
      totalBytes: meta?.totalBytes ?? 0,
      valid: meta !== void 0
    });
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
async function listProjects(backupRoot) {
  const root = projectsRoot(backupRoot);
  const entries = await readdir4(root, { withFileTypes: true }).catch(() => []);
  const out = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = join5(root, entry.name);
    const names = await readdir4(dir, { withFileTypes: true }).catch(() => []);
    const snapshotDirs = names.filter((item) => item.isDirectory());
    let projectPath = "";
    for (const snapshot of snapshotDirs) {
      try {
        const meta = JSON.parse(await readFile4(join5(dir, snapshot.name, "meta.json"), "utf8"));
        projectPath = meta.projectPath;
        break;
      } catch {
      }
    }
    out.push({ key: entry.name, projectPath, snapshots: snapshotDirs.length });
  }
  return out;
}
async function restoreProjectSnapshot(backupRoot, projectPath, rawName, options = {}) {
  const name2 = sanitizeProjectName(rawName);
  const projectRoot = resolve2(projectPath);
  const dir = projectSnapshotDir(backupRoot, projectRoot, name2);
  const meta = await getProjectSnapshot(backupRoot, projectRoot, name2);
  if (meta === void 0) throw new Error(`\u9879\u76EE\u5FEB\u7167\u4E0D\u5B58\u5728\u6216\u5DF2\u635F\u574F\uFF1A${name2}`);
  let safeguard;
  if (options.safeguard !== false && existsSync3(projectRoot)) {
    safeguard = `pre-restore-${(/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-")}`;
    await createProjectSnapshot(backupRoot, projectRoot, safeguard);
  }
  const filesRoot = join5(dir, "files");
  let restored = 0;
  for (const file of meta.files) {
    const from = join5(filesRoot, file.path);
    const to = join5(projectRoot, file.path);
    await mkdir4(dirname4(to), { recursive: true });
    await cp2(from, to, { force: true, dereference: true });
    restored += 1;
  }
  let removed = 0;
  if (options.mode === "exact") {
    const wanted = new Set(meta.files.map((file) => file.path));
    const matcher = makeIgnoreMatcher(meta.ignores);
    const collect = async (current) => {
      const entries = await readdir4(current, { withFileTypes: true }).catch(() => []);
      for (const entry of entries) {
        const absolute = join5(current, entry.name);
        const rel = relative(projectRoot, absolute).split(sep2).join("/");
        if (entry.isSymbolicLink()) continue;
        if (entry.isDirectory()) {
          if (matcher.matchDirectory(entry.name, rel)) continue;
          await collect(absolute);
          continue;
        }
        if (!entry.isFile()) continue;
        if (matcher.matchFile(entry.name, rel)) continue;
        if (wanted.has(rel)) continue;
        await rm3(absolute, { force: true });
        removed += 1;
      }
    };
    await collect(projectRoot);
  }
  return { restored, removed, safeguard };
}
async function restoreProjectFile(backupRoot, projectPath, rawName, relPath) {
  const name2 = sanitizeProjectName(rawName);
  const projectRoot = resolve2(projectPath);
  const meta = await getProjectSnapshot(backupRoot, projectRoot, name2);
  if (meta === void 0) throw new Error(`\u9879\u76EE\u5FEB\u7167\u4E0D\u5B58\u5728\u6216\u5DF2\u635F\u574F\uFF1A${name2}`);
  const normalized = relPath.replace(/\\/g, "/");
  const hit = meta.files.find((file) => file.path === normalized);
  if (hit === void 0) throw new Error(`\u5FEB\u7167\u91CC\u6CA1\u6709\u8FD9\u4E2A\u6587\u4EF6\uFF1A${relPath}`);
  const from = join5(projectSnapshotDir(backupRoot, projectRoot, name2), "files", normalized);
  const to = join5(projectRoot, normalized);
  await mkdir4(dirname4(to), { recursive: true });
  await cp2(from, to, { force: true, dereference: true });
}
async function pruneProjectSnapshots(backupRoot, projectPath, keep) {
  if (keep <= 0) return [];
  const list = await listProjectSnapshots(backupRoot, projectPath);
  const removed = [];
  for (const snapshot of list.slice(keep)) {
    await rm3(projectSnapshotDir(backupRoot, projectPath, snapshot.name), { recursive: true, force: true }).catch(() => void 0);
    removed.push(snapshot.name);
  }
  return removed;
}
async function removeProjectSnapshot(backupRoot, projectPath, rawName) {
  const name2 = sanitizeProjectName(rawName);
  await rm3(projectSnapshotDir(backupRoot, projectPath, name2), { recursive: true, force: true });
}

// ../../../.dsh/plugins-src/dsh-backup-sync/src/index.ts
var name = "backup-sync";
var inject = ["commands", "credentials", "timer", "workspaceRegistry", "sessionPersistence", "sessions", "connection", "webServer"];
var SIZE_UNITS = ["B", "KB", "MB", "GB", "TB"];
function formatBytes(bytes) {
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < SIZE_UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${SIZE_UNITS[unit]}`;
}
function formatTime(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
var SECTION_LABELS = {
  sessions: "\u4F1A\u8BDD\u65E5\u5FD7",
  storages: "\u5DE5\u4F5C\u533A\u6570\u636E",
  "configs/settings.yaml": "\u8BBE\u7F6E",
  "configs/cordis.patch.yml": "\u5168\u5C40\u914D\u7F6E",
  "configs/profiles": "\u5404 profile \u914D\u7F6E"
};
function sectionLabel(rel) {
  return SECTION_LABELS[rel] ?? rel;
}
function summarizeLine(snapshot) {
  const stamp = snapshot.valid ? `${formatTime(snapshot.createdAt)}  ${snapshot.hostname}  ${snapshot.fileCount} \u6587\u4EF6 / ${formatBytes(snapshot.totalBytes)}` : "\u5143\u6570\u636E\u7F3A\u5931\uFF0C\u65E0\u6CD5\u663E\u793A\u8BE6\u60C5\uFF08\u53EF\u91CD\u65B0\u521B\u5EFA\uFF09";
  return `  ${snapshot.name}  ${stamp}`;
}
var SUBCOMMANDS = /* @__PURE__ */ new Set(["create", "list", "push", "pull", "restore", "prune", "remote-prune", "sweep-archives", "baidu-test"]);
function tokens(rawInput) {
  return rawInput.trim().split(/\s+/).filter((token) => token.length > 0);
}
async function readJsonBody(req) {
  const chunks = [];
  await new Promise((resolve4, reject) => {
    req.on("data", (chunk) => chunks.push(String(chunk)));
    req.on("end", () => resolve4());
    req.on("error", (error) => reject(error instanceof Error ? error : new Error(String(error))));
  });
  const raw = chunks.join("").trim();
  if (raw === "") return {};
  const parsed = JSON.parse(raw);
  return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
}
function writeJson(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}
function apply(ctx, config = {}) {
  const home = resolveDshHome();
  const base = config;
  let effective = config;
  const state = () => {
    const backupRoot = (effective.backupRoot?.trim() ?? "") === "" ? join6(home, "backups") : effective.backupRoot.trim();
    const kind = effective.remoteKind === "baidu" ? "baidu" : effective.remoteKind === "local" ? "local" : "webdav";
    const projectKind = effective.projectRemoteKind === "baidu" ? "baidu" : effective.projectRemoteKind === "webdav" ? "webdav" : effective.projectRemoteKind === "local" ? "local" : kind;
    return {
      backupRoot,
      includeAttachments: effective.includeAttachments ?? false,
      includeCredentials: effective.includeCredentials ?? false,
      includeSessions: effective.includeSessions !== false,
      includeStorages: effective.includeStorages !== false,
      projectPaths: (effective.projectPaths ?? []).filter((entry) => typeof entry === "string" && entry.trim() !== ""),
      projects: (effective.projects ?? []).filter((entry) => typeof entry === "string" && entry.trim() !== ""),
      projectIgnores: (effective.projectIgnores ?? []).filter((entry) => typeof entry === "string" && entry.trim() !== ""),
      autoKeep: effective.autoKeep ?? 10,
      remoteKind: kind,
      projectRemoteKind: projectKind,
      remote: effective.remote,
      baidu: effective.baidu
    };
  };
  const reloadSettings = async () => {
    const stored = await loadSettingsFile(home);
    effective = mergeConfig(base, stored);
  };
  const credentialValue = async (refName, fallback) => {
    if (fallback !== void 0 && fallback !== "") return fallback;
    const resolved = await ctx.credentials.resolve(credentialRef(refName));
    return resolved?.value;
  };
  const remoteConfigured = () => {
    const { remote } = state();
    return remote?.baseUrl !== void 0 && remote.baseUrl.trim() !== "";
  };
  const remoteAuth = async () => {
    const { remote } = state();
    if (!remoteConfigured() || remote === void 0) {
      throw new Error("\u672A\u914D\u7F6E\u8FDC\u7AEF\uFF1A\u8BF7\u5728\u8BBE\u7F6E\u9875\u586B\u5199 WebDAV \u5730\u5740\uFF08remote.baseUrl\uFF09");
    }
    const username = await credentialValue("WEBDAV_USERNAME", remote.username) ?? "";
    const password = await credentialValue("WEBDAV_PASSWORD", remote.password) ?? "";
    return { baseUrl: remote.baseUrl, username, password };
  };
  const persistBaidu = async (patch) => {
    const stored = await loadSettingsFile(home);
    await saveSettingsFile(home, { ...stored, baidu: { ...stored.baidu, ...patch } });
    await reloadSettings();
  };
  const baiduApp = () => {
    const { baidu } = state();
    return { appKey: (baidu?.appKey ?? "").trim(), secretKey: (baidu?.secretKey ?? "").trim() };
  };
  const ensureBaiduToken = async (force = false) => {
    const { baidu } = state();
    const current = (await credentialValue("BAIDU_NETDISK_ACCESS_TOKEN", baidu?.token) ?? "").trim();
    const refresh = (baidu?.refreshToken ?? "").trim();
    const expiresAt = baidu?.tokenExpiresAt ?? 0;
    const nearExpiry = expiresAt > 0 && expiresAt - Date.now() < REFRESH_MARGIN_MS;
    if (!force && current !== "" && !nearExpiry) return current;
    if (refresh === "") {
      if (current !== "" && !force) return current;
      throw new Error("\u767E\u5EA6 Token \u4E3A\u7A7A\u6216\u5DF2\u5931\u6548\uFF1A\u8BF7\u5728\u300C\u5907\u4EFD\u540C\u6B65\u300D\u8BBE\u7F6E\u9875\u70B9\u300C\u751F\u6210\u6388\u6743\u94FE\u63A5\u300D\u5B8C\u6210\u4E00\u6B21\u6388\u6743\uFF0C\u4E4B\u540E\u4F1A\u81EA\u52A8\u7EED\u671F");
    }
    const app = baiduApp();
    if (app.appKey === "" || app.secretKey === "") throw new Error("\u81EA\u52A8\u7EED\u671F\u9700\u8981 AppKey \u4E0E SecretKey\uFF1A\u8BF7\u5728\u8BBE\u7F6E\u9875\u586B\u5199");
    try {
      const next = await refreshToken(app, refresh);
      await persistBaidu({
        token: next.accessToken,
        refreshToken: next.refreshToken ?? refresh,
        tokenExpiresAt: next.expiresAt
      });
      ctx.logger.info("backup-sync: \u767E\u5EA6\u7F51\u76D8 token \u5DF2\u81EA\u52A8\u7EED\u671F");
      return next.accessToken;
    } catch (error) {
      if (current !== "" && !force) return current;
      throw error;
    }
  };
  const baiduAuth = async (force = false) => {
    const { baidu } = state();
    const token = await ensureBaiduToken(force);
    const pythonPath = (baidu?.pythonPath ?? "").trim();
    const scriptPath = (baidu?.scriptPath ?? "").trim();
    if (pythonPath === "" || scriptPath === "") throw new Error("\u672A\u914D\u7F6E\u767E\u5EA6\u7F51\u76D8 MCP \u8FD0\u884C\u65F6\uFF1A\u8BF7\u586B\u5199 Python \u89E3\u91CA\u5668\u4E0E fileupload_tool.py \u8DEF\u5F84");
    return { token, pythonPath, scriptPath, dir: baidu?.dir };
  };
  const createBackup = async (name2, signal) => {
    const current = state();
    const { meta, warnings } = await createSnapshot(current.backupRoot, home, name2, {
      includeAttachments: current.includeAttachments,
      includeCredentials: current.includeCredentials,
      includeSessions: current.includeSessions,
      includeStorages: current.includeStorages,
      projectPaths: current.projectPaths
    }, signal);
    const lines = [
      `\u5DF2\u521B\u5EFA\u5FEB\u7167 ${meta.name}\uFF1A${meta.files.length} \u6587\u4EF6 / ${formatBytes(totalBytes(meta.files))}`,
      `  \u4F4D\u7F6E\uFF1A${snapshotDir(current.backupRoot, meta.name)}`
    ];
    for (const warning of warnings) lines.push(`  \u8B66\u544A\uFF1A${warning}`);
    const pruned = await pruneSnapshots(current.backupRoot, current.autoKeep);
    if (pruned.length > 0) lines.push(`  \u5DF2\u6E05\u7406 ${pruned.length} \u4E2A\u65E7\u5FEB\u7167\uFF08\u6309\u4FDD\u7559\u7B56\u7565\uFF09`);
    return lines.join("\n");
  };
  const sweepArchives = async () => {
    const archived = [...ctx.workspaceRegistry.archivedSessionIds];
    if (archived.length === 0) return 0;
    const registry = ctx.workspaceRegistry;
    if (typeof registry.unarchiveSession !== "function") {
      throw new Error("\u5F53\u524D dsh \u7248\u672C\u4E0D\u652F\u6301\u53D6\u6D88\u5F52\u6863\uFF08\u9700\u8981\u542B workspace.unarchiveSession \u7684\u7248\u672C\uFF09");
    }
    let known;
    let removed = 0;
    for (const id of archived) {
      let exists = ctx.sessions.get(id) !== void 0;
      if (!exists) {
        if (known === void 0) {
          try {
            const headers = await ctx.sessionPersistence.list();
            known = new Set(headers.map((header) => header.id));
          } catch (error) {
            ctx.logger.warn("backup-sync: \u6821\u9A8C\u5F52\u6863\u4F1A\u8BDD\u5931\u8D25\uFF0C\u8DF3\u8FC7\uFF1A%s", errorMessage(error));
            return 0;
          }
        }
        exists = known.has(id);
      }
      if (!exists) {
        await registry.unarchiveSession(id);
        removed += 1;
      }
    }
    return removed;
  };
  const userFacing = (error) => {
    if (error instanceof WebDavError) {
      const code = error.status;
      if (code === 401 || code === 403) {
        return "\u8FDC\u7AEF\u8BA4\u8BC1\u5931\u8D25\uFF1A\u8BF7\u68C0\u67E5\u7528\u6237\u540D/\u5BC6\u7801\uFF08\u6216 WEBDAV_USERNAME / WEBDAV_PASSWORD \u51ED\u636E\uFF09";
      }
      if (code === 404) return "\u8FDC\u7AEF\u8DEF\u5F84\u4E0D\u5B58\u5728\uFF1A\u8BF7\u68C0\u67E5\u914D\u7F6E\u4E2D\u7684 WebDAV \u5730\u5740";
      if (code === 413) return "\u8FDC\u7AEF\u62D2\u7EDD\u4E0A\u4F20\uFF08\u53EF\u80FD\u7A7A\u95F4\u4E0D\u8DB3\uFF09\uFF0C\u8BF7\u6E05\u7406\u8FDC\u7AEF\u7A7A\u95F4\u540E\u91CD\u8BD5";
      return `\u8FDC\u7AEF\u8BF7\u6C42\u5931\u8D25\uFF08HTTP ${code ?? "\u672A\u77E5"}\uFF09`;
    }
    const raw = errorMessage(error);
    if (raw.includes("ENOENT")) return `\u672C\u5730\u6587\u4EF6\u8BFB\u53D6\u5931\u8D25\uFF08\u8DEF\u5F84\u4E0D\u5B58\u5728\u6216\u5DF2\u88AB\u79FB\u52A8\uFF09\uFF1A${raw.slice(0, 120)}`;
    return `\u64CD\u4F5C\u5931\u8D25\uFF1A${raw}`;
  };
  const pushToRemote = async (name2, signal) => {
    const current = state();
    const meta = await getSnapshot(current.backupRoot, name2);
    if (meta === void 0) throw new Error(`\u672C\u5730\u5FEB\u7167\u4E0D\u5B58\u5728\uFF1A${name2}\uFF08\u53EF\u7528 /backup list \u67E5\u770B\uFF09`);
    if (current.remoteKind === "local") {
      return `\u5FEB\u7167 ${name2} \u5DF2\u4FDD\u5B58\u5728\u672C\u5730\uFF08\u4EC5\u672C\u5730\u6A21\u5F0F\uFF0C\u672A\u63A8\u9001\uFF09\u3002
\u8981\u540C\u6B65\u5230\u4E91\u7AEF\uFF0C\u8BF7\u5728\u8BBE\u7F6E\u91CC\u628A\u300C\u5907\u4EFD\u5230\u300D\u6539\u4E3A\u767E\u5EA6\u7F51\u76D8\u6216 WebDAV \u540E\u518D\u63A8\u3002`;
    }
    if (current.remoteKind === "baidu") {
      const runPush = async (force) => pushSnapshotToBaidu(await baiduAuth(force), name2, meta, snapshotDir(current.backupRoot, name2), signal);
      let result;
      try {
        result = await runPush(false);
      } catch (error) {
        if (!/token|20017|401|31021|expired/i.test(errorMessage(error))) throw error;
        result = await runPush(true);
      }
      const parts2 = [`\u5DF2\u63A8\u9001\u5FEB\u7167 ${name2} \u5230\u767E\u5EA6\u7F51\u76D8\uFF1A${result.uploaded} \u6587\u4EF6\u4E0A\u4F20\uFF08${result.root}/${name2}\uFF09`];
      if (result.mode === "flat") parts2.push("\u76EE\u5F55\u4E0D\u53EF\u5199\uFF0C\u5DF2\u6539\u7528\u6241\u5E73\u547D\u540D");
      for (const warning of result.warnings) parts2.push(`  \u8B66\u544A\uFF1A${warning}`);
      parts2.push("\u6CE8\u610F\uFF1A\u4E0A\u4F20\u578B MCP \u4E0D\u63D0\u4F9B\u8FDC\u7AEF\u679A\u4E3E/\u4E0B\u8F7D\uFF0C\u6062\u590D\u8BF7\u4F7F\u7528\u672C\u5730\u5FEB\u7167");
      return parts2.join("\n");
    }
    const config2 = await remoteAuth();
    const { uploaded, skipped, removed } = await pushSnapshot(config2, name2, meta, snapshotDir(current.backupRoot, name2), signal);
    const parts = [`\u5DF2\u63A8\u9001\u5FEB\u7167 ${name2} \u5230 WebDAV\uFF1A${uploaded} \u6587\u4EF6\u4E0A\u4F20`];
    if (skipped > 0) parts.push(`${skipped} \u6587\u4EF6\u8DF3\u8FC7\uFF08\u672A\u53D8\u5316\uFF09`);
    if (removed > 0) parts.push(`\u6E05\u7406\u8FDC\u7AEF\u6B8B\u7559 ${removed} \u4E2A`);
    return parts.join("\uFF0C");
  };
  const command = async (invocation) => {
    try {
      await reloadSettings();
      const args = tokens(invocation.rawInput);
      const sub = args[0] ?? "";
      const signal = invocation.signal;
      if (sub === "" || sub === "create") {
        const name2 = args[1] ?? defaultSnapshotName();
        return { kind: "success", text: await createBackup(name2, signal) };
      }
      if (!SUBCOMMANDS.has(sub)) {
        return { kind: "success", text: await createBackup(sub, signal) };
      }
      if (sub === "list") {
        const current = state();
        const lines = [];
        const local = await listSnapshots(current.backupRoot);
        if (local.length === 0) {
          lines.push("\u672C\u5730\u5FEB\u7167\uFF1A\u65E0\uFF08\u53D1\u9001 /backup \u5373\u53EF\u521B\u5EFA\uFF09");
        } else {
          lines.push(`\u672C\u5730\u5FEB\u7167\uFF08${local.length}\uFF09\uFF1A`);
          for (const snapshot of local) lines.push(summarizeLine(snapshot));
        }
        if (current.remoteKind === "local") {
          lines.push("\u8FDC\u7AEF\uFF1A\u672A\u542F\u7528\uFF08\u4EC5\u672C\u5730\u6A21\u5F0F\uFF0C\u5FEB\u7167\u53EA\u4FDD\u5B58\u5728\u672C\u5730\u78C1\u76D8\uFF09");
        } else if (current.remoteKind === "baidu") {
          lines.push(`\u8FDC\u7AEF\u540E\u7AEF\uFF1A\u767E\u5EA6\u7F51\u76D8\uFF08${current.baidu?.dir ?? "/\u6765\u81EA\uFF1Amcp_server/dsh-backup"}\uFF09\u2014 \u4E0A\u4F20\u578B MCP\uFF0C\u4E0D\u63D0\u4F9B\u8FDC\u7AEF\u5217\u8868`);
        } else if (remoteConfigured()) {
          try {
            const config2 = await remoteAuth();
            const names = await listRemoteSnapshots(config2, signal);
            lines.push(names.length === 0 ? "\u8FDC\u7AEF\u5FEB\u7167\uFF1A\u65E0" : `\u8FDC\u7AEF\u5FEB\u7167\uFF08${names.length}\uFF09\uFF1A
${names.map((n) => `  ${n}`).join("\n")}`);
          } catch (error) {
            lines.push(`\u8FDC\u7AEF\u5FEB\u7167\uFF1A\u8BFB\u53D6\u5931\u8D25\uFF08${userFacing(error)}\uFF09`);
          }
        } else {
          lines.push("\u8FDC\u7AEF\uFF1A\u672A\u914D\u7F6E\uFF08\u53EF\u5728\u8BBE\u7F6E\u9875\u300C\u5907\u4EFD\u540C\u6B65\u300D\u91CC\u586B\u5199\uFF09");
        }
        return { kind: "success", text: lines.join("\n") };
      }
      if (sub === "push") {
        const name2 = args[1] ?? "";
        if (name2 === "") return { kind: "error", text: "\u7528\u6CD5\uFF1A/backup push <\u5FEB\u7167\u540D>" };
        assertSnapshotName(name2);
        return { kind: "success", text: await pushToRemote(name2, signal) };
      }
      if (sub === "pull") {
        const name2 = args[1] ?? "";
        if (name2 === "") return { kind: "error", text: "\u7528\u6CD5\uFF1A/backup pull <\u5FEB\u7167\u540D> [--force]" };
        assertSnapshotName(name2);
        if (state().remoteKind === "baidu") {
          return { kind: "error", text: "\u767E\u5EA6\u7F51\u76D8\u540E\u7AEF\u4E0D\u652F\u6301\u4E0B\u8F7D\uFF1A\u4E0A\u4F20\u578B MCP \u53EA\u63D0\u4F9B\u4E0A\u4F20\u3002\u8BF7\u7528 WebDAV \u540E\u7AEF\u540C\u6B65\uFF0C\u6216\u7528\u7F51\u76D8\u5BA2\u6237\u7AEF\u53D6\u56DE\u5FEB\u7167\u3002" };
        }
        const force = args.includes("--force");
        const config2 = await remoteAuth();
        const current = state();
        const { meta, downloaded, removed } = await pullSnapshot(config2, name2, snapshotDir(current.backupRoot, name2), signal, force);
        const lines = [
          `\u5DF2\u540C\u6B65\u5FEB\u7167 ${name2}\uFF1A${downloaded} \u6587\u4EF6\u4E0B\u8F7D / ${removed} \u6587\u4EF6\u6E05\u7406\uFF08\u5171 ${meta.files.length} \u6587\u4EF6 / ${formatBytes(totalBytes(meta.files))}\uFF09`,
          `  \u4F4D\u7F6E\uFF1A${snapshotDir(current.backupRoot, name2)}`,
          "\u4E0B\u4E00\u6B65\uFF1A/backup restore <\u5FEB\u7167\u540D> \u6062\u590D\u6570\u636E"
        ];
        return { kind: "success", text: lines.join("\n") };
      }
      if (sub === "restore") {
        const name2 = args[1] ?? "";
        if (name2 === "") return { kind: "error", text: "\u7528\u6CD5\uFF1A/backup restore <\u5FEB\u7167\u540D> [--all]" };
        assertSnapshotName(name2);
        const all = args.includes("--all");
        const current = state();
        const { restored, skipped, warnings, safeguardName } = await restoreSnapshot(current.backupRoot, home, name2, {
          all,
          safeguard: true
        }, signal);
        const lines = [];
        if (safeguardName !== void 0) {
          lines.push(`\u6062\u590D\u524D\u5DF2\u5BF9\u73B0\u72B6\u5EFA\u4FDD\u9669\u5FEB\u7167\uFF1A${safeguardName}`);
        }
        lines.push(`\u5DF2\u6062\u590D\uFF1A${restored.map(sectionLabel).join("\u3001")}`);
        if (skipped.length > 0) lines.push(`\u672A\u6062\u590D\uFF1A${skipped.map(sectionLabel).join("\u3001")}`);
        for (const warning of warnings) lines.push(`  \u8B66\u544A\uFF1A${warning}`);
        if (all) {
          lines.push("\u914D\u7F6E\u5C42\u5DF2\u8FD8\u539F\uFF08\u8BBE\u7F6E\u4E0E\u5404 profile \u914D\u7F6E\u5C06\u56DE\u9000\u4E3A\u5FEB\u7167\u65F6\u7684\u72B6\u6001\uFF09\uFF0C\u8BF7\u91CD\u542F dsh \u751F\u6548");
        }
        try {
          const swept = await sweepArchives();
          if (swept > 0) lines.push(`\u5DF2\u6E05\u7406 ${swept} \u4E2A\u5931\u6548\u5F52\u6863\uFF08\u4F1A\u8BDD\u65E5\u5FD7\u5DF2\u4E0D\u5B58\u5728\uFF09`);
        } catch (error) {
          lines.push(`  \u8B66\u544A\uFF1A\u6E05\u7406\u5931\u6548\u5F52\u6863\u5931\u8D25\uFF08${errorMessage(error)}\uFF09`);
        }
        return { kind: "success", text: lines.join("\n") };
      }
      if (sub === "sweep-archives") {
        const swept = await sweepArchives();
        const total = ctx.workspaceRegistry.archivedSessionIds.length;
        return { kind: "success", text: swept === 0 ? `\u5F52\u6863\u5217\u8868\u6B63\u5E38\uFF08${total} \u4E2A\u4F1A\u8BDD\uFF0C\u65E0\u5931\u6548\u6761\u76EE\uFF09` : `\u5DF2\u6E05\u7406 ${swept} \u4E2A\u5931\u6548\u5F52\u6863\uFF08\u5269\u4F59 ${total} \u4E2A\uFF09` };
      }
      if (sub === "baidu-test") {
        const auth = await baiduAuth();
        const { tools } = await testBaidu(auth);
        return { kind: "success", text: `\u767E\u5EA6\u7F51\u76D8 MCP \u8FDE\u901A\uFF1A\u5DE5\u5177 ${tools.join(", ") || "\uFF08\u65E0\uFF09"}` };
      }
      if (sub === "prune") {
        const keepArg = args[1];
        if (keepArg !== void 0 && !/^\d+$/.test(keepArg)) {
          return { kind: "error", text: `\u4FDD\u7559\u6570\u975E\u6CD5\uFF1A${keepArg}` };
        }
        const current = state();
        const keep = keepArg !== void 0 ? parseInt(keepArg, 10) : current.autoKeep;
        const removed = await pruneSnapshots(current.backupRoot, keep);
        const remaining = (await listSnapshots(current.backupRoot)).length;
        return { kind: "success", text: removed.length === 0 ? `\u65E0\u9700\u6E05\u7406\uFF08\u4FDD\u7559 ${keep} \u4E2A\uFF0C\u5F53\u524D\u5171 ${remaining} \u4E2A\uFF09` : `\u5DF2\u6E05\u7406 ${removed.length} \u4E2A\u65E7\u5FEB\u7167\uFF08\u5269\u4F59 ${remaining} \u4E2A\uFF0C\u53EF\u7528 /backup list \u67E5\u770B\uFF09` };
      }
      if (sub === "remote-prune") {
        const name2 = args[1] ?? "";
        if (name2 === "") return { kind: "error", text: "\u7528\u6CD5\uFF1A/backup remote-prune <\u5FEB\u7167\u540D>" };
        assertSnapshotName(name2);
        if (state().remoteKind === "baidu") {
          return { kind: "error", text: "\u767E\u5EA6\u7F51\u76D8\u540E\u7AEF\u4E0D\u652F\u6301\u8FDC\u7AEF\u5220\u9664\uFF1A\u8BF7\u5728\u7F51\u76D8\u5BA2\u6237\u7AEF\u5220\u9664\u5BF9\u5E94\u76EE\u5F55\u3002" };
        }
        const config2 = await remoteAuth();
        await removeRemoteSnapshot(config2, name2, signal);
        return { kind: "success", text: `\u5DF2\u5220\u9664\u8FDC\u7AEF\u5FEB\u7167\uFF1A${name2}` };
      }
      return { kind: "error", text: `\u672A\u77E5\u5B50\u547D\u4EE4\uFF1A${sub}
\u7528\u6CD5\uFF1A
  /backup [\u5FEB\u7167\u540D]        \u521B\u5EFA\u5FEB\u7167
  /backup list             \u5217\u51FA\u672C\u5730\u4E0E\u8FDC\u7AEF\u5FEB\u7167
  /backup push <\u5FEB\u7167\u540D>    \u63A8\u9001\u5230\u8FDC\u7AEF\uFF08WebDAV / \u767E\u5EA6\u7F51\u76D8\uFF09
  /backup pull <\u5FEB\u7167\u540D> [--force]  \u4ECE WebDAV \u540C\u6B65\u5FEB\u7167
  /backup restore <\u5FEB\u7167\u540D> [--all] \u4ECE\u5FEB\u7167\u6062\u590D\u6570\u636E
  /backup baidu-test       \u81EA\u68C0\u767E\u5EA6\u7F51\u76D8 MCP
  /backup prune [\u4FDD\u7559\u6570]   \u6E05\u7406\u65E7\u5FEB\u7167
  /backup remote-prune <\u5FEB\u7167\u540D>   \u5220\u9664 WebDAV \u8FDC\u7AEF\u5FEB\u7167
  /backup sweep-archives   \u6E05\u7406\u5931\u6548\u7684\u4F1A\u8BDD\u5F52\u6863` };
    } catch (error) {
      return { kind: "error", text: userFacing(error) };
    }
  };
  ctx.effect(() => ctx.commands.register({
    name: "backup",
    description: "\u5907\u4EFD/\u6062\u590D\u4E0E\u8DE8\u673A\u540C\u6B65\uFF1A\u672C\u5730\u5FEB\u7167\u3001WebDAV / \u767E\u5EA6\u7F51\u76D8\u63A8\u9001\u3001\u6062\u590D\u4E0E\u4FDD\u7559\u6E05\u7406",
    input: { hint: "[<\u5FEB\u7167\u540D>|list|push <\u5FEB\u7167\u540D>|pull <\u5FEB\u7167\u540D> [--force]|restore <\u5FEB\u7167\u540D> [--all]|baidu-test|prune [\u4FDD\u7559\u6570]|sweep-archives]" },
    handler: command
  }), "backup-sync: /backup");
  const webServer = ctx.webServer;
  const connection = ctx.connection;
  let pendingDevice;
  const requireProjectPath = (payload) => {
    const path = typeof payload.path === "string" ? payload.path.trim() : "";
    if (path === "") throw new Error("\u7F3A\u5C11\u9879\u76EE\u8DEF\u5F84\uFF08path\uFF09");
    return path;
  };
  const openDirectory = (target) => {
    if (!existsSync4(target)) throw new Error(`\u76EE\u5F55\u4E0D\u5B58\u5728\uFF1A${target}`);
    const child = process.platform === "win32" ? spawn2("explorer.exe", [target], { detached: true, stdio: "ignore" }) : process.platform === "darwin" ? spawn2("open", [target], { detached: true, stdio: "ignore" }) : spawn2("xdg-open", [target], { detached: true, stdio: "ignore" });
    child.on("error", () => void 0);
    child.unref();
  };
  const api = {
    "settings.get": async () => {
      await reloadSettings();
      const current = state();
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
            baseUrl: current.remote?.baseUrl ?? "",
            username: current.remote?.username ?? "",
            password: current.remote?.password ?? ""
          },
          baidu: {
            token: current.baidu?.token ?? "",
            pythonPath: current.baidu?.pythonPath ?? "",
            scriptPath: current.baidu?.scriptPath ?? "",
            dir: current.baidu?.dir ?? "/\u6765\u81EA\uFF1Amcp_server/dsh-backup",
            appKey: current.baidu?.appKey ?? "",
            secretKey: current.baidu?.secretKey ?? "",
            hasRefreshToken: (current.baidu?.refreshToken ?? "") !== "",
            tokenExpiresAt: current.baidu?.tokenExpiresAt ?? 0
          }
        }
      };
    },
    "settings.save": async (payload) => {
      const incoming = payload.settings ?? payload;
      const saved = await saveSettingsFile(home, incoming);
      await reloadSettings();
      return { ok: true, saved };
    },
    "baidu.authorizeUrl": async () => {
      await reloadSettings();
      const { appKey } = baiduApp();
      if (appKey === "") throw new Error("\u5148\u586B\u5199 AppKey\uFF08\u5E94\u7528\u51ED\u636E\u9875\u7684 AppKey\uFF09");
      return { ok: true, url: authorizeUrl(appKey) };
    },
    /** 一键自动获取：申请设备码，返回给用户确认的短码与链接。 */
    "baidu.deviceStart": async () => {
      await reloadSettings();
      const app = baiduApp();
      if (app.appKey === "") throw new Error("\u5148\u586B\u5199 AppKey");
      const started = await deviceStart(app.appKey);
      pendingDevice = { deviceCode: started.deviceCode, expiresAt: started.expiresAt };
      return {
        ok: true,
        userCode: started.userCode,
        verificationUrl: started.verificationUrl,
        qrcodeUrl: started.qrcodeUrl ?? "",
        intervalSec: started.intervalSec,
        expiresAt: started.expiresAt
      };
    },
    /** 轮询设备码授权结果；成功后自动写入 access_token / refresh_token。 */
    "baidu.devicePoll": async () => {
      await reloadSettings();
      if (pendingDevice === void 0) throw new Error("\u6CA1\u6709\u8FDB\u884C\u4E2D\u7684\u6388\u6743\uFF1A\u5148\u70B9\u300C\u4E00\u952E\u83B7\u53D6 Token\u300D");
      if (Date.now() > pendingDevice.expiresAt) {
        pendingDevice = void 0;
        return { ok: false, status: "expired", message: "\u8BBE\u5907\u7801\u5DF2\u8FC7\u671F\uFF0C\u8BF7\u91CD\u65B0\u70B9\u4E00\u6B21" };
      }
      const app = baiduApp();
      if (app.appKey === "" || app.secretKey === "") throw new Error("\u81EA\u52A8\u83B7\u53D6\u9700\u8981 AppKey \u4E0E SecretKey");
      const result = await devicePoll(app, pendingDevice.deviceCode);
      if (result.done && result.tokens !== void 0) {
        await persistBaidu({
          token: result.tokens.accessToken,
          refreshToken: result.tokens.refreshToken,
          tokenExpiresAt: result.tokens.expiresAt
        });
        pendingDevice = void 0;
        const check = await checkToken(result.tokens.accessToken);
        return {
          ok: true,
          status: "success",
          expiresAt: result.tokens.expiresAt ?? 0,
          hasRefreshToken: (result.tokens.refreshToken ?? "") !== "",
          check
        };
      }
      if (result.pending) return { ok: true, status: "pending" };
      pendingDevice = void 0;
      return { ok: false, status: "error", message: result.message ?? "\u6388\u6743\u5931\u8D25" };
    },
    "baidu.exchange": async (payload) => {
      await reloadSettings();
      const app = baiduApp();
      if (app.appKey === "" || app.secretKey === "") throw new Error("\u5148\u586B\u5199 AppKey \u4E0E SecretKey");
      const code = typeof payload.code === "string" ? payload.code.trim() : "";
      const next = await exchangeCode(app, code);
      await persistBaidu({
        token: next.accessToken,
        refreshToken: next.refreshToken,
        tokenExpiresAt: next.expiresAt
      });
      const check = await checkToken(next.accessToken);
      return {
        ok: true,
        expiresAt: next.expiresAt ?? 0,
        hasRefreshToken: (next.refreshToken ?? "") !== "",
        check
      };
    },
    "baidu.refresh": async () => {
      await reloadSettings();
      const token = await ensureBaiduToken(true);
      const check = await checkToken(token);
      return { ok: true, check };
    },
    "baidu.check": async () => {
      await reloadSettings();
      const token = await ensureBaiduToken(false);
      return { ok: true, check: await checkToken(token) };
    },
    "baidu.test": async () => {
      await reloadSettings();
      const auth = await baiduAuth();
      const check = await checkToken(auth.token);
      const result = await testBaidu(auth);
      return { ok: true, tools: result.tools, hasToken: result.hasToken, check };
    },
    "snapshots.list": async () => {
      await reloadSettings();
      const current = state();
      const snapshots = await listSnapshots(current.backupRoot);
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
          totalBytesLabel: formatBytes(snapshot.totalBytes)
        }))
      };
    },
    "backup.create": async (payload) => {
      await reloadSettings();
      const name2 = typeof payload.name === "string" && payload.name.trim() !== "" ? payload.name.trim() : defaultSnapshotName();
      const text = await createBackup(name2);
      return { ok: true, name: name2, text };
    },
    "backup.push": async (payload) => {
      await reloadSettings();
      const name2 = typeof payload.name === "string" ? payload.name.trim() : "";
      if (name2 === "") throw new Error("\u7F3A\u5C11\u5FEB\u7167\u540D");
      assertSnapshotName(name2);
      const text = await pushToRemote(name2);
      return { ok: true, text };
    },
    "backup.restore": async (payload) => {
      await reloadSettings();
      const name2 = typeof payload.name === "string" ? payload.name.trim() : "";
      if (name2 === "") throw new Error("\u7F3A\u5C11\u5FEB\u7167\u540D");
      assertSnapshotName(name2);
      const all = payload.all === true;
      const current = state();
      const result = await restoreSnapshot(current.backupRoot, home, name2, { all, safeguard: true });
      return { ok: true, restored: result.restored, skipped: result.skipped, safeguardName: result.safeguardName };
    },
    "backup.prune": async (payload) => {
      await reloadSettings();
      const current = state();
      const keep = typeof payload.keep === "number" ? payload.keep : current.autoKeep;
      const removed = await pruneSnapshots(current.backupRoot, keep);
      return { ok: true, removed: removed.length };
    },
    "backup.import": async (payload) => {
      await reloadSettings();
      const raw = typeof payload.path === "string" ? payload.path.trim() : "";
      if (raw === "") throw new Error("\u7F3A\u5C11\u5BFC\u5165\u8DEF\u5F84");
      const source = resolve3(raw);
      if (!existsSync4(source)) throw new Error(`\u8DEF\u5F84\u4E0D\u5B58\u5728\uFF1A${source}`);
      if (!existsSync4(join6(source, "meta.json"))) {
        throw new Error(`\u4E0D\u662F\u6709\u6548\u7684\u5FEB\u7167\u76EE\u5F55\uFF08\u7F3A\u5C11 meta.json\uFF09\uFF1A${source}
\u63D0\u793A\uFF1A\u5982\u679C\u4F60\u7684\u5907\u4EFD\u662F\u538B\u7F29\u5305\uFF0C\u5148\u89E3\u538B\u5230\u67D0\u4E2A\u76EE\u5F55\u518D\u5BFC\u5165`);
      }
      const current = state();
      const name2 = typeof payload.name === "string" && payload.name.trim() !== "" ? payload.name.trim() : basename4(source);
      assertSnapshotName(name2);
      const dest = snapshotDir(current.backupRoot, name2);
      if (existsSync4(dest)) throw new Error(`\u540C\u540D\u5FEB\u7167\u5DF2\u5B58\u5728\uFF1A${name2}\uFF08\u53EF\u6539\u540D\u540E\u5BFC\u5165\uFF09`);
      await mkdir5(dirname5(dest), { recursive: true });
      await cp3(source, dest, { recursive: true, force: false, errorOnExist: true });
      const metaPath = join6(dest, "meta.json");
      try {
        const parsed = JSON.parse(await readFile5(metaPath, "utf8"));
        if (parsed.name !== name2) {
          parsed.name = name2;
          await writeFile6(metaPath, `${JSON.stringify(parsed, null, 2)}
`, "utf8");
        }
      } catch (error) {
        throw new Error(`\u5FEB\u7167\u7684 meta.json \u65E0\u6CD5\u89E3\u6790\uFF0C\u5BFC\u5165\u5DF2\u4E2D\u6B62\uFF1A${errorMessage(error)}`);
      }
      const meta = await getSnapshot(current.backupRoot, name2);
      return { ok: true, name: name2, fileCount: meta?.files.length ?? 0, backupRoot: current.backupRoot };
    },
    // ---- 项目快照（复刻 vscode-local-snapshots 的命名快照模型） ----
    "projects.list": async () => {
      await reloadSettings();
      const current = state();
      const known = await listProjects(current.backupRoot);
      const merged = /* @__PURE__ */ new Map();
      for (const entry of known) {
        if (entry.projectPath === "") continue;
        merged.set(entry.projectPath.toLowerCase(), { path: entry.projectPath, snapshots: entry.snapshots, watched: false });
      }
      for (const path of current.projects) {
        const key = path.toLowerCase();
        const prev = merged.get(key);
        merged.set(key, { path, snapshots: prev?.snapshots ?? 0, watched: true });
      }
      return { ok: true, projects: [...merged.values()] };
    },
    "project.snapshots": async (payload) => {
      await reloadSettings();
      const current = state();
      const path = requireProjectPath(payload);
      return { ok: true, projectPath: path, snapshots: await listProjectSnapshots(current.backupRoot, path) };
    },
    "project.snapshot": async (payload) => {
      await reloadSettings();
      const current = state();
      const path = requireProjectPath(payload);
      const rawName = typeof payload.name === "string" && payload.name.trim() !== "" ? payload.name.trim() : `snap-${(/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-")}`;
      const { meta, skipped } = await createProjectSnapshot(current.backupRoot, path, rawName, {
        ignores: current.projectIgnores
      });
      const pruned = await pruneProjectSnapshots(current.backupRoot, path, current.autoKeep);
      const name2 = sanitizeProjectName(rawName);
      return {
        ok: true,
        name: name2,
        fileCount: meta.fileCount,
        totalBytes: meta.totalBytes,
        totalBytesLabel: formatBytes(meta.totalBytes),
        skipped,
        pruned: pruned.length,
        location: projectSnapshotDir(current.backupRoot, path, name2)
      };
    },
    "project.files": async (payload) => {
      await reloadSettings();
      const current = state();
      const path = requireProjectPath(payload);
      const name2 = typeof payload.name === "string" ? payload.name.trim() : "";
      const meta = await getProjectSnapshot(current.backupRoot, path, name2);
      if (meta === void 0) throw new Error(`\u9879\u76EE\u5FEB\u7167\u4E0D\u5B58\u5728\uFF1A${name2}`);
      return { ok: true, name: name2, projectPath: meta.projectPath, files: meta.files.slice(0, 2e3), truncated: meta.files.length > 2e3 };
    },
    "project.restore": async (payload) => {
      await reloadSettings();
      const current = state();
      const path = requireProjectPath(payload);
      const name2 = typeof payload.name === "string" ? payload.name.trim() : "";
      if (name2 === "") throw new Error("\u7F3A\u5C11\u5FEB\u7167\u540D\uFF08name\uFF09");
      const result = await restoreProjectSnapshot(current.backupRoot, path, name2, {
        mode: payload.mode === "exact" ? "exact" : "overwrite",
        safeguard: payload.safeguard !== false
      });
      return { ok: true, ...result };
    },
    "project.restoreFile": async (payload) => {
      await reloadSettings();
      const current = state();
      const path = requireProjectPath(payload);
      const name2 = typeof payload.name === "string" ? payload.name.trim() : "";
      const file = typeof payload.file === "string" ? payload.file.trim() : "";
      if (file === "") throw new Error("\u7F3A\u5C11\u6587\u4EF6\u8DEF\u5F84\uFF08file\uFF09");
      await restoreProjectFile(current.backupRoot, path, name2, file);
      return { ok: true, file };
    },
    "project.remove": async (payload) => {
      await reloadSettings();
      const current = state();
      const path = requireProjectPath(payload);
      const name2 = typeof payload.name === "string" ? payload.name.trim() : "";
      await removeProjectSnapshot(current.backupRoot, path, name2);
      return { ok: true, name: name2 };
    },
    /** 把项目快照推送到所选远端（百度网盘 / WebDAV）。 */
    "project.push": async (payload) => {
      await reloadSettings();
      const current = state();
      const path = requireProjectPath(payload);
      const name2 = sanitizeProjectName(typeof payload.name === "string" ? payload.name.trim() : "");
      if (name2 === "") throw new Error("\u7F3A\u5C11\u5FEB\u7167\u540D");
      const meta = await getProjectSnapshot(current.backupRoot, path, name2);
      if (meta === void 0) throw new Error(`\u9879\u76EE\u5FEB\u7167\u4E0D\u5B58\u5728\uFF1A${name2}`);
      if (current.projectRemoteKind === "local") {
        return { ok: true, text: `\u5FEB\u7167 ${name2} \u5DF2\u4FDD\u5B58\u5728\u672C\u5730\uFF08\u4EC5\u672C\u5730\u6A21\u5F0F\uFF0C\u672A\u63A8\u9001\uFF09\u3002\u628A\u300C\u5907\u4EFD\u5230\u300D\u6539\u6210\u767E\u5EA6\u7F51\u76D8\u6216 WebDAV \u540E\u518D\u63A8\u3002` };
      }
      const localDir = projectSnapshotDir(current.backupRoot, path, name2);
      const remoteBase = `${projectKey(path)}/${name2}`;
      if (current.projectRemoteKind === "baidu") {
        const auth = await baiduAuth();
        const base2 = ((auth.dir ?? "").trim() === "" ? DEFAULT_BAIDU_DIR : auth.dir.trim()).replace(/\/+$/, "");
        const result2 = await pushDirectoryToBaidu(auth, `${base2}/projects/${remoteBase}`, localDir);
        const parts = [`\u5DF2\u63A8\u9001\u9879\u76EE\u5FEB\u7167 ${name2} \u5230\u767E\u5EA6\u7F51\u76D8\uFF1A${result2.uploaded} \u6587\u4EF6\uFF08${result2.root}\uFF09`];
        if (result2.mode === "flat") parts.push("\u76EE\u5F55\u4E0D\u53EF\u5199\uFF0C\u5DF2\u6539\u7528\u6241\u5E73\u547D\u540D");
        for (const warning of result2.warnings) parts.push(`  \u8B66\u544A\uFF1A${warning}`);
        return { ok: true, text: parts.join("\n") };
      }
      const config2 = await remoteAuth();
      const dirUrl = `${config2.baseUrl.replace(/\/+$/, "")}/dsh-backup/projects/${remoteBase}`;
      const result = await pushDirectoryToWebDav(config2, dirUrl, localDir);
      return { ok: true, text: `\u5DF2\u63A8\u9001\u9879\u76EE\u5FEB\u7167 ${name2} \u5230 WebDAV\uFF1A${result.uploaded}/${result.total} \u6587\u4EF6` };
    },
    // ---- 打开备份文件夹 ----
    "backup.remove": async (payload) => {
      await reloadSettings();
      const current = state();
      const name2 = typeof payload.name === "string" ? payload.name.trim() : "";
      if (name2 === "") throw new Error("\u7F3A\u5C11\u5FEB\u7167\u540D\uFF08name\uFF09");
      assertSnapshotName(name2);
      const target = snapshotDir(current.backupRoot, name2);
      if (!existsSync4(target)) throw new Error(`\u5FEB\u7167\u4E0D\u5B58\u5728\uFF1A${name2}`);
      await rm4(target, { recursive: true, force: true });
      return { ok: true, name: name2 };
    },
    "backup.open": async (payload) => {
      await reloadSettings();
      const current = state();
      const name2 = typeof payload.name === "string" ? payload.name.trim() : "";
      const target = name2 === "" ? current.backupRoot : snapshotDir(current.backupRoot, name2);
      openDirectory(target);
      return { ok: true, path: target };
    },
    "project.open": async (payload) => {
      await reloadSettings();
      const current = state();
      const path = requireProjectPath(payload);
      const name2 = sanitizeProjectName(typeof payload.name === "string" ? payload.name.trim() : "");
      const target = name2 === "" ? projectStoreRoot(current.backupRoot, path) : projectSnapshotDir(current.backupRoot, path, name2);
      openDirectory(target);
      return { ok: true, path: target };
    },
    // ---- 会话所属项目反查（会话 Tab「备份」用） ----
    "workspace.default": async () => {
      try {
        const raw = await readFile5(join6(home, "storages", "workspace.json"), "utf8");
        const parsed = JSON.parse(raw);
        const workspaces = parsed.tables?.workspaces ?? {};
        const defaultId = parsed.global?.defaultWorkspaceId ?? "";
        const preferred = defaultId !== "" ? workspaces[defaultId] : void 0;
        if (preferred !== void 0 && (preferred.path ?? "") !== "") {
          return { ok: true, projectPath: String(preferred.path), title: String(preferred.title ?? "") };
        }
        const newest = Object.values(workspaces).filter((entry) => (entry.path ?? "") !== "").sort((a, b) => String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? "")))[0];
        return { ok: true, projectPath: String(newest?.path ?? ""), title: String(newest?.title ?? "") };
      } catch {
        return { ok: true, projectPath: "", title: "" };
      }
    },
    "session.project": async (payload) => {
      const sessionId = typeof payload.sessionId === "string" ? payload.sessionId.trim() : "";
      if (sessionId === "") return { ok: true, projectPath: "", title: "" };
      try {
        const raw = await readFile5(join6(home, "storages", "workspace.json"), "utf8");
        const parsed = JSON.parse(raw);
        const workspaces = parsed.tables?.workspaces ?? {};
        for (const entry of Object.values(workspaces)) {
          if (Array.isArray(entry.sessionIds) && entry.sessionIds.includes(sessionId)) {
            return { ok: true, projectPath: String(entry.path ?? ""), title: String(entry.title ?? "") };
          }
        }
      } catch {
      }
      return { ok: true, projectPath: "", title: "" };
    },
    // ---- 目录浏览（设置页「选择目录」用，只返回目录） ----
    "fs.list": async (payload) => {
      const raw = typeof payload.path === "string" ? payload.path.trim() : "";
      if (raw === "") {
        const drives = [];
        for (let code = 65; code <= 90; code += 1) {
          const letter = `${String.fromCharCode(code)}:\\`;
          if (existsSync4(letter)) drives.push({ name: letter, path: letter });
        }
        return { ok: true, path: "", parent: null, directories: drives };
      }
      const target = resolve3(raw);
      const info = await stat5(target).catch(() => void 0);
      if (info === void 0) throw new Error(`\u8DEF\u5F84\u4E0D\u5B58\u5728\uFF1A${target}`);
      if (!info.isDirectory()) throw new Error(`\u4E0D\u662F\u76EE\u5F55\uFF1A${target}`);
      const entries = await readdir5(target, { withFileTypes: true }).catch(() => []);
      const directories = entries.filter((entry) => entry.isDirectory() && !entry.name.startsWith(".")).filter((entry) => entry.name !== "node_modules").map((entry) => ({ name: entry.name, path: join6(target, entry.name) })).sort((a, b) => a.name.localeCompare(b.name));
      const parent = dirname5(target) === target ? "" : dirname5(target);
      return { ok: true, path: target, parent, directories };
    }
  };
  ctx.effect(() => webServer.register({
    kind: "prefix",
    path: "/backup-sync/api",
    handler: async (req, res) => {
      const rejection = connection.requestRejection(req);
      if (rejection !== void 0) {
        writeJson(res, 403, { ok: false, error: "forbidden" });
        return;
      }
      if ((req.method ?? "").toUpperCase() !== "POST") {
        writeJson(res, 405, { ok: false, error: "method not allowed" });
        return;
      }
      const pathname = new URL(req.url ?? "/", "http://dsh.internal").pathname;
      const method = pathname.startsWith("/backup-sync/api/") ? pathname.slice("/backup-sync/api/".length) : "";
      if (method === "" || method.includes("/")) {
        writeJson(res, 404, { ok: false, error: "unknown method" });
        return;
      }
      const handlerFor = Object.hasOwn(api, method) ? api[method] : void 0;
      if (handlerFor === void 0) {
        writeJson(res, 404, { ok: false, error: `unknown method "${method}"` });
        return;
      }
      try {
        const payload = await readJsonBody(req);
        writeJson(res, 200, await handlerFor(payload));
      } catch (error) {
        writeJson(res, 500, { ok: false, error: userFacing(error) });
      }
    }
  }), "backup-sync: /backup-sync/api routes");
  const autoMinutes = config.autoIntervalMinutes ?? 0;
  if (autoMinutes > 0) {
    let running = false;
    ctx.effect(() => ctx.interval(async () => {
      if (running) return;
      running = true;
      try {
        await reloadSettings();
        const current = state();
        const interval = effective.autoIntervalMinutes ?? 0;
        if (interval <= 0) return;
        const name2 = defaultSnapshotName();
        await createSnapshot(current.backupRoot, home, name2, {
          includeAttachments: current.includeAttachments,
          includeCredentials: current.includeCredentials
        });
        await pruneSnapshots(current.backupRoot, current.autoKeep);
        ctx.logger.info("backup-sync: \u81EA\u52A8\u5FEB\u7167 %s \u5B8C\u6210", name2);
      } catch (error) {
        ctx.logger.warn("backup-sync: \u81EA\u52A8\u5FEB\u7167\u5931\u8D25\uFF1A%s", errorMessage(error));
      } finally {
        running = false;
      }
    }, autoMinutes * 60 * 1e3), "backup-sync: auto-backup");
    ctx.logger.info("backup-sync: \u81EA\u52A8\u5907\u4EFD\u5DF2\u542F\u7528\uFF08\u6BCF %d \u5206\u949F\uFF0C\u4FDD\u7559 %d \u4E2A\uFF09", autoMinutes, config.autoKeep ?? 10);
  }
}
export {
  apply,
  inject,
  name
};
