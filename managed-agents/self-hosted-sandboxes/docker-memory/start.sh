#!/usr/bin/env bash
# Host-side launcher for the memory-enabled Docker demo.
#
# Builds the per-session image, then runs `ant beta:worker poll` on the host
# with --on-work pointed at on-work.sh, which `docker run`s one container per
# claimed session. The poller only claims work. It never runs tools, and it
# is the only process that ever holds the environment key.
#
# Requires: docker, jq, and `ant` on PATH.
#
# Reads .env (written by ./agents/setup.sh) when present; a value set there
# wins over the same variable exported in the shell. On a sandbox host that is
# not the machine you ran setup on, skip .env and export these instead:
#   ANTHROPIC_ENVIRONMENT_ID   - the self-hosted environment id (env_...);
#                                defaults to CLAUDE_ENVIRONMENT_ID from .env
#   ANTHROPIC_ENVIRONMENT_KEY  - the environment key, minted in the Console.
#                                Stays in the poller; never enters a container.
#   ANTHROPIC_BASE_URL         - optional, default https://api.anthropic.com
set -euo pipefail
cd "$(dirname "$0")"

if [ -f .env ]; then set -a; . ./.env; set +a; fi
export ANTHROPIC_ENVIRONMENT_ID="${ANTHROPIC_ENVIRONMENT_ID:-${CLAUDE_ENVIRONMENT_ID:-}}"
: "${ANTHROPIC_ENVIRONMENT_ID:?run ./agents/setup.sh first, or export ANTHROPIC_ENVIRONMENT_ID (env_...)}"
: "${ANTHROPIC_ENVIRONMENT_KEY:?set ANTHROPIC_ENVIRONMENT_KEY in .env (mint it in the Console for ${ANTHROPIC_ENVIRONMENT_ID})}"
export ANTHROPIC_ENVIRONMENT_KEY
export ANTHROPIC_BASE_URL="${ANTHROPIC_BASE_URL:-https://api.anthropic.com}"
# The poller authenticates with the environment key alone. An org API key
# from .env has no business in the sandbox host's process tree.
unset ANTHROPIC_API_KEY ANTHROPIC_AUTH_TOKEN

for bin in docker jq ant; do
  command -v "$bin" >/dev/null || { echo "$bin not found on PATH (see the README)" >&2; exit 1; }
done

IMAGE="${SANDBOX_IMAGE:-shs-docker-memory}"
echo "[start] building ${IMAGE}"
docker build -t "$IMAGE" .

echo "[start] polling env=${ANTHROPIC_ENVIRONMENT_ID} base=${ANTHROPIC_BASE_URL}"
# --on-work delegates each work item to on-work.sh (SANDBOX_IMAGE/ANTHROPIC_*
# are inherited). The poll side runs no tools, so its --workdir is unused;
# point it at a throwaway. Exits cleanly on SIGTERM/SIGINT.
exec env SANDBOX_IMAGE="$IMAGE" \
  ant beta:worker poll \
    --on-work "$PWD/on-work.sh" \
    --workdir /tmp \
    --log-format text
