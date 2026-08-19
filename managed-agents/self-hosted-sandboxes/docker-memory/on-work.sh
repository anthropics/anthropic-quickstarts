#!/usr/bin/env bash
# Invoked by `ant beta:worker poll --on-work` once per claimed work item.
#
# The poller passes ANTHROPIC_{WORK_ID,ENVIRONMENT_ID,SESSION_ID,ENVIRONMENT_KEY}
# in the environment and the work item JSON on stdin. This script is where
# the credentials split: it takes the per-session `secret` off that JSON and
# runs a per-session container that gets ONLY the secret. The environment
# key stops here, on the host.
#
# The container runs in the foreground: the poller stops a work item as soon
# as this script returns, so the script stays attached until the container
# idles out and exits. One poller therefore serves one session at a time,
# and the container's log streams into the poller's output.
set -euo pipefail

: "${ANTHROPIC_SESSION_ID:?on-work: ANTHROPIC_SESSION_ID not set by poller}"
: "${ANTHROPIC_ENVIRONMENT_ID:?on-work: ANTHROPIC_ENVIRONMENT_ID not set by poller}"
: "${ANTHROPIC_WORK_ID:?on-work: ANTHROPIC_WORK_ID not set by poller}"
: "${ANTHROPIC_ENVIRONMENT_KEY:?on-work: ANTHROPIC_ENVIRONMENT_KEY not set by poller}"

SECRET="$(jq -r '.secret // empty')"  # the work JSON on stdin
IMAGE="${SANDBOX_IMAGE:-shs-docker-memory}"
NAME="shs-mem-${ANTHROPIC_SESSION_ID}"  # session ids are docker-name-safe
VOLUME="shs-mem-ws-${ANTHROPIC_SESSION_ID}"

# A duplicate work item for a session another poller on this host is
# already serving: leave that container alone.
if [ -n "$(docker ps -q --filter "name=^${NAME}$" 2>/dev/null)" ]; then
  echo "[on-work] session=${ANTHROPIC_SESSION_ID} already has a live container; skipping" >&2
  exit 0
fi

# No secret means no per-session token, and this demo never hands the
# environment key to a container, so the container would have no credential
# at all. Fail the item loudly (the poller stops it when we return).
if [ -z "$SECRET" ]; then
  echo "[on-work] work=${ANTHROPIC_WORK_ID} carried no per-session secret: this environment does not issue them, use ../docker instead" >&2
  exit 1
fi

docker rm -f "$NAME" >/dev/null 2>&1 || true  # clear any exited leftover

# --rm, attached: the container owns the session from here (memory download
# and sync, tools, lease heartbeat, force-stop when it idles out) and this
# script returns when it exits. /workspace persists on a per-session volume.
# Memory deliberately does not: every container downloads its stores fresh
# and syncs back, and the server is the source of truth.
# SANDBOX_DOCKER_RUN_ARGS adds `docker run` flags (resource limits, networks).
echo "[on-work] session=${ANTHROPIC_SESSION_ID} work=${ANTHROPIC_WORK_ID} container=${NAME} (starting)" >&2
# shellcheck disable=SC2086
docker run --rm --name "$NAME" \
  -v "${VOLUME}:/workspace" \
  -e "ANTHROPIC_BASE_URL=${ANTHROPIC_BASE_URL:-https://api.anthropic.com}" \
  -e "ANTHROPIC_SESSION_ID=${ANTHROPIC_SESSION_ID}" \
  -e "ANTHROPIC_ENVIRONMENT_ID=${ANTHROPIC_ENVIRONMENT_ID}" \
  -e "ANTHROPIC_WORK_ID=${ANTHROPIC_WORK_ID}" \
  -e "ANTHROPIC_WORK_SECRET=${SECRET}" \
  ${SANDBOX_DOCKER_RUN_ARGS:-} \
  "$IMAGE"
echo "[on-work] session=${ANTHROPIC_SESSION_ID} container exited" >&2
