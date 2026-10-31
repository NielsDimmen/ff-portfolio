# Linux bundle for /data/app. Built on the Mac with Docker, then pushed
# through the gateway. The add-on image itself stays small.
FROM node:22-bookworm-slim AS build

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 \
      make \
      g++ \
      ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /work
COPY package.json package-lock.json ./
COPY app ./app
COPY brand ./brand
RUN npm ci && npm run build:admin && npm cache clean --force

FROM scratch
COPY --from=build /work /
