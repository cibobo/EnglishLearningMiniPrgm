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
