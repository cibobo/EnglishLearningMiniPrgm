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

      if (req.user?.role === 'student') {
        const lessonIds = lessons.map(l => l.id);
        const scores = await prisma.lessonScore.findMany({
          where: { studentId: req.user.id, lessonId: { in: lessonIds } },
        });
        const scoreMap = Object.fromEntries(scores.map(s => [s.lessonId, s]));
        res.json(lessons.map(l => ({
          ...l,
          trophyLevel: scoreMap[l.id]?.trophyLevel ?? null,
          scorePercent: scoreMap[l.id]?.scorePercent ?? null,
          isLocked: !!scoreMap[l.id],
        })));
        return;
      }

      res.json(lessons);
      return;
    }

    // 课程库视图：返回教师本人所有课程（超级管理员返回所有）
    if (req.user?.role !== 'teacher' && req.user?.role !== 'superadmin') {
      res.status(403).json({ message: '无权限查看课程库' });
      return;
    }
    const whereClause = req.user?.role === 'superadmin' ? { deletedAt: null } : { teacherId: req.user!.id, deletedAt: null };
    const lessons = await prisma.lesson.findMany({
      where: whereClause,
      include: {
        _count: { select: { sentences: true } },
        classLessons: { select: { classId: true } },
        lessonGroupItems: { select: { groupId: true } },
        teacher: { select: { name: true } },
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
    
    if (req.user?.role === 'student') {
      const score = await prisma.lessonScore.findUnique({
        where: { studentId_lessonId: { studentId: req.user.id, lessonId } }
      });
      res.json({
        ...lesson,
        trophyLevel: score?.trophyLevel ?? null,
        scorePercent: score?.scorePercent ?? null,
        isLocked: !!score
      });
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
    const { title, imageUrl, masterAudioUrl, sentences, teacherId } = req.body;
    if (!title || !imageUrl) {
      res.status(400).json({ message: '缺少必要字段：title、imageUrl' });
      return;
    }

    const finalTeacherId = (req.user!.role === 'superadmin' && teacherId) ? teacherId : req.user!.id;

    const lesson = await prisma.lesson.create({
      data: {
        teacherId: finalTeacherId,
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
    const { title, imageUrl, masterAudioUrl, teacherId } = req.body;
    const lessonId = req.params.id as string;
    
    // 检查所有权
    const existing = await prisma.lesson.findUnique({ where: { id: lessonId } });
    if (!existing || (req.user!.role !== 'superadmin' && existing.teacherId !== req.user!.id)) {
      res.status(404).json({ message: '课程不存在或无权限修改' });
      return;
    }

    const dataToUpdate: any = { title, imageUrl, masterAudioUrl };
    if (req.user!.role === 'superadmin' && teacherId) {
      dataToUpdate.teacherId = teacherId;
    }

    const lesson = await prisma.lesson.update({
      where: { id: lessonId },
      data: dataToUpdate,
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

    // 检查所有权
    const existing = await prisma.lesson.findUnique({ where: { id: lessonId } });
    if (!existing || (req.user!.role !== 'superadmin' && existing.teacherId !== req.user!.id)) {
      res.status(404).json({ message: '课程不存在或无权限删除' });
      return;
    }

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

// ─── POST /lessons/:id/groups ──────────────────────────────────────────────────
router.post('/:id/groups', requireTeacher, async (req, res) => {
  try {
    const lessonId = req.params.id as string;
    const { groupIds } = req.body as { groupIds: string[] };

    const whereClause = req.user!.role === 'superadmin' ? { id: lessonId } : { id: lessonId, teacherId: req.user!.id };
    const lesson = await prisma.lesson.findFirst({
      where: whereClause
    });
    if (!lesson) {
       res.status(404).json({ message: '课程不存在' });
       return;
    }

    // Replace all groups with the new ones
    await prisma.$transaction([
      prisma.lessonGroupItem.deleteMany({
        where: { lessonId }
      }),
      ...(groupIds && groupIds.length > 0 ? [
        prisma.lessonGroupItem.createMany({
          data: groupIds.map(groupId => ({
            lessonId,
            groupId
          }))
        })
      ] : [])
    ]);
    
    res.json({ message: '分组已更新' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: '指派课程分组失败' });
  }
});

// ─── POST /lessons/:id/sentences ──────────────────────────────────────────────
router.post('/:id/sentences', requireTeacher, async (req, res) => {
  try {
    const { sentences } = req.body;
    const lessonId = req.params.id as string;

    // 检查所有权
    const existing = await prisma.lesson.findUnique({ where: { id: lessonId } });
    if (!existing || (req.user!.role !== 'superadmin' && existing.teacherId !== req.user!.id)) {
      res.status(404).json({ message: '课程不存在或无权限修改' });
      return;
    }

    if (!Array.isArray(sentences) || sentences.length === 0) {
      res.status(400).json({ message: '句子列表不能为空' });
      return;
    }
    // Must delete child records first due to FK constraint on sentence_id
    await prisma.$transaction(async (tx) => {
      await tx.recordingSubmission.deleteMany({ where: { lessonId } });
      await tx.sentence.deleteMany({ where: { lessonId } });
    });
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
  } catch (err) {
    console.error('[POST /lessons/:id/sentences] Error:', err);
    res.status(500).json({ message: '服务器错误' });
  }
});

export default router;
