import { Router, Request, Response } from 'express';
import multer, { StorageEngine, FileFilterCallback } from 'multer';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { authenticate } from '../middleware/auth';

const router = Router();
router.use(authenticate);

// ─── 本地存储配置 ──────────────────────────────────────────────────────────────
// 文件保存到服务器的 uploads/ 目录下
const UPLOADS_DIR = path.join(process.cwd(), 'uploads');

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

// multer 动态存储：根据 category 决定子目录
const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const category = req.query.category as UploadCategory;
    const subDir = CATEGORY_DIRS[category] || 'misc';
    const now = new Date();
    const datePath = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}`;
    const dir = path.join(UPLOADS_DIR, subDir, datePath);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.bin';
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB 上限
});

// 服务器的公网基础 URL（从 env 读取，默认用 IP）
const BASE_URL = process.env.SERVER_BASE_URL || 'http://150.230.2.226:3000';

// ─── POST /upload/presign ─────────────────────────────────────────────────────
// 注意：原来是「预签名URL然后前端直传」的模式。
// 改为本地存储后，前端需要改用 POST /upload/file 接口直接上传文件。
// 为了保持前端兼容，此接口返回一个「上传令牌」，前端用它调用 /upload/file。
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

  // 返回直传接口地址，前端把文件 POST 到这里
  res.json({
    upload_url: `${BASE_URL}/api/v1/upload/file?category=${category}`,
    method: 'POST',                 // 前端用 multipart/form-data POST
    field_name: 'file',             // FormData 的字段名
    expires_in: 900,
  });
});

// ─── POST /upload/file?category=xxx ──────────────────────────────────────────
// 接收前端直传的文件，保存到本地，返回可访问的 public_url
router.post('/file', upload.single('file'), (req: Request, res: Response) => {
  if (!req.file) {
    res.status(400).json({ message: '未收到文件' });
    return;
  }

  // 计算相对于 UPLOADS_DIR 的路径，作为 file_key
  const relativePath = path.relative(UPLOADS_DIR, req.file.path).replace(/\\/g, '/');
  const publicUrl = `${BASE_URL}/uploads/${relativePath}`;

  res.json({
    file_key: relativePath,
    public_url: publicUrl,
  });
});

export default router;
