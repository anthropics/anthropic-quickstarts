#!/usr/bin/env bash
# Create this demo's Managed Agents resources with the ant CLI and save their
# IDs to .env. Re-run after editing the YAML to update them in place.
set -euo pipefail
cd "$(dirname "$0")/.."

[ -f .env ] || cp .env.example .env
set -a; . ./.env; set +a

if [ -z "${CLAUDE_MEMORY_STORE_ID:-}" ]; then
  CLAUDE_MEMORY_STORE_ID=$(ant beta:memory-stores create --transform id --raw-output < agents/memory-demo/memory-store.yaml)
  printf '\nCLAUDE_MEMORY_STORE_ID=%s\n' "$CLAUDE_MEMORY_STORE_ID" >> .env
  echo "memory store: created $CLAUDE_MEMORY_STORE_ID"
else
  ant beta:memory-stores update --memory-store-id "$CLAUDE_MEMORY_STORE_ID" < agents/memory-demo/memory-store.yaml > /dev/null
  echo "memory store: updated $CLAUDE_MEMORY_STORE_ID"
fi

if [ -z "${CLAUDE_ENVIRONMENT_ID:-}" ]; then
  CLAUDE_ENVIRONMENT_ID=$(ant beta:environments create --transform id --raw-output < agents/memory-demo/environment.yaml)
  printf '\nCLAUDE_ENVIRONMENT_ID=%s\n' "$CLAUDE_ENVIRONMENT_ID" >> .env
  echo "environment: created $CLAUDE_ENVIRONMENT_ID (mint its key in the Console and set ANTHROPIC_ENVIRONMENT_KEY in .env)"
else
  ant beta:environments update --environment-id "$CLAUDE_ENVIRONMENT_ID" < agents/memory-demo/environment.yaml > /dev/null
  echo "environment: updated $CLAUDE_ENVIRONMENT_ID"
fi

if [ -z "${CLAUDE_AGENT_ID:-}" ]; then
  CLAUDE_AGENT_ID=$(ant beta:agents create --transform id --raw-output < agents/memory-demo/agent.yaml)
  printf '\nCLAUDE_AGENT_ID=%s\n' "$CLAUDE_AGENT_ID" >> .env
  echo "agent: created $CLAUDE_AGENT_ID"
else
  version=$(ant beta:agents update --agent-id "$CLAUDE_AGENT_ID" --transform version --raw-output < agents/memory-demo/agent.yaml)
  echo "agent: updated $CLAUDE_AGENT_ID (version $version)"
fi
