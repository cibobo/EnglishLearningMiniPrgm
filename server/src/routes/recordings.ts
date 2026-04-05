import { Router } from 'express';
import prisma from '../lib/prisma';
import { authenticate, requireTeacher, requireStudent } from '../middleware/auth';

const router = Router();
router.use(authenticate);

// ─── POST /recordings ─────────────────────────────────────────────────────────
// 学生提交录音（小程序端直传 COS 后，把 cloudId 发给后端登记）
router.post('/', requireStudent, async (req, res) => {
  try {
    const { lessonId, cloudId, sentenceId } = req.body;
    if (!lessonId || !cloudId) {
      res.status(400).json({ message: '缺少 lessonId 或 cloudId' });
      return;
    }

    const lesson = await prisma.lesson.findUnique({ where: { id: lessonId } });
    if (!lesson || lesson.deletedAt) {
      res.status(404).json({ message: '课程不存在' });
      return;
    }

    // cloudId 格式: cloud://prod-xxx/recordings/lessonId/timestamp_index.aac
    // 直接存储，后续通过微信开放接口或 COS SDK 生成临时下载链接
    const submission = await prisma.recordingSubmission.create({
      data: {
        studentId: req.user!.id,
        lessonId,
        sentenceId: sentenceId || null,
        audioUrl: cloudId,
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
        sentence: { select: { id: true, text: true, orderIndex: true } },
      },
      orderBy: { submittedAt: 'desc' },
    });
    res.json(recordings);
  } catch {
    res.status(500).json({ message: '服务器错误' });
  }
});

// ─── GET /recordings/:id/url ──────────────────────────────────────────────────
// 获取录音访问 URL（仅教师）
// audioUrl 可能是旧的 http URL 或新的 cloud:// CloudID
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

    // 新格式：cloud:// CloudID，直接返回给教师端。
    // 教师端通过 wx.cloud.getTempFileURL 转换为临时播放链接。
    // 旧格式：http URL（Oracle 服务器时期的历史数据），直接返回。
    res.json({ url: recording.audioUrl, expires_in: 3600 });
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

// ─── DELETE /recordings/:id ─────────────────────────────────────────────────────
// 删除数据库记录
// 注意：COS 上的音频文件不会自动删除，可在云托管控制台手动清理，
// 或后续集成 COS SDK 在此处自动删除。
router.delete('/:id', requireTeacher, async (req, res) => {
  try {
    const recording = await prisma.recordingSubmission.findUnique({
      where: { id: req.params.id as string },
    });
    if (!recording) {
      res.status(404).json({ message: '录音不存在' });
      return;
    }

    await prisma.recordingSubmission.delete({ where: { id: req.params.id as string } });
    // TODO: 后续可调用 COS SDK 删除 recording.audioUrl 对应的 COS 文件

    res.json({ message: '录音已删除' });
  } catch {
    res.status(500).json({ message: '服务器错误' });
  }
});

export default router;
