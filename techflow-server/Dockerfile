# Stage 1: Builder
FROM node:18-alpine AS builder

WORKDIR /app

# 安装构建依赖 (为了编译 native 模块，尽管 sharp 通常有预编译包)
RUN apk add --no-cache python3 make g++

COPY package*.json ./

# 安装所有依赖 (包括 devDependencies)
RUN npm ci

COPY . .

# 编译 TypeScript
RUN npm run build

# Stage 2: Production Runner
FROM node:18-alpine

WORKDIR /app

ENV NODE_ENV=production

# 仅复制 package 文件以安装生产依赖
COPY package*.json ./

# 安装生产依赖 (跳过 devDependencies)
# sharp 会自动下载适合 alpine (musl) 的预编译包
RUN npm ci --omit=dev && npm cache clean --force

# 从构建阶段复制编译产物
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public

# 创建数据目录
RUN mkdir -p data public/cache

EXPOSE 3000

CMD ["npm", "start"]
