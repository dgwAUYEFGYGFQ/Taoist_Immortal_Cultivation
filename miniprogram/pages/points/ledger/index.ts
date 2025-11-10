import { get } from '../../../utils/api'

Page({
  data: {
    list: [] as Array<any>,
    loading: false,
    page: 1,
    pageSize: 20,
    total: 0,
    currentType: 'VIRTUE' as 'VIRTUE'|'CONTRIB'
  },

  onLoad(options:any) {
    const t = String(options?.type || '').toUpperCase()
    if (t === 'VIRTUE' || t === 'CONTRIB') this.setData({ currentType: t })
    this.refresh()
  },

  onPullDownRefresh() {
    this.refresh()
  },

  async refresh() {
    this.setData({ list: [], page: 1, total: 0 })
    await this.loadMore()
  },

  async loadMore() {
    const d:any = this.data
    if (d.loading) return
    if (d.total && d.list.length >= d.total) return
    this.setData({ loading: true })
    try {
      const params:any = { type: d.currentType, page: d.page, pageSize: d.pageSize }
      let resp:any
      try { resp = await get('/api/points/ledger', params) }
      catch (e:any) { if (e?.statusCode === 404) resp = await get('/points/ledger', params); else throw e }
      const items = (resp?.list || []).map((it:any) => ({
        ...it,
        sign: Number(it.delta) >= 0 ? '+' : '',
        date: (it.createdAt || '').slice(0, 10),
        time: (it.createdAt || '').slice(11, 19)
      }))
      this.setData({
        list: d.list.concat(items),
        page: d.page + 1,
        total: Number(resp?.total || d.total || 0)
      })
    } catch (e) {
      // 错误提示在请求封装中已处理
    } finally {
      this.setData({ loading: false })
      wx.stopPullDownRefresh && wx.stopPullDownRefresh()
    }
  },

  onSwitchType(e:any) {
    const t = e.currentTarget.dataset.type
    if (!t || t === (this.data as any).currentType) return
    this.setData({ currentType: t, list: [], page: 1, total: 0 })
    this.loadMore()
  },

  onReachBottom() {
    const d:any = this.data
    if (d.loading) return
    if (!d.total || d.list.length < d.total) {
      this.loadMore()
    }
  }
})

