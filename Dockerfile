FROM node:18-slim as builder

WORKDIR /app
COPY package*.json ./
RUN npm install

COPY . .

FROM node:18-slim
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd -r dstatus && useradd -r -g dstatus dstatus

COPY --from=builder /app /app

# 创建必要的目录和文件
RUN mkdir -p /app/database /app/logs \
    && touch /app/tokens.json \
    && chown -R dstatus:dstatus /app \
    && chmod -R 755 /app \
    && chmod 644 /app/tokens.json

USER dstatus

EXPOSE 5555 9999

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:5555', res => res.statusCode === 200 ? process.exit(0) : process.exit(1))"

CMD ["node", "nekonekostatus.js"]