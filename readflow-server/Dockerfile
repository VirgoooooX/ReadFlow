# Stage 1: Builder
FROM node:18-bookworm-slim AS builder

WORKDIR /app

# 安装构建依赖 (为了编译 native 模块，尽管 sharp 通常有预编译包)
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./

# 安装所有依赖 (包括 devDependencies)
RUN npm ci

COPY . .

# 生成 Prisma Client
RUN npx prisma generate

# 编译 TypeScript
RUN npm run build

# 移除 devDependencies，缩小运行时 node_modules
RUN npm prune --omit=dev

# Stage 2: Production Runner
FROM node:18-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# 从构建阶段复制运行所需文件
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/scripts ./scripts

# 创建数据目录
RUN mkdir -p data public/cache

ARG SERVER_VERSION
ARG SERVER_BUILD
ARG SERVER_BUILD_TIME
ARG SERVER_CHANGELOG

ENV SERVER_VERSION=${SERVER_VERSION}
ENV SERVER_BUILD=${SERVER_BUILD}
ENV SERVER_BUILD_TIME=${SERVER_BUILD_TIME}
ENV SERVER_CHANGELOG=${SERVER_CHANGELOG}

EXPOSE 3000

CMD ["/bin/sh", "-c", "npx prisma migrate deploy && node -e \"const fs=require('fs'); if(fs.existsSync('./scripts/migrate-public-feeds.js')) require('./scripts/migrate-public-feeds.js');\" && npm start"]
