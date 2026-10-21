# Copyright 2026 Oliver Weinrich
# SPDX-License-Identifier: Apache-2.0
ARG ALPINE_IMAGE
FROM ${ALPINE_IMAGE}
RUN apk add --no-cache bash abuild curl grep tar xz zstd
COPY collect-sources.sh /usr/local/bin/collect-sources
ENTRYPOINT ["/bin/bash", "/usr/local/bin/collect-sources"]
