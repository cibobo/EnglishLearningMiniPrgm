import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';

export interface AuthPayload {
  id: string;
  role: 'teacher' | 'student';
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

export const authenticate = (req: Request, res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ message: '未授权，缺少 Token' });
    return;
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET!) as AuthPayload;
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ message: 'Token 无效或已过期' });
  }
};

export const requireTeacher = (req: Request, res: Response, next: NextFunction): void => {
  if (req.user?.role !== 'teacher') {
    res.status(403).json({ message: '无权限，仅教师可操作' });
    return;
  }
  next();
};

export const requireStudent = (req: Request, res: Response, next: NextFunction): void => {
  if (req.user?.role !== 'student') {
    res.status(403).json({ message: '无权限，仅学生可操作' });
    return;
  }
  next();
};

export const generateAccessToken = (payload: AuthPayload): string => {
  return jwt.sign(payload, process.env.JWT_ACCESS_SECRET!, {
    expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '2h',
  });
};

export const generateRefreshToken = (payload: AuthPayload): string => {
  return jwt.sign(payload, process.env.JWT_REFRESH_SECRET!, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  });
};
