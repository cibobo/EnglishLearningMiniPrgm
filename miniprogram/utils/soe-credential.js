// utils/soe-credential.js
// 从服务端获取 SOE 临时访问凭证，并在本地缓存至失效前 2 分钟自动刷新。
const { request } = require('./request');

let _cached = null;

/**
 * 获取当前有效的 SOE 临时凭证。
 * - 同一会话内凭证未过期时直接返回缓存，不发起网络请求。
 * - 过期（或即将过期）时自动向服务端刷新。
 *
 * @returns {{ tmpSecretId, tmpSecretKey, sessionToken }}
 */
async function getSoeCredential() {
  const nowSeconds = Math.floor(Date.now() / 1000);
  // 提前 120 秒刷新，避免边界情况下凭证在途失效
  if (_cached && _cached.expiredTime - nowSeconds > 120) {
    return _cached;
  }

  const data = await request({ url: '/soe-token' });
  _cached = data; // { tmpSecretId, tmpSecretKey, sessionToken, expiredTime }
  return _cached;
}

module.exports = { getSoeCredential };
