# syntax=docker/dockerfile:1.7

ARG OPENLABOS_VERSION=0.0.0-dev
ARG GIT_REVISION=unknown

FROM python:3.12-slim-bookworm

LABEL org.opencontainers.image.title="OpenLabOS Perception" \
      org.opencontainers.image.description="OpenLabOS entity segmentation sidecar" \
      org.opencontainers.image.url="https://github.com/Caerii/OpenLabOS" \
      org.opencontainers.image.source="https://github.com/Caerii/OpenLabOS" \
      org.opencontainers.image.vendor="OpenLabOS" \
      org.opencontainers.image.licenses="Apache-2.0" \
      org.opencontainers.image.version="${OPENLABOS_VERSION}" \
      org.opencontainers.image.revision="${GIT_REVISION}" \
      openlabos.component="perception"

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PATH="/opt/openlabos-venv/bin:${PATH}"

WORKDIR /app

RUN python -m venv /opt/openlabos-venv
COPY services/perception/requirements-smoke.txt ./requirements.txt
RUN --mount=type=cache,target=/root/.cache/pip \
    /opt/openlabos-venv/bin/python -m pip install --requirement requirements.txt

COPY services/perception/app.py ./app.py

RUN useradd --create-home --uid 10001 openlabos \
    && chown -R openlabos:openlabos /app

USER openlabos

EXPOSE 8002

HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=5 \
  CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8002/health', timeout=2)"]

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8002", "--no-access-log"]
