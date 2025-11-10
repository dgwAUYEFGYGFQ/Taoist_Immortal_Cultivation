const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event, context) => {
  const wxCtx = cloud.getWXContext()
  return {
    openid: wxCtx.OPENID,
    appid: wxCtx.APPID,
    env: process.env.TCB_ENV || process.env.SCF_NAMESPACE || 'unknown'
  }
}

