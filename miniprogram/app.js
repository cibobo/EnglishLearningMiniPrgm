// app.js — 微信小程序全局入口
const { login, getStorageSync } = require('./utils/auth');

App({
  globalData: {
    userInfo: null,
    classId: null,
    celebration: null,  // 跨页庆典数据 { lessonId, trophyLevel }
  },

  onLaunch() {
    // 初始化微信云服务（仅用于 wx.cloud.uploadFile 直传 COS）
    // 注意：API 调用仍然走 wx.request，不受此影响
    wx.cloud.init({ env: 'prod-7gq2vor170262a75' });

    // 检查本地 Token，若有效则静默刷新用户信息
    const token = getStorageSync('access_token');
    if (token) {
      console.log('[App] 已有 Token，跳过登录页');
    }
  },
});
