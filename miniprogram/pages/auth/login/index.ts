import { get, post } from '../../../utils/api'

Page({
  data: {
    tab: 'login' as 'login' | 'register',
    // login
    phone: '',
    password: '',
    // register
    regPhone: '',
    regPassword: '',
    inviteCode: '',
    // legacy dev login (optional)
    openid: '',
    role: 'DAO_FRIEND' as 'DAO_FRIEND'|'ELDER'|'ADMIN',
    submitting: false,
    logging: false,
  },

  onLoad() {
    const o = (wx.getStorageSync('X_OPENID') as string) || ''
    const r = (wx.getStorageSync('X_ROLE') as string) || 'DAO_FRIEND'
    this.setData({ openid: o, role: (r as any) })

    // 云函数联通性测试：进入登录页即调用 getUserInfo
    if ((wx as any).cloud) {
      ;(wx as any).cloud.callFunction({ name: 'getUserInfo' })
        .then((res: any) => {
          console.log('cloud getUserInfo:', res?.result)
        })
        .catch((err: any) => {
          console.error('cloud getUserInfo error:', err)
        })
    } else {
      console.error('当前基础库不支持云开发，请升级微信或基础库版本')
    }
  },

  switchTab(e: any) {
    const t = e.currentTarget.dataset.tab
    this.setData({ tab: t })
  },

  // inputs
  onInput(e: any) {
    const key = e.currentTarget.dataset.key
    this.setData({ [key]: e.detail.value })
  },
  onInputOpenid(e: any) {
    this.setData({ openid: e.detail.value })
  },

  // 手机号 + 密码 登录
  async doPasswordLogin() {
    const { phone, password } = (this.data as any)
    if (!phone || !password) return wx.showToast({ title: '请输入手机号和密码', icon: 'none' })
    this.setData({ submitting: true })
    try {
      const ret = await post<any>('/auth/password-login', { phone, password })
      const openid = (ret as any)?.openid
      if (!openid) throw new Error('未获取到 openid')
      wx.setStorageSync('X_OPENID', openid)
      // 初始角色先置为访客，随后以 /me/info 为准覆盖
      wx.setStorageSync('X_ROLE', 'DAO_FRIEND')
      const me = await get<any>('/me/info')
      if (me?.role) wx.setStorageSync('X_ROLE', String(me.role).toUpperCase())
      wx.showToast({ title: '登录成功', icon: 'success' })
      setTimeout(() => { wx.switchTab({ url: '/pages/profile/index' }) }, 200)
    } catch (e) {
      // post 已有统一错误提示
    } finally {
      this.setData({ submitting: false })
    }
  },

  // 使用邀请码注册并登录（绑定微信 openid）
  async doRegister() {
    const { regPhone, regPassword, inviteCode } = (this.data as any)
    if (!regPhone || !regPassword || !inviteCode) return wx.showToast({ title: '请完整填写手机号/密码/邀请码', icon: 'none' })
    this.setData({ submitting: true })
    try {
      const loginRes = await new Promise<WechatMiniprogram.LoginSuccessCallbackResult>((resolve, reject) => {
        wx.login({ success: resolve, fail: reject })
      })
      const code = loginRes.code
      if (!code) throw new Error('微信未返回 code')
      const ret = await post<any>('/auth/register', { code, phone: regPhone, password: regPassword, inviteCode })
      const openid = (ret as any)?.openid
      if (!openid) throw new Error('未获取到 openid')
      wx.setStorageSync('X_OPENID', openid)
      wx.setStorageSync('X_ROLE', 'DAO_FRIEND')
      const me = await get<any>('/me/info')
      if (me?.role) wx.setStorageSync('X_ROLE', String(me.role).toUpperCase())
      wx.showToast({ title: '注册并登录成功', icon: 'success' })
      setTimeout(() => { wx.switchTab({ url: '/pages/profile/index' }) }, 200)
    } catch (e) {
    } finally {
      this.setData({ submitting: false })
    }
  },

  // 真实微信一键登录：已注册/已激活用户直接登录
  async doWeChatLogin() {
    this.setData({ logging: true })
    try {
      const loginRes = await new Promise<WechatMiniprogram.LoginSuccessCallbackResult>((resolve, reject) => {
        wx.login({ success: resolve, fail: reject })
      })
      const code = loginRes.code
      if (!code) throw new Error('微信未返回 code')

      const ret = await post<any>('/auth/login', { code })
      const openid = (ret as any)?.openid
      const status = (ret as any)?.status || 'PENDING'
      if (!openid) throw new Error('后端未返回 openid')

      if (status !== 'ACTIVE') {
        wx.showToast({ title: '请先使用邀请码注册', icon: 'none' })
        this.setData({ tab: 'register' })
        return
      }

      wx.setStorageSync('X_OPENID', openid)
      wx.setStorageSync('X_ROLE', 'DAO_FRIEND')
      const me = await get<any>('/me/info')
      if (me?.role) wx.setStorageSync('X_ROLE', String(me.role).toUpperCase())
      wx.showToast({ title: '登录成功', icon: 'success' })
      setTimeout(() => { wx.switchTab({ url: '/pages/profile/index' }) }, 200)
    } catch (e) {
      wx.showToast({ title: '微信登录失败', icon: 'none' })
    } finally {
      this.setData({ logging: false })
    }
  },

  // 开发态：手填 OpenID（可保留，也可以后去掉）
  async doLogin() {
    const { openid } = (this.data as any)
    if (!openid) return wx.showToast({ title: '请填写 OpenID', icon: 'none' })
    this.setData({ logging: true })
    try {
      // 先写入 openid；DEV 常用 openid 直接映射一个初始角色，防止后端未返回 role 时判定失败
      wx.setStorageSync('X_OPENID', openid)
      const oid = String(openid || '')
      let roleGuess: 'DAO_FRIEND'|'ELDER'|'ADMIN' = 'DAO_FRIEND'
      if (/admin/i.test(oid)) roleGuess = 'ADMIN'
      else if (/elder/i.test(oid)) roleGuess = 'ELDER'
      wx.setStorageSync('X_ROLE', roleGuess)
      // 再以 /me/info 为准覆盖
      const me = await get<any>('/me/info')
      if (me?.role) wx.setStorageSync('X_ROLE', String(me.role).toUpperCase())
      wx.showToast({ title: '登录成功', icon: 'success' })
      setTimeout(() => { wx.switchTab({ url: '/pages/profile/index' }) }, 200)
    } finally {
      this.setData({ logging: false })
    }
  },
})
