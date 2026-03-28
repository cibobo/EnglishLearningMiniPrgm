import { Router } from 'express';
import prisma from '../lib/prisma';
import { authenticate, requireTeacher } from '../middleware/auth';

const router = Router();
router.use(authenticate);

// ─── GET /lessons ─────────────────────────────────────────────────────────────
// 不传 class_id → 返回教师的全部课程库
// 传 class_id  → 返回该班级已分配的课程（小程序 & 教师端班级视图用）
router.get('/', async (req, res) => {
  try {
    const { class_id } = req.query;

    if (class_id) {
      // 小程序/班级视图：按 class_id 筛选
      const classLessons = await prisma.classLesson.findMany({
        where: { classId: class_id as string },
        include: {
          lesson: {
            where: { deletedAt: null },
            include: { _count: { select: { sentences: true } } },
          },
        },
        orderBy: { orderIndex: 'asc' },
      });
      // 过滤掉已软删除的课程
      const lessons = classLessons
        .filter(cl => cl.lesson)
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
        classLessons: { select: { classId: true } }, // 知道被分配给了哪些班级
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
    const lesson = await prisma.lesson.findUnique({
      where: { id: req.params.id },
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
// 教师创建课程（进入课程库，不属于任何班级）
router.post('/', requireTeacher, async (req, res) => {
  try {
    const { title, imageUrl, sentences } = req.body;
    if (!title || !imageUrl) {
      res.status(400).json({ message: '缺少必要字段：title、imageUrl' });
      return;
    }

    const lesson = await prisma.lesson.create({
      data: {
        teacherId: req.user!.id,
        title,
        imageUrl,
        sentences: sentences
          ? {
              create: sentences.map((s: { text: string; audioUrl?: string }, i: number) => ({
                text: s.text,
                audioUrl: s.audioUrl || null,
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
    const { title, imageUrl } = req.body;
    const lesson = await prisma.lesson.update({
      where: { id: req.params.id },
      data: { title, imageUrl },
    });
    res.json(lesson);
  } catch {
    res.status(500).json({ message: '服务器错误' });
  }
});

// ─── DELETE /lessons/:id ──────────────────────────────────────────────────────
router.delete('/:id', requireTeacher, async (req, res) => {
  try {
    await prisma.lesson.update({
      where: { id: req.params.id },
      data: { deletedAt: new Date() },
    });
    res.json({ message: '课程已删除' });
  } catch {
    res.status(500).json({ message: '服务器错误' });
  }
});

// ─── POST /lessons/:id/sentences ──────────────────────────────────────────────
router.post('/:id/sentences', requireTeacher, async (req, res) => {
  try {
    const { sentences } = req.body;
    const lessonId = req.params.id;
    if (!Array.isArray(sentences) || sentences.length === 0) {
      res.status(400).json({ message: '句子列表不能为空' });
      return;
    }
    await prisma.sentence.deleteMany({ where: { lessonId } });
    const created = await prisma.sentence.createMany({
      data: sentences.map((s: { text: string; audioUrl?: string }, i: number) => ({
        lessonId,
        text: s.text,
        audioUrl: s.audioUrl || null,
        orderIndex: i,
      })),
    });
    res.json({ count: created.count, message: `已保存 ${created.count} 条句子` });
  } catch {
    res.status(500).json({ message: '服务器错误' });
  }
});

export default router;
