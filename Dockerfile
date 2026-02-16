# Stage 1: Build
FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# Remove devDependencies for production
RUN npm ci --omit=dev

# Stage 2: Production
FROM node:22-alpine AS production

RUN addgroup -g 1000 openwind && \
    adduser -u 1000 -G openwind -s /bin/sh -D openwind

WORKDIR /app

COPY --from=build --chown=openwind:openwind /app/dist ./dist
COPY --from=build --chown=openwind:openwind /app/node_modules ./node_modules
COPY --from=build --chown=openwind:openwind /app/package.json ./package.json

RUN mkdir -p /home/openwind/.openwind/logs \
             /home/openwind/.openwind/tmp \
             /home/openwind/.openwind/exports \
             /home/openwind/.openwind/vault && \
    chown -R openwind:openwind /home/openwind/.openwind

USER openwind

ENV NODE_ENV=production

ENTRYPOINT ["node", "dist/cli.js"]
