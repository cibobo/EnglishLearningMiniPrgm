# Transcriber Microservice 裸机部署指南

如果您不希望使用 Docker 容器化来部署，我们可以使用原生（Bare Metal）部署方式。在裸机上部署，建议使用 [PM2](https://pm2.keymetrics.io/) 进行进程守护，这样可以保证微服务在崩溃或服务器重启后能够自动恢复。

因为我们的服务使用到了 FFmpeg 处理音频格式转换，**核心区别在于您需要手动在操作系统宿主机安装 FFmpeg**。

以下是完整的系统配置与部署流程。

## 1. 环境准备 (以 Ubuntu 为例)

首先，您需要通过 SSH 登录到您的 Oracle Server Instance，并安装核心依赖：

```bash
# 1. 更新包管理器缓存
sudo apt update

# 2. 安装 Node.js (如果你还没安装)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# 3. 安装必须要用到的 FFmpeg (非常关键！)
sudo apt install ffmpeg -y

# 4. 全局安装 PM2
sudo npm install -g pm2
```

*(注：如果您使用的是 Oracle Linux / CentOS，安装 FFmpeg 的命令可能需要改为 `sudo dnf install epel-release -y && sudo dnf install ffmpeg ffmpeg-devel -y`)*

---

## 2. 上传代码与构建

1. 将开发笔记本上的整个 `transcriber-service` 文件夹（**切记：跳过 `node_modules` 文件夹以避免系统环境不兼容**）上传到 Oracle 服务器上（可以通过 SCP / FTP 或者直接 Git clone）。
2. 在服务器上进入该项目根目录。

```bash
cd /path/to/your/transcriber-service
```

3. 安装项目依赖：

```bash
npm install
```

4. 将 TypeScript 代码编译为 JavaScript 代码：

```bash
npm run build
```
*(这会在项目内生成一个 `dist` 文件夹)*

---

## 3. 环境变量配置

将本地测试好的环境变量配置到服务器中。

```bash
cp .env.example .env
nano .env
```
填入你原本在后端的密钥配置：
```env
PORT=4000
JWT_ACCESS_SECRET="your_existing_jwt_access_secret_from_tencent"
GOOGLE_CREDENTIALS_JSON='{ "type": "service_account", "project_id": "..." }'
```
*(注意：`GOOGLE_CREDENTIALS_JSON`的内容最好压缩成单行字符串，确保 JSON 格式不被换行符破坏)*

---

## 4. 使用 PM2 启动微服务

依靠 PM2，我们可以让它在后台默默运行并具备挂掉重启的能力：

```bash
# 使用 PM2 启动刚刚编译出的 JS 入口文件，并命名为 transcriber
pm2 start dist/app.js --name transcriber

# 检查运行状态，如果 Status 是 online 说明启动成功
pm2 status

# 保存现有的 PM2 进程列表，使其开机自启
pm2 save
pm2 startup
```

想要查看微服务的相关 Console 报错或日志，随时输入：
```bash
pm2 logs transcriber
```

---

## 5. 配置 Nginx 反向代理

为了让已经在通过 80/443 跑着 `teacher-web` 的服务器能够收到发给微服务的请求，我们需要把特定的路径（例如 `/api/transcribe`）指向这台机器的本地 4000 端口。

打开您的 Nginx 配置文件（可能是 `/etc/nginx/sites-available/default` 或 `/etc/nginx/nginx.conf`）：

```bash
sudo nano `/etc/nginx/sites-available/default`
```

在您的 `server { ... }` 块中加入：

```nginx
server {
    # ... 在这里通常有您现有的 teacher-web 的静态路由设置 ...
    # 比如 root /var/www/teacher-web; 等等

    # 将所有给录音识别的请求转给后端的 PM2 进程
    location /api/transcribe {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        
        # 将用户的真实IP透传给Node.js
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;

        # 重要：因为音频文件可能会比普通文本大得多，放宽 Nginx 对包大小的限制
        client_max_body_size 50M; 
        
        # 允许大文件处理更长时间
        proxy_read_timeout 300s;
        proxy_connect_timeout 300s;
    }
}
```

保存后，重启你的 Nginx：

```bash
sudo nginx -t     # 测试语法是否正确，不报错就执行下一步
sudo systemctl reload nginx
```

## 6. 前端 Teacher-Web 调用

以上一切配置就绪后，你前端 `teacher-web` 在发起上传验证时，只要将请求发送给：

`POST https://你的域名/api/transcribe` (记得带上 Bearer Token 头)

音频就会先走 Nginx → 穿透给 4000 端口微服务（带 JWT 校验） → 唤起 FFmpeg 切片 → 调起海外网络的 Google ASR → 返回全段识别给前端。
