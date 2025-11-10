import { get } from '../../utils/api'

Page({
  data: {
    me: { virtueBalance: 0, contribBalance: 0 } as any,
    loading: false
  },

  async onLoad() {
    await this.refreshAll()
  },

  async onShow() {
    // 每次返回首页都刷新，避免切换账号/积分变化后显示旧值
    await this.refreshAll()
  },

  async refreshAll() {
    this.setData({ loading: true })
    try {
      const info = await get<any>('/me/info')
      const me = {
        virtueBalance: Number(info?.virtueBalance || 0),
        contribBalance: Number(info?.contribBalance || 0),
        nickname: info?.nickname || ''
      }
      this.setData({ me })
    } catch (e) {
      wx.showToast({ title: '加载失败', icon: 'none' })
    } finally {
      this.setData({ loading: false })
    }
  },



  goSubmit() {
    wx.navigateTo({ url: '/pages/deeds/submit/index' })
  },

  goMine() {
    wx.navigateTo({ url: '/pages/points/ledger/index' })
  }
})
