import { get, post } from '../../../utils/api'

type ExhibitDetail = {
  id: number
  name: string
  grade?: 'HUMAN'|'EARTH'|'HEAVEN'|'DIVINE'|'DIVINE_PLUS'
  effectType?: 'ATTACK'|'DEFENSE'|'BALANCED'|'DOMAIN'|'SUPPORT'
  author?: string
  lore?: string
  imageUrl?: string
  isUnderstood?: boolean
  requiredPoints?: number
  costPoints?: number
}

Page({
  data: {
    loading: false,
    detail: null as ExhibitDetail | null,
    contribBalance: 0,
    redeeming: false
  },

  async onLoad(query: Record<string, any>) {
    const id = Number(query?.id || 0)
    if (!id) {
      wx.showToast({ title: '参数错误', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 500)
      return
    }
    await this.loadUser()
    await this.loadDetail(id)
  },

  async onPullDownRefresh() {
    try {
      const id = (this.data.detail as any)?.id
      if (id) await this.loadDetail(id)
    } finally {
      wx.stopPullDownRefresh()
    }
  },

  async loadUser() {
    const info = await get<any>('/me/info')
    this.setData({ contribBalance: Number(info?.contribBalance || 0) })
  },

  async loadDetail(id: number) {
    this.setData({ loading: true })
    try {
      let d: ExhibitDetail
      try { d = await get<ExhibitDetail>(`/api/pavilion/exhibits/${id}`) }
      catch (e: any) { if (e?.statusCode === 404) d = await get<ExhibitDetail>(`/pavilion/exhibits/${id}`); else throw e }
      this.setData({ detail: d })
      if (d && d.isUnderstood === false) {
        const need = Number(d.requiredPoints || 0)
        const has = Number((this.data as any).contribBalance || 0)
        const lack = Math.max(need - has, 0)
        wx.showModal({
          title: '悟性未至！',
          content: `尚需 ${lack} 贡献点方可参悟此宝。`,
          showCancel: false
        })
      }
    } finally {
      this.setData({ loading: false })
    }
  },

  async onRedeem() {
    const d:any = this.data
    const detail = d.detail
    if (!detail?.id) return
    const need = Number(detail.requiredPoints || detail.costPoints || 0)
    const has = Number(d.contribBalance || 0)
    if (has < need) {
      wx.showToast({ title: `贡献点不足，需${need}点`, icon: 'none' })
      return
    }
    this.setData({ redeeming: true })
    try {
      let resp:any
      try { resp = await post('/api/pavilion/redeem', { exhibitId: detail.id }) }
      catch (e:any) { if (e?.statusCode===404) resp = await post('/pavilion/redeem', { exhibitId: detail.id }); else throw e }
      const balanceAfter = Number(resp?.balanceAfter ?? d.contribBalance)
      wx.showToast({ title: '获取成功', icon: 'success' })
      this.setData({ contribBalance: balanceAfter, detail: { ...detail, isUnderstood: true } })
    } catch (e:any) {
      const raw = String(e?.data?.message || e?.data?.error || e?.message || '')
      const map: Record<string,string> = {
        INSUFFICIENT_CONTRIB_POINTS: '贡献点不足',
        EXHIBIT_UNAVAILABLE: '展品不可获取'
      }
      const msg = map[raw] || raw || '获取失败'
      wx.showToast({ title: msg, icon: 'none' })
    } finally {
      this.setData({ redeeming: false })
    }
  }
})

