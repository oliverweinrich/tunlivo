# Copyright 2026 Oliver Weinrich
# SPDX-License-Identifier: Apache-2.0
FROM --platform=$BUILDPLATFORM golang:1.27.2-alpine@sha256:f92b6ef800e499660581efdabdf25d9d817a9d124eaf900924f0504e7e27e12d AS pairing
ARG TARGETOS
ARG TARGETARCH
WORKDIR /src
COPY pairing/ ./
RUN go test ./...
RUN CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH go build -trimpath -ldflags='-s -w' -o /gateway-pair .
RUN mkdir /go-notices && cd /usr/local/go && cp LICENSE PATENTS /go-notices/ && find src -type f \( -iname 'LICENSE*' -o -iname 'COPYING*' -o -iname 'NOTICE*' \) -exec cp --parents '{}' /go-notices/ \;

FROM alpine:3.23@sha256:85fe1e81d6758c208f3e1eed4338a1997e19d4be002d4dd32d3100c9a8c010a0 AS runtime
RUN apk upgrade --no-cache \
    && apk add --no-cache bash iproute2 netcat-openbsd wireguard-tools nginx nginx-mod-stream
COPY entrypoint.sh healthcheck.sh configure.sh /usr/local/bin/
COPY --from=pairing /gateway-pair /usr/local/bin/gateway-pair
COPY --from=pairing /go-notices/ /usr/share/licenses/tunlivo/go/
COPY legal/ /usr/share/licenses/tunlivo/
COPY inventory.awk /usr/local/share/tunlivo/inventory.awk
RUN chmod 755 /usr/local/bin/entrypoint.sh /usr/local/bin/healthcheck.sh /usr/local/bin/configure.sh \
    && awk -f /usr/local/share/tunlivo/inventory.awk /lib/apk/db/installed > /usr/share/licenses/tunlivo/packages.tsv \
    && sha256sum /usr/local/bin/gateway-pair /usr/local/bin/entrypoint.sh /usr/local/bin/healthcheck.sh /usr/local/bin/configure.sh /usr/local/share/tunlivo/inventory.awk > /usr/share/licenses/tunlivo/runtime-files.sha256
ARG VERSION=dev
LABEL org.opencontainers.image.title="Tunlivo" \
      org.opencontainers.image.description="Independent TCP/UDP gateway using WireGuard and nginx" \
      org.opencontainers.image.version="$VERSION" \
      org.opencontainers.image.source="https://github.com/oliverweinrich/tunlivo" \
      org.opencontainers.image.authors="Oliver Weinrich" \
      org.opencontainers.image.licenses="Apache-2.0 AND LicenseRef-ThirdParty"
HEALTHCHECK --interval=5s --timeout=3s --start-period=5s --retries=3 \
  CMD ["/usr/local/bin/healthcheck.sh"]
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]

# Export matching package metadata and the exact Go standard-library sources.
FROM scratch AS release-sources
COPY --from=runtime /usr/share/licenses/tunlivo/ /licenses/
COPY --from=runtime /usr/share/licenses/tunlivo/packages.tsv /packages.tsv
COPY --from=runtime /usr/share/licenses/tunlivo/runtime-files.sha256 /runtime-files.sha256
COPY --from=pairing /usr/local/go/src/ /go/src/
COPY --from=pairing /usr/local/go/lib/ /go/lib/
COPY --from=pairing /usr/local/go/LICENSE /usr/local/go/PATENTS /usr/local/go/VERSION /go/

# Keep the default target as the runtime image, not the source export.
FROM runtime AS final
