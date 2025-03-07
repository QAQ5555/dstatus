# ---------- 构建阶段 ----------
FROM node:18-alpine as builder
WORKDIR /app
COPY . .
RUN npm install

# ---------- 运行阶段 ----------
FROM node:18-alpine

# 安装运行时依赖（必需的工具）
RUN apk add --no-cache tini

# 创建非 root 用户
RUN adduser -D -h /app -s /bin/sh node

# 设置工作目录并复制文件
WORKDIR /app
COPY --from=builder /app .

# 创建默认目录结构（容器内路径）
RUN mkdir -p /database /logs \
  && touch /tokens.json \
  && chown -R node:node /app /database /logs /tokens.json \
  && chmod 755 /database /logs \
  && chmod 644 /tokens.json

# 使用非 root 用户运行
USER node

# 使用 tini 作为初始化进程
ENTRYPOINT ["/sbin/tini", "--"]

# 启动应用
CMD ["node", "nekonekostatus.js"]
