import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import dotenv from 'dotenv';
import path from 'path';

import authRouter from './routes/auth';
import classesRouter from './routes/classes';
import studentsRouter from './routes/students';
import lessonsRouter from './routes/lessons';
import recordingsRouter from './routes/recordings';
import uploadRouter from './routes/upload';
import transcribeRouter from './routes/transcribe';
import dashboardRouter from './routes/dashboard';
import lessonGroupsRouter from './routes/lesson-groups';

dotenv.config();

const app = express();
app.set('trust proxy', 1); // 允许信任微信云托管的反向代理（修复 rate-limit 日志报错）

// ─── Security Middleware ───────────────────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(cors({
  origin: true,
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ─── 静态文件服务（上传的图片/音频）────────────────────────────────────────────
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// ─── Rate Limiting ─────────────────────────────────────────────────────────────
const loginLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  message: { message: '请求过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ─── Routes ───────────────────────────────────────────────────────────────────
app.get('/api/v1/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/v1/auth', loginLimiter, authRouter);
app.use('/api/v1/classes', classesRouter);
app.use('/api/v1/students', studentsRouter);
app.use('/api/v1/lessons', lessonsRouter);
app.use('/api/v1/recordings', recordingsRouter);
app.use('/api/v1/upload', uploadRouter);
app.use('/api/v1/transcribe', transcribeRouter);
app.use('/api/v1/dashboard', dashboardRouter);
app.use('/api/v1/lesson-groups', lessonGroupsRouter);
// ─── Global Error Handler ──────────────────────────────────────────────────────
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[Error]', err.message, err.stack);
  res.status(500).json({ message: '服务器内部错误' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});

export default app;
