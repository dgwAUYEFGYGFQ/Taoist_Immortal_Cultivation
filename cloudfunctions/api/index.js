const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

function ok(data) { return { code: 'OK', message: 'ok', data } }
function err(message, code = 400) { return { code, message, data: null } }
function nowISO() { return new Date().toISOString() }

function stripApiPrefix(p) { return String(p || '/').replace(/^\/api(?=\/|$)/, '') }

async function getProfile(openid) {
  try {
    const snap = await db.collection('users').where({ openid }).limit(1).get()
    const row = (snap.data || [])[0]
    return row || null
  } catch (_) { return null }
}
async function getPoints(openid) {
  try {
    const r = await db.collection('user_points').doc(openid).get()
    return r.data || null
  } catch (_) { return null }
}
async function ensurePoints(tx, openid) {
  const ref = tx.collection('user_points').doc(openid)
  const cur = await ref.get().catch(() => ({ data: null }))
  if (!cur || !cur.data) {
    await ref.set({ _id: openid, virtueBalance: 0, contribBalance: 0, updatedAt: nowISO() })
    return { virtueBalance: 0, contribBalance: 0 }
  }
  return cur.data
}

function toListItem(doc) {
  if (!doc) return doc
  const { _id, ...rest } = doc
  return { id: _id, ...rest }
}

exports.main = async (event, context) => {
  const method = String(event.method || 'GET').toUpperCase()
  let path = stripApiPrefix(event.path || '/')
  const body = event.data || {}
  const wxCtx = (cloud.getWXContext && cloud.getWXContext()) || {}
  // 默认使用微信环境提供的 openid
  let openid = (context && (context['OPENID'] || context['openid'])) || wxCtx['OPENID'] || wxCtx['openid'] || ''
  // 开发态兼容：优先从 body.data._mockOpenid 里取，其次 body._mockOpenid，便于前端统一透传
  const payload = (body && typeof body.data === 'object') ? body.data : body
  if (payload && payload._mockOpenid) {
    openid = String(payload._mockOpenid)
  }

  try {
    // 0) POST /me/bootstrap  首次初始化：若无任何用户，则将当前人置为 ADMIN；否则仅建档
    if (method === 'POST' && path === '/me/bootstrap') {
      const cnt = await db.collection('users').count()
      if ((cnt.total || 0) === 0) {
        await db.collection('users').doc(openid).set({ data: { _id: openid, openid, role: 'ADMIN', nickname: '掌门', createdAt: nowISO() } })
        return ok({ role: 'ADMIN' })
      }
      const me = await getProfile(openid)
      if (!me) {
        await db.collection('users').doc(openid).set({ data: { _id: openid, openid, role: 'DAO_FRIEND', nickname: '道友', createdAt: nowISO() } })
        return ok({ role: 'DAO_FRIEND' })
      }
      return ok({ role: me.role || 'DAO_FRIEND' })
    }

    // 1) GET /me/info
    if (method === 'GET' && path === '/me/info') {
      const profile = (await getProfile(openid)) || { _id: openid, openid, role: 'DAO_FRIEND', nickname: '道友' }
      const points = (await getPoints(openid)) || { virtueBalance: 0, contribBalance: 0 }
      return ok({ openid, role: profile.role || 'DAO_FRIEND', nickname: profile.nickname || '道友', virtueBalance: Number(points.virtueBalance||0), contribBalance: Number(points.contribBalance||0) })
    }

    // 2) POST /deeds  (提交功德)
    if (method === 'POST' && path === '/deeds') {
      const { title = '', description = '', occurredAt = '', type = 'VIRTUE', attachments = [] } = body || {}
      if (!title || !occurredAt) return err('标题和发生时间必填')
      const now = nowISO()
      const addRes = await db.collection('deed_submission').add({
        data: { userId: openid, title, description, occurredAt, type: String(type).toUpperCase(), attachments: Array.isArray(attachments)?attachments:[], status: 'PENDING', createdAt: now, updatedAt: now }
      })
      return ok({ id: addRes._id })
    }

    // 3) GET /deeds/my
    if (method === 'GET' && path === '/deeds/my') {
      const { page = 1, pageSize = 50, type, start, end, kw, status = 'ALL' } = body || {}
      const where = { userId: openid }
      if (type) where.type = String(type).toUpperCase()
      if (status && status !== 'ALL') where.status = String(status).toUpperCase()
      if (kw) where.title = db.RegExp({ regexp: String(kw), options: 'i' })
      let qry = db.collection('deed_submission').where(where)
      if (start) qry = qry.where({ occurredAt: _.gte(String(start)) })
      if (end) qry = qry.where({ occurredAt: _.lte(String(end)) })
      const skip = (Number(page)-1) * Number(pageSize)
      const [cnt, list] = await Promise.all([
        db.collection('deed_submission').where(where).count(),
        qry.orderBy('createdAt','desc').skip(skip).limit(Number(pageSize)).get()
      ])
      const arr = (list.data || []).map(toListItem)
      return ok({ list: arr, total: cnt.total || arr.length })
    }

    // 4) GET /deeds/:id
    if (method === 'GET' && /^\/deeds\//.test(path)) {
      const id = String(path.split('/')[2] || '')
      if (!id) return err('缺少ID')
      const r = await db.collection('deed_submission').doc(id).get()
      if (!r || !r.data) return err('未找到', 404)
      return ok(toListItem(r.data))
    }

    // 5) GET /elder/reviews/list (仅 ELDER/ADMIN)
    if (method === 'GET' && path === '/elder/reviews/list') {
      const me = await getProfile(openid)
      const role = (me && me.role) || 'DAO_FRIEND'
      if (!['ELDER','ADMIN'].includes(String(role).toUpperCase())) return err('无权限', 403)
      const { limit = 20 } = body || {}
      const list = await db.collection('deed_submission').where({ status: 'PENDING' }).orderBy('createdAt','desc').limit(Number(limit)).get()
      const items = (list.data || []).map(toListItem)
      return ok({ items, nextCursor: null })
    }

    // 6) GET /elder/reviews/:id
    if (method === 'GET' && /^\/elder\/reviews\//.test(path) && !/(approve|reject)$/.test(path)) {
      const id = String(path.split('/')[3] || '')
      if (!id) return err('缺少ID')
      const me = await getProfile(openid)
      const role = (me && me.role) || 'DAO_FRIEND'
      if (!['ELDER','ADMIN'].includes(String(role).toUpperCase())) return err('无权限', 403)
      const r = await db.collection('deed_submission').doc(id).get()
      if (!r || !r.data) return err('未找到', 404)
      return ok(toListItem(r.data))
    }

    // 7) POST /elder/reviews/:id/approve
    if (method === 'POST' && /\/elder\/reviews\/.+\/approve$/.test(path)) {
      const id = String(path.split('/')[3] || '')
      if (!id) return err('缺少ID')
      const { scoreDelta = 0, comment = '' } = body || {}
      const me = await getProfile(openid)
      const role = (me && me.role) || 'DAO_FRIEND'
      if (!['ELDER','ADMIN'].includes(String(role).toUpperCase())) return err('无权限', 403)
      const reviewerNickname = (me && me.nickname) || ''
      const now = nowISO()

      const txRes = await db.runTransaction(async (t) => {
        const subRef = t.collection('deed_submission').doc(id)
        const subSnap = await subRef.get()
        if (!subSnap.data) throw new Error('未找到提交单')
        const sub = subSnap.data
        if (sub.status !== 'PENDING') throw new Error('当前状态不允许操作')
        const userId = sub.userId
        const pointType = String(sub.type || 'VIRTUE').toUpperCase()
        const pts = await ensurePoints(t, userId)
        const cur = pointType === 'VIRTUE' ? Number(pts.virtueBalance || 0) : Number(pts.contribBalance || 0)
        const delta = Number(scoreDelta || 0)
        const after = cur + delta

        // update user_points
        const upRef = t.collection('user_points').doc(userId)
        if (pointType === 'VIRTUE') {
          await upRef.update({ virtueBalance: after, updatedAt: now })
        } else {
          await upRef.update({ contribBalance: after, updatedAt: now })
        }
        // insert ledger
        await t.collection('points_ledger').add({ data: {
          userId, pointType, sourceType: 'DEED_REVIEW', sourceId: id, delta, balanceAfter: after, remark: '功德审核通过', createdAt: now
        }})
        // update submission
        await subRef.update({ status: 'APPROVED', updatedAt: now, review: { scoreDelta: delta, comment, reviewerOpenid: openid, reviewerNickname, createdAt: now } })
        return { after }
      })

      return ok({ id, status: 'APPROVED', balanceAfter: txRes.after })
    }

    // 8) POST /elder/reviews/:id/reject
    if (method === 'POST' && /\/elder\/reviews\/.+\/reject$/.test(path)) {
      const id = String(path.split('/')[3] || '')
      if (!id) return err('缺少ID')
      const { comment = '', scoreDelta = 0 } = body || {}
      const me = await getProfile(openid)
      const role = (me && me.role) || 'DAO_FRIEND'
      if (!['ELDER','ADMIN'].includes(String(role).toUpperCase())) return err('无权限', 403)
      const reviewerNickname = (me && me.nickname) || ''
      const now = nowISO()
      await db.collection('deed_submission').doc(id).update({
        data: { status: 'REJECTED', updatedAt: now, review: { scoreDelta: Number(scoreDelta||0), comment, reviewerOpenid: openid, reviewerNickname, createdAt: now } }
      })
      return ok({ id, status: 'REJECTED' })
    }

    // 9) GET /points/ledger
    if (method === 'GET' && path === '/points/ledger') {
      const { type, page = 1, pageSize = 20 } = body || {}
      const where = { userId: openid }
      if (type) where.pointType = String(type).toUpperCase()
      const skip = (Number(page)-1) * Number(pageSize)
      const [cnt, list] = await Promise.all([
        db.collection('points_ledger').where(where).count(),
        db.collection('points_ledger').where(where).orderBy('createdAt','desc').skip(skip).limit(Number(pageSize)).get()
      ])
      const arr = (list.data || []).map(toListItem)
      return ok({ list: arr, total: cnt.total || arr.length })
    }

    // 10) GET /ziyun/status
    if (method === 'GET' && path === '/ziyun/status') {
      // 当前在内的人
      const insideSnap = await db.collection('zy_queue').where({ status: 'INSIDE' }).orderBy('enteredAt','desc').limit(1).get()
      const inside = (insideSnap.data || [])[0]
      let insideUser = null
      if (inside && inside.userId) {
        const p = await getProfile(inside.userId)
        insideUser = p ? { id: inside.userId, nickname: p.nickname || '道友' } : { id: inside.userId, nickname: '道友' }
      }
      // 排队中
      const waitSnap = await db.collection('zy_queue').where({ status: 'WAITING' }).orderBy('joinedAt','asc').get()
      const waitList = waitSnap.data || []
      const queue = []
      for (const r of waitList) {
        const p = await getProfile(r.userId)
        queue.push({ id: r.userId, nickname: (p && p.nickname) || '道友' })
      }
      // 我的状态与位置
      const myWaitIdx = waitList.findIndex(x => x.userId === openid)
      const myInside = inside && inside.userId === openid
      const inQueue = myWaitIdx >= 0
      const position = inQueue ? (myWaitIdx + 1) : undefined
      // 我的善恶点余额
      const pts = (await getPoints(openid)) || { virtueBalance: 0 }
      const status = myInside ? 'INSIDE' : (inQueue ? 'WAITING' : '')
      return ok({ status, insideUser, queue, inQueue, position, virtueBalance: Number(pts.virtueBalance || 0) })
    }

    // 11) POST /ziyun/join  扣 10 点善恶点，进入 WAITING（若已在 WAITING/INSIDE 则幂等返回）
    if (method === 'POST' && path === '/ziyun/join') {
      // 幂等：若已在 WAITING/INSIDE，则直接返回 OK
      const active = await db.collection('zy_queue').where({ userId: openid, status: _.in(['WAITING','INSIDE']) }).get()
      if ((active.data || []).length > 0) return ok({ status: (active.data[0].status || 'WAITING') })
      const now = nowISO()
      const res = await db.runTransaction(async (t) => {
        const curPts = await ensurePoints(t, openid)
        const cur = Number(curPts.virtueBalance || 0)
        const after = cur - 10
        if (after < 0) throw new Error('INSUFFICIENT_VIRTUE_POINTS')
        // 更新余额
        await t.collection('user_points').doc(openid).update({ virtueBalance: after, updatedAt: now })
        // 记账
        await t.collection('points_ledger').add({ data: { userId: openid, pointType: 'VIRTUE', sourceType: 'ZIYUN_JOIN', sourceId: now, delta: -10, balanceAfter: after, remark: '紫云阁报名', createdAt: now } })
        // 入队
        const add = await t.collection('zy_queue').add({ data: { userId: openid, status: 'WAITING', joinedAt: now } })
        return { after, id: add._id }
      })
      return ok({ id: res.id, status: 'WAITING' })
    }

    // 12) POST /ziyun/cancel  WAITING 可取消并退回 10 点
    if (method === 'POST' && path === '/ziyun/cancel') {
      const waitSnap = await db.collection('zy_queue').where({ userId: openid, status: 'WAITING' }).orderBy('joinedAt','asc').limit(1).get()
      const row = (waitSnap.data || [])[0]
      if (!row) return err('WRONG_STATE', 400)
      const now = nowISO()
      await db.runTransaction(async (t) => {
        // 改状态
        await t.collection('zy_queue').doc(row._id).update({ status: 'CANCELLED', cancelledAt: now })
        // 退回 10 点
        const curPts = await ensurePoints(t, openid)
        const cur = Number(curPts.virtueBalance || 0)
        const after = cur + 10
        await t.collection('user_points').doc(openid).update({ virtueBalance: after, updatedAt: now })
        await t.collection('points_ledger').add({ data: { userId: openid, pointType: 'VIRTUE', sourceType: 'ZIYUN_CANCEL', sourceId: row._id, delta: +10, balanceAfter: after, remark: '紫云阁取消排队退款', createdAt: now } })
        return { after }
      })
      return ok({ status: 'CANCELLED' })
    }

    // 13) POST /ziyun/leave  仅 INSIDE 可离开，不退款
    if (method === 'POST' && path === '/ziyun/leave') {
      const inSnap = await db.collection('zy_queue').where({ userId: openid, status: 'INSIDE' }).orderBy('enteredAt','desc').limit(1).get()
      const row = (inSnap.data || [])[0]
      if (!row) return err('NOT_INSIDE', 400)
      const now = nowISO()
      await db.collection('zy_queue').doc(row._id).update({ data: { status: 'FINISHED', leftAt: now } })
      return ok({ status: 'FINISHED' })
    }

    // 14) GET /pavilion/levels  楼层 + 解锁状态（基于贡献点）
    if (method === 'GET' && path === '/pavilion/levels') {
      const pts = (await getPoints(openid)) || { contribBalance: 0 }
      const contrib = Number(pts.contribBalance || 0)
      const defs = [
        { layer:1, name:'练气', minScore:0 },
        { layer:2, name:'筑基', minScore:100 },
        { layer:3, name:'金丹', minScore:300 },
        { layer:4, name:'元婴', minScore:600 },
        { layer:5, name:'化神', minScore:1000 },
        { layer:6, name:'合道', minScore:1500 }
      ]
      const list = defs.map(l => ({ ...l, unlocked: contrib >= l.minScore, exhibitCount: 0 }))
      return ok(list)
    }

    // 15) GET /levels  段位列表（Admin 页面使用）
    if (method === 'GET' && path === '/levels') {
      const levels = [
        { id: 1, name: '练气', min_score: 0, order_no: 1 },
        { id: 2, name: '筑基', min_score: 100, order_no: 2 },
        { id: 3, name: '金丹', min_score: 300, order_no: 3 },
        { id: 4, name: '元婴', min_score: 600, order_no: 4 },
        { id: 5, name: '化神', min_score: 1000, order_no: 5 },
        { id: 6, name: '合道', min_score: 1500, order_no: 6 },
      ]
      return ok(levels)
    }

    // 16) GET /pavilion/exhibits?layer=
    if (method === 'GET' && path === '/pavilion/exhibits') {
      const { layer } = body || {}
      const l = Number(layer || 0)
      if (!l) return ok([])
      const list = await db.collection('exhibits').where({ isPublished: true, layer: l }).orderBy('createdAt','desc').limit(100).get()
      const items = (list.data||[]).map(e => ({
        id: e.id, name: e.name, grade: e.grade, effectType: e.effectType, costPoints: Number(e.costPoints||0), author: e.author||'', imageUrl: e.imageUrl||''
      }))
      return ok(items)
    }

    // 17) GET /pavilion/exhibits/:id
    if (method === 'GET' && /^\/pavilion\/exhibits\//.test(path)) {
      const exId = Number(String(path.split('/')[3]||'0'))
      if (!exId) return err('缺少ID')
      const snap = await db.collection('exhibits').where({ id: exId }).limit(1).get()
      const ex = (snap.data||[])[0]
      if (!ex) return err('未找到', 404)
      const own = await db.collection('user_exhibits').where({ userId: openid, exhibitId: exId }).count()
      const isUnderstood = (own.total||0) > 0
      return ok({ id: ex.id, name: ex.name, grade: ex.grade, effectType: ex.effectType, author: ex.author||'', lore: ex.lore||'', imageUrl: ex.imageUrl||'', isUnderstood, requiredPoints: Number(ex.costPoints||0), costPoints: Number(ex.costPoints||0) })
    }

    // 18) POST /pavilion/redeem { exhibitId }
    if (method === 'POST' && path === '/pavilion/redeem') {
      const { exhibitId } = body || {}
      const exId = Number(exhibitId || 0)
      if (!exId) return err('缺少ID')
      // 幂等：已拥有则直接返回
      const owned = await db.collection('user_exhibits').where({ userId: openid, exhibitId: exId }).limit(1).get()
      if ((owned.data||[]).length>0) {
        const pts = (await getPoints(openid)) || { contribBalance: 0 }
        return ok({ balanceAfter: Number(pts.contribBalance||0), already: true })
      }
      const now = nowISO()
      const tx = await db.runTransaction(async (t) => {
        const exSnap = await t.collection('exhibits').where({ id: exId }).limit(1).get()
        const ex = (exSnap.data||[])[0]
        if (!ex || ex.isPublished===false) throw new Error('EXHIBIT_UNAVAILABLE')
        if (typeof ex.stockCurrent === 'number' && ex.stockCurrent <= 0) throw new Error('EXHIBIT_UNAVAILABLE')
        const pts = await ensurePoints(t, openid)
        const cur = Number(pts.contribBalance||0)
        const price = Number(ex.costPoints||0)
        const after = cur - price
        if (after < 0) throw new Error('INSUFFICIENT_CONTRIB_POINTS')
        await t.collection('user_points').doc(openid).update({ contribBalance: after, updatedAt: now })
        await t.collection('points_ledger').add({ data: { userId: openid, pointType: 'CONTRIB', sourceType: 'EXHIBIT_BUY', sourceId: exId, delta: -price, balanceAfter: after, remark: `兑换展品：${ex.name||''}`, createdAt: now } })
        // 减库存（如有设置）
        if (typeof ex.stockCurrent === 'number') {
          const left = ex.stockCurrent - 1
          const exDoc = (ex._id) ? t.collection('exhibits').doc(ex._id) : null
          if (exDoc) await exDoc.update({ stockCurrent: left })
        }
        await t.collection('user_exhibits').add({ data: { userId: openid, exhibitId: exId, createdAt: now } })
        return { after }
      })
      return ok({ balanceAfter: tx.after })
    }

    // 19) GET /admin/exhibits  （仅 ELDER/ADMIN）
    if (method === 'GET' && path === '/admin/exhibits') {
      const me = await getProfile(openid); const role = (me&&me.role)||'DAO_FRIEND'
      if (!['ELDER','ADMIN'].includes(String(role).toUpperCase())) return err('无权限', 403)
      const { levelId, layer, grade, effectType, isPublished, keyword, limit = 100 } = body || {}
      const where = {}
      if (levelId) where.levelId = Number(levelId)
      if (layer) where.layer = Number(layer)
      if (grade) where.grade = String(grade).toUpperCase()
      if (effectType) where.effectType = String(effectType).toUpperCase()
      if (typeof isPublished === 'boolean') where.isPublished = !!isPublished
      let q = db.collection('exhibits').where(where)
      if (keyword && String(keyword).trim()) q = q.where({ name: db.RegExp({ regexp: String(keyword), options: 'i' }) })
      const snap = await q.orderBy('createdAt','desc').limit(Number(limit)).get()
      return ok((snap.data||[]).map(e=>({ id:e.id, levelId:e.levelId, name:e.name, imageUrl:e.imageUrl||'', lore:e.lore||'', effectType:e.effectType, grade:e.grade, author:e.author||'', costPoints:Number(e.costPoints||0), stockInit:Number(e.stockInit||0), stockCurrent: typeof e.stockCurrent==='number'?Number(e.stockCurrent):null, layer:Number(e.layer||1), isPublished:!!e.isPublished, createdAt:e.createdAt||'' })))
    }

    // 20) POST /admin/exhibits  创建（仅 ELDER/ADMIN）
    if (method === 'POST' && path === '/admin/exhibits') {
      const me = await getProfile(openid); const role = (me&&me.role)||'DAO_FRIEND'
      if (!['ELDER','ADMIN'].includes(String(role).toUpperCase())) return err('无权限', 403)
      const { levelId, name, imageUrl, lore='', effectType, grade, author='', costPoints=0, stockInit=0, stockCurrent=0, layer=1, isPublished=false } = body || {}
      if (!levelId) return err('缺少段位')
      if (!name) return err('名称必填')
      if (!imageUrl) return err('图片必填')
      const now = nowISO()
      const ex = { id: Date.now(), levelId: Number(levelId), name, imageUrl, lore, effectType: effectType?String(effectType).toUpperCase():undefined, grade: grade?String(grade).toUpperCase():undefined, author, costPoints: Number(costPoints||0), stockInit: Number(stockInit||0), stockCurrent: Number(stockCurrent||0), layer: Number(layer||1), isPublished: !!isPublished, createdAt: now }
      await db.collection('exhibits').add({ data: ex })
      return ok({ id: ex.id })
    }

    // 21) POST /admin/exhibits/:id  更新
    if (method === 'POST' && /^\/admin\/exhibits\/[0-9]+$/.test(path)) {
      const me = await getProfile(openid); const role = (me&&me.role)||'DAO_FRIEND'
      if (!['ELDER','ADMIN'].includes(String(role).toUpperCase())) return err('无权限', 403)
      const exId = Number(String(path.split('/')[3]))
      const payload = body || {}
      const data = { ...payload }
      if (data.grade) data.grade = String(data.grade).toUpperCase()
      if (data.effectType) data.effectType = String(data.effectType).toUpperCase()
      if (typeof data.isPublished !== 'undefined') data.isPublished = !!data.isPublished
      await db.collection('exhibits').where({ id: exId }).update({ data })
      return ok({ id: exId })
    }

    // 22) POST /admin/exhibits/:id/delete  删除
    if (method === 'POST' && /\/admin\/exhibits\/[0-9]+\/delete$/.test(path)) {
      const me = await getProfile(openid); const role = (me&&me.role)||'DAO_FRIEND'
      if (!['ELDER','ADMIN'].includes(String(role).toUpperCase())) return err('无权限', 403)
      const exId = Number(String(path.split('/')[3]))
      await db.collection('exhibits').where({ id: exId }).remove()
      return ok({ id: exId, deleted: true })
    }

    // 23) POST /admin/exhibits/batch  批量更新字段
    if (method === 'POST' && path === '/admin/exhibits/batch') {
      const me = await getProfile(openid); const role = (me&&me.role)||'DAO_FRIEND'
      if (!['ELDER','ADMIN'].includes(String(role).toUpperCase())) return err('无权限', 403)
      const { ids = [], updateFields = {} } = body || {}
      const arr = Array.isArray(ids) ? ids.map((x)=>Number(x)).filter(Boolean) : []
      const data = { ...updateFields }
      if (data.grade) data.grade = String(data.grade).toUpperCase()
      if (data.effectType) data.effectType = String(data.effectType).toUpperCase()
      await db.collection('exhibits').where({ id: _.in(arr) }).update({ data })
      return ok({ updated: arr.length })
    }

    // 24) POST /admin/exhibits/batch/publish  批量上下架
    if (method === 'POST' && path === '/admin/exhibits/batch/publish') {
      const me = await getProfile(openid); const role = (me&&me.role)||'DAO_FRIEND'
      if (!['ELDER','ADMIN'].includes(String(role).toUpperCase())) return err('无权限', 403)
      const { ids = [], isPublished = false } = body || {}
      const arr = Array.isArray(ids) ? ids.map((x)=>Number(x)).filter(Boolean) : []
      await db.collection('exhibits').where({ id: _.in(arr) }).update({ data: { isPublished: !!isPublished } })
      return ok({ updated: arr.length })
    }

    // 25) GET /admin/invites  （仅 ADMIN/ELDER）
    if (method === 'GET' && path === '/admin/invites') {
      const me = await getProfile(openid); const role = (me&&me.role)||'DAO_FRIEND'
      if (!['ELDER','ADMIN'].includes(String(role).toUpperCase())) return err('无权限', 403)
      const { limit = 100 } = body || {}
      const snap = await db.collection('invites').orderBy('createdAt','desc').limit(Number(limit)).get()
      return ok((snap.data||[]))
    }

    // 26) POST /admin/invites/generate  （仅 ADMIN/ELDER）
    if (method === 'POST' && path === '/admin/invites/generate') {
      const me = await getProfile(openid); const role = (me&&me.role)||'DAO_FRIEND'
      if (!['ELDER','ADMIN'].includes(String(role).toUpperCase())) return err('无权限', 403)
      const { count = 1, expireAt = '', remark = '' } = body || {}
      const c = Math.max(1, Math.min(200, Number(count)))
      const now = nowISO()
      const gen = () => Math.random().toString(36).slice(2, 10).toUpperCase()
      const batch = []
      for (let i=0;i<c;i++) batch.push({ code: gen(), used: false, expire_at: expireAt||'', used_at: '', remark: remark||'', createdAt: now, createdBy: openid })
      await db.collection('invites').add({ data: batch })
      return ok({ created: batch.length })
    }

    return err('Not Found', 404)
  } catch (e) {
    return err(e && e.message ? String(e.message) : 'Server Error', 500)
  }
}
