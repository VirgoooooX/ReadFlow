# RSS Proxy Server Dockerfile - Go 版本
# 多阶段构建，最终镜像仅包含静态二进制

# 第一阶段：编译
FROM golang:1.21-alpine AS builder

# 安装 CA 证书（HTTPS 需要）
RUN apk add --no-cache ca-certificates

WORKDIR /build

# 复制 Go 模块文件
COPY go.mod ./

# 复制源码
COPY main.go ./

# 编译为静态二进制（CGO 禁用，自动检测目标架构）
RUN CGO_ENABLED=0 GOOS=linux go build \
    -ldflags="-w -s" \
    -o rss-proxy \
    main.go

# 第二阶段：最小运行环境
FROM scratch

# 复制 CA 证书（HTTPS 需要）
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/

# 复制编译好的二进制
COPY --from=builder /build/rss-proxy /rss-proxy

# 环境变量
ENV PORT=3000
ENV NODE_ENV=production

# 暴露端口
EXPOSE 3000

# 启动服务
ENTRYPOINT ["/rss-proxy"]
