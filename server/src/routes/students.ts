import { Router } from 'express';
import crypto from 'crypto';
import prisma from '../lib/prisma';
import { authenticate, requireTeacher } from '../middleware/auth';

const router = Router();

// Generate a unique 6-character alphanumeric student code
async function generateUniqueCode(): Promise<string> {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Exclude confusing chars (0,O,1,I)
  let code: string;
  let attempts = 0;
  do {
    code = Array.from({ length: 6 }, () =>
      chars[crypto.randomInt(0, chars.length)]
    ).join('');
    const existing = await prisma.student.findUnique({ where: { studentCode: code } });
    if (!existing) return code;
    attempts++;
  } while (attempts < 10);
  throw new Error('无法生成唯一学生码，请重试');
}

router.use(authenticate, requireTeacher);

// ─── GET /students ────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { classId } = req.query;
    const where: Record<string, unknown> = { deletedAt: null };
    if (classId) where.classId = classId as string;

    const students = await prisma.student.findMany({
      where,
      include: {
        class: { select: { id: true, name: true } },
        _count: { select: { recordingSubmissions: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(students);
  } catch {
    res.status(500).json({ message: '服务器错误' });
  }
});

// ─── POST /students ───────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const { name, classId } = req.body;
    if (!name) {
      res.status(400).json({ message: '学生姓名不能为空' });
      return;
    }

    const studentCode = await generateUniqueCode();
    const student = await prisma.student.create({
      data: { name, classId: classId || null, studentCode },
      include: { class: true },
    });
    res.status(201).json(student);
  } catch {
    res.status(500).json({ message: '服务器错误' });
  }
});

// ─── PUT /students/:id ────────────────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const existing = await prisma.student.findUnique({
      where: { id: req.params.id },
    });
    if (!existing || existing.deletedAt) {
      res.status(404).json({ message: '学生不存在' });
      return;
    }

    const { name, classId } = req.body;
    const student = await prisma.student.update({
      where: { id: req.params.id },
      data: { name, classId: classId || null },
      include: { class: true },
    });
    res.json(student);
  } catch {
    res.status(500).json({ message: '服务器错误' });
  }
});

// ─── DELETE /students/:id ─────────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const existing = await prisma.student.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.deletedAt) {
      res.status(404).json({ message: '学生不存在' });
      return;
    }
    await prisma.student.update({
      where: { id: req.params.id },
      data: { deletedAt: new Date() },
    });
    res.json({ message: '学生已删除' });
  } catch {
    res.status(500).json({ message: '服务器错误' });
  }
});

// ─── GET /students/:id/progress ───────────────────────────────────────────────
router.get('/:id/progress', async (req, res) => {
  try {
    const student = await prisma.student.findUnique({
      where: { id: req.params.id },
      include: { class: true },
    });
    if (!student || student.deletedAt) {
      res.status(404).json({ message: '学生不存在' });
      return;
    }

    // 统计该学生班级分配的课程数（通过关联表）
    const totalLessons = student.classId
      ? await prisma.classLesson.count({
          where: {
            classId: student.classId,
            lesson: { deletedAt: null },
          },
        })
      : 0;

    const submissions = await prisma.recordingSubmission.findMany({
      where: { studentId: req.params.id },
      include: { lesson: { select: { id: true, title: true } } },
      orderBy: { submittedAt: 'desc' },
    });

    const completedLessons = new Set(submissions.map((s) => s.lessonId)).size;

    res.json({
      student,
      totalLessons,
      completedLessons,
      submissions,
    });
  } catch {
    res.status(500).json({ message: '服务器错误' });
  }
});

export default router;
