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
RUN pnpm --filter @openwind/daemon run build

# Remove devDependencies for production
RUN pnpm prune --prod

# Stage 2: Production
FROM node:24-alpine AS production

RUN addgroup -g 1000 openwind && \
    adduser -u 1000 -G openwind -s /bin/sh -D openwind

WORKDIR /app

COPY --from=build --chown=openwind:openwind /app/apps/daemon/dist ./dist
COPY --from=build --chown=openwind:openwind /app/node_modules ./node_modules
COPY --from=build --chown=openwind:openwind /app/apps/daemon/package.json ./package.json

RUN mkdir -p /home/openwind/.openwind/logs \
             /home/openwind/.openwind/tmp \
             /home/openwind/.openwind/exports \
             /home/openwind/.openwind/vault && \
    chown -R openwind:openwind /home/openwind/.openwind

USER openwind

ENV NODE_ENV=production

ENTRYPOINT ["node", "dist/cli.js"]
