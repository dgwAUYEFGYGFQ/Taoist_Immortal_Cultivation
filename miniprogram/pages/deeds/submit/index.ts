import { post } from '../../../utils/api'
import { uploadFiles } from '../../../utils/upload'

Page({
  data: {
    title: '',
    description: '',
    occurredAt: '' as string,
    attachments: [] as string[],
    typeOptions: ['善恶点(VIRTUE)','贡献点(CONTRIB)'],
    typeValues: ['VIRTUE','CONTRIB'] as ('VIRTUE'|'CONTRIB')[],
    typeIndex: 0,

  },
  onTitle(e: any) { this.setData({ title: e.detail.value }) },
  onDesc(e: any) { this.setData({ description: e.detail.value }) },
  onDate(e: any) { this.setData({ occurredAt: e.detail.value }) },
  onChooseImage() {
    wx.chooseImage({
      count: 3,
      success: (res) => {
        const files = res.tempFilePaths
        this.setData({ attachments: files })
      }
    })
  },
  onTypeChange(e:any){ this.setData({ typeIndex: Number(e.detail.value||0) }) },

  async onSubmit() {
    const d:any = this.data
    const { title, description, occurredAt, attachments } = d
    const type = Array.isArray(d.typeValues) ? d.typeValues[d.typeIndex] : (d.type || 'VIRTUE')
    // no score field at submission stage per new contract
    if (!title?.trim() || !description?.trim() || !occurredAt) {
      wx.showToast({ title: '请完整填写', icon: 'none' })
      return
    }

    try {
      wx.showLoading({ title: '提交中...' })
      const urls = await uploadFiles(Array.isArray(attachments) ? attachments : [])
      const payload:any = { title, description, occurredAt, type, attachments: urls }
      try {
        await post('/api/deeds', payload)
      } catch (e:any) {
        if (e?.statusCode === 404) await post('/deeds', payload)
        else throw e
      }
      wx.hideLoading()
      wx.showToast({ title: '已提交', icon: 'success' })
      setTimeout(() => wx.navigateBack?.({ delta: 1 }) || wx.redirectTo({ url: '/pages/deeds/mine/index' }), 500)
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: '提交失败，请稍后再试', icon: 'none' })
    }
  }
})

