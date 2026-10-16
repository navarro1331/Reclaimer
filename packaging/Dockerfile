FROM node:24.14.1-bookworm-slim@sha256:b506e7321f176aae77317f99d67a24b272c1f09f1d10f1761f2773447d8da26c
WORKDIR /opt/reclaimer
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund
COPY lib ./lib
COPY bridge ./bridge
COPY skills ./skills
COPY third-party ./third-party
COPY THIRD_PARTY_NOTICES.md ./
COPY scripts ./scripts
COPY config ./config
COPY docs ./docs
COPY packaging/worker-entry.mjs ./packaging/worker-entry.mjs
USER 1000:1000
ENTRYPOINT ["node", "/opt/reclaimer/packaging/worker-entry.mjs"]
