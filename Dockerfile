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
RUN pnpm --filter @opensauria/daemon run build

# Remove devDependencies for production
RUN pnpm prune --prod

# Stage 2: Production
FROM node:24-alpine AS production

RUN addgroup -g 1000 opensauria && \
    adduser -u 1000 -G opensauria -s /bin/sh -D opensauria

WORKDIR /app

COPY --from=build --chown=opensauria:opensauria /app/apps/daemon/dist ./dist
COPY --from=build --chown=opensauria:opensauria /app/node_modules ./node_modules
COPY --from=build --chown=opensauria:opensauria /app/apps/daemon/package.json ./package.json

RUN mkdir -p /home/opensauria/.opensauria/logs \
             /home/opensauria/.opensauria/tmp \
             /home/opensauria/.opensauria/exports \
             /home/opensauria/.opensauria/vault && \
    chown -R opensauria:opensauria /home/opensauria/.opensauria

USER opensauria

ENV NODE_ENV=production

ENTRYPOINT ["node", "dist/cli.js"]
