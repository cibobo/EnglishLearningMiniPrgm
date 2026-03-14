// app.js — 微信小程序全局入口
const { login, getStorageSync } = require('./utils/auth');

App({
  globalData: {
    userInfo: null,
    classId: null,
  },

  onLaunch() {
    // 检查本地 Token，若有效则静默刷新用户信息
    const token = getStorageSync('access_token');
    if (token) {
      console.log('[App] 已有 Token，跳过登录页');
    }
  },
});
