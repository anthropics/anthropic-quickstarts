#!/usr/bin/env bash
# Invoked by `ant beta:worker poll --on-work` once per claimed work item.
#
# The poller passes ANTHROPIC_{WORK_ID,ENVIRONMENT_ID,SESSION_ID,ENVIRONMENT_KEY}
# in the environment and the raw work JSON on stdin (drained, unused here).
# ANTHROPIC_BASE_URL is inherited from the poller process.
#
# Per work item this runs a per-session Docker container whose ENTRYPOINT is
# `ant beta:worker run`, with a per-session volume mounted at /workspace. The
# container runs in the foreground: the poller stops a work item as soon as
# this script returns, so the script stays attached until the container idles
# out and exits. One poller therefore serves one session at a time, and the
# container's log streams into the poller's output.
set -euo pipefail

cat >/dev/null  # drain the work JSON on stdin

: "${ANTHROPIC_SESSION_ID:?on-work: ANTHROPIC_SESSION_ID not set by poller}"
: "${ANTHROPIC_ENVIRONMENT_ID:?on-work: ANTHROPIC_ENVIRONMENT_ID not set by poller}"
: "${ANTHROPIC_WORK_ID:?on-work: ANTHROPIC_WORK_ID not set by poller}"
: "${ANTHROPIC_ENVIRONMENT_KEY:?on-work: ANTHROPIC_ENVIRONMENT_KEY not set by poller}"

IMAGE="${SANDBOX_IMAGE:-shs-docker}"
NAME="shs-${ANTHROPIC_SESSION_ID}"     # session ids are docker-name-safe
VOLUME="shs-ws-${ANTHROPIC_SESSION_ID}"

# A duplicate work item for a session another poller on this host is already
# serving: leave that container alone.
if [ -n "$(docker ps -q --filter "name=^${NAME}$" 2>/dev/null)" ]; then
  echo "[on-work] session=${ANTHROPIC_SESSION_ID} already has a live container; skipping" >&2
  exit 0
fi
docker rm -f "$NAME" >/dev/null 2>&1 || true  # clear any exited leftover

# --rm, attached: the container owns the session from here (heartbeat, event
# stream, tool dispatch, force-stop when it idles out) and this script returns
# when it exits. SANDBOX_DOCKER_RUN_ARGS adds `docker run` flags (resource
# limits, networks).
echo "[on-work] session=${ANTHROPIC_SESSION_ID} work=${ANTHROPIC_WORK_ID} container=${NAME} (starting)" >&2
# shellcheck disable=SC2086
docker run --rm --name "$NAME" \
  -v "${VOLUME}:/workspace" \
  -e "ANTHROPIC_BASE_URL=${ANTHROPIC_BASE_URL:-https://api.anthropic.com}" \
  -e "ANTHROPIC_ENVIRONMENT_KEY=${ANTHROPIC_ENVIRONMENT_KEY}" \
  -e "ANTHROPIC_SESSION_ID=${ANTHROPIC_SESSION_ID}" \
  -e "ANTHROPIC_ENVIRONMENT_ID=${ANTHROPIC_ENVIRONMENT_ID}" \
  -e "ANTHROPIC_WORK_ID=${ANTHROPIC_WORK_ID}" \
  ${SANDBOX_DOCKER_RUN_ARGS:-} \
  "$IMAGE"
echo "[on-work] session=${ANTHROPIC_SESSION_ID} container exited" >&2
