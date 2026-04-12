import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

// Use authentication middleware for all routes
router.use(authenticate);

// GET /lesson-groups - Get all groups for the current teacher with their lessons
router.get('/', async (req, res) => {
  try {
    const teacherId = req.user!.id;
    const groups = await prisma.lessonGroup.findMany({
      where: { teacherId },
      include: {
        lessons: {
          include: {
            lesson: true
          }
        }
      },
      orderBy: { createdAt: 'asc' }
    });
    
    // Transform the result slightly for easier frontend consumption
    const result = groups.map(group => ({
      id: group.id,
      name: group.name,
      createdAt: group.createdAt,
      lessons: group.lessons.map(lg => lg.lesson)
    }));
    
    res.json(result);
  } catch (error) {
    console.error('Error fetching lesson groups:', error);
    res.status(500).json({ message: '获取分组失败' });
  }
});

// POST /lesson-groups - Create a new group
router.post('/', async (req, res) => {
  try {
    const teacherId = req.user!.id;
    const { name } = req.body;
    
    if (!name || name.trim() === '') {
      return res.status(400).json({ message: '分组名称不能为空' });
    }

    const group = await prisma.lessonGroup.create({
      data: {
        name,
        teacherId
      }
    });

    res.status(201).json(group);
  } catch (error) {
    console.error('Error creating lesson group:', error);
    res.status(500).json({ message: '创建分组失败' });
  }
});

// PUT /lesson-groups/:id - Update group name
router.put('/:id', async (req, res) => {
  try {
    const teacherId = req.user!.id;
    const { id } = req.params;
    const { name } = req.body;

    if (!name || name.trim() === '') {
      return res.status(400).json({ message: '分组名称不能为空' });
    }

    // Ensure the group belongs to the teacher
    const existingGroup = await prisma.lessonGroup.findFirst({
      where: { id, teacherId }
    });

    if (!existingGroup) {
      return res.status(404).json({ message: '分组不存在或您无权访问' });
    }

    const updatedGroup = await prisma.lessonGroup.update({
      where: { id },
      data: { name }
    });

    res.json(updatedGroup);
  } catch (error) {
    console.error('Error updating lesson group:', error);
    res.status(500).json({ message: '更新分组失败' });
  }
});

// DELETE /lesson-groups/:id - Delete a group (lessons won't be deleted due to Prisma schema cascade only on relation item)
router.delete('/:id', async (req, res) => {
  try {
    const teacherId = req.user!.id;
    const { id } = req.params;

    // Ensure the group belongs to the teacher
    const existingGroup = await prisma.lessonGroup.findFirst({
      where: { id, teacherId }
    });

    if (!existingGroup) {
      return res.status(404).json({ message: '分组不存在或您无权访问' });
    }

    await prisma.lessonGroup.delete({
      where: { id }
    });

    res.json({ message: '分组已删除' });
  } catch (error) {
    console.error('Error deleting lesson group:', error);
    res.status(500).json({ message: '删除分组失败' });
  }
});

// POST /lesson-groups/:groupId/lessons - Update lessons in a group (bulk assign)
router.post('/:groupId/lessons', async (req, res) => {
  try {
    const teacherId = req.user!.id;
    const { groupId } = req.params;
    const { lessonIds } = req.body as { lessonIds: string[] };

    const existingGroup = await prisma.lessonGroup.findFirst({
      where: { id: groupId, teacherId }
    });

    if (!existingGroup) {
      return res.status(404).json({ message: '分组不存在或您无权访问' });
    }

    // Delete existing relations for this group
    await prisma.lessonGroupItem.deleteMany({
      where: { groupId }
    });

    // Create new relations
    if (lessonIds && lessonIds.length > 0) {
      await prisma.lessonGroupItem.createMany({
        data: lessonIds.map(lessonId => ({
          groupId,
          lessonId
        }))
      });
    }

    res.json({ message: '分组更新成功' });
  } catch (error) {
    console.error('Error assigning lessons to group:', error);
    res.status(500).json({ message: '指派课程失败' });
  }
});

export default router;
