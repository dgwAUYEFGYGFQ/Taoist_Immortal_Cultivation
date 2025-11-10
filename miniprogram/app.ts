App({
  onLaunch() {
    // 初始化云开发环境（使用你提供的环境 ID）
    if ((wx as any).cloud) {
      (wx as any).cloud.init({ env: 'cloud1-3garp74rd531c7b7', traceUser: true })
    } else {
      console.error('当前基础库不支持云开发，请升级微信或基础库版本')
    }
  }
})

