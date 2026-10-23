# Copyright 2026 Oliver Weinrich
# SPDX-License-Identifier: Apache-2.0
ARG ALPINE_IMAGE
FROM ${ALPINE_IMAGE}
RUN apk add --no-cache bash abuild curl grep tar xz zstd nodejs
WORKDIR /tools
COPY release/ /tools/release/
COPY scripts/lib.mts /tools/scripts/lib.mts
COPY tests/tooling/release/ /tools/tests/tooling/release/
ENTRYPOINT ["node", "release/collect-sources.mts"]
