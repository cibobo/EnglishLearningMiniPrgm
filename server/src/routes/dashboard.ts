import { Router } from 'express';
import prisma from '../lib/prisma';
import { authenticate, requireTeacher } from '../middleware/auth';

const router = Router();
router.use(authenticate, requireTeacher);

// ─── GET /dashboard/summary ───────────────────────────────────────────────────
router.get('/summary', async (req, res) => {
  try {
    const teacherId = req.user!.id;

    // 获取该教师的所有班级 ID
    const classes = await prisma.class.findMany({
      where: { teacherId, deletedAt: null },
      select: { id: true },
    });
    const classIds = classes.map((c) => c.id);

    const [totalClasses, totalStudents, totalLessons, pendingRecordings, weekRecordings] =
      await Promise.all([
        prisma.class.count({ where: { teacherId, deletedAt: null } }),
        prisma.student.count({ where: { classId: { in: classIds }, deletedAt: null } }),
        prisma.lesson.count({ where: { classId: { in: classIds }, deletedAt: null } }),
        prisma.recordingSubmission.count({
          where: { lesson: { classId: { in: classIds } }, status: 'pending' },
        }),
        prisma.recordingSubmission.count({
          where: {
            lesson: { classId: { in: classIds } },
            submittedAt: {
              gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
            },
          },
        }),
      ]);

    res.json({
      totalClasses,
      totalStudents,
      totalLessons,
      pendingRecordings,
      weekRecordings,
    });
  } catch {
    res.status(500).json({ message: '服务器错误' });
  }
});

export default router;
