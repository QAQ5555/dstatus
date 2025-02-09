FROM node:18 as builder

WORKDIR /app
COPY . ./
RUN npm install

FROM node:18-buster-slim
WORKDIR /

# 从构建阶段复制文件
COPY --from=builder /app /

# 创建必要的目录和文件
RUN mkdir -p /database /logs \
    && touch /tokens.json \
    && chmod -R 755 / \

# 设置数据卷
VOLUME ["/database", "/logs"]

EXPOSE 5555

CMD ["node", "nekonekostatus.js"]