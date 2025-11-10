import { post } from '../../../utils/api'

Page({
  data: {
    phone: ''
  },

  onInput(e: any) {
    this.setData({ phone: e.detail.value })
  },

  async onSubmit() {
    const phone = String(this.data.phone || '').trim()
    if (!phone) {
      wx.showToast({ title: '请输入手机号', icon: 'none' })
      return
    }
    try {
      await post('/me/bind-phone', { phone })
      // 主动刷新上一页（我的）数据
      const pages = getCurrentPages()
      const prev: any = pages[pages.length - 2]
      if (prev) {
        // 先本地立即更新上一页 UI，保证返回即看到已绑定
        if (typeof prev.setData === 'function') {
          try { prev.setData({ phoneBound: true, phone }) } catch (_) {}
        }
        // 再触发它的 load() 从后端拉最新
        if (typeof prev.load === 'function') {
          try { prev.load() } catch (_) {}
        }
      }
      wx.showToast({ title: '绑定成功', icon: 'success' })
      setTimeout(() => {
        wx.navigateBack()
      }, 400)
    } catch (e) {
      // 错误提示在 request 中已处理
    }
  }
})

