# syntax=docker/dockerfile:1.7
# Inside Life API — build context is the repo root (npm workspaces).

FROM node:24-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci --ignore-scripts -w @insidelife/shared -w @insidelife/backend --include-workspace-root

FROM deps AS build
COPY packages/shared packages/shared
COPY backend backend
RUN npm run build -w @insidelife/shared && npm run build -w @insidelife/backend

FROM node:24-bookworm-slim AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci --ignore-scripts --omit=dev -w @insidelife/shared -w @insidelife/backend --include-workspace-root \
 && npm cache clean --force

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=build --chown=node:node /app/packages/shared/dist ./packages/shared/dist
COPY --from=build --chown=node:node /app/backend/package.json ./backend/package.json
COPY --from=build --chown=node:node /app/backend/dist ./backend/dist
USER node
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:4000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--enable-source-maps", "backend/dist/main.js"]
