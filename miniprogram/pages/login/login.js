// pages/login/login.js
const { wechatLogin, isLoggedIn, getUserInfo } = require('../../utils/auth');

Page({
  data: {
    loading: false,
    needCode: false,    // 是否需要输入学生码
    studentCode: '',
    errorMsg: '',
  },

  onLoad() {
    // 已登录则直接跳转
    if (isLoggedIn()) {
      const user = getUserInfo();
      if (user) {
        wx.reLaunch({ url: `/pages/lessons/lessons?classId=${user.classId}` });
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
