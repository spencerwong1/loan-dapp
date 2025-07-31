# ─────────────── base image ───────────────
FROM node:20-slim

# ─────────────── create app dir ───────────
WORKDIR /app

# ─────────────── copy & install ───────────
# 先复制 package.json + yarn.lock 以利用层缓存
COPY package.json yarn.lock ./
RUN yarn install --production

# 再复制源码
COPY . .

# Typescript build
RUN yarn build

# ─────────────── runtime env ──────────────
# 1. RPC_URL 和 PAYER_PRIVATE_KEY 通过 -e 或 .env 注入
# 2. Expose 可选 3000 端口（如果将来 API 跑在同镜像中）
EXPOSE 3000

# ─────────────── start bot ────────────────
CMD ["node", "dist/bot.js"]

