import { post } from '../../../utils/api'

Page({
  data: {
    code: ''
  },
  onInput(e: any) {
    this.setData({ code: e.detail.value })
  },
  async onActivate() {
    const inviteCode = (this.data as any).code?.trim()
    if (!inviteCode) {
      wx.showToast({ title: '请输入邀请码', icon: 'none' })
      return
    }
    try {
      wx.showLoading({ title: '激活中...' })
      await post('/auth/activate', { inviteCode })
      wx.hideLoading()
      wx.showToast({ title: '激活成功', icon: 'success' })
      setTimeout(() => {
        if (wx.reLaunch) {
          wx.reLaunch({ url: '/pages/index/index' })
        } else {
          wx.redirectTo({ url: '/pages/index/index' })
        }
      }, 300)
    } catch (e) {
      wx.hideLoading()
      // 错误提示已在请求封装中统一处理
    }
  }
})

