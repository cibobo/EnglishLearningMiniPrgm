import { Router } from 'express';
import prisma from '../lib/prisma';
import { authenticate, requireTeacher, requireStudent } from '../middleware/auth';
import { recalculateLessonScore } from '../lib/scoring';

const router = Router();
router.use(authenticate);

// ─── POST /recordings ─────────────────────────────────────────────────────────
// 学生提交录音（小程序端直传 COS 后，把 cloudId 发给后端登记）
router.post('/', requireStudent, async (req, res) => {
  try {
    const { lessonId, cloudId, sentenceId } = req.body;
    if (!lessonId || !cloudId || !sentenceId) {
      res.status(400).json({ message: '缺少 lessonId、cloudId 或 sentenceId' });
      return;
    }

    const lesson = await prisma.lesson.findUnique({ where: { id: lessonId } });
    if (!lesson || lesson.deletedAt) {
      res.status(404).json({ message: '课程不存在' });
      return;
    }

    // 锁定检查：LessonScore 存在 → 课程已锁，拒绝新录音
    const locked = await prisma.lessonScore.findUnique({
      where: { studentId_lessonId: { studentId: req.user!.id, lessonId } },
    });
    if (locked) {
      res.status(403).json({ message: '课程已评分完成，无法继续跟读' });
      return;
    }

    // cloudId 格式: cloud://prod-xxx/recordings/lessonId/timestamp_index.aac
    // 直接存储，后续通过微信开放接口或 COS SDK 生成临时下载链接
    const submission = await prisma.recordingSubmission.upsert({
      where: { studentId_sentenceId: { studentId: req.user!.id, sentenceId } },
      create: {
        studentId: req.user!.id,
        lessonId,
        sentenceId,
        audioUrl: cloudId,
        status: 'pending',
        score: null,
      },
      update: {
        audioUrl: cloudId,
        status: 'pending',
        score: null,
        submittedAt: new Date(),
      },
    });

    // 重录后旧分数被清除，重新计算（如果已有记录会被删除解锁）
    await recalculateLessonScore(req.user!.id, lessonId);
    
    res.status(201).json(submission);
  } catch (error) {
    console.error(error);
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
    // 教师端是 Web 页面，无法直接播放 cloud:// 协议音频，由于云托管的 COS 桶配置为 public-read，
    // 我们直接将其转换为可公开访问的 HTTPS 链接。
    let finalUrl = recording.audioUrl;
    if (finalUrl && finalUrl.startsWith('cloud://')) {
      const match = finalUrl.match(/^cloud:\/\/[^/]+\.([^/]+)\/(.+)$/);
      if (match) {
        finalUrl = `https://${match[1]}.tcb.qcloud.la/${match[2]}`;
      }
    }

    res.json({ url: finalUrl, expires_in: 3600 });
  } catch {
    res.status(500).json({ message: '获取播放 URL 失败' });
  }
});

// ─── PATCH /recordings/:id/score ────────────────────────────────────────────
// 教师给录音打分
router.patch('/:id/score', requireTeacher, async (req, res) => {
  try {
    const { score } = req.body;
    if (score !== null && (!Number.isInteger(score) || score < 1 || score > 5)) {
      res.status(400).json({ message: 'score 必须为 1-5 的整数或 null' });
      return;
    }
    const recordingId = req.params.id as string;
    
    const recording = await prisma.recordingSubmission.findUnique({
      where: { id: recordingId },
    });
    if (!recording) {
      res.status(404).json({ message: '录音不存在' });
      return;
    }

    const updated = await prisma.recordingSubmission.update({
      where: { id: recordingId },
      data: { score, status: 'reviewed' },
    });
    
    await recalculateLessonScore(updated.studentId, updated.lessonId);
    res.json(updated);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: '服务器错误' });
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
