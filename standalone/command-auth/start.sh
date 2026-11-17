#!/bin/sh
set -e

umask 077

# Railway injects PORT; default to 8080 for local testing
PORT="${PORT:-8080}"
export PORT

# Substitute only ${PORT} — leave nginx variables like $host and $remote_addr intact
envsubst '${PORT}' < /etc/nginx/nginx.conf.template > /etc/nginx/nginx.conf

# Temp directories nginx needs to write (container may run as non-root)
mkdir -p /tmp/nginx_client_body /tmp/nginx_proxy /tmp/nginx_fastcgi /tmp/nginx_uwsgi /tmp/nginx_scgi

# Ensure the data directory is locked down (Railway volume mount may reset perms)
chmod 700 /data 2>/dev/null || true

# Start nginx in the background
nginx -g "daemon off;" &

# Start the auth gateway — when this exits the container exits (Railway restarts it)
exec node /app/server.mjs
