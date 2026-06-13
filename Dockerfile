# ---- Build backend ----
FROM oven/bun:1 AS backend-builder
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY src/ ./src/
COPY tsconfig.json ./

# ---- Build frontend ----
FROM oven/bun:1 AS frontend-builder
WORKDIR /app/client
COPY client/package.json client/bun.lock ./
RUN bun install --frozen-lockfile
COPY client/ ./
RUN bun run build

# ---- Run stage ----
FROM oven/bun:1-slim
WORKDIR /app
COPY --from=backend-builder /app/node_modules ./node_modules
COPY --from=backend-builder /app/src ./src
COPY --from=backend-builder /app/package.json ./
COPY --from=frontend-builder /app/client/dist ./client/dist

ENV PORT=3002
EXPOSE 3002

CMD ["bun", "run", "src/index.ts"]
