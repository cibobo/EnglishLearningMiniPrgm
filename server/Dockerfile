# 参考微信云托管官方示例优化
# 使用 alpine:3.13 基础镜像配合国内镜像源，确保构建速度和稳定性
FROM alpine:3.13

# 安装 HTTPS 证书（云托管调用必需）
RUN apk add ca-certificates

# 安装 Node.js 和 npm（使用腾讯镜像加速）
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.tencent.com/g' /etc/apk/repositories \
  && apk add --update --no-cache nodejs npm

# 安装 TypeScript 编译工具
RUN npm install -g typescript ts-node --registry=https://mirrors.cloud.tencent.com/npm/

WORKDIR /app

# 拷贝依赖文件
COPY package*.json ./
COPY tsconfig.json ./
COPY prisma ./prisma/

# 使用国内镜像源安装依赖
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
