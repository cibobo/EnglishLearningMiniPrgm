import { Router, Request, Response } from 'express';
import multer from 'multer';
import crypto from 'crypto';
import path from 'path';
import axios from 'axios';
import COS from 'cos-nodejs-sdk-v5';
import { authenticate } from '../middleware/auth';

const router = Router();
router.use(authenticate);

const cosConfig = {
  Bucket: process.env.COS_BUCKET || '', // 在云托管环境变量中配置
  Region: process.env.COS_REGION || 'ap-shanghai'
};

let cos: COS;
try {
  cos = new COS({
    getAuthorization: async function (options, callback) {
      try {
        const res = await axios.get('http://api.weixin.qq.com/_/cos/getauth');
        const info = res.data;
        const auth = {
          TmpSecretId: info.TmpSecretId,
          TmpSecretKey: info.TmpSecretKey,
          SecurityToken: info.Token,
          StartTime: Math.floor(Date.now() / 1000),
          ExpiredTime: info.ExpiredTime,
        };
        callback(auth);
      } catch (err) {
        console.error('获取临时密钥失败', err);
      }
    },
  });
  console.log('COS 初始化成功');

  // 自动强制校验并设置存储桶为公有读（异步执行，不阻塞启动）
  if (cosConfig.Bucket) {
    setTimeout(() => {
      cos.putBucketAcl({
        Bucket: cosConfig.Bucket,
        Region: cosConfig.Region,
        ACL: 'public-read'
      }, (err, data) => {
        if (err) {
          console.error('【通知】自动设置 COS 存储桶为公有读失败（如已是公有读可能忽略）:', err.message || err);
        } else {
          console.log('【成功】底层 COS 存储桶权限已自动更新为「公有读私有写」');
        }
      });
    }, 3000); // 延迟3秒执行，确保环境完全就绪
  }
} catch (e) {
  console.error('COS 初始化失败', e);
}

type UploadCategory = 'lesson_image' | 'lesson_audio' | 'recording';

const CATEGORY_DIRS: Record<UploadCategory, string> = {
  lesson_image: 'lesson-images',
  lesson_audio: 'lesson-audios',
  recording: 'student-recordings',
};

const ALLOWED_TYPES: Record<UploadCategory, string[]> = {
  lesson_image: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  lesson_audio: ['audio/mpeg', 'audio/aac', 'audio/wav', 'audio/mp3', 'audio/x-m4a', 'audio/m4a', 'audio/mp4', 'video/mp4'],
  recording: ['audio/aac', 'audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/m4a', 'audio/wav', 'audio/mp3', 'video/mp4'],
};

// 改用内存存储，直接将前端传来的包读到内存里，再通过 SDK 上传至 COS
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB 上限
});

// 服务器的公网基础 URL
const BASE_URL = process.env.SERVER_BASE_URL || 'https://express-u5ne-242771-4-1419482792.sh.run.tcloudbase.com';

// ─── POST /upload/presign ─────────────────────────────────────────────────────
// 为了保持前端（Teacher-Web）兼容，该接口继续返回包含后续真实上传路径的指令
router.post('/presign', async (req: Request, res: Response) => {
  const { filename, content_type, category } = req.body as {
    filename: string;
    content_type: string;
    category: UploadCategory;
  };

  if (!filename || !content_type || !category) {
    res.status(400).json({ message: '缺少必要字段：filename、content_type、category' });
    return;
  }

  if (!CATEGORY_DIRS[category]) {
    res.status(400).json({ message: '无效的 category' });
    return;
  }

  if (!ALLOWED_TYPES[category]?.includes(content_type)) {
    res.status(400).json({ message: `不支持的文件类型：${content_type}` });
    return;
  }

  res.json({
    upload_url: `${BASE_URL}/api/v1/upload/file?category=${category}`,
    method: 'POST',
    field_name: 'file',
    expires_in: 900,
  });
});

// ─── POST /upload/file?category=xxx ──────────────────────────────────────────
// 接收前端 Teacher-Web 的真实文件，通过云托管内网 SDK 存入 COS
router.post('/file', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ message: '未收到文件' });
      return;
    }

    const category = (req.query.category as UploadCategory) || 'lesson_image';
    const subDir = CATEGORY_DIRS[category] || 'misc';
    
    // 生成 CloudPath (例如: lesson-images/2026/04/uuid.jpg)
    const now = new Date();
    const datePath = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}`;
    const ext = path.extname(req.file.originalname) || '.bin';
    const cloudPath = `${subDir}/${datePath}/${crypto.randomUUID()}${ext}`;

    try {
      // 1. 获取文件上传所需的加密元数据，保证后续小程序端能够访问
      const authRes = await axios.post('http://api.weixin.qq.com/_/cos/metaid/encode', {
        openid: '', // 管理端统一为空字符串
        bucket: cosConfig.Bucket,
        paths: [cloudPath]
      });

      const metaid = authRes.data?.respdata?.x_cos_meta_field_strs?.[0];

      if (!metaid) {
        console.error('获取文件元数据失败，API返回值:', authRes.data);
        res.status(500).json({ message: '文件上传初始化凭证失败' });
        return;
      }

      // 2. 使用 COS SDK 结合元数据执行普通上传
      cos.putObject({
        Bucket: cosConfig.Bucket,
        Region: cosConfig.Region,
        Key: cloudPath,
        StorageClass: 'STANDARD',
        Body: req.file.buffer,
        ContentLength: req.file.size,
        ContentType: req.file.mimetype,
        Headers: {
          'x-cos-meta-fileid': metaid
        }
      }, (err, data) => {
        if (err) {
          console.error('上传到微信云 COS 失败:', err);
          res.status(500).json({ message: '文件转存失败' });
          return;
        }

        // data.Location 返回示例: "examplebucket-1250000000.cos.ap-guangzhou.myqcloud.com/lesson-images/..."
        const publicUrl = `https://${data.Location}`;

        res.json({
          // 可以将 tcb 云环境 ID 拼接成的完整地址视为前端可读取的持久标志，这里我们尽量保持向下兼容或直接返回云端路径对象
          file_key: cloudPath, 
          // public_url 代表可被外部直接访问的公有URL
          public_url: publicUrl, 
        });
      });
    } catch (err) {
      console.error('获取元数据阶段失败:', err);
      res.status(500).json({ message: '系统内部调用元数据错误' });
    }

  } catch (err) {
    console.error('文件上传处理失败:', err);
    res.status(500).json({ message: '文件转存失败' });
  }
});

export default router;
