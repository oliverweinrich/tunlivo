# Copyright 2026 Oliver Weinrich
# SPDX-License-Identifier: Apache-2.0
FROM alpine:3.24@sha256:294b683cb724975bec92580e1e685676bd4b50bda910ddb8c51d4cabeaec77e6 AS runtime
RUN apk upgrade --no-cache \
    && apk add --no-cache bash iproute2 netcat-openbsd wireguard-tools nginx nginx-mod-stream nodejs openssl flock
COPY image/runtime/ /opt/tunlivo/image/runtime/
COPY tests/runtime/ /opt/tunlivo/tests/runtime/
COPY image/legal/ /usr/share/licenses/tunlivo/
RUN chmod 755 /opt/tunlivo/image/runtime/pair.mts \
    && ln -s /opt/tunlivo/image/runtime/pair.mts /usr/local/bin/gateway-pair \
    && node /opt/tunlivo/image/runtime/inventory.mts /lib/apk/db/installed > /usr/share/licenses/tunlivo/packages.tsv \
    && sha256sum /opt/tunlivo/image/runtime/gateway.mts /opt/tunlivo/image/runtime/pair.mts /opt/tunlivo/image/runtime/inventory.mts > /usr/share/licenses/tunlivo/runtime-files.sha256
ARG VERSION=dev
LABEL org.opencontainers.image.title="Tunlivo" \
      org.opencontainers.image.description="Independent TCP/UDP gateway using WireGuard and nginx" \
      org.opencontainers.image.version="$VERSION" \
      org.opencontainers.image.source="https://github.com/oliverweinrich/tunlivo" \
      org.opencontainers.image.authors="Oliver Weinrich" \
      org.opencontainers.image.licenses="Apache-2.0 AND LicenseRef-ThirdParty"
HEALTHCHECK --interval=5s --timeout=3s --start-period=5s --retries=3 \
  CMD ["node", "/opt/tunlivo/image/runtime/gateway.mts", "health"]
ENTRYPOINT ["node", "/opt/tunlivo/image/runtime/gateway.mts", "start"]

# Export matching package metadata for all Alpine runtime packages, including Node.js.
FROM scratch AS release-sources
COPY --from=runtime /usr/share/licenses/tunlivo/packages.tsv /packages.tsv
COPY --from=runtime /usr/share/licenses/tunlivo/runtime-files.sha256 /runtime-files.sha256
# Keep the default target as the runtime image, not the source export.
FROM runtime AS final
