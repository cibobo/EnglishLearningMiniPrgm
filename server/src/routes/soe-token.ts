import { Router, Request, Response } from 'express';
// @ts-ignore — JS-only SDK, no bundled type declarations
const tencentcloud = require('tencentcloud-sdk-nodejs-sts');

const StsClient = tencentcloud.sts.v20180813.Client;

const router = Router();

// ─── GET /api/v1/soe-token ────────────────────────────────────────────────────
// 为小程序前端颁发临时访问凭证，授权范围仅限于 SOE 口语评测流式接口。
// 临时凭证有效期 30 分钟，由前端缓存，到期前自动刷新。
// 此接口不需要鉴权（小程序无 Cookie/Token），但依赖微信云托管的网络隔离保护。
router.get('/', async (_req: Request, res: Response) => {
  try {
    const clientConfig = {
      credential: {
        secretId: process.env.TENCENTCLOUD_SECRET_ID,
        secretKey: process.env.TENCENTCLOUD_SECRET_KEY,
      },
      region: 'ap-guangzhou',
      profile: {
        httpProfile: {
          endpoint: 'sts.tencentcloudapi.com',
        },
      },
    };

    const client = new StsClient(clientConfig);

    const params = {
      Name: 'SOE',
      Policy: JSON.stringify({
        version: '2.0',
        statement: {
          effect: 'allow',
          action: ['soe:SpeakingAssessmentStream'],
          resource: '*',
        },
      }),
      DurationSeconds: 1800, // 30 分钟
    };

    const data = await client.GetFederationToken(params);

    res.json({
      tmpSecretId: data.Credentials.TmpSecretId,
      tmpSecretKey: data.Credentials.TmpSecretKey,
      sessionToken: data.Credentials.Token,
      expiredTime: data.ExpiredTime, // Unix timestamp (seconds)
    });
  } catch (err: any) {
    console.error('[SOE Token] 获取临时凭证失败:', err?.message || err);
    res.status(500).json({ message: '获取临时凭证失败，请稍后重试' });
  }
});

export default router;
