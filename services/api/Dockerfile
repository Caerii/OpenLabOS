# syntax=docker/dockerfile:1.7

ARG OPENLABOS_VERSION=0.0.0-dev
ARG GIT_REVISION=unknown

FROM node:22-bookworm-slim AS build

ENV PNPM_HOME=/pnpm
ENV PATH="${PNPM_HOME}:${PATH}"

RUN corepack enable

WORKDIR /workspace
COPY . .

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile
RUN pnpm --filter @openlabos/protocol build \
    && pnpm --filter @openlabos/preview build \
    && pnpm --filter @openlabos/sdk-ts build \
    && pnpm --filter @openlabos/device-android build \
    && pnpm --filter @openlabos/api build \
    && pnpm --filter @openlabos/web build \
    && mkdir -p services/api/client \
    && cp -R apps/web/dist/. services/api/client/

FROM node:22-bookworm-slim AS runtime

ARG OPENLABOS_VERSION=0.0.0-dev
ARG GIT_REVISION=unknown
LABEL org.opencontainers.image.title="OpenLabOS API" \
      org.opencontainers.image.description="OpenLabOS coordination API and operator console" \
      org.opencontainers.image.url="https://github.com/Caerii/OpenLabOS" \
      org.opencontainers.image.source="https://github.com/Caerii/OpenLabOS" \
      org.opencontainers.image.vendor="OpenLabOS" \
      org.opencontainers.image.licenses="Apache-2.0" \
      org.opencontainers.image.version="${OPENLABOS_VERSION}" \
      org.opencontainers.image.revision="${GIT_REVISION}" \
      openlabos.component="api"

ENV NODE_ENV=production
ENV OPENLABOS_API_HOST=0.0.0.0
ENV OPENLABOS_API_PORT=3847
ENV CLOUD_MODE=true

WORKDIR /workspace

COPY --from=build --chown=node:node /workspace/node_modules ./node_modules
COPY --from=build --chown=node:node /workspace/packages ./packages
COPY --from=build --chown=node:node /workspace/adapters/device-android ./adapters/device-android
COPY --from=build --chown=node:node /workspace/services/api/node_modules ./services/api/node_modules
COPY --from=build --chown=node:node /workspace/services/api/package.json ./services/api/package.json
COPY --from=build --chown=node:node /workspace/services/api/dist ./services/api/dist
COPY --from=build --chown=node:node /workspace/services/api/client ./services/api/client

RUN mkdir -p /workspace/services/api/artifacts /workspace/services/api/data \
    && chown -R node:node /workspace/services/api/artifacts /workspace/services/api/data

USER node
WORKDIR /workspace/services/api

EXPOSE 3847

HEALTHCHECK --interval=10s --timeout=3s --start-period=15s --retries=5 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3847/api/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]

CMD ["node", "dist/index.js"]
