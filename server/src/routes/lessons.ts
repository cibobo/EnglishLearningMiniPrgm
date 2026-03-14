import { Router } from 'express';
import prisma from '../lib/prisma';
import { authenticate, requireTeacher, requireStudent } from '../middleware/auth';

const router = Router();
router.use(authenticate);

// ─── GET /lessons?class_id= ───────────────────────────────────────────────────
// 学生端和教师端都可获取课程列表
router.get('/', async (req, res) => {
  try {
    const { class_id } = req.query;
    if (!class_id) {
      res.status(400).json({ message: '缺少 class_id 参数' });
      return;
    }
    const lessons = await prisma.lesson.findMany({
      where: { classId: class_id as string, deletedAt: null },
      include: { _count: { select: { sentences: true } } },
      orderBy: { orderIndex: 'asc' },
    });
    res.json(lessons);
  } catch {
    res.status(500).json({ message: '服务器错误' });
  }
});

// ─── GET /lessons/:id ─────────────────────────────────────────────────────────
// 获取课程详情（含句子列表）
router.get('/:id', async (req, res) => {
  try {
    const lesson = await prisma.lesson.findUnique({
      where: { id: req.params.id },
      include: {
        sentences: { orderBy: { orderIndex: 'asc' } },
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
// 教师创建课程
router.post('/', requireTeacher, async (req, res) => {
  try {
    const { classId, title, imageUrl, sentences } = req.body;
    if (!classId || !title || !imageUrl) {
      res.status(400).json({ message: '缺少必要字段：classId、title、imageUrl' });
      return;
    }

    // 获取当前最大 orderIndex
    const maxOrder = await prisma.lesson.count({ where: { classId, deletedAt: null } });

    const lesson = await prisma.lesson.create({
      data: {
        classId,
        title,
        imageUrl,
        orderIndex: maxOrder,
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
  } catch {
    res.status(500).json({ message: '服务器错误' });
  }
});

// ─── PUT /lessons/:id ─────────────────────────────────────────────────────────
router.put('/:id', requireTeacher, async (req, res) => {
  try {
    const { title, imageUrl, orderIndex } = req.body;
    const lesson = await prisma.lesson.update({
      where: { id: req.params.id },
      data: { title, imageUrl, orderIndex },
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
// 向课程批量添加/替换句子
router.post('/:id/sentences', requireTeacher, async (req, res) => {
  try {
    const { sentences } = req.body;
    if (!Array.isArray(sentences) || sentences.length === 0) {
      res.status(400).json({ message: '句子列表不能为空' });
      return;
    }

    // 删除旧句子，替换为新的
    await prisma.sentence.deleteMany({ where: { lessonId: req.params.id } });
    const created = await prisma.sentence.createMany({
      data: sentences.map((s: { text: string; audioUrl?: string }, i: number) => ({
        lessonId: req.params.id,
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
