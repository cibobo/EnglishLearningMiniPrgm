import { Router } from 'express';
import COS from 'cos-nodejs-sdk-v5';
import crypto from 'crypto';
import path from 'path';
import { authenticate } from '../middleware/auth';

const router = Router();
router.use(authenticate);

const cos = new COS({
  SecretId: process.env.COS_SECRET_ID!,
  SecretKey: process.env.COS_SECRET_KEY!,
});

const BUCKET = process.env.COS_BUCKET!;
const REGION = process.env.COS_REGION!;

type UploadCategory = 'lesson_image' | 'lesson_audio' | 'recording';

const CATEGORY_DIRS: Record<UploadCategory, string> = {
  lesson_image: 'lesson-images',
  lesson_audio: 'lesson-audios',
  recording: 'student-recordings',
};

const ALLOWED_TYPES: Record<UploadCategory, string[]> = {
  lesson_image: ['image/jpeg', 'image/png', 'image/webp'],
  lesson_audio: ['audio/mpeg', 'audio/aac', 'audio/wav', 'audio/mp3'],
  recording: ['audio/aac', 'audio/mpeg', 'audio/mp4'],
};

// ─── POST /upload/presign ─────────────────────────────────────────────────────
router.post('/presign', async (req, res) => {
  try {
    const { filename, content_type, category } = req.body as {
      filename: string;
      content_type: string;
      category: UploadCategory;
    };

    if (!filename || !content_type || !category) {
      res.status(400).json({ message: '缺少必要字段：filename、content_type、category' });
      return;
    }

    const dir = CATEGORY_DIRS[category];
    if (!dir) {
      res.status(400).json({ message: '无效的 category' });
      return;
    }

    if (!ALLOWED_TYPES[category]?.includes(content_type)) {
      res.status(400).json({ message: `不支持的文件类型：${content_type}` });
      return;
    }

    const ext = path.extname(filename) || '.bin';
    const now = new Date();
    const datePath = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}`;
    const fileKey = `${dir}/${datePath}/${crypto.randomUUID()}${ext}`;

    // 生成预签名 PUT URL（有效期 15 分钟）
    const presignedUrl = await new Promise<string>((resolve, reject) => {
      cos.getObjectUrl(
        {
          Bucket: BUCKET,
          Region: REGION,
          Key: fileKey,
          Method: 'PUT',
          Expires: 900,
          Headers: { 'Content-Type': content_type },
          Sign: true,
        },
        (err: any, data: any) => {
          if (err) reject(err);
          else resolve(data.Url);
        }
      );
    });

    res.json({
      presigned_url: presignedUrl,
      file_key: fileKey,
      public_url: `${process.env.COS_DOMAIN}/${fileKey}`,
      expires_in: 900,
    });
  } catch (err) {
    console.error('[presign]', err);
    res.status(500).json({ message: '生成上传 URL 失败' });
  }
});

export default router;
