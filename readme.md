# DStatus - 服务器状态监控面板


DStatus 是一个轻量级的服务器状态监控面板，专为个人和小型团队设计。它提供了实时的服务器状态监控、历史数据记录和可视化展示功能。

## 功能特点

- 🚀 实时监控服务器状态
- 📊 历史数据记录与可视化
- 🔔 异常状态告警
- 🔒 安全访问控制
- 🐳 Docker 容器化部署
- 📱 移动端友好界面

## 📸 界面预览
[在线演示](https://vps.mom)


## 安装与更新

### 全新安装

```bash
# 使用host网络模式，适合单机部署
docker run -d \
  --name dstatus \
  --network host \
  --restart unless-stopped \
  -e TZ=Asia/Shanghai \
  -e NODE_ENV=production \
  -e PORT=5555 \
  ghcr.io/fev125/dstatus:latest

# 使用端口映射模式，适合多服务部署
docker run -d \
  --name dstatus \
  -p 5555:5555 \
  --restart unless-stopped \
  -e TZ=Asia/Shanghai \
  -e NODE_ENV=production \
  ghcr.io/fev125/dstatus:latest
```

### 更新版本

```bash
# 更新步骤（建议先备份数据）
(docker stop dstatus || true) && \
(docker rm dstatus || true) && \
docker pull ghcr.io/fev125/dstatus:latest && \
docker run -d \
  --name dstatus \
  --network host \
  --restart unless-stopped \
  -e TZ=Asia/Shanghai \
  -e NODE_ENV=production \
  -e PORT=5555 \
  ghcr.io/fev125/dstatus:latest
```



### 访问管理面板

- 访问地址: `http://your-ip:5555` 或 
- 默认密码: `dstatus`
- 首次登录后请立即修改密码

## 安全建议

1. **密码安全**
   - 首次登录后立即修改默认密码
   - 建议使用强密码策略

2. **网络防护**
   - 使用反向代理并启用HTTPS
   - 配置防火墙，限制访问IP
   - 示例Nginx配置：
     ```nginx
     server {
         listen 443 ssl;
         server_name status.example.com;
         
         ssl_certificate /path/to/cert.pem;
         ssl_certificate_key /path/to/key.pem;
         
         location / {
             proxy_pass http://127.0.0.1:5555;
             proxy_set_header Host $host;
             proxy_set_header X-Real-IP $remote_addr;
         }
     }
     ```

3. **数据安全**
   - 请定期备份数据库


## 常用命令

```bash
# 启动容器
docker start dstatus

# 停止容器
docker stop dstatus

# 查看日志
docker logs -f dstatus

# 进入容器
docker exec -it dstatus /bin/bash


```

## 环境变量

| 变量名         | 默认值       | 描述                     |
|----------------|--------------|--------------------------|
| TZ            | Asia/Shanghai | 时区设置                 |
| NODE_ENV      | production   | 运行环境                 |
| PORT          | 5555         | 服务端口                 |
| DB_PATH       | /app/database | 数据库存储路径           |
| LOG_LEVEL     | info         | 日志级别 (debug/info/warn/error) |


## 🙏 致谢

- [Node.js](https://nodejs.org/) - 核心运行时
- [Express](https://expressjs.com/) - Web框架
- [SQLite](https://www.sqlite.org/) - 数据库
- [Chart.js](https://www.chartjs.org/) - 数据可视化

## 许可证

本项目采用 [MIT License](LICENSE) 开源协议。