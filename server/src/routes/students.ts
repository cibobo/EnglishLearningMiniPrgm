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
    const where: any = { deletedAt: null };
    if (classId) {
      where.classes = { some: { id: classId as string } };
      if (req.user!.role !== 'superadmin') {
         // ensure class belongs to teacher
         const cls = await prisma.class.findUnique({where: {id: classId as string}});
         if (!cls || cls.teacherId !== req.user!.id) {
            res.status(403).json({message: '无权限访问该班级'});
            return;
         }
      }
    } else {
      if (req.user!.role !== 'superadmin') {
        where.classes = { some: { teacherId: req.user!.id } };
      }
    }

    const students = await prisma.student.findMany({
      where,
      include: {
        classes: { select: { id: true, name: true, teacher: { select: { name: true } } } },
        _count: { select: { recordingSubmissions: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(students);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '服务器错误' });
  }
});

// ─── POST /students ───────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const { name, classIds } = req.body;
    if (!name) {
      res.status(400).json({ message: '学生姓名不能为空' });
      return;
    }

    if (classIds && classIds.length > 0 && req.user!.role !== 'superadmin') {
      const clsList = await prisma.class.findMany({ where: { id: { in: classIds } } });
      const allOwned = clsList.length === classIds.length && clsList.every(c => c.teacherId === req.user!.id);
      if (!allOwned) {
        res.status(403).json({ message: '无权限：包含无效班级或不属于您的班级' });
        return;
      }
    }

    const studentCode = await generateUniqueCode();
    const student = await prisma.student.create({
      data: { 
        name, 
        studentCode,
        classes: classIds && classIds.length > 0 ? { connect: classIds.map((id: string) => ({ id })) } : undefined
      },
      include: { classes: true },
    });
    res.status(201).json(student);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '服务器错误' });
  }
});

// ─── PUT /students/:id ────────────────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const existing = await prisma.student.findUnique({
      where: { id: req.params.id },
      include: { classes: true }
    });
    if (!existing || existing.deletedAt) {
      res.status(404).json({ message: '学生不存在' });
      return;
    }

    if (req.user!.role !== 'superadmin' && existing.classes.length > 0) {
      const hasOwnedClass = existing.classes.some(c => c.teacherId === req.user!.id);
      if (!hasOwnedClass) {
        res.status(403).json({ message: '无权限修改该学生' });
        return;
      }
    }

    const { name, classIds } = req.body;
    let finalClassIds: string[] = classIds || [];
    
    if (classIds && req.user!.role !== 'superadmin') {
      const clsList = await prisma.class.findMany({ where: { id: { in: classIds } } });
      const allOwned = clsList.length === classIds.length && clsList.every(c => c.teacherId === req.user!.id);
      if (!allOwned) {
        res.status(403).json({ message: '无权限：只能将学生分配到您的班级' });
        return;
      }
      const otherTeacherClasses = existing.classes.filter(c => c.teacherId !== req.user!.id).map(c => c.id);
      finalClassIds = [...otherTeacherClasses, ...classIds];
    }

    const student = await prisma.student.update({
      where: { id: req.params.id },
      data: { 
        name, 
        classes: { set: finalClassIds.map(id => ({ id })) } 
      },
      include: { classes: true },
    });
    res.json(student);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '服务器错误' });
  }
});

// ─── DELETE /students/:id ─────────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const existing = await prisma.student.findUnique({ 
       where: { id: req.params.id },
       include: { classes: true }
    });
    if (!existing || existing.deletedAt) {
      res.status(404).json({ message: '学生不存在' });
      return;
    }

    if (req.user!.role !== 'superadmin' && existing.classes.length > 0) {
      const hasOwnedClass = existing.classes.some(c => c.teacherId === req.user!.id);
      if (!hasOwnedClass) {
        res.status(403).json({ message: '无权限删除该学生' });
        return;
      }
    }

    await prisma.student.update({
      where: { id: req.params.id },
      data: { deletedAt: new Date() },
    });
    res.json({ message: '学生已删除' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '服务器错误' });
  }
});

// ─── GET /students/:id/progress ───────────────────────────────────────────────
router.get('/:id/progress', async (req, res) => {
  try {
    const student = await prisma.student.findUnique({
      where: { id: req.params.id },
      include: { classes: true },
    });
    if (!student || student.deletedAt) {
      res.status(404).json({ message: '学生不存在' });
      return;
    }

    // 获取该学生所有班级分配的所有课程，并包含句子数量
    const classIds = student.classes.map(c => c.id);
    const classLessonsRaw = classIds.length > 0
      ? await prisma.classLesson.findMany({
          where: { classId: { in: classIds }, lesson: { deletedAt: null } },
          include: {
            lesson: {
              select: {
                id: true,
                title: true,
                _count: { select: { sentences: true } },
              },
            },
          },
          orderBy: { orderIndex: 'asc' },
        })
      : [];
      
    // Deduplicate lessons manually (in case multiple classes assign the same lesson)
    const classLessons: typeof classLessonsRaw = [];
    const seenLessonIds = new Set<string>();
    for (const cl of classLessonsRaw) {
      if (!seenLessonIds.has(cl.lessonId)) {
        seenLessonIds.add(cl.lessonId);
        classLessons.push(cl);
      }
    }

    const totalLessons = classLessons.length;

    const submissions = await prisma.recordingSubmission.findMany({
      where: { studentId: req.params.id },
      include: {
        lesson: {
          select: { id: true, title: true, sentences: { select: { id: true, text: true, orderIndex: true }, orderBy: { orderIndex: 'asc' } } },
        },
        sentence: { select: { id: true, text: true, orderIndex: true } },
      },
      orderBy: { submittedAt: 'desc' },
    });

    const completedLessons = new Set(submissions.map((s) => s.lessonId)).size;

    const lessonScores = await prisma.lessonScore.findMany({
      where: { studentId: req.params.id },
    });
    const scoreMap = Object.fromEntries(lessonScores.map(s => [s.lessonId, s]));

    // 构建每个课程的分组结构
    const lessonGroups = classLessons.map((cl) => {
      const lessonId = cl.lesson.id;
      const lessonSubmissions = submissions.filter((s) => s.lessonId === lessonId);
      const score = scoreMap[lessonId];
      return {
        lessonId,
        lessonTitle: cl.lesson.title,
        sentenceCount: cl.lesson._count.sentences,
        submissionCount: lessonSubmissions.length,
        trophyLevel: score?.trophyLevel ?? null,
        scorePercent: score?.scorePercent ?? null,
        submissions: lessonSubmissions,
      };
    });

    res.json({
      student,
      totalLessons,
      completedLessons,
      submissions,
      lessonGroups,
    });
  } catch {
    res.status(500).json({ message: '服务器错误' });
  }
});

export default router;
