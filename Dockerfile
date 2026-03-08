# Stage 1: Build
FROM node:24-alpine AS build

RUN npm install -g pnpm@9

WORKDIR /app

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./
COPY packages/ ./packages/
COPY apps/daemon/package.json ./apps/daemon/
RUN pnpm install --frozen-lockfile

COPY apps/daemon/ ./apps/daemon/
RUN pnpm turbo run build --filter='./packages/*'
RUN pnpm --filter sauria run build

# Remove devDependencies for production
RUN pnpm prune --prod

# Stage 2: Production
FROM node:24-alpine AS production

RUN addgroup -g 1000 sauria && \
    adduser -u 1000 -G sauria -s /bin/sh -D sauria

WORKDIR /app

COPY --from=build --chown=sauria:sauria /app/apps/daemon/dist ./dist
COPY --from=build --chown=sauria:sauria /app/node_modules ./node_modules
COPY --from=build --chown=sauria:sauria /app/apps/daemon/package.json ./package.json

RUN mkdir -p /home/sauria/.sauria/logs \
             /home/sauria/.sauria/tmp \
             /home/sauria/.sauria/exports \
             /home/sauria/.sauria/vault && \
    chown -R sauria:sauria /home/sauria/.sauria

USER sauria

ENV NODE_ENV=production

ENTRYPOINT ["node", "dist/cli.js"]

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD node -e "require('net').connect('/home/sauria/.sauria/daemon.sock').on('connect',()=>process.exit(0)).on('error',()=>process.exit(1))"
