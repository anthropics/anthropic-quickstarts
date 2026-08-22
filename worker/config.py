"""Runtime configuration for the worker, read from the environment."""

import os
from dataclasses import dataclass

from worker.upstream import APIProvider, ThinkingEffort, ThinkingMode, ToolVersion

# Upstream's default Anthropic model, and the settings streamlit.py pairs with
# it (claude-opus-4-8 resolves to its CLAUDE_4_7 config). Duplicated here rather
# than imported so the worker does not depend on the Streamlit module it
# replaces; the backend can override any of it per deployment.
DEFAULT_MODEL = "claude-opus-4-8"
DEFAULT_TOOL_VERSION: ToolVersion = "computer_use_20251124"
DEFAULT_MAX_TOKENS = 1024 * 16
DEFAULT_THINKING_MODE: ThinkingMode = "adaptive"
DEFAULT_THINKING_EFFORT: ThinkingEffort = "medium"


def _int_or_none(raw: str | None) -> int | None:
    if raw is None or raw.strip() == "":
        return None
    return int(raw)


@dataclass(frozen=True)
class WorkerConfig:
    api_key: str = ""
    model: str = DEFAULT_MODEL
    provider: APIProvider = APIProvider.ANTHROPIC
    tool_version: ToolVersion = DEFAULT_TOOL_VERSION
    max_tokens: int = DEFAULT_MAX_TOKENS
    thinking_mode: ThinkingMode = DEFAULT_THINKING_MODE
    thinking_effort: ThinkingEffort = DEFAULT_THINKING_EFFORT
    system_prompt_suffix: str = ""
    only_n_most_recent_images: int | None = None

    @classmethod
    def from_env(cls) -> "WorkerConfig":
        return cls(
            api_key=os.environ.get("ANTHROPIC_API_KEY", ""),
            model=os.environ.get("WORKER_MODEL", DEFAULT_MODEL),
            provider=APIProvider(os.environ.get("API_PROVIDER", APIProvider.ANTHROPIC)),
            tool_version=os.environ.get("WORKER_TOOL_VERSION", DEFAULT_TOOL_VERSION),  # type: ignore[arg-type]
            max_tokens=int(os.environ.get("WORKER_MAX_TOKENS", DEFAULT_MAX_TOKENS)),
            thinking_mode=os.environ.get("WORKER_THINKING_MODE", DEFAULT_THINKING_MODE),  # type: ignore[arg-type]
            thinking_effort=os.environ.get(
                "WORKER_THINKING_EFFORT", DEFAULT_THINKING_EFFORT
            ),  # type: ignore[arg-type]
            system_prompt_suffix=os.environ.get("WORKER_SYSTEM_PROMPT_SUFFIX", ""),
            only_n_most_recent_images=_int_or_none(
                os.environ.get("WORKER_ONLY_N_MOST_RECENT_IMAGES")
            ),
        )
