# 使用官方 Node 20 Alpine 镜像（含正确版本 Node.js，Prisma 5.x 需要 Node 16+）
FROM node:20-alpine

# 安装 HTTPS 证书（云托管调用必需）和构建工具
RUN apk add --no-cache ca-certificates openssl libc6-compat

WORKDIR /app

# 先拷贝依赖文件（利用 Docker 层缓存）
COPY package*.json ./
COPY tsconfig.json ./
COPY prisma ./prisma/

# 使用腾讯国内镜像源加速安装
RUN npm config set registry https://mirrors.cloud.tencent.com/npm/
RUN npm install

# 生成 Prisma Client
RUN npx prisma generate

# 拷贝全部源码
COPY . /app

# 编译 TypeScript
RUN npm run build

# 云托管监听 80 端口
ENV PORT=80
ENV NODE_ENV=production

EXPOSE 80

# 启动：先跑数据库迁移，再启动服务
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/app.js"]
