# Tunlivo: third-party notices

Tunlivo is independently developed software. Its original code is licensed
under Apache-2.0. The container is an aggregation of separately licensed
programs; Apache-2.0 does not override their respective licenses.

## Included software

The runtime image contains an Alpine Linux userland, the original WireGuard
command-line tools, nginx and its stream module, Bash, iproute2, OpenBSD
netcat, Node.js, OpenSSL, flock and supporting libraries. The gateway
application is written in TypeScript and executed by Node.js. The Linux kernel and its WireGuard implementation are supplied by the host, not by
this image. No official WireGuard logo is used.

The exact package names, versions, Alpine source origins, license expressions,
build commits and architectures are recorded in each release's inventory.
Subpackages can share the same source origin. Examples include:

| Component                       | License / source                                                            |
| ------------------------------- | --------------------------------------------------------------------------- |
| WireGuard tools                 | GPL-2.0-only; https://git.zx2c4.com/wireguard-tools/                        |
| nginx                           | BSD-2-Clause; https://nginx.org/                                            |
| Bash and Readline               | GPL-3.0-or-later; https://www.gnu.org/                                      |
| BusyBox                         | GPL-2.0-only; https://busybox.net/                                          |
| iproute2                        | GPL-2.0-or-later; https://www.kernel.org/pub/linux/utils/net/iproute2/      |
| Node.js | MIT and bundled third-party notices; https://nodejs.org/ |
| OpenSSL | Apache-2.0; https://www.openssl.org/ |
| flock (util-linux) | Package-specific license; see the version-specific Alpine inventory |
| Remaining Alpine packages       | Individual licenses; see the version-specific inventory and source archive  |

## License texts and source distribution

The release workflow collects the exact Alpine APKBUILD recipes at their
recorded build commits, local patches, upstream source archives and license
files. Attribution and license terms embedded in source-file headers are
also preserved verbatim in per-package `source-notices.tar.gz` bundles.
Archives are verified against the checksums in the package recipes.
Node.js and its bundled dependency sources/notices are collected from the exact Alpine Node.js package recipe alongside the other runtime packages. No runtime npm modules are installed.
Tunlivo's source and build scripts are included separately in the archive.

Before distributing an image, publish its matching complete source archive,
license bundle, package inventories and checksums at the release location
shown on Docker Hub. Keep those files available for the distributed image.
Do not substitute a generic upstream homepage for version-matching sources.
No promise to provide source "on request" is used by this project.

The runtime image includes license texts and collected copyright notices at
`/usr/share/licenses/tunlivo/`, along with source-distribution information.
The source archive is distributed alongside the image, not embedded in it.
A build without a completed, matching release bundle is not ready for publication.

## Names and trademarks

Tunlivo is the product name. References to WireGuard identify the actual
upstream software distributed in the image; they do not imply endorsement.
"WireGuard" and the "WireGuard" logo are registered trademarks of
Jason A. Donenfeld. https://www.wireguard.com/

This file documents the technical distribution process. It is not a legal
opinion or a statement of trademark clearance for the Tunlivo name.
