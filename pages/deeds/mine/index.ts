import { get } from '../../../utils/api'

Page({
  data: {
    list: [] as Array<any>,
    loading: false,
    // filters
    statusOptions: ['全部','待审','已通过','已驳回'],
    statusValues: ['ALL','PENDING','APPROVED','REJECTED'],
    statusIndex: 0,
    start: '', end: '',
    kw: '',
    page: 1,
    pageSize: 20,
    total: 0,
    // detail
    detailVisible: false,
    detail: null as any,
  },

  onShow() {
    this.load()
  },

  async load() {
    this.setData({ loading: true })
    try {
      const d:any = this.data
      const params:any = { status: d.statusValues[d.statusIndex], page: d.page, pageSize: d.pageSize }
      if (d.start) params.start = d.start
      if (d.end) params.end = d.end
      if (d.kw) params.kw = d.kw
      let resp: any
      try { resp = await get<any>('/api/deeds/my', params) }
      catch (e:any) { if (e?.statusCode===404) resp = await get<any>('/deeds/my', params); else throw e }
      const arr = Array.isArray(resp) ? resp : (resp?.list || [])
      const total = Array.isArray(resp) ? arr.length : Number(resp?.total || 0)
      const list = (arr || []).map((it: any) => ({
        ...it,
        occurredDate: (it.occurredAt || '').slice(0, 10)
      }))
      this.setData({ list, total })
    } catch (e) {
      wx.showToast({ title: '加载失败', icon: 'none' })
    } finally {
      this.setData({ loading: false })
      wx.stopPullDownRefresh && wx.stopPullDownRefresh()
    }
  },

  onPullDownRefresh() {
    this.load()
  },

  onStatusChange(e:any){ this.setData({ statusIndex: Number(e.detail.value||0) }) },
  onStartChange(e:any){ this.setData({ start: e.detail.value }) },
  onEndChange(e:any){ this.setData({ end: e.detail.value }) },
  onKwInput(e:any){ this.setData({ kw: e.detail.value }) },
  doSearch(){ this.load() },
  resetFilters(){ this.setData({ statusIndex:0, start:'', end:'', kw:'' }); this.load() },

  async openDetail(e:any){
    const id = e?.currentTarget?.dataset?.id
    if(!id) return
    // 先打开弹窗，提升可见性
    this.setData({ detailVisible: true, detail: { title: '加载中...', status: '', occurredDate:'', createdDate:'', description:'', attachments: [] } })
    try{
      let detail:any
      try { detail = await get<any>(`/api/deeds/${id}`) }
      catch (e:any) { if (e?.statusCode===404) detail = await get<any>(`/deeds/${id}`); else throw e }
      const d = {
        ...detail,
        occurredDate: (detail?.occurredAt||'').slice(0,10),
        createdDate: (detail?.createdAt||'').slice(0,10),
        attachments: Array.isArray(detail?.attachments)? detail.attachments:[],
        reviewScore: (detail as any)?.review?.score,
        reviewComment: (detail as any)?.review?.comment || '',
        reviewedAt: (detail as any)?.review?.reviewedAt || '',
        reviewedByName: (detail as any)?.review?.reviewedBy?.name || '',
        userNickname: (detail as any)?.userNickname || ''
      }
      this.setData({ detail: d })
    }catch(err){
      wx.showToast({ title: '加载详情失败', icon: 'none' })
      this.setData({ detailVisible:false, detail:null })
    }
  },
  closeDetail(){ this.setData({ detailVisible:false, detail:null }) },

  goSubmit() {
    wx.navigateTo({ url: '/pages/deeds/submit/index' })
  }
})

