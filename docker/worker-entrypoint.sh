#!/bin/bash
# Brings up the desktop the way the base image does, then serves the worker
# instead of Streamlit. The base image's static combined page is not started:
# the backend serves the frontend, and noVNC is reached through it.
set -e

./start_all.sh
./novnc_startup.sh

echo "Agent worker listening on ${WORKER_PORT:-8000}"

exec python -m uvicorn worker.main:app \
    --host 0.0.0.0 \
    --port "${WORKER_PORT:-8000}"
