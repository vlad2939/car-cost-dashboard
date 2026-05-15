#!/usr/bin/with-contenv bashio
set -e

export PORT="${PORT:-3000}"
export DATA_DIR="${DATA_DIR:-/data/car-cost-dashboard}"

mkdir -p "${DATA_DIR}"

bashio::log.info "Starting Car Cost Dashboard on port ${PORT}"
bashio::log.info "Persistent data directory: ${DATA_DIR}"

exec node /app/server.js
