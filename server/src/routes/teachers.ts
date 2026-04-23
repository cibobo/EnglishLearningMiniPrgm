import { Router } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../lib/prisma';
import { authenticate, requireSuperAdmin } from '../middleware/auth';

const router = Router();
router.use(authenticate, requireSuperAdmin);

// ─── GET /teachers ────────────────────────────────────────────────────────────
// 返回所有教师列表（不含敏感信息）
router.get('/', async (req, res) => {
  try {
    const teachers = await prisma.teacher.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        username: true,
        role: true,
        createdAt: true,
        _count: {
          select: { classes: { where: { deletedAt: null } }, lessons: { where: { deletedAt: null } } }
        }
      }
    });
    res.json(teachers);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '服务器错误' });
  }
});

// ─── POST /teachers ───────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const { username, password, name, role } = req.body;
    if (!username || !password || !name) {
      res.status(400).json({ message: '用户名、密码和姓名不能为空' });
      return;
    }
    const existing = await prisma.teacher.findUnique({ where: { username } });
    if (existing) {
      res.status(400).json({ message: '用户名已存在' });
      return;
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const teacher = await prisma.teacher.create({
      data: {
        username,
        passwordHash: hashedPassword,
        name,
        role: role || 'teacher'
      },
      select: { id: true, username: true, name: true, role: true }
    });
    res.status(201).json(teacher);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '服务器错误' });
  }
});

// ─── PUT /teachers/:id ────────────────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const { name, role, password } = req.body; // 允许修改姓名，角色和选填密码
    const teacherId = req.params.id;
    const existing = await prisma.teacher.findUnique({ where: { id: teacherId } });
    
    if (!existing || existing.deletedAt) {
      res.status(404).json({ message: '教师不存在' });
      return;
    }

    const dataToUpdate: any = { name, role };
    if (password) {
      dataToUpdate.passwordHash = await bcrypt.hash(password, 10);
    }

    const updated = await prisma.teacher.update({
      where: { id: teacherId },
      data: dataToUpdate,
      select: { id: true, username: true, name: true, role: true }
    });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '服务器错误' });
  }
});

// ─── DELETE /teachers/:id ─────────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const teacherId = req.params.id;
    // 不能删除自己
    if (teacherId === req.user!.id) {
      res.status(400).json({ message: '不能删除自己' });
      return;
    }

    await prisma.teacher.update({
      where: { id: teacherId },
      data: { deletedAt: new Date() }
    });
    res.json({ message: '教师已删除' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '服务器错误' });
  }
});

export default router;
