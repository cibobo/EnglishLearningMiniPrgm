import { Router, Request, Response } from 'express';
import multer from 'multer';
import crypto from 'crypto';
import path from 'path';
import tcb from '@cloudbase/node-sdk';
import { authenticate } from '../middleware/auth';

const router = Router();
router.use(authenticate);

// ─── 初始化 CloudBase Node SDK ────────────────────────────────────────────────
// 在微信云托管内容器会自动继承环境凭证
const cloudApp = tcb.init({
  env: tcb.SYMBOL_CURRENT_ENV,
});

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
const BASE_URL = process.env.SERVER_BASE_URL || 'http://150.230.2.226:3000';

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

    // 使用 CloudBase SDK 把内存中的文件 Buffer 直传云存储
    const uploadResult = await cloudApp.uploadFile({
      cloudPath: cloudPath,
      fileContent: req.file.buffer,
    });

    // uploadResult.fileID 是类似 cloud://xxx... 的格式
    // 借用 getTempFileURL() 方法来反推获取底层的 HTTPS URL (去掉签名部分留作永久公共链接)
    const tempUrlResult = await cloudApp.getTempFileURL({
      fileList: [uploadResult.fileID]
    });
    
    let publicUrl = tempUrlResult.fileList[0].tempFileURL;
    // 去掉 ?sign=... 后缀得到原生静态加载地址（前提：COS 权限需设置为公有读）
    if (publicUrl.includes('?')) {
      publicUrl = publicUrl.substring(0, publicUrl.indexOf('?'));
    }

    res.json({
      file_key: uploadResult.fileID,
      // 如果老师网页没配置 COS CORS 白名单拦截了公共访问，我们也可以传原始 public_url (含临时签名) 供立马预览
      public_url: publicUrl, 
    });
  } catch (err) {
    console.error('上传到微信云 COS 失败:', err);
    res.status(500).json({ message: '文件转存失败' });
  }
});

export default router;
