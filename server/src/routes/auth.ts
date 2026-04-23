import { Router } from 'express';
import axios from 'axios';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma';
import { generateAccessToken, generateRefreshToken, AuthPayload, authenticate } from '../middleware/auth';

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

    // 1. 用 code 换取 openid (如果环境变量没配，为了方便本地调试直接走 mock)
    let openid: string;
    if (!process.env.WECHAT_APPID || !process.env.WECHAT_SECRET) {
      console.log('⚠️ 未配置微信 AppID/Secret，使用 Mock OpenID 绕过鉴权用于本地测试');
      // 如果是用 mock，直接根据传入的 code（开发者工具通常是 mock 字符串）生成一个假的 openid
      openid = `mock_openid_${code.substring(0, 10)}`;
    } else {
      const wxRes = await axios.get('https://api.weixin.qq.com/sns/jscode2session', {
        params: {
          appid: process.env.WECHAT_APPID,
          secret: process.env.WECHAT_SECRET,
          js_code: code,
          grant_type: 'authorization_code',
        },
      });

      const { errcode } = wxRes.data;
      if (errcode || !wxRes.data.openid) {
        res.status(401).json({ message: '微信登录失败，请重试' });
        return;
      }
      openid = wxRes.data.openid;
    }

    // 2. 用 openid 查找学生
    let student = await prisma.student.findUnique({
      where: { openid },
      include: { classes: true },
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
        include: { classes: true },
      });

      if (!unbound || unbound.openid) {
        res.status(400).json({ message: '学生码无效或已被使用' });
        return;
      }

      // 绑定 openid
      student = await prisma.student.update({
        where: { id: unbound.id },
        data: { openid },
        include: { classes: true },
      });
    }

    if (!student) return;

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
        classes: student.classes.map(c => ({ id: c.id, name: c.name })),
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

    const payload: AuthPayload = { id: teacher.id, role: (teacher.role as 'teacher' | 'superadmin') || 'teacher' };
    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);

    res.json({
      access_token: accessToken,
      refresh_token: refreshToken,
      user: { id: teacher.id, name: teacher.name, username: teacher.username, role: teacher.role },
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

// ─── POST /auth/me/checkin ──────────────────────────────────────────────────
router.post('/me/checkin', authenticate, async (req, res) => {
  try {
    const studentId = (req as any).user.id;
    const role = (req as any).user.role;
    
    if (role !== 'student') {
      res.status(403).json({ message: '仅学生可打卡' });
      return;
    }

    const student = await prisma.student.findUnique({
      where: { id: studentId }
    });

    if (!student) {
      res.status(404).json({ message: '学生不存在' });
      return;
    }

    // 计算累计句子数
    const totalSentences = await prisma.recordingSubmission.count({
      where: { studentId }
    });

    const now = new Date();
    // 转换为北京时间 (UTC+8) 的 YYYY-MM-DD 字符串
    const getBeijingDateStr = (d: Date) => {
      const beijingTime = new Date(d.getTime() + 8 * 60 * 60 * 1000);
      return beijingTime.toISOString().split('T')[0];
    };

    const beijingNowStr = getBeijingDateStr(now);
    const beijingYesterdayStr = getBeijingDateStr(new Date(now.getTime() - 24 * 60 * 60 * 1000));
    
    let streak = student.loginStreak || 0;
    let isFirstLoginToday = false;

    if (!student.lastLoginAt) {
      streak = 1;
      isFirstLoginToday = true;
    } else {
      const lastLoginStr = getBeijingDateStr(student.lastLoginAt);
      if (lastLoginStr === beijingNowStr) {
        // 今天已打卡
        isFirstLoginToday = false;
      } else if (lastLoginStr === beijingYesterdayStr) {
        // 昨天打过卡，连续打卡
        streak += 1;
        isFirstLoginToday = true;
      } else {
        // 断签
        streak = 1;
        isFirstLoginToday = true;
      }
    }

    if (isFirstLoginToday) {
      await prisma.student.update({
        where: { id: studentId },
        data: {
          lastLoginAt: now,
          loginStreak: streak
        }
      });
    }

    res.json({
      isFirstLoginToday,
      streak,
      totalSentences
    });
  } catch (err) {
    console.error('[checkin]', err);
    res.status(500).json({ message: '服务器错误' });
  }
});

// ─── POST /auth/wechat-unbind ───────────────────────────────────────────────
// 学生端：根据微信 code 解绑当前的 openid
router.post('/wechat-unbind', async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) {
      res.status(400).json({ message: '缺少微信 code' });
      return;
    }

    let openid: string;
    if (!process.env.WECHAT_APPID || !process.env.WECHAT_SECRET) {
      console.log('⚠️ 未配置微信 AppID/Secret，使用 Mock OpenID 绕过鉴权用于本地测试');
      openid = `mock_openid_${code.substring(0, 10)}`;
    } else {
      const wxRes = await axios.get('https://api.weixin.qq.com/sns/jscode2session', {
        params: {
          appid: process.env.WECHAT_APPID,
          secret: process.env.WECHAT_SECRET,
          js_code: code,
          grant_type: 'authorization_code',
        },
      });

      const { errcode } = wxRes.data;
      if (errcode || !wxRes.data.openid) {
        res.status(401).json({ message: '微信鉴权失败，请重试' });
        return;
      }
      openid = wxRes.data.openid;
    }

    // 查找并解绑所有匹配的 openid（正常情况唯一）
    await prisma.student.updateMany({
      where: { openid },
      data: { openid: null }
    });

    res.json({ message: '解绑成功' });
  } catch (err) {
    console.error('[wechat-unbind]', err);
    res.status(500).json({ message: '服务器错误' });
  }
});

export default router;
