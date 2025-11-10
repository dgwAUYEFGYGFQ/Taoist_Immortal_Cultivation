import { get, post } from '../../../utils/api'

Page({
  data: {
    list: [] as any[],
    loading: false,
    nextCursor: null as string | null,
    approving: false,
    rejecting: false,
    // filters
    statusOptions: ['待审','已通过','已驳回','全部'],
    statusValues: ['PENDING','APPROVED','REJECTED','ALL'],
    statusIndex: 0,
    submitStart: '',
    submitEnd: '',
    reviewStart: '',
    reviewEnd: '',
    submitter: '',
    // detail
    detailVisible: false,
    detail: null as any,
    formComment: '',
    formScore: ''
  },

  onLoad() { this.refresh() },
  onPullDownRefresh() { this.refresh() },

  async refresh() {
    this.setData({ list: [], nextCursor: null })
    await this.loadMore()
  },

  async loadMore() {
    if ((this.data as any).loading) return
    this.setData({ loading: true })
    try {
      const d = this.data as any
      const params: any = { limit: 20 }
      const c = d.nextCursor
      if (c) params.cursor = c
      // filters
      const status = d.statusValues[d.statusIndex]
      if (status) params.status = status
      if (d.submitStart) params.submitStart = d.submitStart
      if (d.submitEnd) params.submitEnd = d.submitEnd
      if (d.reviewStart) params.reviewStart = d.reviewStart
      if (d.reviewEnd) params.reviewEnd = d.reviewEnd
      if (d.submitter) params.submitter = d.submitter
      let resp: { items: any[]; nextCursor: string | null }
      try { resp = await get<{ items: any[]; nextCursor: string | null }>('/api/elder/reviews/list', params) }
      catch (e: any) { if (!e?.statusCode || e?.statusCode === 404 || e?.statusCode === 405) resp = await get('/elder/reviews/list', params); else throw e }
      const items = (resp?.items || []).map(it => ({
        ...it,
        occurredDate: (it.occurredAt || '').slice(0,10),
        createdDate: (it.createdAt || '').slice(0,10)
      }))
      this.setData({ list: [ ...(this.data as any).list, ...items ], nextCursor: resp?.nextCursor ?? null })
    } finally {
      this.setData({ loading: false })
      wx.stopPullDownRefresh && wx.stopPullDownRefresh()
    }
  },

  // 新：从弹窗表单提交“通过”
  async approveSubmit(e: any) {
    const id = e?.currentTarget?.dataset?.id || (this.data as any).detail?.id
    if (!id) return
    const d:any = this.data
    const delta = parseInt(String(d.formScore||'10')) || 10
    this.setData({ approving: true })
    try {
      try { await post(`/api/elder/reviews/${id}/approve`, { scoreDelta: delta, comment: d.formComment || '' }) }
      catch (e: any) { if (!e?.statusCode || e?.statusCode === 404 || e?.statusCode === 405) await post(`/elder/reviews/${id}/approve`, { scoreDelta: delta, comment: d.formComment || '' }); else throw e }
      wx.showToast({ title: '已通过', icon: 'success' })
      const rest = (d.list || []).filter((x:any)=>x.id!==id)
      this.setData({ list: rest, detailVisible: false })
    } finally {
      this.setData({ approving: false })
    }
  },

  // 新：从弹窗表单提交“驳回”
  async rejectSubmit(e: any) {
    const id = e?.currentTarget?.dataset?.id || (this.data as any).detail?.id
    if (!id) return
    const d:any = this.data
    const delta = parseInt(String(d.formScore||'0')) || 0
    this.setData({ rejecting: true })
    try {
      try { await post(`/api/elder/reviews/${id}/reject`, { comment: d.formComment || '', scoreDelta: delta }) }
      catch (e: any) { if (!e?.statusCode || e?.statusCode === 404 || e?.statusCode === 405) await post(`/elder/reviews/${id}/reject`, { comment: d.formComment || '', scoreDelta: delta }); else throw e }
      wx.showToast({ title: '已驳回', icon: 'success' })
      const rest = (d.list || []).filter((x:any)=>x.id!==id)
      this.setData({ list: rest, detailVisible: false })
    } finally {
      this.setData({ rejecting: false })
    }
  },

  onStatusChange(e: any) {
    this.setData({ statusIndex: Number(e?.detail?.value || 0) })
  },
  onSubmitStartChange(e: any) { this.setData({ submitStart: e?.detail?.value || '' }) },
  onSubmitEndChange(e: any) { this.setData({ submitEnd: e?.detail?.value || '' }) },
  onReviewStartChange(e: any) { this.setData({ reviewStart: e?.detail?.value || '' }) },
  onReviewEndChange(e: any) { this.setData({ reviewEnd: e?.detail?.value || '' }) },
  onSubmitterInput(e: any) { this.setData({ submitter: e?.detail?.value || '' }) },
  onFormCommentInput(e:any){ this.setData({ formComment: e?.detail?.value||'' }) },
  onFormScoreInput(e:any){ this.setData({ formScore: e?.detail?.value||'' }) },
  doSearch() { this.refresh() },
  resetFilters() {
    this.setData({
      statusIndex: 0,
      submitStart: '', submitEnd: '',
      reviewStart: '', reviewEnd: '',
      submitter: ''
    })
    this.refresh()
  },

  async openDetail(e: any) {
    const id = e?.currentTarget?.dataset?.id
    if (!id) return
    let detail: any
    try { detail = await get<any>(`/api/elder/reviews/${id}`) }
    catch (e: any) { if (!e?.statusCode || e?.statusCode === 404 || e?.statusCode === 405) detail = await get<any>(`/elder/reviews/${id}`); else throw e }
    const d = {
      ...detail,
      occurredDate: (detail?.occurredAt||'').slice(0,10),
      createdDate: (detail?.createdAt||'').slice(0,10),
      attachments: Array.isArray(detail?.attachments) ? detail.attachments : [],
      reviewerNickname: (detail as any)?.review?.reviewerNickname || '',
      reviewDate: ((detail as any)?.review?.createdAt || '').slice(0,10)
    }
    const formComment = (detail as any)?.review?.comment || ''
    const formScore = (detail as any)?.review?.scoreDelta != null
      ? String((detail as any).review.scoreDelta)
      : (d.status==='PENDING' ? '10' : '')
    this.setData({ detailVisible: true, detail: d, formComment, formScore })
  },
  closeDetail() { this.setData({ detailVisible: false }) },
  previewImg(e: any) {
    const url = e?.currentTarget?.dataset?.url
    const urls = ((this.data as any).detail?.attachments || [])
    if (url) wx.previewImage({ current: url, urls })
  }
})

