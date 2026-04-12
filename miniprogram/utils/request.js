// utils/request.js — 统一网络请求封装
//const BASE_URL = 'http://150.230.2.226:3000/api/v1';           // Oracle 服务器（已停用）
// const BASE_URL = 'https://express-u5ne-242771-4-1419482792.sh.run.tcloudbase.com/api/v1';

const request = (options) => {
  return new Promise((resolve, reject) => {
    const token = wx.getStorageSync('access_token');
    
    // 使用微信云托管原生方法，免域名配置
    wx.cloud.callContainer({
      config: {
        env: 'prod-7gq2vor170262a75', // 微信云托管的环境ID
      },
      path: `/api/v1${options.url}`,  // 接口路径
      method: options.method || 'GET',
      header: {
        'X-WX-SERVICE': 'express-u5ne', // 服务名称
        'content-type': 'application/json',
        Authorization: token ? `Bearer ${token}` : '',
        ...options.header,
      },
      data: options.data || {},
      success: (res) => {
        if (res.statusCode === 401) {
          // Token 过期，尝试刷新
          refreshAndRetry(options).then(resolve).catch(reject);
          return;
        }
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data);
        } else {
          reject({ code: res.statusCode, message: res.data?.message || '请求失败' });
        }
      },
      fail: (err) => {
        reject({ code: -1, message: '网络错误，请检查网络连接', detail: err });
      },
    });
  });
};

const refreshAndRetry = async (originalOptions) => {
  const refreshToken = wx.getStorageSync('refresh_token');
  if (!refreshToken) {
    redirectToLogin();
    throw new Error('No refresh token');
  }
  try {
    const res = await request({ url: '/auth/refresh', method: 'POST', data: { refresh_token: refreshToken } });
    wx.setStorageSync('access_token', res.access_token);
    return request(originalOptions);
  } catch {
    redirectToLogin();
    throw new Error('Token refresh failed');
  }
};

const redirectToLogin = () => {
  wx.removeStorageSync('access_token');
  wx.removeStorageSync('refresh_token');
  wx.reLaunch({ url: '/pages/login/login' });
};

module.exports = { request };
