# syntax=docker/dockerfile:1.7
# Inside Life web client — build context is the repo root (npm workspaces).

FROM node:24.21.0-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci --ignore-scripts -w @insidelife/shared -w @insidelife/frontend --include-workspace-root

FROM deps AS build
ENV NEXT_TELEMETRY_DISABLED=1
# Server-side rewrite target inside the compose network; the browser itself goes through nginx.
ARG BACKEND_INTERNAL_URL=http://backend:4000
ENV BACKEND_INTERNAL_URL=${BACKEND_INTERNAL_URL}
# Same-origin realtime socket behind nginx.
ENV NEXT_PUBLIC_REALTIME_URL=
# The build's id (the git commit): installed games compare it with /version.json and refresh to the latest.
ARG BUILD_ID=dev
ENV NEXT_PUBLIC_BUILD_ID=${BUILD_ID}
COPY packages/shared packages/shared
COPY frontend frontend
RUN npm run build -w @insidelife/shared && npm run build -w @insidelife/frontend

FROM node:24.21.0-bookworm-slim AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build --chown=node:node /app/frontend/.next/standalone ./
COPY --from=build --chown=node:node /app/frontend/.next/static ./frontend/.next/static
COPY --from=build --chown=node:node /app/frontend/public ./frontend/public
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"
CMD ["node", "frontend/server.js"]
