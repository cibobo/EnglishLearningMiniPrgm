import { Router } from 'express';
import prisma from '../lib/prisma';
import { authenticate, requireTeacher } from '../middleware/auth';

const router = Router();

// All class routes require teacher auth
router.use(authenticate, requireTeacher);

// ─── GET /classes ──────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const classes = await prisma.class.findMany({
      where: { teacherId: req.user!.id, deletedAt: null },
      include: {
        _count: { select: { students: true, lessons: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(classes);
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

export default router;
