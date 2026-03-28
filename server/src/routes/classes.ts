import { Router } from 'express';
import prisma from '../lib/prisma';
import { authenticate, requireTeacher } from '../middleware/auth';

const router = Router();
router.use(authenticate, requireTeacher);

// ─── GET /classes ──────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const classes = await prisma.class.findMany({
      where: { teacherId: req.user!.id, deletedAt: null },
      include: {
        _count: { select: { students: true, classLessons: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    // 将 classLessons count 重命名为 lessons 以保持前端兼容
    const result = classes.map(c => ({
      ...c,
      _count: { students: c._count.students, lessons: c._count.classLessons },
    }));
    res.json(result);
  } catch {
    res.status(500).json({ message: '服务器错误' });
  }
});

// ─── POST /classes ─────────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name) {
      res.status(400).json({ message: '班级名称不能为空' });
      return;
    }
    const cls = await prisma.class.create({
      data: { name, description, teacherId: req.user!.id },
    });
    res.status(201).json(cls);
  } catch {
    res.status(500).json({ message: '服务器错误' });
  }
});

// ─── PUT /classes/:id ─────────────────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const cls = await prisma.class.findFirst({
      where: { id: req.params.id, teacherId: req.user!.id, deletedAt: null },
    });
    if (!cls) { res.status(404).json({ message: '班级不存在' }); return; }

    const { name, description } = req.body;
    const updated = await prisma.class.update({
      where: { id: req.params.id },
      data: { name, description },
    });
    res.json(updated);
  } catch {
    res.status(500).json({ message: '服务器错误' });
  }
});

// ─── DELETE /classes/:id ──────────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const cls = await prisma.class.findFirst({
      where: { id: req.params.id, teacherId: req.user!.id, deletedAt: null },
    });
    if (!cls) { res.status(404).json({ message: '班级不存在' }); return; }

    await prisma.class.update({
      where: { id: req.params.id },
      data: { deletedAt: new Date() },
    });
    res.json({ message: '班级已删除' });
  } catch {
    res.status(500).json({ message: '服务器错误' });
  }
});

// ─── GET /classes/:id/students ────────────────────────────────────────────────
router.get('/:id/students', async (req, res) => {
  try {
    const students = await prisma.student.findMany({
      where: { classId: req.params.id, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });
    res.json(students);
  } catch {
    res.status(500).json({ message: '服务器错误' });
  }
});

// ─── GET /classes/:id/lessons ─────────────────────────────────────────────────
// 获取班级已分配的课程列表（含课程详情）
router.get('/:id/lessons', async (req, res) => {
  try {
    const classLessons = await prisma.classLesson.findMany({
      where: { classId: req.params.id },
      include: {
        lesson: {
          where: { deletedAt: null },
          include: { _count: { select: { sentences: true } } },
        },
      },
      orderBy: { orderIndex: 'asc' },
    });
    const lessons = classLessons.filter(cl => cl.lesson).map(cl => cl.lesson);
    res.json(lessons);
  } catch {
    res.status(500).json({ message: '服务器错误' });
  }
});

// ─── POST /classes/:id/lessons ────────────────────────────────────────────────
// 将课程分配给班级（支持批量）body: { lessonIds: string[] }
router.post('/:id/lessons', async (req, res) => {
  try {
    const classId = req.params.id;
    const { lessonIds } = req.body as { lessonIds: string[] };

    if (!Array.isArray(lessonIds) || lessonIds.length === 0) {
      res.status(400).json({ message: '请提供 lessonIds 数组' });
      return;
    }

    // 获取当前最大 orderIndex
    const maxOrder = await prisma.classLesson.count({ where: { classId } });

    // 过滤已分配的（避免重复）
    const existing = await prisma.classLesson.findMany({
      where: { classId, lessonId: { in: lessonIds } },
      select: { lessonId: true },
    });
    const existingIds = new Set(existing.map(e => e.lessonId));
    const newIds = lessonIds.filter(id => !existingIds.has(id));

    if (newIds.length === 0) {
      res.json({ message: '所选课程已全部分配过了', assigned: 0 });
      return;
    }

    await prisma.classLesson.createMany({
      data: newIds.map((lessonId, i) => ({
        classId,
        lessonId,
        orderIndex: maxOrder + i,
      })),
    });

    res.json({ message: `已分配 ${newIds.length} 门课程`, assigned: newIds.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '服务器错误' });
  }
});

// ─── DELETE /classes/:id/lessons/:lessonId ────────────────────────────────────
// 从班级移除课程（不删除课程本身）
router.delete('/:id/lessons/:lessonId', async (req, res) => {
  try {
    await prisma.classLesson.delete({
      where: {
        classId_lessonId: {
          classId: req.params.id,
          lessonId: req.params.lessonId,
        },
      },
    });
    res.json({ message: '课程已从班级移除' });
  } catch {
    res.status(500).json({ message: '服务器错误' });
  }
});

export default router;
