// utils/auth.js — 本地存储和登录工具
const { request } = require('./request');

const getStorageSync = (key) => {
  try { return wx.getStorageSync(key); } catch { return null; }
};

const setStorageSync = (key, value) => {
  try { wx.setStorageSync(key, value); } catch (e) { console.error(e); }
};

// 微信一键登录 + 可选的学生码绑定
const wechatLogin = (studentCode) => {
  return new Promise((resolve, reject) => {
    wx.login({
      success: async ({ code }) => {
        try {
          const data = await request({
            url: '/auth/wechat-login',
            method: 'POST',
            data: { code, studentCode: studentCode || undefined },
          });
          setStorageSync('access_token', data.access_token);
          setStorageSync('refresh_token', data.refresh_token);
          setStorageSync('user_info', data.user);
          resolve(data.user);
        } catch (err) {
          reject(err);
        }
      },
      fail: (err) => reject(err),
    });
  });
};

const logout = () => {
  wx.removeStorageSync('access_token');
  wx.removeStorageSync('refresh_token');
  wx.removeStorageSync('user_info');
  wx.reLaunch({ url: '/pages/login/login?from=logout' });
};

const getUserInfo = () => getStorageSync('user_info');
const isLoggedIn = () => !!getStorageSync('access_token');

module.exports = { wechatLogin, logout, getUserInfo, isLoggedIn, getStorageSync, setStorageSync };
