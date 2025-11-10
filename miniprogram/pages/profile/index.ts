import { get } from '../../utils/api'

Page({
  data: {
    nickname: '',
    avatarUrl: '',
    status: 'UNACTIVATED' as 'ACTIVE' | 'UNACTIVATED',
    role: 'DAO_FRIEND' as 'DAO_FRIEND' | 'ELDER' | 'ADMIN',
    isAdmin: false,
    wechatBound: true,
    phoneBound: false,
    phone: null as string | null,

    virtueBalance: 0,
    contribBalance: 0
  },

  onShow() {
    this.load()
    if ((wx as any).cloud) {
      ;(wx as any).cloud.callFunction({ name: 'getUserInfo' })
        .then((res: any) => {
          console.log('cloud getUserInfo:', res?.result)
        })
        .catch((err: any) => {
          console.error('cloud getUserInfo error:', err)
        })
    }
  },

  async load() {
    try {
      const info = await get<any>('/me/info')
      // 合并后端返回与本地开发态头部，确保管理员入口可见
      const localRole = (wx.getStorageSync('X_ROLE') as string) || ''
      const openid = (wx.getStorageSync('X_OPENID') as string) || ''
      const rawRole = (info?.role as any) || (localRole as any) || 'DAO_FRIEND'
      let role = String(rawRole || '').toUpperCase() as any
      // DEV 兜底：如果 openid 中包含 admin/elder，推断其角色，避免后端未返回 role 时入口缺失
      if (role !== 'ADMIN' && /admin/i.test(openid)) role = 'ADMIN' as any
      if (role !== 'ELDER' && /elder/i.test(openid)) role = 'ELDER' as any
      const isAdmin = !!info?.isAdmin || role === 'ADMIN' || String(localRole||'').toUpperCase() === 'ADMIN'
      this.setData({
        nickname: info?.nickname || '道友',
        avatarUrl: info?.avatarUrl || '',
        status: info?.status || 'UNACTIVATED',
        role,
        isAdmin,
        wechatBound: !!info?.wechatBound,
        phoneBound: !!info?.phoneBound,
        phone: info?.phone ?? null,

        virtueBalance: Number(info?.virtueBalance || 0),
        contribBalance: Number(info?.contribBalance || 0)
      })
    } catch(e) {
      // 回退到本地角色，避免后端异常时管理员入口消失
      const localRole = (wx.getStorageSync('X_ROLE') as string) || ''
      const isAdmin = localRole === 'ADMIN'
      if (localRole) this.setData({ role: localRole as any, isAdmin })
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
  },

  goBind() {
    if (this.data.phoneBound) return
    wx.navigateTo({ url: '/pages/profile/bind/index' })
  },

  goLogin() {
    wx.navigateTo({ url: '/pages/auth/login/index' })
  },

  goExhibits() {
    wx.navigateTo({ url: '/pages/exhibits/index' })
  },

  goLedger() {
    wx.navigateTo({ url: '/pages/points/ledger/index' })
  },

  goAdminInvites() {
    wx.navigateTo({ url: '/pages/admin/invite/index' })
  },

  goAdminExhibits() {
    wx.navigateTo({ url: '/pages/admin/exhibits/index' })
  },

  goElderReview() {
    wx.navigateTo({ url: '/pages/elder/review/index' })
  },

  goDeedSubmit() {
    wx.navigateTo({ url: '/pages/deeds/submit/index' })
  },

  goZiYun() {
    wx.navigateTo({ url: '/pages/ziyun/index' })
  }
})

