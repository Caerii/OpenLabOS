# syntax=docker/dockerfile:1.7

ARG OPENLABOS_VERSION=0.0.0-dev
ARG GIT_REVISION=unknown

FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim

LABEL org.opencontainers.image.title="OpenLabOS Inference" \
      org.opencontainers.image.description="OpenLabOS reasoning gateway" \
      org.opencontainers.image.url="https://github.com/Caerii/OpenLabOS" \
      org.opencontainers.image.source="https://github.com/Caerii/OpenLabOS" \
      org.opencontainers.image.vendor="OpenLabOS" \
      org.opencontainers.image.licenses="Apache-2.0" \
      org.opencontainers.image.version="${OPENLABOS_VERSION}" \
      org.opencontainers.image.revision="${GIT_REVISION}" \
      openlabos.component="inference"

ENV UV_COMPILE_BYTECODE=1
ENV UV_LINK_MODE=copy
ENV OPENLABOS_INFERENCE_HOST=0.0.0.0
ENV OPENLABOS_INFERENCE_PORT=8001

WORKDIR /app

COPY services/inference/pyproject.toml services/inference/uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev --no-install-project

COPY services/inference/openlabos_inference ./openlabos_inference
COPY services/inference/README.md ./README.md
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev

RUN useradd --create-home --uid 10001 openlabos \
    && chown -R openlabos:openlabos /app

USER openlabos

EXPOSE 8001

HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=5 \
  CMD ["/app/.venv/bin/python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8001/v1/healthz', timeout=2)"]

CMD ["/app/.venv/bin/openlabos-inference"]
