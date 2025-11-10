import { get, post } from '../../../utils/api'

Page({
  data: {
    list: [] as any[],
    loading: false,
    gen: { count: 3 as number, expireAt: '', remark: '' },
    displayExpireAt: '不限'
  },

  onLoad() {
    this.refresh()
  },

  onPullDownRefresh() {
    this.refresh()
  },

  async refresh() {
    this.setData({ loading: true })
    try {
      const items = await get<any[]>('/admin/invites', { limit: 100 })
      const mapped = (items || []).map((it: any) => ({
        ...it,
        expireDate: it && it.expire_at ? String(it.expire_at).slice(0, 10) : '',
        usedDate: it && it.used_at ? String(it.used_at).slice(0, 10) : ''
      }))
      this.setData({ list: mapped })
    } finally {
      this.setData({ loading: false })
      wx.stopPullDownRefresh?.()
    }
  },

  onInputCount(e: any) {
    const v = Number(e.detail.value || 0)
    this.setData({ gen: { ...(this.data as any).gen, count: v } })
  },
  onInputDate(e: any) {
    const val = e.detail.value
    this.setData({
      gen: { ...(this.data as any).gen, expireAt: val },
      displayExpireAt: val || '不限'
    })
  },
  onInputRemark(e: any) {
    this.setData({ gen: { ...(this.data as any).gen, remark: e.detail.value } })
  },

  async generate() {
    if ((this.data as any).loading) return
    const { count, expireAt, remark } = (this.data as any).gen
    if (!count || count <= 0) return wx.showToast({ title: '数量必须 > 0', icon: 'none' })
    this.setData({ loading: true })
    try {
      await post<any[]>('/admin/invites/generate', { count, expireAt: expireAt || undefined, remark: remark || undefined })
      wx.showToast({ title: '生成成功', icon: 'success' })
      await this.refresh()
    } finally {
      this.setData({ loading: false })
    }
  }
})

