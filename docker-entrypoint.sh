#!/bin/sh
set -e

mkdir -p /app/videos /app/tmp /app/output

# Bind mounts from the host are often root-owned; the app runs as node (uid 1000).
chown -R node:node /app/videos /app/tmp /app/output

exec gosu node "$@"
