FROM node:18 as builder

WORKDIR /app
COPY . ./
RUN npm install

# 使用 debian:bullseye-slim 作为基础镜像，它包含更新版本的 GLIBC
FROM debian:bullseye-slim

# 安装 Node.js 和必要的依赖
RUN apt-get update && apt-get install -y \
    curl \
    && curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get install -y nodejs \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 从构建阶段复制文件
COPY --from=builder /app ./

# 创建必要的目录和文件
RUN mkdir -p /database /logs && \
    touch /tokens.json && \
    chown -R node:node /database /logs /tokens.json && \
    chmod 755 /database /logs && \
    chmod 644 /tokens.json

# 设置数据卷
VOLUME ["/database", "/logs"]

USER node

EXPOSE 5555

CMD ["node", "nekonekostatus.js"]