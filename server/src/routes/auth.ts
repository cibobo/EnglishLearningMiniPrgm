import { Router } from 'express';
import axios from 'axios';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma';
import { generateAccessToken, generateRefreshToken, AuthPayload } from '../middleware/auth';

const router = Router();

// ─── POST /auth/wechat-login ──────────────────────────────────────────────────
// 学生端：用微信 code 登录
router.post('/wechat-login', async (req, res) => {
  try {
    const { code, studentCode } = req.body;
    if (!code) {
      res.status(400).json({ message: '缺少微信 code' });
      return;
    }

    // 1. 用 code 换取 openid
    const wxRes = await axios.get('https://api.weixin.qq.com/sns/jscode2session', {
      params: {
        appid: process.env.WECHAT_APPID,
        secret: process.env.WECHAT_SECRET,
        js_code: code,
        grant_type: 'authorization_code',
      },
    });

    const { openid, errcode } = wxRes.data;
    if (errcode || !openid) {
      res.status(401).json({ message: '微信登录失败，请重试' });
      return;
    }

    // 2. 用 openid 查找学生
    let student = await prisma.student.findUnique({
      where: { openid },
      include: { class: true },
    });

    // 3. 如果没有与 openid 绑定的学生，尝试用 studentCode 绑定
    if (!student) {
      if (!studentCode) {
        // openid 未绑定且没有提供学生码
        res.status(404).json({
          message: 'NEED_STUDENT_CODE',
          hint: '请输入老师提供的学生码完成绑定',
        });
        return;
      }

      // 查找学生码对应的学生（未绑定的）
      const unbound = await prisma.student.findUnique({
        where: { studentCode: studentCode.toUpperCase() },
        include: { class: true },
      });

      if (!unbound || unbound.openid) {
        res.status(400).json({ message: '学生码无效或已被使用' });
        return;
      }

      // 绑定 openid
      student = await prisma.student.update({
        where: { id: unbound.id },
        data: { openid },
        include: { class: true },
      });
    }

    if (student.deletedAt) {
      res.status(403).json({ message: '账号已被禁用，请联系老师' });
      return;
    }

    const payload: AuthPayload = { id: student.id, role: 'student' };
    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);

    res.json({
      access_token: accessToken,
      refresh_token: refreshToken,
      user: {
        id: student.id,
        name: student.name,
        className: student.class?.name || null,
        classId: student.classId,
      },
    });
  } catch (err) {
    console.error('[wechat-login]', err);
    res.status(500).json({ message: '服务器错误' });
  }
});

// ─── POST /auth/teacher-login ──────────────────────────────────────────────────
// 教师端：账号密码登录
router.post('/teacher-login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      res.status(400).json({ message: '请填写用户名和密码' });
      return;
    }

    const teacher = await prisma.teacher.findUnique({ where: { username } });
    if (!teacher || teacher.deletedAt) {
      res.status(401).json({ message: '用户名或密码错误' });
      return;
    }

    const valid = await bcrypt.compare(password, teacher.passwordHash);
    if (!valid) {
      res.status(401).json({ message: '用户名或密码错误' });
      return;
    }

    const payload: AuthPayload = { id: teacher.id, role: 'teacher' };
    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);

    res.json({
      access_token: accessToken,
      refresh_token: refreshToken,
      user: { id: teacher.id, name: teacher.name, username: teacher.username },
    });
  } catch (err) {
    console.error('[teacher-login]', err);
    res.status(500).json({ message: '服务器错误' });
  }
});

// ─── POST /auth/refresh ────────────────────────────────────────────────────────
router.post('/refresh', async (req, res) => {
  try {
    const { refresh_token } = req.body;
    if (!refresh_token) {
      res.status(400).json({ message: '缺少 refresh_token' });
      return;
    }

    const payload = jwt.verify(refresh_token, process.env.JWT_REFRESH_SECRET!) as AuthPayload;
    const newAccess = generateAccessToken({ id: payload.id, role: payload.role });
    res.json({ access_token: newAccess });
  } catch {
    res.status(401).json({ message: 'Refresh token 无效或已过期' });
  }
});

export default router;
