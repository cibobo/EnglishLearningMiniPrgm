# 儿童英语跟读系统 — 模块需求文档

> 版本：v1.0 | 日期：2026-03-14

---

## 模块一：学生端 — 微信小程序

### M1.1 总体要求

- 运行环境：微信小程序（iOS/Android）
- 目标用户：6～12 岁儿童（由家长辅助使用）
- 设计原则：界面简洁明亮，图标大，文字大，操作直觉化

### M1.2 页面清单

| 页面 | 路由 | 功能描述 |
|------|------|----------|
| 登录页 | `/pages/login/login` | 微信一键登录 |
| 课程列表页 | `/pages/lessons/lessons` | 显示班级所有跟读课程 |
| 跟读页 | `/pages/reading/reading` | 逐句跟读、录音、提交 |

### M1.3 功能需求详述

#### **F1-01 → 微信一键登录**

**触发条件**: 未持有有效 JWT Token 时自动跳转到登录页

**流程**:
1. 页面展示 App Logo + "开始学习" 按钮
2. 用户点击按钮，调用 `wx.login()` 获取临时 `code`
3. 将 `code` 发送至后端 `POST /api/v1/auth/wechat-login`
4. 后端返回 `access_token`、`refresh_token`、用户基本信息
5. 本地存储 Token，跳转至课程列表页

**异常处理**:
- 网络超时：展示"网络不佳，请重试"提示
- 该 openid 未被老师注册为学生：展示"请联系老师为你开通账号"
- Token 过期：自动用 Refresh Token 换新 Access Token；若 Refresh 也过期则重新登录

**验收标准**:
- 登录全程不超过 3 秒（正常网络）
- Token 持久化，App 后台唤起后无需重新登录（7天内）

---

#### **F1-02 → 课程列表页**

**界面描述**:
- 上方显示当前学生姓名和班级名称
- 下方为可上下滑动的课程卡片列表（使用 `scroll-view` 组件）
- 每张卡片显示：课程封面图（儿童画）、课程标题、句子数量
- 卡片有轻微圆角和阴影，颜色明亮活泼

**数据来源**: `GET /api/v1/lessons?class_id={classId}`

**状态标识**（可选 v2 功能）:
- 已完成提交：卡片右上角绿色"✓"徽标
- 未完成：无标识

**验收标准**:
- 列表加载时显示骨架屏（Skeleton）
- 列表为空时显示"老师暂未发布课程"空状态插图
- 点击卡片跳转至对应跟读页，携带 `lessonId`

---

#### **F1-03 → 跟读页**

**界面布局**（从上到下）:
```
┌──────────────────────────────┐
│        儿童画（封面图）           │  高度约 40% 屏幕
├──────────────────────────────┤
│  [句子 1 — 高亮当前，其余灰色]     │  可滚动文本区域
│  [句子 2]                     │  当前句子字体放大 + 高亮
│  [句子 3]                     │
├──────────────────────────────┤
│  [▶ 听范读]   [● 按住跟读]      │  底部操作区
│  [✓ 结束并发送]（全部完成后出现）   │
└──────────────────────────────┘
```

**功能详述**:

**F1-03-a 句子导航**
- 页面初始化时加载课程所有句子（`GET /api/v1/lessons/:id`）
- 句子按 `order_index` 顺序排列
- 当前跟读句子自动滚动到可见区域，样式高亮

**F1-03-b 听范读**
- 点击"▶ 听范读"按钮，播放当前句子的教师参考音频
- 使用 `wx.createInnerAudioContext()` 从 COS URL 播放
- 播放期间按钮变为"◼ 停止"

**F1-03-c 跟读录音（核心功能）**
- "按住跟读"为长按按钮（`bindtouchstart` / `bindtouchend`）
- 按下：调用 `wx.getRecorderManager().start()`，弹出麦克风权限请求（首次），显示录音动画
- 松开：调用 `recorderManager.stop()`，保存本次句子录音（覆盖上一次），自动跳转到下一句
- 每句保存最新一次录音（用户可重录）
- 本地临时存储各句录音文件路径（`tempFilePath`）

**F1-03-d 结束并发送**
- 所有句子均录音完成后，底部出现"结束并发送"按钮
- 点击后：
  1. 对每条录音调用后端 `POST /api/v1/upload/presign` 获取预签名上传 URL
  2. 使用 `wx.uploadFile` 将录音文件直传至 COS
  3. 所有上传完成后，调用 `POST /api/v1/recordings` 提交录音记录
  4. 显示"提交成功！老师会认真听的 🎉"成功页并返回课程列表

**异常处理**:
- 用户拒绝麦克风权限：引导至设置页面开启
- 上传失败：弹出"发送失败，请检查网络后重试"，保留录音文件
- 录音文件损坏：提示重新录制该句

**验收标准**:
- 按下到录音开始延迟 < 300ms
- 所有句子录音完成后"结束并发送"按钮才出现
- 提交成功率 > 99%（正常网络）
- 页面从退出到重新进入保留当前进度

---

### M1.4 权限声明（app.json）

```json
{
  "permission": {
    "scope.record": {
      "desc": "用于英语跟读练习，录音仅保存在本地和您的班级老师账户中"
    }
  }
}
```

---

## 模块二：教师管理端 — Web 网页应用

### M2.1 总体要求

- 运行环境：现代浏览器（Chrome 90+，Safari 14+）
- 目标用户：英语老师（有基本电脑使用能力）
- 界面风格：简洁专业，中文，Ant Design 管理后台风格

### M2.2 页面清单

| 页面 | 路由 | 功能描述 |
|------|------|----------|
| 登录页 | `/login` | 账号密码登录 |
| 仪表盘 | `/dashboard` | 概览（班级数、学生数、待审录音数） |
| 班级管理 | `/classes` | 班级 CRUD、课程管理 |
| 学生管理 | `/students` | 学生 CRUD、进度查看、录音审听 |

### M2.3 功能需求详述

#### **F2-01 → 登录页**

**界面**: 居中表单，输入用户名、密码，点击"登录"

**流程**:
1. 提交 `POST /api/v1/auth/teacher-login { username, password }`
2. 成功：存储 JWT，跳转 `/dashboard`
3. 失败：表单内联错误提示"用户名或密码错误"

**验收标准**:
- 密码字段可切换显示/隐藏
- 按下 Enter 可提交表单
- 登录状态 7 天内持久化

---

#### **F2-02 → 仪表盘（Dashboard）**

**展示卡片**:
- 总班级数
- 总学生数
- 本周新录音提交数
- 待审录音数

**数据来源**: `GET /api/v1/dashboard/summary`

---

#### **F2-03 → 班级管理**

**班级列表视图**:
- 表格显示：班级名称、学生人数、课程数量、创建时间、操作按钮
- 操作列：查看课程、编辑、删除

**创建/编辑班级**:
- 弹窗 Modal：填写班级名称、描述
- 删除班级：确认对话框，软删除（学生数据保留）

**课程管理（课程列表在班级下）**:
- 进入班级详情页，展示该班级所有课程
- 可添加/编辑/删除课程
- 创建课程表单：
  - 课程标题（必填）
  - 封面图上传（儿童画，必填，上传后直传 COS）
  - 句子列表（至少 1 句）：
    - 每句：文本内容 + 参考音频上传（MP3/AAC，直传 COS）
    - 拖拽排序句子顺序
  - 保存后即对该班级学生可见

**验收标准**:
- 课程封面图上传支持 JPG/PNG，自动压缩至 < 2MB
- 参考音频上传支持 MP3/AAC/WAV
- 上传进度条显示
- 句子排序实时保存

---

#### **F2-04 → 学生管理**

**学生列表视图**:
- 筛选器：按班级筛选
- 表格显示：学生姓名、绑定微信（显示 openid 前 6 位...）、所在班级、加入时间、操作
- 因学生使用微信登录，"添加学生"实际为**预注册**流程（老师先填学生信息，学生首次微信登录时自动匹配）

**添加学生**:
- 弹窗表单：学生姓名、所属班级（下拉）
- 系统生成唯一学生码（6位字母数字），老师告知家长
- 学生首次登录小程序时输入学生码完成绑定（与 openid 关联）

> 注：这是替代微信 openid 直接注册的实用方案，因为老师在学生未登录前无法获知其 openid。

**学生详情**:
- 基本信息（头像、姓名、班级）
- 跟读进度：已完成课程数 / 总课程数，进度条
- 录音记录表：课程名、提交时间、操作（播放）
- 每条录音可在线播放（`<audio>` 标签，URL 来自 `GET /api/v1/recordings/:id/url`）

**删除学生**: 软删除，保留历史录音数据

**验收标准**:
- 录音在线播放延迟 < 3 秒（CDN 加速）
- 进度页面数据实时刷新（手动刷新按钮）
- 删除操作需二次确认

---

## 模块三：后端服务器与数据库

### M3.1 数据库 Schema 详细设计

```sql
-- 教师表
CREATE TABLE teachers (
    id          VARCHAR(36) PRIMARY KEY,  -- UUID
    username    VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,  -- bcrypt
    name        VARCHAR(100) NOT NULL,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at  DATETIME NULL
);

-- 班级表
CREATE TABLE classes (
    id          VARCHAR(36) PRIMARY KEY,
    teacher_id  VARCHAR(36) NOT NULL REFERENCES teachers(id),
    name        VARCHAR(100) NOT NULL,
    description VARCHAR(500),
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    deleted_at  DATETIME NULL
);

-- 学生表
CREATE TABLE students (
    id          VARCHAR(36) PRIMARY KEY,
    openid      VARCHAR(100) UNIQUE,     -- 微信 openid（首次绑定后填入）
    student_code VARCHAR(6) UNIQUE NOT NULL,  -- 6位绑定码
    name        VARCHAR(100) NOT NULL,
    class_id    VARCHAR(36) REFERENCES classes(id),
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    deleted_at  DATETIME NULL
);

-- 课程表
CREATE TABLE lessons (
    id          VARCHAR(36) PRIMARY KEY,
    class_id    VARCHAR(36) NOT NULL REFERENCES classes(id),
    title       VARCHAR(200) NOT NULL,
    image_url   VARCHAR(500) NOT NULL,  -- COS URL
    order_index INT DEFAULT 0,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    deleted_at  DATETIME NULL
);

-- 句子表
CREATE TABLE sentences (
    id          VARCHAR(36) PRIMARY KEY,
    lesson_id   VARCHAR(36) NOT NULL REFERENCES lessons(id),
    text        VARCHAR(500) NOT NULL,
    audio_url   VARCHAR(500),           -- 教师参考音频 COS URL
    order_index INT DEFAULT 0
);

-- 跟读提交表
CREATE TABLE recording_submissions (
    id              VARCHAR(36) PRIMARY KEY,
    student_id      VARCHAR(36) NOT NULL REFERENCES students(id),
    lesson_id       VARCHAR(36) NOT NULL REFERENCES lessons(id),
    audio_url       VARCHAR(500) NOT NULL,  -- 合并录音 COS URL
    status          ENUM('pending', 'reviewed') DEFAULT 'pending',
    submitted_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 索引
CREATE INDEX idx_students_openid ON students(openid);
CREATE INDEX idx_students_code ON students(student_code);
CREATE INDEX idx_lessons_class ON lessons(class_id);
CREATE INDEX idx_submissions_student ON recording_submissions(student_id);
CREATE INDEX idx_submissions_lesson ON recording_submissions(lesson_id);
```

### M3.2 API 接口详细规范

#### 认证中间件

所有需鉴权接口须携带 Header:
```
Authorization: Bearer <access_token>
```

中间件解析 JWT，注入 `req.user = { id, role: 'teacher'|'student' }`

---

#### 文件上传接口

**POST `/api/v1/upload/presign`**
```json
// Request
{
  "filename": "lesson_audio.mp3",
  "content_type": "audio/mpeg",
  "category": "lesson_audio" | "recording" | "lesson_image"
}

// Response
{
  "presigned_url": "https://bucket.cos.ap-guangzhou.myqcloud.com/...",
  "file_key": "recordings/2024/03/uuid.mp3",
  "expires_in": 900
}
```

---

#### 录音提交接口

**POST `/api/v1/recordings`**
```json
// Request（学生端，JWT 验证 student 角色）
{
  "lesson_id": "uuid",
  "file_key": "recordings/2024/03/uuid.aac"
}

// Response
{
  "id": "uuid",
  "status": "pending",
  "submitted_at": "2024-03-14T10:00:00Z"
}
```

---

### M3.3 文件存储规范

**COS 目录结构**:
```
cos://bucket-name/
├── lesson-images/        # 课程封面图（教师上传）
│   └── {lesson_id}/{uuid}.jpg
├── lesson-audios/        # 课程参考音频（教师上传）
│   └── {lesson_id}/{sentence_id}.aac
└── student-recordings/  # 学生跟读录音
    └── {year}/{month}/{submission_id}.aac
```

**访问控制**:
- `lesson-images/` & `lesson-audios/`：COS 公读（CDN 加速），供小程序直接播放
- `student-recordings/`：私有，需通过后端生成临时访问 URL（有效期 1 小时）

---

### M3.4 非功能性需求

| 指标 | 目标值 |
|------|--------|
| API 响应时间（P95） | < 200ms |
| 文件上传成功率 | > 99.5% |
| 系统可用性 | > 99.5%（月） |
| 并发用户 | 支持 500+ 并发（初期班级数 < 20） |
| 数据备份 | 每日自动备份，保留 30 天 |
| 日志保留 | 90 天 |

---

### M3.5 服务器目录结构

```
server/
├── src/
│   ├── app.ts                # Express 入口
│   ├── routes/               # 路由定义
│   │   ├── auth.ts
│   │   ├── classes.ts
│   │   ├── students.ts
│   │   ├── lessons.ts
│   │   └── recordings.ts
│   ├── controllers/          # 业务逻辑
│   ├── middleware/
│   │   ├── auth.ts           # JWT 验证
│   │   └── upload.ts         # 预签名 URL 生成
│   ├── services/
│   │   ├── wechat.ts         # 微信 code2session
│   │   └── cos.ts            # COS SDK 封装
│   ├── prisma/
│   │   └── schema.prisma     # 数据库 Schema
│   └── utils/
│       ├── jwt.ts
│       └── logger.ts
├── prisma/
│   └── migrations/
├── .env.example
└── package.json
```
