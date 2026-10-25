/**
 * 百度网盘 OAuth：用应用的 AppKey / SecretKey 换取并续期用户级 Access Token。
 *
 * 流程（官方 OAuth 2.0）：
 *   1. 用户在浏览器打开 authorize 链接并授权 → 页面显示授权码（redirect_uri=oob）
 *   2. 用授权码 + SecretKey 调 token 接口 → access_token + refresh_token + expires_in
 *   3. access_token 过期前用 refresh_token 续期（refresh_token 也会轮换，需回写）
 */
const TOKEN_ENDPOINT = 'https://openapi.baidu.com/oauth/2.0/token'
const AUTHORIZE_ENDPOINT = 'https://openapi.baidu.com/oauth/2.0/authorize'
const UINFO_ENDPOINT = 'https://pan.baidu.com/rest/2.0/xpan/nas'
const DEFAULT_SCOPE = 'basic,netdisk'

export interface OAuthApp {
  readonly appKey: string
  readonly secretKey: string
}

export interface TokenSet {
  readonly accessToken: string
  readonly refreshToken?: string
  /** 过期时间戳（毫秒）；未知时 undefined。 */
  readonly expiresAt?: number
  readonly scope?: string
}

export interface TokenCheck {
  readonly ok: boolean
  readonly errno?: number
  readonly message: string
  readonly netdiskName?: string
}

/** 授权页地址；redirect_uri=oob 时百度在授权后把 code 直接显示在页面上。 */
export function authorizeUrl(appKey: string, scope = DEFAULT_SCOPE): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: appKey,
    redirect_uri: 'oob',
    scope,
  })
  return `${AUTHORIZE_ENDPOINT}?${params.toString()}`
}

interface RawTokenResponse {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  scope?: string
  error?: string
  error_description?: string
}

async function requestToken(query: Record<string, string>): Promise<TokenSet> {
  const url = `${TOKEN_ENDPOINT}?${new URLSearchParams(query).toString()}`
  const response = await fetch(url)
  const text = await response.text()
  let body: RawTokenResponse
  try {
    body = JSON.parse(text) as RawTokenResponse
  } catch {
    throw new Error(`百度 token 接口返回非 JSON（HTTP ${response.status}）：${text.slice(0, 160)}`)
  }
  if (body.error !== undefined || body.access_token === undefined) {
    const detail = body.error_description ?? body.error ?? `HTTP ${response.status}`
    throw new Error(`百度 token 接口拒绝：${detail}`)
  }
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresAt: body.expires_in === undefined ? undefined : Date.now() + body.expires_in * 1000,
    scope: body.scope,
  }
}

/** 用授权码换 token（同时拿到 refresh_token，后续可长期自动续期）。 */
export function exchangeCode(app: OAuthApp, code: string, scope = DEFAULT_SCOPE): Promise<TokenSet> {
  const trimmed = code.trim()
  if (trimmed === '') throw new Error('授权码为空')
  return requestToken({
    grant_type: 'authorization_code',
    code: trimmed,
    client_id: app.appKey,
    client_secret: app.secretKey,
    redirect_uri: 'oob',
    scope,
  })
}

/** 用 refresh_token 续期；返回的新 refresh_token 需覆盖旧值。 */
export function refreshToken(app: OAuthApp, token: string, scope = DEFAULT_SCOPE): Promise<TokenSet> {
  const trimmed = token.trim()
  if (trimmed === '') throw new Error('refresh_token 为空')
  return requestToken({
    grant_type: 'refresh_token',
    refresh_token: trimmed,
    client_id: app.appKey,
    client_secret: app.secretKey,
    scope,
  })
}

/** 校验 access_token 是否真的能用（网盘 nas 接口），把 errno 原样报出来。 */
export async function checkToken(accessToken: string): Promise<TokenCheck> {
  const token = accessToken.trim()
  if (token === '') return { ok: false, message: 'token 为空' }
  try {
    const response = await fetch(`${UINFO_ENDPOINT}?method=uinfo&access_token=${encodeURIComponent(token)}`)
    const text = await response.text()
    const body = JSON.parse(text) as { errno?: number; baidu_name?: string; netdisk_name?: string; show_msg?: string }
    if (body.errno !== undefined && body.errno !== 0) {
      return {
        ok: false,
        errno: body.errno,
        message: body.show_msg ?? `errno ${body.errno}`,
      }
    }
    return { ok: true, message: 'token 有效', netdiskName: body.netdisk_name ?? body.baidu_name }
  } catch (error) {
    return { ok: false, message: `校验请求失败：${error instanceof Error ? error.message : String(error)}` }
  }
}

/** 距离过期不足该阈值就提前续期。 */
export const REFRESH_MARGIN_MS = 10 * 60 * 1000

const DEVICE_ENDPOINT = 'https://openapi.baidu.com/oauth/2.0/device/code'

export interface DeviceStart {
  readonly deviceCode: string
  readonly userCode: string
  readonly verificationUrl: string
  readonly qrcodeUrl?: string
  readonly intervalSec: number
  readonly expiresAt: number
}

/**
 * 设备码授权第一步：用 AppKey 申请 device_code + user_code。
 * 该流程不需要登记回调地址，也不需要用户复制授权码 —— 用户只需在浏览器里确认，
 * 之后由插件轮询 token 接口自动取回 access_token / refresh_token。
 */
export async function deviceStart(appKey: string, scope = DEFAULT_SCOPE): Promise<DeviceStart> {
  const key = appKey.trim()
  if (key === '') throw new Error('AppKey 为空')
  const query = new URLSearchParams({ response_type: 'device_code', client_id: key, scope })
  const response = await fetch(`${DEVICE_ENDPOINT}?${query.toString()}`)
  const text = await response.text()
  let body: {
    device_code?: string
    user_code?: string
    verification_url?: string
    qrcode_url?: string
    expires_in?: number
    interval?: number
    error?: string
    error_description?: string
  }
  try {
    body = JSON.parse(text)
  } catch {
    throw new Error(`设备码接口返回非 JSON（HTTP ${response.status}）：${text.slice(0, 160)}`)
  }
  if (body.device_code === undefined || body.user_code === undefined) {
    throw new Error(`设备码申请失败：${body.error_description ?? body.error ?? `HTTP ${response.status}`}`)
  }
  const expiresIn = body.expires_in ?? 300
  return {
    deviceCode: body.device_code,
    userCode: body.user_code,
    verificationUrl: body.verification_url ?? 'https://openapi.baidu.com/device',
    qrcodeUrl: body.qrcode_url,
    intervalSec: Math.max(2, body.interval ?? 5),
    expiresAt: Date.now() + expiresIn * 1000,
  }
}

export interface DevicePollResult {
  readonly done: boolean
  readonly pending: boolean
  readonly tokens?: TokenSet
  readonly message?: string
}

/** 设备码授权第二步：轮询换取 token；用户未确认时返回 pending。 */
export async function devicePoll(app: OAuthApp, deviceCode: string): Promise<DevicePollResult> {
  const query = new URLSearchParams({
    grant_type: 'device_token',
    code: deviceCode,
    client_id: app.appKey,
    client_secret: app.secretKey,
  })
  const response = await fetch(`${TOKEN_ENDPOINT}?${query.toString()}`)
  const text = await response.text()
  let body: RawTokenResponse
  try {
    body = JSON.parse(text) as RawTokenResponse
  } catch {
    return { done: false, pending: true, message: `token 接口返回非 JSON（HTTP ${response.status}）` }
  }
  if (body.access_token !== undefined) {
    return {
      done: true,
      pending: false,
      tokens: {
        accessToken: body.access_token,
        refreshToken: body.refresh_token,
        expiresAt: body.expires_in === undefined ? undefined : Date.now() + body.expires_in * 1000,
        scope: body.scope,
      },
    }
  }
  if (body.error === 'authorization_pending' || body.error === 'slow_down') {
    return { done: false, pending: true }
  }
  return { done: false, pending: false, message: body.error_description ?? body.error ?? '授权失败' }
}
