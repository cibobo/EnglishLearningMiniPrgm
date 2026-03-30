import { Router } from 'express';
import prisma from '../lib/prisma';
import { authenticate, requireTeacher } from '../middleware/auth';

const router = Router();
router.use(authenticate);

// ─── GET /lessons ─────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { class_id } = req.query;

    if (class_id) {
      // 小程序/班级视图：按 class_id 筛选，通过关联表获取
      const classLessons = await prisma.classLesson.findMany({
        where: { classId: class_id as string },
        include: {
          lesson: {
            include: { _count: { select: { sentences: true } } },
          },
        },
        orderBy: { orderIndex: 'asc' },
      });
      // 过滤已软删除的课程
      const lessons = classLessons
        .filter(cl => cl.lesson && !cl.lesson.deletedAt)
        .map(cl => cl.lesson);
      res.json(lessons);
      return;
    }

    // 课程库视图：返回教师本人所有课程
    if (req.user?.role !== 'teacher') {
      res.status(403).json({ message: '仅教师可查看课程库' });
      return;
    }
    const lessons = await prisma.lesson.findMany({
      where: { teacherId: req.user.id, deletedAt: null },
      include: {
        _count: { select: { sentences: true } },
        classLessons: { select: { classId: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(lessons);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '服务器错误' });
  }
});

// ─── GET /lessons/:id ─────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const lessonId = req.params.id as string;
    const lesson = await prisma.lesson.findUnique({
      where: { id: lessonId },
      include: {
        sentences: { orderBy: { orderIndex: 'asc' } },
        classLessons: { select: { classId: true } },
      },
    });
    if (!lesson || lesson.deletedAt) {
      res.status(404).json({ message: '课程不存在' });
      return;
    }
    res.json(lesson);
  } catch {
    res.status(500).json({ message: '服务器错误' });
  }
});

// ─── POST /lessons ────────────────────────────────────────────────────────────
router.post('/', requireTeacher, async (req, res) => {
  try {
    const { title, imageUrl, masterAudioUrl, sentences } = req.body;
    if (!title || !imageUrl) {
      res.status(400).json({ message: '缺少必要字段：title、imageUrl' });
      return;
    }

    const lesson = await prisma.lesson.create({
      data: {
        teacherId: req.user!.id,
        masterAudioUrl,
        title,
        imageUrl,
        sentences: sentences
          ? {
              create: sentences.map((s: { text: string; audioUrl?: string; startTime?: number; endTime?: number; imageUrl?: string; }, i: number) => ({
                text: s.text,
                audioUrl: s.audioUrl || null,
                startTime: s.startTime || null,
                endTime: s.endTime || null,
                imageUrl: s.imageUrl || null,
                orderIndex: i,
              })),
            }
          : undefined,
      },
      include: { sentences: { orderBy: { orderIndex: 'asc' } } },
    });
    res.status(201).json(lesson);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '服务器错误' });
  }
});

// ─── PUT /lessons/:id ─────────────────────────────────────────────────────────
router.put('/:id', requireTeacher, async (req, res) => {
  try {
    const { title, imageUrl, masterAudioUrl } = req.body;
    const lesson = await prisma.lesson.update({
      where: { id: req.params.id as string },
      data: { title, imageUrl, masterAudioUrl },
    });
    res.json(lesson);
  } catch {
    res.status(500).json({ message: '服务器错误' });
  }
});

// ─── DELETE /lessons/:id ──────────────────────────────────────────────────────
router.delete('/:id', requireTeacher, async (req, res) => {
  try {
    const lessonId = req.params.id as string;
    await prisma.$transaction([
      prisma.lesson.update({
        where: { id: lessonId },
        data: { deletedAt: new Date() },
      }),
      // @ts-ignore Prisma client might be stale in IDE
      prisma.classLesson.deleteMany({
        where: { lessonId: lessonId },
      }),
    ]);
    res.json({ message: '课程已删除' });
  } catch {
    res.status(500).json({ message: '服务器错误' });
  }
});

// ─── POST /lessons/:id/sentences ──────────────────────────────────────────────
router.post('/:id/sentences', requireTeacher, async (req, res) => {
  try {
    const { sentences } = req.body;
    const lessonId = req.params.id as string;
    if (!Array.isArray(sentences) || sentences.length === 0) {
      res.status(400).json({ message: '句子列表不能为空' });
      return;
    }
    await prisma.sentence.deleteMany({ where: { lessonId } });
    const created = await prisma.sentence.createMany({
      data: sentences.map((s: { text: string; audioUrl?: string; startTime?: number; endTime?: number; imageUrl?: string; }, i: number) => ({
        lessonId,
        text: s.text,
        audioUrl: s.audioUrl || null,
        startTime: s.startTime || null,
        endTime: s.endTime || null,
        imageUrl: s.imageUrl || null,
        orderIndex: i,
      })),
    });
    res.json({ count: created.count, message: `已保存 ${created.count} 条句子` });
  } catch {
    res.status(500).json({ message: '服务器错误' });
  }
});

export default router;
