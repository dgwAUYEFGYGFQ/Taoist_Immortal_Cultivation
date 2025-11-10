import { get, post } from '../../../utils/api'
import { uploadFiles } from '../../../utils/upload'

interface Level { id: number; name: string; min_score: number; order_no?: number }
type EffectType = 'ATTACK'|'DEFENSE'|'BALANCED'|'DOMAIN'|'SUPPORT'
type Grade = 'HUMAN'|'EARTH'|'HEAVEN'|'DIVINE'|'DIVINE_PLUS'
interface Exhibit { id?: number; levelId: number; name: string; imageUrl?: string; lore?: string; effectType?: EffectType; grade?: Grade; author?: string; costPoints?: number; stockInit?: number; stockCurrent?: number; layer?: number; isPublished?: boolean; createdAt?: string }

Page({
  data: {
    isAdmin: false,
    loading: false,
    levels: [] as Level[],
    currentLevelId: 0,
    currentLevelName: '',
    list: [] as Exhibit[],

    // selection & batch
    selectedIds: [] as number[],
    batchEdit: { costPoints: null as number | null, layer: null as number | null },

    // filters
    filter: { levelId: 0, layer: null as number | null, grade: null as Grade | null, effectType: null as EffectType | null, isPublished: null as boolean | null, keyword: '' },

    effectTypes: ['ATTACK','DEFENSE','BALANCED','DOMAIN','SUPPORT'] as EffectType[],
    grades: ['HUMAN','EARTH','HEAVEN','DIVINE','DIVINE_PLUS'] as Grade[],
    publishedOptions: ['全部','已发布','未发布'],

    // form
    showForm: false,
    form: { id: undefined as number | undefined, levelId: 0, name: '', imageUrl: '', lore: '', effectType: undefined, grade: undefined, author: '', costPoints: 0, stockInit: 0, stockCurrent: 0, layer: 1, isPublished: false } as Exhibit,
    formLevelName: ''
  },

  getLevelName(id: number) {
    const lv = (this.data as any).levels.find((x: Level) => x.id === id)
    return lv ? (lv.name || '') : ''
  },


  async onLoad() {
    await this.ensureAdmin()
    if (!(this.data as any).isAdmin) return
    await this.loadLevels()
    await this.refresh()
  },

  async onPullDownRefresh() {
    try { await this.refresh() } finally { wx.stopPullDownRefresh && wx.stopPullDownRefresh() }
  },

  async ensureAdmin() {
    // 先从本地判断，快速失败
    const role = wx.getStorageSync('X_ROLE') as string
    if (role === 'ADMIN') {
      this.setData({ isAdmin: true })
      return
    }
    try {
      const me = await get<any>('/me/info')
      const openid = (wx.getStorageSync('X_OPENID') as string) || ''
      const roleUp = String(me?.role||'').toUpperCase()
      const ok = !!me?.isAdmin || roleUp === 'ADMIN' || roleUp === 'ELDER' || /admin|elder/i.test(openid)
      this.setData({ isAdmin: ok })
      if (!ok) {
        wx.showModal({ title: '无权限', content: '仅管理员可访问此页面', showCancel: false, success: () => wx.navigateBack() })
      }
    } catch (e) {
      wx.showModal({ title: '无权限', content: '无法验证身份，请重试', showCancel: false, success: () => wx.navigateBack() })
    }
  },

  async loadLevels() {
    const levels = await get<Level[]>('/api/levels')
    const currentLevelId = (levels && levels[0] && levels[0].id) ? levels[0].id : 0
    const currentLevelName = currentLevelId ? ((levels || []).find(l=>l.id===currentLevelId)?.name || '') : ''
    const formLevelId = (this.data as any).form?.levelId || 0
    const formLevelName = formLevelId ? ((levels || []).find(l=>l.id===formLevelId)?.name || '') : ''
    this.setData({ levels: levels || [], currentLevelId, currentLevelName, formLevelName })
  },

  async refresh() {
    if (!(this.data as any).currentLevelId) return
    this.setData({ loading: true })
    try {
      const f = (this.data as any).filter || {}
      const params: any = { levelId: (this.data as any).currentLevelId, limit: 100 }
      if (f.layer) params.layer = f.layer
      if (f.grade) params.grade = f.grade
      if (f.effectType) params.effectType = f.effectType
      if (typeof f.isPublished === 'boolean') params.isPublished = f.isPublished
      if (f.keyword && f.keyword.trim()) params.keyword = f.keyword.trim()
      const list = await get<Exhibit[]>('/admin/exhibits', params)
      this.setData({ list: list || [] })
    } finally {
      this.setData({ loading: false })
    }
  },
  onPickLevel(e: any) {
    const index = Number(e.detail.value || 0)
    const lv = (this.data as any).levels[index]
    if (lv) {
      this.setData({ currentLevelId: lv.id, currentLevelName: lv.name || '' })
      this.refresh()
    }
  },

  onInputKeyword(e: any) {
    this.setData({ filter: { ...(this.data as any).filter, keyword: e.detail.value } })
  },
  onPickFilterLayer(e: any) {
    const v = Number(e.detail.value || 0)
    this.setData({ filter: { ...(this.data as any).filter, layer: v || null } })
    this.refresh()
  },
  onPickFilterGrade(e: any) {
    const idx = Number(e.detail.value || 0)
    const g = (this.data as any).grades[idx]
    this.setData({ filter: { ...(this.data as any).filter, grade: g || null } })
    this.refresh()
  },
  onPickFilterEffect(e: any) {
    const idx = Number(e.detail.value || 0)
    const et = (this.data as any).effectTypes[idx]
    this.setData({ filter: { ...(this.data as any).filter, effectType: et || null } })
    this.refresh()
  },
  onPickFilterPublished(e: any) {
    const idx = Number(e.detail.value || 0)
    // 0=全部,1=已发布,2=未发布
    const map = [null, true, false] as (boolean|null)[]
    const v = map[idx] ?? null
    this.setData({ filter: { ...(this.data as any).filter, isPublished: v } })
    this.refresh()
  },
  doSearch() {
    this.refresh()
  },

  openCreate() {
    const lv = (this.data as any).currentLevelId
    const formLevelName = this.getLevelName(lv)
    this.setData({ showForm: true, form: { id: undefined, levelId: lv, name: '', imageUrl: '', lore: '', effectType: undefined, grade: undefined, author: '', costPoints: 0, stockInit: 0, stockCurrent: 0, layer: 1, isPublished: false }, formLevelName })
  },

  openEdit(e: any) {
    const id = Number(e.currentTarget.dataset.id)
    const item = (this.data as any).list.find((x: Exhibit) => x.id === id)
    if (!item) return
    const formLevelName = this.getLevelName((item as any).levelId)
    this.setData({ showForm: true, form: { ...item }, formLevelName })
  },

  onInputName(e: any) {
    this.setData({ form: { ...(this.data as any).form, name: e.detail.value } })
  },
  onInputLore(e: any) {
    this.setData({ form: { ...(this.data as any).form, lore: e.detail.value } })
  },
  onInputAuthor(e: any) {
    this.setData({ form: { ...(this.data as any).form, author: e.detail.value } })
  },
  onInputCost(e: any) {
    const v = Number(e.detail.value || 0)
    this.setData({ form: { ...(this.data as any).form, costPoints: v } })
  },
  onInputStockInit(e: any) {
    const v = Number(e.detail.value || 0)
    this.setData({ form: { ...(this.data as any).form, stockInit: v } })
  },
  onInputStockCurrent(e: any) {
    const v = Number(e.detail.value || 0)
    this.setData({ form: { ...(this.data as any).form, stockCurrent: v } })
  },
  onPickFormLevel(e: any) {
    const index = Number(e.detail.value || 0)
    const lv = (this.data as any).levels[index]
    if (lv) this.setData({ form: { ...(this.data as any).form, levelId: lv.id }, formLevelName: lv.name || '' })
  },
  onPickGrade(e: any) {
    const idx = Number(e.detail.value || 0)
    const g = (this.data as any).grades[idx]
    if (g) this.setData({ form: { ...(this.data as any).form, grade: g } })
  },
  onPickEffectType(e: any) {
    const idx = Number(e.detail.value || 0)
    const et = (this.data as any).effectTypes[idx]
    if (et) this.setData({ form: { ...(this.data as any).form, effectType: et } })
  },
  onPickLayer(e: any) {
    const layer = Number(e.detail.value || 1)
    this.setData({ form: { ...(this.data as any).form, layer } })
  },
  onTogglePublish(e: any) {
    const val = !!e.detail.value
    this.setData({ form: { ...(this.data as any).form, isPublished: val } })
  },

  async chooseImage() {
    try {
      const res = await wx.chooseImage({ count: 1 })
      const paths = res.tempFilePaths || (res.tempFiles?.map((f: any) => f.path) ?? [])
      if (!paths.length) return
      wx.showLoading({ title: '上传中' })
      try {
        const [url] = await uploadFiles([paths[0]])
        this.setData({ form: { ...(this.data as any).form, imageUrl: url } })
        wx.showToast({ title: '上传成功', icon: 'success' })
      } finally {
        wx.hideLoading()
      }
    } catch (e) {
      wx.showToast({ title: '选择或上传失败', icon: 'none' })
    }
  },

  onSelectChange(e: any) {
    const vals = (e?.detail?.value || []) as string[]
    const ids = vals.map(v => Number(v)).filter(v => !!v)
    this.setData({ selectedIds: ids })
  },
  onToggleRowPublish(e: any) {
    const id = Number(e.currentTarget.dataset.id)
    const isPublished = !!e.detail.value
    this.batchPublish([id], isPublished)
  },
  onInputBatchCost(e: any) {
    const v = e.detail.value
    const num = v === '' ? null : Number(v)
    this.setData({ batchEdit: { ...(this.data as any).batchEdit, costPoints: (num as any) } })
  },
  onInputBatchLayer(e: any) {
    const v = e.detail.value
    const num = v === '' ? null : Number(v)
    this.setData({ batchEdit: { ...(this.data as any).batchEdit, layer: (num as any) } })
  },
  async onBatchUpdate() {
    const ids = (this.data as any).selectedIds as number[]
    const be = (this.data as any).batchEdit as { costPoints: number|null, layer: number|null }
    if (!ids || ids.length === 0) return wx.showToast({ title: '请先选择要批量修改的项', icon: 'none' })
    const updateFields: any = {}
    if (typeof be.costPoints === 'number') updateFields.costPoints = be.costPoints
    if (typeof be.layer === 'number') updateFields.layer = be.layer
    if (Object.keys(updateFields).length === 0) return wx.showToast({ title: '未填写任何更新字段', icon: 'none' })
    this.setData({ loading: true })
    try {
      await post('/admin/exhibits/batch', { ids, updateFields })
      wx.showToast({ title: '批量更新完成', icon: 'success' })
      this.setData({ selectedIds: [], batchEdit: { costPoints: null, layer: null } })
      await this.refresh()
    } finally {
      this.setData({ loading: false })
    }
  },
  async onBatchPublish(e: any) {
    const isPublished = !!e.currentTarget.dataset.on
    const ids = (this.data as any).selectedIds as number[]
    if (!ids || ids.length === 0) return wx.showToast({ title: '请先选择要批量发布/下架的项', icon: 'none' })
    await this.batchPublish(ids, isPublished)
  },
  async batchPublish(ids: number[], isPublished: boolean) {
    this.setData({ loading: true })
    try {
      await post('/admin/exhibits/batch/publish', { ids, isPublished })
      wx.showToast({ title: isPublished ? '已上架' : '已下架', icon: 'success' })
      await this.refresh()
    } finally {
      this.setData({ loading: false })
    }
  },

  async submit() {
    if ((this.data as any).loading) return
    const f = (this.data as any).form as Exhibit
    if (!f.levelId) return wx.showToast({ title: '请选择段位', icon: 'none' })
    if (!f.name?.trim()) return wx.showToast({ title: '请输入名称', icon: 'none' })
    if (!f.imageUrl?.trim()) return wx.showToast({ title: '请上传图片', icon: 'none' })

    const payload = { name: f.name, imageUrl: f.imageUrl, lore: f.lore || '', effectType: f.effectType, grade: f.grade, author: f.author, costPoints: f.costPoints, stockInit: f.stockInit, stockCurrent: f.stockCurrent, layer: f.layer, levelId: f.levelId, isPublished: !!f.isPublished }

    this.setData({ loading: true })
    try {
      if (f.id) {
        await post(`/admin/exhibits/${f.id}`, payload) // 若后端严格要求 PUT，可在 utils/api 增加 put 方法
        wx.showToast({ title: '已保存', icon: 'success' })
      } else {
        await post('/admin/exhibits', payload)
        wx.showToast({ title: '已创建', icon: 'success' })
      }
      this.setData({ showForm: false })
      await this.refresh()
    } finally {
      this.setData({ loading: false })
    }
  },

  cancelForm() {
    this.setData({ showForm: false })
  },

  async remove(e: any) {
    const id = Number(e.currentTarget.dataset.id)
    if (!id) return
    wx.showModal({ title: '确认删除', content: '删除后不可恢复，确定要删除吗？', success: async (res) => {
      if (!res.confirm) return
      this.setData({ loading: true })
      try {
        await post(`/admin/exhibits/${id}/delete`, {})
        wx.showToast({ title: '已删除', icon: 'success' })
        await this.refresh()
      } finally {
        this.setData({ loading: false })
      }
    } })
  }
})

