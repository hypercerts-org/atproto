#!/bin/sh
set -e

# Fix permissions on data directory (Railway volumes may mount with wrong ownership)
if [ -d /app/data ]; then
  chown -R node:node /app/data 2>/dev/null || true
  chmod -R 755 /app/data 2>/dev/null || true
fi

# Ensure data directory exists
mkdir -p /app/data
chown -R node:node /app/data
chmod 755 /app/data

# Switch to node user and run the command
exec su-exec node "$@"

