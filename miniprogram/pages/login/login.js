// pages/login/login.js
const { wechatLogin, isLoggedIn, getUserInfo, setStorageSync } = require('../../utils/auth');

Page({
  data: {
    loading: true,      // 页面加载时立即自动校验，GO 按钮先禁用
    needCode: false,    // 是否需要输入学生码
    studentCode: '',
    errorMsg: '',
    showAvatarPicker: false,
    avatars: [],
    selectedAvatar: null,
    currentUser: null,
  },

  async onLoad(options) {
    // 主动退出登录时跳过自动校验，直接显示 GO 按钮
    if (options && options.from === 'logout') {
      this.setData({ loading: false });
      return;
    }
    // 其他情况（首次打开、Token 过期跳转）自动向服务器校验绑定状态
    // 已绑定 → 直接跳转；未绑定（404）→ 显示学生码输入；网络错误 → 显示 GO 按钮
    try {
      const user = await wechatLogin();
      this.handleLoginSuccess(user);
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
      this.handleLoginSuccess(user);
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
      this.handleLoginSuccess(user);
    } catch (err) {
      this.setData({
        loading: false,
        errorMsg: err?.message || '绑定失败，请检查学生码',
      });
    }
  },

  handleLoginSuccess(user) {
    if (!user.avatarUrl) {
      // First time login, prompt for avatar
      const avatars = Array.from({length: 12}, (_, i) => `/images/avatars/avatar_${i+1}.png`);
      this.setData({
        showAvatarPicker: true,
        avatars,
        loading: false,
        currentUser: user,
      });
    } else {
      // Has avatar, go to lessons
      wx.reLaunch({ url: `/pages/lessons/lessons?classId=${user.classId}` });
    }
  },

  onSelectAvatar(e) {
    const { url } = e.currentTarget.dataset;
    this.setData({ selectedAvatar: url });
  },

  async onConfirmAvatar() {
    const { selectedAvatar, currentUser } = this.data;
    if (!selectedAvatar) return;
    
    // Save to user object and local storage
    currentUser.avatarUrl = selectedAvatar;
    setStorageSync('user_info', currentUser);
    
    // Persist independently so it survives logouts
    setStorageSync(`user_avatar_${currentUser.id}`, selectedAvatar);

    // Give best effort to send it to the backend natively if the endpoint exists.
    try {
      const { request } = require('../../utils/request');
      await request({ url: '/auth/me', method: 'PUT', data: { avatarUrl: selectedAvatar } });
    } catch(e) {
      // Ignore API error as backend might not support it yet, local storage will handle it.
    }

    // Proceed to app
    wx.reLaunch({ url: `/pages/lessons/lessons?classId=${currentUser.classId}` });
  },
});
