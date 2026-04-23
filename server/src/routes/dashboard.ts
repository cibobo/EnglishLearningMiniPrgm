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
        // 班级总数
        prisma.class.count({ where: { teacherId, deletedAt: null } }),
        // 学生总数
        prisma.student.count({ where: { classes: { some: { id: { in: classIds } } }, deletedAt: null } }),
        // 课程库总数（属于该教师的所有课程）
        prisma.lesson.count({ where: { teachers: { some: { id: teacherId } }, deletedAt: null } }),
        // 待批录音数（通过 classLessons 关联到该教师班级的课程）
        prisma.recordingSubmission.count({
          where: {
            status: 'pending',
            lesson: {
              classLessons: { some: { classId: { in: classIds } } },
            },
          },
        }),
        // 本周录音数
        prisma.recordingSubmission.count({
          where: {
            lesson: {
              classLessons: { some: { classId: { in: classIds } } },
            },
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
