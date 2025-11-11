export interface ApiResp<T> { code: number; message: string; data: T }

function resolveBaseURL(): string {
  const override = wx.getStorageSync('BASE_URL_OVERRIDE') as string
  if (override) return override
  try {
    const info = (wx.getAccountInfoSync && wx.getAccountInfoSync()) as any
    const env = info?.miniProgram?.envVersion || 'develop'
    if (env === 'develop') return 'http://127.0.0.1:3000'
    if (env === 'trial') return 'https://api.xiuxian.test'
    return 'https://api.xiuxian.test'
  } catch (e) {
    return 'http://127.0.0.1:3000'
  }
}
export const BASE_URL = resolveBaseURL();

function toast(msg: string) {
  if (!msg) return;
  wx.showToast({ title: msg, icon: 'none' });
}

function authHeaders() {
  const openid = wx.getStorageSync('X_OPENID') as string
  const role = wx.getStorageSync('X_ROLE') as string
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  if (openid) h['x-openid'] = openid
  if (role) h['x-role'] = role
  return h
}

export function request<T>(options: WechatMiniprogram.RequestOption) {
  return new Promise<T>((resolve, reject) => {
    wx.request<ApiResp<T>>({
      url: BASE_URL + (options.url || ''),
      method: options.method || 'GET',
      data: options.data,
      header: { ...authHeaders(), ...(options.header || {}) },
      timeout: options.timeout,
      success(res) {
        // 若 HTTP 状态码为 4xx/5xx，统一按错误处理
        const status = (res as any).statusCode
        if (typeof status === 'number' && status >= 400) {
          const data: any = (res as any).data || {}
          const msg = data.message || `请求失败(${status})`
          toast(msg)
          reject({ statusCode: status, data })
          return
        }
        const body = res.data as unknown as ApiResp<T>;
        if (typeof body === 'object' && body && 'code' in body) {
          const codeVal = (body as any).code
          const ok = codeVal === 0 || codeVal === 'OK'
          if (ok) {
            resolve((body as any).data as T);
          } else {
            toast((body as any).message || '请求失败');
            reject(body);
          }
        } else {
          // 非统一结构，直接返回
          resolve((res.data as unknown) as T);
        }
      },
      fail(err) {
        const msg = (err && (err.errMsg || err.message)) ? String(err.errMsg || err.message) : '网络异常，请稍后再试'
        toast(msg)
        reject(err);
      },
    });
  });
}

function isCloudPreferred(): boolean {
  try {
    const force = wx.getStorageSync('USE_CLOUD') as any
    // 显式关闭云优先
    if (force === false || force === '0') return false
    // 显式开启云优先
    if (force === true || force === '1') return !!(wx as any).cloud
    // 默认：只要有云能力就优先走云（包括开发环境）
    return !!(wx as any).cloud
  } catch (_) {
    return !!(wx as any).cloud
  }
}

function isCloudForced(): boolean {
  try {
    const force = wx.getStorageSync('USE_CLOUD') as any
    return force === true || force === '1'
  } catch (_) {
    return false
  }
}


function cloudRequest<T>(options: { url: string; method?: 'GET'|'POST'|'PUT'|'DELETE'; data?: any }) {
  return new Promise<T>((resolve, reject) => {
    const cloud = (wx as any).cloud
    if (!cloud || !cloud.callFunction) return reject(new Error('cloud not available'))
    cloud.callFunction({
      name: 'api',
      data: { path: options.url, method: (options.method || 'GET'), data: (options.data || null) }
    }).then((res: any) => {
      const body = res?.result
      if (body && typeof body === 'object' && 'code' in body) {
        const codeVal = (body as any).code
        const ok = codeVal === 0 || codeVal === 'OK'
        if (ok) resolve(((body as any).data) as T)
        else { toast((body as any).message || '请求失败'); reject(body) }
      } else {
        resolve((body as T))
      }
    }).catch((err: any) => {
      const msg = (err && (err.errMsg || err.message)) ? String(err.errMsg || err.message) : '网络异常，请稍后再试'
      toast(msg); reject(err)
    })
  })
}


export function get<T>(url: string, data?: any) {
  if (isCloudPreferred()) {
    const p = cloudRequest<T>({ url, method: 'GET', data })
    return isCloudForced() ? p : p.catch(() => request<T>({ url, method: 'GET', data }))
  }
  return request<T>({ url, method: 'GET', data });
}

export function post<T>(url: string, data?: any) {
  if (isCloudPreferred()) {
    const p = cloudRequest<T>({ url, method: 'POST', data })
    return isCloudForced() ? p : p.catch(() => request<T>({ url, method: 'POST', data }))
  }
  return request<T>({ url, method: 'POST', data });
}

