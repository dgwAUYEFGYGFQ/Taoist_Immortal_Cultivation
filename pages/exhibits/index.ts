import { get } from '../../utils/api'

type PavilionLevel = { layer: number; name: string; minScore: number; unlocked: boolean; exhibitCount: number }
type ExhibitCard = { id: number; name: string; grade?: 'HUMAN'|'EARTH'|'HEAVEN'|'DIVINE'|'DIVINE_PLUS'; effectType?: 'ATTACK'|'DEFENSE'|'BALANCED'|'DOMAIN'|'SUPPORT'; costPoints?: number; author?: string; isLocked?: boolean; isUnderstood?: boolean; hint?: string | null; imageUrl?: string }

Page({
  data: {
    contribBalance: 0 as number,
    levels: [] as PavilionLevel[],
    currentLayer: null as number | null,
    exhibits: [] as ExhibitCard[],
    loading: false
  },

  async onLoad() {
    await this.loadAll()
  },

  async onPullDownRefresh() {
    try { await this.loadAll() }
    finally { wx.stopPullDownRefresh && wx.stopPullDownRefresh() }
  },

  async loadAll() {
    this.setData({ loading: true })
    try {
      // 用户信息：贡献点余额与段位
      const info = await get<any>('/me/info')
      const contrib = Number(info?.contribBalance || 0)
      this.setData({ contribBalance: contrib })
      // 楼层与解锁状态：优先接口，失败则退化为本地静态构建
      let levels: PavilionLevel[] = []
      try {
        try {
          levels = await get<PavilionLevel[]>('/api/pavilion/levels')
        } catch (e: any) {
          if (e?.statusCode === 404) {
            levels = await get<PavilionLevel[]>('/pavilion/levels')
          } else { throw e }
        }
      } catch (_) {
        levels = this.buildFallbackLevels(info)
      }
      const levelsWithDisplay = (levels || []).map(l => ({ ...l, displayName: `第${this.ordinalCn(l.layer)}层` }))
      const currentLayer = this.deriveDefaultLayer(levelsWithDisplay)
      this.setData({ levels: levelsWithDisplay, currentLayer })
      if (currentLayer) {
        try { await this.fetchExhibits(currentLayer) } catch (_) { /* 列表失败也不阻断 */ }
      } else {
        this.setData({ exhibits: [] })
      }
    } catch (e) {
      // 若用户信息都获取失败，给出提示
      wx.showToast({ title: '加载失败', icon: 'none' })
    } finally {
      this.setData({ loading: false })
    }
  },

  deriveDefaultLayer(levels: PavilionLevel[]) {
    if (!levels || levels.length === 0) return null
    // 选已解锁的最高层作为默认层；若都未解锁则选第一层
    const unlocked = levels.filter(l => !!l.unlocked)
    if (unlocked.length === 0) return levels[0]?.layer || null
    return unlocked[unlocked.length - 1].layer
  },

  async fetchExhibits(layer: number) {
    try {
      const exhibits = await get<ExhibitCard[]>(`/api/pavilion/exhibits`, { layer })
      this.setData({ exhibits: exhibits || [] })
    } catch (e: any) {
      if (e?.statusCode === 404) {
        try {
          const exhibits = await get<ExhibitCard[]>(`/pavilion/exhibits`, { layer })
          this.setData({ exhibits: exhibits || [] })
        } catch (e2) {
          this.setData({ exhibits: [] })
        }
      } else {
        // 其他错误也降级为空列表
        this.setData({ exhibits: [] })
      }
    }
  },

  buildFallbackLevels(info: any): PavilionLevel[] {
    const names = ['练气','筑基','金丹','元婴','化神','合道']
    const minScores = [0, 100, 300, 600, 1000, 1500]
    const unlockedMax = Math.max(1, Number(info?.levelId || 1))
    return names.map((name, idx) => ({
      layer: idx + 1,
      name,
      minScore: minScores[idx] || 0,
      unlocked: (idx + 1) <= unlockedMax,
      exhibitCount: 0
    }))
  },

  async onTapLayer(e: any) {
    const layer = Number(e.currentTarget.dataset.layer)
    const { levels } = this.data as any
    const lv = (levels as PavilionLevel[]).find(l => l.layer === layer)
    if (!lv) return
    if (!lv.unlocked) {
      wx.showToast({ title: '修为未至，尚不可登此层', icon: 'none' })
      return
    }
    if (this.data.currentLayer === layer) return
    this.setData({ currentLayer: layer, exhibits: [] })
    try {
      wx.showLoading({ title: '加载中' })
      await this.fetchExhibits(layer)
    } finally {
      wx.hideLoading()
    }
  },

  goDetail(e: any) {
    const id = Number(e.currentTarget.dataset.id)
    if (!id) return
    wx.navigateTo({ url: `/pages/exhibits/detail/index?id=${id}` })
  },

  ordinalCn(n: number) {
    const map = ['零','一','二','三','四','五','六','七','八','九','十']
    if (n >= 1 && n <= 10) return map[n]
    if (n < 20) return '十' + map[n - 10]
    const tens = Math.floor(n / 10)
    const ones = n % 10
    return (tens > 1 ? map[tens] + '十' : '十') + (ones ? map[ones] : '')
  }
})
