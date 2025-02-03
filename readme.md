# DStatus

一个现代化的服务器状态监控面板，基于 Node.js 和 TailwindCSS 构建。

## 功能特点

- 📊 服务器监控
  - CPU 使用率监控
  - 内存占用监控
  - 网络带宽监控
  - 在线状态监控

- 📂 分组管理
  - 服务器分组
  - 分组排序
  - 批量管理

- 💻 服务器管理
  - SSH 连接管理
  - 服务器配置
  - 状态刷新
  - 批量操作

- 🎨 界面设计
  - 响应式布局
  - 明暗主题
  - 卡片/列表视图

## 快速开始

### Docker 部署（推荐）

```bash
docker run --restart=always \
  --name dstatus \
  -p 5555:5555 \
  -p 9999:9999 \
  -v /path/to/data:/app/database \
  -v /path/to/logs:/app/logs \
  -e NODE_ENV=production \
  -d fev125/dstatus:latest
```

### 环境变量
- `WEB_PORT`: Web 管理界面端口（默认 5555）
- `CONTROL_PORT`: 被控端通信端口（默认 9999）

### 目录说明
- `/app/database`: 数据库文件目录
- `/app/logs`: 日志文件目录

## 安全建议

1. 修改默认密码
2. 使用 HTTPS
3. 定期备份数据

## 许可证

MIT License

## 致谢

- 感谢 [NekoNekoStatus](https://github.com/nkeonkeo/nekonekostatus) 项目的启发