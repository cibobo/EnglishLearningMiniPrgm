// pages/login/login.js
const { wechatLogin, isLoggedIn, getUserInfo } = require('../../utils/auth');

Page({
  data: {
    loading: true,      // 页面加载时立即自动校验，GO 按钮先禁用
    needCode: false,    // 是否需要输入学生码
    studentCode: '',
    errorMsg: '',
  },

  async onLoad() {
    // 无论有无本地 Token，都自动向服务器校验绑定状态
    // 已绑定 → 直接跳转；未绑定（404）→ 显示学生码输入；网络错误 → 显示 GO 按钮供重试
    try {
      const user = await wechatLogin();
      wx.reLaunch({ url: `/pages/lessons/lessons?classId=${user.classId}` });
    } catch (err) {
      if (err && (err.code === 404 || err.message === 'NEED_STUDENT_CODE')) {
        wx.removeStorageSync('access_token');
        wx.removeStorageSync('refresh_token');
        wx.removeStorageSync('user_info');
        this.setData({ loading: false, needCode: true });
      } else {
        // 网络错误等，显示 GO 按钮供用户手动重试
        this.setData({ loading: false });
      }
    }
  },

  // 微信一键登录
  async onLogin() {
    this.setData({ loading: true, errorMsg: '' });
    try {
      const user = await wechatLogin();
      wx.reLaunch({ url: `/pages/lessons/lessons?classId=${user.classId}` });
    } catch (err) {
      if (err?.message === 'NEED_STUDENT_CODE' || err?.code === 404) {
        this.setData({ needCode: true, loading: false });
      } else {
        this.setData({
          loading: false,
          errorMsg: err?.message || '登录失败，请重试',
        });
      }
    }
  },

  onCodeInput(e) {
    this.setData({ studentCode: e.detail.value.toUpperCase() });
  },

  // 输入学生码后绑定并登录
  async onBindAndLogin() {
    const { studentCode } = this.data;
    if (!studentCode || studentCode.length !== 6) {
      this.setData({ errorMsg: '请输入 6 位学生码' });
      return;
    }
    this.setData({ loading: true, errorMsg: '' });
    try {
      const user = await wechatLogin(studentCode);
      wx.reLaunch({ url: `/pages/lessons/lessons?classId=${user.classId}` });
    } catch (err) {
      this.setData({
        loading: false,
        errorMsg: err?.message || '绑定失败，请检查学生码',
      });
    }
  },
});
