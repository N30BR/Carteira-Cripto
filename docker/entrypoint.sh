#!/bin/sh
set -e
# O volume do Easypanel costuma ser montado como root; ajusta o dono e roda o app como "node".
mkdir -p /app/data
chown -R node:node /app/data
exec setpriv --reuid=node --regid=node --init-groups "$@"
