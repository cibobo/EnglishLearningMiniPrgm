# 使用官方 Node 20 Debian Slim 镜像（原生支持 glibc 和标准 OpenSSL，完美兼容 Prisma）
FROM node:20-slim

# 安装 HTTPS 证书和 OpenSSL（Prisma 迁移引擎强依赖）
# 配合国内 apt 镜像源加速下载
RUN sed -i 's/deb.debian.org/mirrors.tencent.com/g' /etc/apt/sources.list.d/debian.sources \
    && apt-get update \
    && apt-get install -y ca-certificates openssl \
    && rm -rf /var/lib/apt/lists/*

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
# 忽略微信云托管内网拦截可能抛出的自签名证书报错
ENV NODE_TLS_REJECT_UNAUTHORIZED=0

EXPOSE 80

# 启动服务
CMD ["sh", "-c", "npx prisma db push --accept-data-loss && npx prisma db seed && node dist/app.js"]
