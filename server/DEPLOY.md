# Oracle 服务器后端部署与更新指南

此文档整理了当你在本地使用 `git push` 推送了代码更新（特别是涉及到数据库结构 `schema.prisma` 修改，或者安装了新依赖包时）后，在远程生产环境服务器上需要执行的**标准更新流程**。

---

## 🚀 标准更新 5 步曲

每次连接到服务器，并 `cd server/` 进入后端目录后，请按顺序执行以下命令：

### 1. 拉取最新代码
将从 GitHub 远端拉取最新 commit：
```bash
git pull origin master
```

### 2. 安装/更新依赖包
如果 `package.json` 添加了新的库（如刚才的 `@types/multer`），必须执行此命令补齐环境：
```bash
npm install
```

### 3. 同步数据库并重铸类型卡 (极其关键)
只要你修改了 `prisma/schema.prisma` 文件（例如加了新表、新字段），**必须**执行以下两条命令，否则极易出现 `TS2353` 类型未识别等编译报错：
```bash
# 将模型改变真正应用到 MySQL 数据库里（不影响已有数据）
npx prisma db push

# 重新生成 Node_modules 中的 Prisma Client 类型卡片
npx prisma generate
```

### 4. 编译 Typescript 为生产代码
这一步至关重要：由于生产环境（`package.json` 的 `start`）跑的是 `dist/app.js`，我们需要把刚刚拉下来的所有 `.ts` 源码翻译打包成可执行的 `.js`，覆盖旧的同名文件：
```bash
npm run build
```
*(如果此时控制台报错，说明你漏掉了第 2 步或者第 3 步，请倒回去检查)*

### 5. 重启守护进程 (PM2 等)
当最新的 `.js` 就绪后，通知 Node 服务端以新代码热重启：
```bash
pm2 restart all
```
*(如果你习惯用 npm start 或系统服务启动，按你之前的方式重启它的进程即可)*

---

## 🔑 核心配置：集成 Google Speech-to-Text 凭证

当需要使用 AI 智能长语音识别打轴功能时，我们必须往 Oracle 生产服务器上安全配置来自 Google Cloud 的鉴权文件：

1. **获取鉴权文件**
   - 从 Google Cloud Console 中生成并下载一个服务帐号密钥，即 `google-credentials.json` 文件。

2. **安全上传文件到服务器 (绝不能提交至 Git)**
   - 为防泄露，绝对不要将包含密钥的 JSON 推送到公共代码仓库。
   - 方式一：使用 SFTP 客户端（如 FileZilla、WinSCP 等）将它拖拽上传至 Oracle 服务器。
   - 方式二：也可以通过终端在安全目录手动创建（例如：`vim /home/ubuntu/google-credentials.json`），然后复制并右键粘贴内容。强烈建议存放到项目目录**外层**更安全的区域。

3. **配置服务器后端环境变量 (.env)**
   - 打开项目后端挂载路径 `server/.env` 文件，在最底部新加上对应的绝对路径指向变量：
   ```env
   GOOGLE_APPLICATION_CREDENTIALS="/home/ubuntu/google-credentials.json"
   ```

4. **强制重启生效**
   - 最后，必须在 `server` 根目录重新跑一次守护进程重启（如 `pm2 restart all`），好让 Node.js 客户端在初始化时吃下新的鉴权路径！

---

## 🛠️ 常见报错急救速查

*   **报错**：`Property 'xxx' does not exist on type 'PrismaClient' / 'LessonCreateInput'`
    *   **原因**：你可能修改了 Prisma 的模型，但没有重新生成代码里的接口文档。
    *   **解法**：在 `server` 目录下补一句 `npx prisma generate`，然后再次执行 `npm run build`。
*   **报错**：`Cannot find module 'xxxx' or its corresponding type declarations`
    *   **原因**：拉下了含有新依赖的代码，但服务器上没安装这些库；或者是缺少针对 Typescript 的 `@types/xxx`。
    *   **解法**：在本地 `git push` 时确保把依赖正确写入了 `package.json`，在服务器重新运行 `npm install`。
*   **关于鉴权环境配置丢失**
    *   **排查**：如果有些第三方服务（如 Google Speech-to-Text API）挂了，检查 `server/.env` 最后一行是否仍然保留着 `GOOGLE_APPLICATION_CREDENTIALS` 等配置路径。

> **最佳实践建议**：
> 以后如果本地只是改了一行没有逻辑和数据库绑定的简单代码，虽然第 3 步 `prisma` 操作可以跳过，但我仍然**强烈建议**每次都把这 5 个命令连着跑完（或者写成一个小小的 `sh` 运行脚本），以防万一！

---

---

# 微信云托管部署指南

架构：Express.js (TypeScript) + Prisma + MySQL → 腾讯云「云托管」

**当前云托管服务域名：**
```
https://express-u5ne-242771-4-1419482792.sh.run.tcloudbase.com
```

---

## 第一步：在云托管控制台配置数据库

> 做这步之前先别部署代码，数据库地址要先拿到才能填 ENV。

1. 打开 [微信云开发控制台](https://cloud.weixin.qq.com/)
2. 进入 **云托管 → 数据库**（或单独开通**腾讯云数据库 MySQL**）
3. 创建一个 MySQL 实例，记录下内网 Host、端口、用户名、密码、库名

> ⚠️ 云托管内的服务通过**内网**直连数据库，不需要公网暴露。

---

## 第二步：在云托管配置环境变量

在 **云托管 → 服务 → 版本配置 → 环境变量** 中填入：

| 变量名 | 说明 |
|---|---|
| `PORT` | `80`（云托管要求，Dockerfile 已设） |
| `NODE_ENV` | `production` |
| `DATABASE_URL` | `mysql://user:pass@10.x.x.x:3306/learning_app`（内网地址） |
| `JWT_ACCESS_SECRET` | 随机长字符串 |
| `JWT_REFRESH_SECRET` | 随机长字符串 |
| `JWT_ACCESS_EXPIRES_IN` | `2h` |
| `JWT_REFRESH_EXPIRES_IN` | `7d` |
| `WECHAT_APPID` | 小程序 AppID |
| `WECHAT_SECRET` | 小程序 Secret |
| `CORS_ORIGIN` | 教师端 Web 地址 |

---

## 第三步：打包代码（每次发布都用这条命令）

> ⚠️ **必须用 `git archive` 而不是 `Compress-Archive`**。  
> Windows 的 `Compress-Archive` 会产生反斜杠路径，Linux 无法识别，导致构建失败。

在 `server/` 目录下运行：

```powershell
git add -A
git commit -m "chore: deploy update"
git archive --format=zip --output=deploy.zip HEAD Dockerfile .dockerignore package.json package-lock.json tsconfig.json tsconfig.seed.json src prisma
```

打包后将 `server/deploy.zip` 上传到云托管控制台。

---

## 第四步：上传并等待构建

```
云托管控制台 → 服务 → 新建版本 → 上传代码包 → 选择 deploy.zip
```

构建时云托管会自动：
1. 按 `Dockerfile` 执行 `docker build`
2. 容器启动时运行 `prisma migrate deploy`（自动建表/迁移）
3. 启动 `node dist/app.js`

构建日志在 **服务 → 版本 → 构建日志** 可实时查看。

---

## 第五步：验证部署成功

访问健康检查接口：

```
GET https://express-u5ne-242771-4-1419482792.sh.run.tcloudbase.com/api/v1/health
```

应返回：

```json
{ "status": "ok", "timestamp": "..." }
```

---

## 第六步：更新小程序 API 地址

```javascript
// miniprogram/utils/request.js
const BASE_URL = 'https://express-u5ne-242771-4-1419482792.sh.run.tcloudbase.com/api/v1';
```

---

## 第七步：配置微信合法域名

在 **微信公众平台 → 开发 → 开发设置 → 服务器域名** 中添加：

- **request 合法域名**：`https://express-u5ne-242771-4-1419482792.sh.run.tcloudbase.com`
- **uploadFile 合法域名**：同上

---

## 已知坑（逐一解决过）

| 问题 | 原因 | 解法 |
|---|---|---|
| ZIP 路径反斜杠警告，构建失败 | `Compress-Archive` 产生 Windows 路径 | 改用 `git archive` |
| `prisma preinstall` 失败 | `alpine:3.13` 自带 Node.js v12，太旧 | 换 `node:20-alpine` |
| `openssl not found`，启动崩溃 | Alpine 默认无 OpenSSL | Dockerfile 加 `apk add openssl libc6-compat` |

