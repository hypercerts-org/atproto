#!/bin/sh
set -e

# Railway sets PORT environment variable, map it to PDS_PORT if not already set
if [ -n "$PORT" ] && [ -z "$PDS_PORT" ]; then
  export PDS_PORT="$PORT"
fi

# Fix permissions for data directory if it exists and is mounted
# This handles Railway volume mounts that may have wrong permissions
if [ -n "$PDS_DATA_DIRECTORY" ]; then
  # Ensure the directory exists
  mkdir -p "$PDS_DATA_DIRECTORY"

  # Fix ownership if we're running as root (before USER directive)
  # or if we have sudo access
  if [ "$(id -u)" = "0" ]; then
    chown -R node:node "$PDS_DATA_DIRECTORY"
    chmod -R 755 "$PDS_DATA_DIRECTORY"
  fi
fi

# If running as root, switch to node user and exec the command
if [ "$(id -u)" = "0" ]; then
  exec su-exec node "$@"
else
  # Already running as node user, just exec
  exec "$@"
fi

