# Copyright 2026 Oliver Weinrich
# SPDX-License-Identifier: Apache-2.0
FROM scratch
ARG VERSION
LABEL org.opencontainers.image.title="Tunlivo source and license archives" \
      org.opencontainers.image.version="$VERSION" \
      org.opencontainers.image.authors="Oliver Weinrich" \
      org.opencontainers.image.source="https://github.com/oliverweinrich/tunlivo" \
      org.opencontainers.image.description="Source-only image. Extract /sources with docker create and docker cp; do not run." \
      org.opencontainers.image.licenses="Apache-2.0 AND LicenseRef-ThirdParty"
COPY *.tar.gz packages.tsv SHA256SUMS Dockerfile /sources/
CMD ["/sources-only-do-not-run"]
