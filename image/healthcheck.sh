#!/bin/sh
# Copyright 2026 Oliver Weinrich
# SPDX-License-Identifier: Apache-2.0

set -eu
test -f /run/gateway/ready
wg show wg0 >/dev/null
ip link show wg0 | grep -q 'UP'
test -f /run/gateway/nginx.pid
kill -0 "$(cat /run/gateway/nginx.pid)"
