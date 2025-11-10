import { get, post } from '../../utils/api'

type UserLite = { id: string | number; nickname: string }

type ZiyunStatus = {
  status?: 'WAITING' | 'INSIDE' | 'CANCELLED' | 'FINISHED' | string
  insideUser?: UserLite | null
  queue?: UserLite[]
  inQueue?: boolean
  position?: number
  virtueBalance?: number
}

Page({
  data: {
    loading: false,
    status: {} as ZiyunStatus,
    positionText: '-',
    joining: false,
    leaving: false,
    showJoin: false,
    showCancel: false,
    showLeave: false,
  },

  async onLoad() {
    await this.refresh()
  },

  async onPullDownRefresh() {
    try { await this.refresh() } finally { wx.stopPullDownRefresh && wx.stopPullDownRefresh() }
  },

  async refresh() {
    this.setData({ loading: true })
    try {
      let s: ZiyunStatus
      try { s = await get<ZiyunStatus>('/api/ziyun/status') }
      catch (e: any) { if (e?.statusCode === 404) s = await get<ZiyunStatus>('/ziyun/status'); else throw e }
      const norm = String((s as any)?.status || '').toUpperCase()
      const status: ZiyunStatus = {
        status: norm as any,
        insideUser: s?.insideUser || null,
        queue: Array.isArray(s?.queue) ? s!.queue! : [],
        inQueue: !!s?.inQueue,
        position: typeof s?.position === 'number' ? s!.position! : undefined,
        virtueBalance: typeof s?.virtueBalance === 'number' ? s!.virtueBalance! : undefined,
      }
      const posText = typeof status.position === 'number' ? String(status.position) : '-'
      const showCancel = norm === 'WAITING'
      const showLeave = norm === 'INSIDE'
      const showJoin = !(norm === 'WAITING' || norm === 'INSIDE' || norm === 'CANCELLED' || norm === 'FINISHED')
      this.setData({ status, positionText: posText, showJoin, showCancel, showLeave })
    } finally {
      this.setData({ loading: false })
    }
  },

  async onJoin() {
    const s: any = this.data.status || {}
    let bal = typeof s.virtueBalance === 'number' ? Number(s.virtueBalance) : NaN
    if (isNaN(bal)) {
      try {
        const me:any = await get('/me/info')
        bal = Number(me?.virtueBalance || 0)
      } catch(_) { bal = 0 }
    }
    if (bal < 10) {
      wx.showToast({ title: '善恶点不足，需10点', icon: 'none' })
      return
    }
    this.setData({ joining: true })
    try {
      try { await post('/api/ziyun/join', {}) }
      catch (e: any) { if (e?.statusCode === 404) await post('/ziyun/join', {}); else throw e }
      wx.showToast({ title: '报名成功', icon: 'success' })
      await this.refresh()
    } catch (e: any) {
      const raw = String(e?.data?.message || e?.message || '')
      const map: Record<string,string> = {
        INSUFFICIENT_VIRTUE_POINTS: '善恶点不足',
        ALREADY_IN_QUEUE: '已在队列中',
        QUEUE_CLOSED: '队列暂停报名'
      }
      const msg = map[raw] || raw || '报名失败'
      wx.showToast({ title: msg, icon: 'none' })
    } finally {
      this.setData({ joining: false })
    }
  },

  async onCancel() {
    this.setData({ leaving: true })
    try {
      try { await post('/api/ziyun/cancel', {}) }
      catch (e: any) { if (e?.statusCode === 404) await post('/ziyun/cancel', {}); else throw e }
      wx.showToast({ title: '已取消', icon: 'success' })
      await this.refresh()
    } catch (e: any) {
      const raw = String(e?.data?.message || e?.message || '')
      const map: Record<string,string> = { WRONG_STATE: '已入场，无法取消' }
      wx.showToast({ title: map[raw] || raw || '操作失败', icon: 'none' })
    } finally {
      this.setData({ leaving: false })
    }
  },

  async onLeave() {
    this.setData({ leaving: true })
    try {
      try { await post('/api/ziyun/leave', {}) }
      catch (e: any) { if (e?.statusCode === 404) await post('/ziyun/leave', {}); else throw e }
      wx.showToast({ title: '已离开', icon: 'success' })
      await this.refresh()
    } catch (e: any) {
      const raw = String(e?.data?.message || e?.message || '')
      const map: Record<string,string> = { NOT_INSIDE: '未在场，无法离开' }
      wx.showToast({ title: map[raw] || raw || '操作失败', icon: 'none' })
    } finally {
      this.setData({ leaving: false })
    }
  }
})

