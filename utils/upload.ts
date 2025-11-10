import { BASE_URL } from './api'

function buildAuthHeaders() {
  const openid = wx.getStorageSync('X_OPENID') as string
  const role = wx.getStorageSync('X_ROLE') as string
  const h: Record<string, string> = {}
  if (openid) h['x-openid'] = openid
  if (role) h['x-role'] = role
  // 不要设置 Content-Type，wx.uploadFile 会自动设置 multipart/form-data
  return h
}

function parseUploadResponse(data: string, preferKey?: boolean): string {
  try {
    const obj = JSON.parse(data as any)
    if (obj && typeof obj === 'object') {
      // Scheme 2: 后端返回 key 或 data.key
      if (preferKey) {
        if ((obj as any).key) return String((obj as any).key)
        if ((obj as any).data && (obj as any).data.key) return String((obj as any).data.key)
      }
      // 兼容常见 URL 返回结构
      if ((obj as any).code === 0 && (obj as any).data && (obj as any).data.url)
        return String((obj as any).data.url)
      if ((obj as any).url) return String((obj as any).url)
    }
  } catch (_) {
    // 不是 JSON，尝试当作纯文本 URL
    if (!preferKey && /^https?:\/\//i.test(String(data))) return String(data)
  }
  throw new Error('不支持的上传返回格式')
}

async function uploadOne(localPath: string, options?: { url?: string; fieldName?: string; formData?: Record<string, string>; preferKey?: boolean }): Promise<string> {
  // 已经是线上 URL 的：若偏好 key，则不能直接返回；否则直接透传
  if (/^https?:\/\//i.test(localPath) && !options?.preferKey) return localPath

  const url = (options?.url) || (BASE_URL + '/api/upload')
  const name = options?.fieldName || 'file'
  const formData = options?.formData || {}

  return await new Promise<string>((resolve, reject) => {
    wx.uploadFile({
      url,
      filePath: localPath,
      name,
      formData,
      header: buildAuthHeaders(),
      success(res) {
        try {
          const ret = parseUploadResponse(res.data as any, options?.preferKey)
          resolve(ret)
        } catch (e) {
          reject(e)
        }
      },
      fail(err) { reject(err) }
    })
  })
}

export async function uploadFiles(paths: string[], options?: { url?: string; fieldName?: string; formData?: Record<string, string>; preferKey?: boolean }): Promise<string[]> {
  const list = Array.isArray(paths) ? paths : []
  const out: string[] = []
  for (const p of list) {
    const u = await uploadOne(p, options)
    out.push(u)
  }
  return out
}

