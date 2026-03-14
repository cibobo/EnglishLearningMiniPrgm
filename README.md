# 儿童英语跟读系统

> 项目代号：**rebalance.report**

一套帮助儿童在课后跟读英语的三端系统。

---

## 项目结构

```
LearningApp/
├── doc/                     # 规划文档
│   ├── architecture_design.md
│   ├── module_requirements.md
│   └── project_roadmap.md
├── server/                  # Node.js + Express + Prisma 后端
│   ├── src/
│   │   ├── app.ts           # Express 入口
│   │   ├── middleware/auth.ts
│   │   ├── lib/prisma.ts
│   │   └── routes/          # auth / classes / students / lessons / recordings / upload / dashboard
│   ├── prisma/
│   │   ├── schema.prisma    # 数据库模型
│   │   └── seed.ts          # 初始化数据
│   ├── .env.example         # 环境变量模板
│   └── tsconfig.json
├── miniprogram/             # 微信小程序（原生）
│   ├── app.js / app.json / app.wxss
│   ├── utils/request.js     # 统一请求封装
│   ├── utils/auth.js        # 微信登录 + 学生码绑定
│   └── pages/
│       ├── login/           # 登录页（微信一键 + 学生码绑定）
│       ├── lessons/         # 课程列表页
│       └── reading/         # 跟读页（RecorderManager + COS 上传）
└── teacher-web/             # React + Ant Design 教师管理端
    └── src/
        ├── App.tsx           # 路由
        ├── lib/api.ts        # Axios + Token 自动刷新
        ├── store/authStore.ts
        └── pages/
            ├── LoginPage.tsx
            ├── ClassesPage.tsx      # 班级管理 + 课程上传
            ├── StudentsPage.tsx     # 学生管理 + 学生码
            └── StudentDetailPage.tsx # 进度 + 录音播放
```

---

## 快速开始

### 1. 配置后端环境变量

```bash
cd server
cp .env.example .env
# 编辑 .env，填入：
# - DATABASE_URL（MySQL 连接串）
# - WECHAT_APPID / WECHAT_SECRET
# - COS_SECRET_ID / COS_SECRET_KEY / COS_BUCKET / COS_REGION
# - JWT_ACCESS_SECRET / JWT_REFRESH_SECRET
```

### 2. 初始化数据库

```bash
cd server
npm run db:migrate   # 运行 Prisma migration 建表
npm run db:seed      # 创建默认教师账号 admin / admin123
```

### 3. 启动后端

```bash
cd server
npm run dev          # 开发模式（nodemon + ts-node）
# → http://localhost:3000
```

### 4. 启动教师管理端

```bash
cd teacher-web
npm run dev          # Vite 开发服务器
# → http://localhost:5173
# 默认账号：admin / admin123
```

### 5. 微信小程序

1. 打开微信开发者工具
2. 导入 `miniprogram/` 目录
3. 填入 AppID（`project.config.json`）
4. 修改 `utils/request.js` 中的 `BASE_URL` 为你的服务器地址

---

## 技术栈

| 端 | 技术 |
|---|---|
| 后端 | Node.js + Express + TypeScript + Prisma + MySQL |
| 学生端 | 原生微信小程序（WXML/WXSS/JS）|
| 教师端 | React 18 + TypeScript + Vite + Ant Design 5 |
| 文件存储 | 腾讯云 COS（预签名直传）|
| 认证 | JWT（Access 2h + Refresh 7d）|

---

## 下一步（Phase 5）

- [ ] 配置腾讯云环境（COS / TDSQL-C / CloudBase）
- [ ] 注册微信小程序账号，填入 AppID
- [ ] 生产环境部署（Nginx + HTTPS）
- [ ] 微信审核材料准备（隐私政策页面）
- [ ] 集成测试（真实设备全链路验证）
