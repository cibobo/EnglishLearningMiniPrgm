import { Router } from 'express';
import COS from 'cos-nodejs-sdk-v5';
import prisma from '../lib/prisma';
import { authenticate, requireTeacher, requireStudent } from '../middleware/auth';

const router = Router();
router.use(authenticate);

const cos = new COS({
  SecretId: process.env.COS_SECRET_ID!,
  SecretKey: process.env.COS_SECRET_KEY!,
});

// ─── POST /recordings ─────────────────────────────────────────────────────────
// 学生提交录音
router.post('/', requireStudent, async (req, res) => {
  try {
    const { lessonId, fileKey } = req.body;
    if (!lessonId || !fileKey) {
      res.status(400).json({ message: '缺少 lessonId 或 fileKey' });
      return;
    }

    const lesson = await prisma.lesson.findUnique({ where: { id: lessonId } });
    if (!lesson || lesson.deletedAt) {
      res.status(404).json({ message: '课程不存在' });
      return;
    }

    const audioUrl = `${process.env.COS_DOMAIN}/${fileKey}`;
    const submission = await prisma.recordingSubmission.create({
      data: {
        studentId: req.user!.id,
        lessonId,
        audioUrl,
        status: 'pending',
      },
    });
    res.status(201).json(submission);
  } catch {
    res.status(500).json({ message: '服务器错误' });
  }
});

// ─── GET /recordings ──────────────────────────────────────────────────────────
// 教师查看录音列表（按学生或课程筛选）
router.get('/', requireTeacher, async (req, res) => {
  try {
    const { student_id, lesson_id } = req.query;
    const where: Record<string, unknown> = {};
    if (student_id) where.studentId = student_id as string;
    if (lesson_id) where.lessonId = lesson_id as string;

    const recordings = await prisma.recordingSubmission.findMany({
      where,
      include: {
        student: { select: { id: true, name: true } },
        lesson: { select: { id: true, title: true } },
      },
      orderBy: { submittedAt: 'desc' },
    });
    res.json(recordings);
  } catch {
    res.status(500).json({ message: '服务器错误' });
  }
});

// ─── GET /recordings/:id/url ──────────────────────────────────────────────────
// 获取录音私有访问 URL（仅教师）
router.get('/:id/url', requireTeacher, async (req, res) => {
  try {
    const recordingId = req.params.id as string;
    const recording = await prisma.recordingSubmission.findUnique({
      where: { id: recordingId },
    });
    if (!recording) {
      res.status(404).json({ message: '录音不存在' });
      return;
    }

    // 从 audioUrl 提取 fileKey
    const domain = process.env.COS_DOMAIN!;
    const fileKey = recording.audioUrl.replace(`${domain}/`, '');

    // 生成 1 小时有效的临时访问 URL
    const tempUrl = await new Promise<string>((resolve, reject) => {
      cos.getObjectUrl(
        {
          Bucket: process.env.COS_BUCKET!,
          Region: process.env.COS_REGION!,
          Key: fileKey,
          Method: 'GET',
          Expires: 3600,
          Sign: true,
        },
        (err: any, data: any) => {
          if (err) reject(err);
          else resolve(data.Url);
        }
      );
    });

    res.json({ url: tempUrl, expires_in: 3600 });
  } catch {
    res.status(500).json({ message: '获取播放 URL 失败' });
  }
});

// ─── PATCH /recordings/:id/status ─────────────────────────────────────────────
// 教师标记录音为已听
router.patch('/:id/status', requireTeacher, async (req, res) => {
  try {
    const { status } = req.body;
    const recordingId = req.params.id as string;
    if (!['pending', 'reviewed'].includes(status)) {
      res.status(400).json({ message: 'status 值无效' });
      return;
    }
    const updated = await prisma.recordingSubmission.update({
      where: { id: recordingId },
      data: { status },
    });
    res.json(updated);
  } catch {
    res.status(500).json({ message: '服务器错误' });
  }
});

export default router;
