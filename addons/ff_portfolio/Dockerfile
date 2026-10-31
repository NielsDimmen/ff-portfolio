FROM node:22-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive \
    NODE_ENV=production \
    HA_DATA=/data \
    TZ=Europe/Amsterdam \
    LANG=C.UTF-8 \
    LC_ALL=C.UTF-8

RUN apt-get update && apt-get install -y --no-install-recommends \
      tini \
      ca-certificates \
      tar \
      gzip \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/ha
COPY ha-gateway.mjs read-options.mjs run.sh ./
RUN chmod +x /opt/ha/run.sh

EXPOSE 8080 9099

ENTRYPOINT ["tini", "--"]
CMD ["/opt/ha/run.sh"]
