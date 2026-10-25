# 构建 dsh-backup-sync：host 半区（ESM）+ browser 半区（CJS + module-loader 包装）
# 用本机 DSH profile 里的 esbuild 二进制，避免联网安装构建链。
$ErrorActionPreference = 'Stop'
$work = Split-Path -Parent $MyInvocation.MyCommand.Path
$eb = Join-Path $env:USERPROFILE '.dsh\profiles\desktop\node_modules\@esbuild\win32-x64\esbuild.exe'
if (-not (Test-Path $eb)) { throw "esbuild not found: $eb" }

$lib = Join-Path $work 'lib'
New-Item -ItemType Directory -Force -Path $lib | Out-Null

$hostArgs = @(
  (Join-Path $work 'src/index.ts'),
  '--bundle', '--format=esm', '--platform=node', '--target=es2022',
  ('--outfile=' + (Join-Path $lib 'index.js')),
  '--external:@deepseek-ai/*', '--external:node:*',
  '--log-level=warning'
)
& $eb @hostArgs
if ($LASTEXITCODE -ne 0) { throw "host build failed: $LASTEXITCODE" }

$banner = "--banner:js=window.__ModuleLoader__.load({ id: '@dsh-external/dsh-backup-sync', factory: (require) => { var module = { exports: {} }; var exports = module.exports;"
$footer = '--footer:js=return module.exports; } });'
$clientArgs = @(
  (Join-Path $work 'src/client/index.ts'),
  '--bundle', '--format=cjs', '--platform=browser', '--target=es2022',
  ('--outfile=' + (Join-Path $lib 'client.js')),
  '--external:react', '--external:react/*', '--external:@deepseek-ai/*',
  $banner, $footer,
  '--log-level=warning'
)
& $eb @clientArgs
if ($LASTEXITCODE -ne 0) { throw "client build failed: $LASTEXITCODE" }

Get-ChildItem $lib | Select-Object Name, Length | Format-Table -AutoSize
