"""The single import seam with Anthropic's computer-use stack.

`computer-use-demo/` is not an installable package: its `pyproject.toml`
declares only tooling config, and the hyphenated directory name means
`computer_use_demo` cannot be imported from the repo root. Rather than fork
upstream to add packaging metadata, the directory is placed on `sys.path` here,
once, and every upstream name the worker needs is re-exported from this module.

Keeping the coupling in one file means an upstream reshuffle breaks a single
import site rather than scattering through the worker.

Inside the container image `computer_use_demo` is already importable from the
working directory, so the path insertion is skipped and the plain import wins.
Set `COMPUTER_USE_DEMO_PATH` to override where it is looked for.
"""

import os
import sys
from pathlib import Path

_DEFAULT_UPSTREAM_ROOT = Path(__file__).resolve().parent.parent / "computer-use-demo"


def _ensure_importable() -> None:
    root = Path(os.environ.get("COMPUTER_USE_DEMO_PATH", _DEFAULT_UPSTREAM_ROOT))
    if not root.is_dir():
        return
    path = str(root)
    if path not in sys.path:
        sys.path.insert(0, path)


_ensure_importable()

try:
    from computer_use_demo.loop import (  # noqa: E402
        APIProvider,
        ThinkingEffort,
        ThinkingMode,
        sampling_loop,
    )
    from computer_use_demo.tools import (  # noqa: E402
        ToolResult as UpstreamToolResult,
        ToolVersion,
    )
except ImportError as exc:  # pragma: no cover - depends on deployment layout
    raise ImportError(
        "Could not import computer_use_demo. Expected it at "
        f"{_DEFAULT_UPSTREAM_ROOT}, or on sys.path, or at COMPUTER_USE_DEMO_PATH."
    ) from exc

__all__ = [
    "APIProvider",
    "ThinkingEffort",
    "ThinkingMode",
    "ToolVersion",
    "UpstreamToolResult",
    "sampling_loop",
]
