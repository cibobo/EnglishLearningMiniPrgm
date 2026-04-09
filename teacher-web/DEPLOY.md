# 教师前端 (Teacher Web) 服务器部署指南

本文档整理了在此 Oracle 云服务器上完整部署和日常更新基于 React/Vue (Vite) 的单页应用（SPA）的标准流程。包含了从零开始的初次部署网络配置，以及每次推送新代码后的快速更新命令。

---

## 🌟 初次部署：从零开始的环境配置

如果你是一台刚拿到手的全新 Oracle Ubuntu 服务器，请按照以下 3 个核心步骤打开网络生命线并安装必备工具。

### 第一步：开启 Oracle Cloud 云端防火墙端口
默认情况下，Oracle 云的安全列表会阻挡所有入站流量，你必须通过网页控制台放行 8080 (前端) 和 3000 (后端) 端口：
1. 登录 [Oracle Cloud 控制台](https://cloud.oracle.com/)。
2. 导航到 **Compute > Instances**，点击进入你的实例详情页。
3. 点击 **Primary VNIC** 下绑定的子网（Subnet）。
4. 在左侧菜单点击 **Security Lists**，然后点击子网所属的安全列表（通常名叫 `Default Security List for...`）。
5. 点击 **Add Ingress Rules** (添加入站规则)：
   - **Source CIDR**: `0.0.0.0/0` (代表允许所有 IP 访问)
   - **IP Protocol**: `TCP`
   - **Destination Port Range**: `8080` (如果是后端就是 `3000`，可以逗号分隔写 `3000,8080`)
6. 点击确认保存。

### 第二步：开启 Linux 内部 iptables 端口
即使云端放行了，Ubuntu 系统自带的 `iptables` 防火墙依然会死死拦住端口。在 SSH 终端里执行如下命令（永久放行所需端口）：
```bash
# 打开 8080 端口进入外部流量
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 8080 -j ACCEPT
# 打开 3000 端口进入外部流量
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 3000 -j ACCEPT

# 保存规则（确保重启后仍然有效）
sudo netfilter-persistent save
# （注意：如果提示 netfilter-persistent 找不到，可以执行 sudo apt install iptables-persistent 安装）
```

### 第三步：安装 PM2 守护程序与静态托管服务
我们不需要复杂笨重的 Nginx，直接使用强大的 PM2 就能满足前端静态文件包的挂载和崩溃重启要求：
```bash
# 全局安装 PM2，作为我们管理 Node 后端和静态前端进程的核心工具
npm install -g pm2

# 非常重要：在使用 PM2 提供静态网页服务 (serve) 前，必须安装以下官方辅助包：
#pm2-serve 可以让 pm2 直接挂载并返回静态的 HTML/CSS/JS 资源
npm install -g pm2-serve
```

---

## 🚀 首次上线 / 日常标准更新流程

每次在本地电脑（GitHub）修改完界面，并在服务器拉取代码后，进入 `teacher-web/` 目录，请执行以下命令更新线上服务：

### 1. 拉取代码并刷新包管理器
```bash
# 拉取最新前端代码更新
git pull origin master

# 如果增添了新的前端组件依赖（如 Antd、Axios新插件），须重新补齐
npm install
```

### 2. 构建静态部署文件 (Build)
在生产环境，绝对不能使用 `npm run dev` 来启动服务。必须利用 Vite/Webpack 打包，在当前目录下生成一个经过极度压缩和优化的 `dist` 文件夹：
```bash
npm run build
```
*(注意：打包前确认你的 `.env.production` 或相关环境配置里，请求后端的地址已经写成了绝对域名 `http://150.230.2.226:3000/api/v1` 等)*

### 3. 使用 PM2 挂载更新并生效 (Serve)

**情况 A：我是第一天上线，PM2 里还没有这个服务！**
你需要利用刚装好的 PM2 用“单页应用模式（SPA）”将 `dist` 文件夹挂起在 8080 端口：
```bash
# --spa 参数极为关键：它能确保 React/Vue 这种前端单页路由在刷新内页（比如 /lessons）时不会报 404 错误！
pm2 serve dist 8080 --name "teacher-web" --spa
```
*(成功后，你可以用 `pm2 save` 把当前所有运行的服务定格，并结合 `pm2 startup` 创建系统开机自启记录)*

**情况 B：我只是更新了点代码（原来已经用 PM2 跑着 8080 端口了）**
生成完新的 `dist` 后，直接高速重启该服务名称刷新缓存即可：
```bash
pm2 restart teacher-web
```

---

## 🚨 常见避坑与调试指南

1. **连接超时 ERR_CONNECTION_TIMED_OUT**
   - **原因**：100% 是前两步的防火墙没开好！Oracle 控制台的安全组，以及 Linux `iptables` 中的任意一个忘记放行 8080 端口，前端就根本刷不开。
2. **页面出现点击刷新后网页空白 / Cannot GET /xxx**
   - **原因**：当你直接按 F5 刷新一个子路由网址（如 `/dashboard`）时，静态服务器会傻傻去寻找叫做 dashboard 的文件夹。
   - **解法**：如果你严格按照上方执行了 `--spa` 启动，PM2 会自动重定向到 `index.html`，绝不会报空白。
3. **接口报 CORS 跨域拦截 / ERR_CONNECTION_REFUSED**
   - **原因**：CORS 是因为后端的跨域白名单（在 `app.ts` 内部）不认识 `http://150.230.2.226:8080`；而 Refused 是因为打过去地址发现后端系统根本没开或者死机了。
   - **解法**：使用 `pm2 logs` 分别针对前端或后台检查错误原因，确认后端 3000 端口存活。

---

## 🌩️ 进阶部署方案：使用 Nginx + Cloudflare 域名加速托管

如果你的架构已经演进到拥有自己的域名，并希望利用 Cloudflare 提供的高速 CDN 和免费 HTTPS 绿锁，推荐抛弃 PM2 Serve，改用企业级的 Nginx 进行静态托管。

### 第一阶段：准备 Cloudflare 与网络权限
1. **云端防火墙**：在 Oracle Cloud 网页控制台的 Security Lists 中，额外添加入站规则开放 **80** 和 **443** 端口。
2. **内部防火墙**：在 Linux SSH 内执行以下命令放行 Web 默认端口：
   ```bash
   sudo iptables -I INPUT -p tcp -m tcp --dport 80 -j ACCEPT
   sudo iptables -I INPUT -p tcp -m tcp --dport 443 -j ACCEPT
   sudo netfilter-persistent save
   ```
3. **设置 Cloudflare DNS**：在 Cloudflare 中添加 `A` 记录指向你的 Oracle 服务器 IP，并**点亮橙色云朵标志**启用代理。
4. **设置 SSL 模式**：在 Cloudflare 的 **SSL/TLS -> 概述** 中，必须将加密模式设置为 **灵活 (Flexible)** 或 **完全 (Full)**。

### 第二阶段：安装配置 Nginx
```bash
# 安装 Nginx
sudo apt update
sudo apt install nginx -y

# 编辑针对本项目域名的专用配置（自行替换为你的真实域名和绝对路径）
sudo nano /etc/nginx/conf.d/teacher-web.conf
```
输入以下为单页应用（SPA）量身定制的配置内容：
```nginx
server {
    listen 80;
    # 替换为你绑定的域名。如果希望同时允许通过服务器公网 IP 直接访问，只需用空格将其加在后面即可，比如：
    server_name www.yourdomain.online 150.230.2.226; 

    # 替换为你刚才 npm run build 生成的 dist 文件夹绝对路径
    root /var/www/EnglishLearningMiniPrgm/teacher-web/dist;
    index index.html;

    # 让 Vue/React Router 完美处理 History 刷新不报 404
    location / {
        try_files $uri $uri/ /index.html;
    }

    # 静态资源长期缓存，加速秒开
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff2)$ {
        expires 30d;
        add_header Cache-Control "public, no-transform";
    }
}
```

### 第三阶段：解决权限并重启即刻生效
```bash
# 给所有父级目录和产物颁发 Nginx 的查看通行证 (防止前端报 403 Forbidden)
sudo chmod -R 755 /var/www/EnglishLearningMiniPrgm/teacher-web/dist
sudo chmod 755 /var/www/EnglishLearningMiniPrgm

# 测试配置正确并让 Nginx 加载生效
sudo nginx -t
sudo systemctl reload nginx
```
以后每次代码拉取完执行 `npm run build` 生成新的 dist 文件夹后，Nginx 会自动实时应用最新的前端体验，极速优雅！
