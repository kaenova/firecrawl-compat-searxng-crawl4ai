# ---- Build stage ----
FROM oven/bun:1 AS builder
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY src/ ./src/
COPY tsconfig.json ./

# ---- Run stage ----
FROM oven/bun:1-slim
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/src ./src
COPY --from=builder /app/package.json ./

ENV PORT=3002
EXPOSE 3002

CMD ["bun", "run", "src/index.ts"]
