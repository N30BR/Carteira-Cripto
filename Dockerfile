# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# Os módulos nativos (better-sqlite3, argon2) já vêm compilados; sem scripts o npm
# não tenta recompilar com node-gyp (que exigiria python/g++ na imagem).
RUN npm ci --ignore-scripts \
 && (node -e "require('@node-rs/argon2')" \
     || npm i --no-save --ignore-scripts "@node-rs/argon2-linux-$(uname -m | sed 's/x86_64/x64/;s/aarch64/arm64/')-gnu")

FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# O next.config é lido no build: o domínio precisa estar disponível aqui (Build Args no Easypanel).
ARG APP_DOMAIN
ENV APP_DOMAIN=$APP_DOMAIN
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DATABASE_PATH=/app/data/app.db

COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/scripts/backup.mjs ./scripts/backup.mjs
COPY --from=build /app/docker/entrypoint.sh ./docker/entrypoint.sh

# Garante que os módulos nativos funcionam na imagem final; se o tracing do Next
# não os copiou, copia direto de node_modules.
COPY --from=deps /app/node_modules/better-sqlite3 /tmp/fallback/better-sqlite3
COPY --from=deps /app/node_modules/@node-rs /tmp/fallback/@node-rs
RUN (node -e "require('better-sqlite3')(':memory:');require('@node-rs/argon2')" \
     || (cp -r /tmp/fallback/better-sqlite3 node_modules/ && mkdir -p node_modules/@node-rs && cp -r /tmp/fallback/@node-rs/. node_modules/@node-rs/)) \
 && node -e "require('better-sqlite3')(':memory:');require('@node-rs/argon2');console.log('módulos nativos ok')" \
 && rm -rf /tmp/fallback \
 && chmod +x docker/entrypoint.sh \
 && mkdir -p /app/data && chown -R node:node /app/data

EXPOSE 3000
ENTRYPOINT ["/app/docker/entrypoint.sh"]
CMD ["node", "server.js"]
