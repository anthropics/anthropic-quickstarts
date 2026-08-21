from dataclasses import dataclass
from typing import Literal

from .base import BaseAnthropicTool
from .bash import BashTool20241022, BashTool20250124
from .computer import (
    ComputerTool20241022,
    ComputerTool20250124,
    ComputerTool20251124,
    ComputerToolset20260801,
)
from .edit import EditTool20250728

ToolVersion = Literal[
    "computer_use_20250124",
    "computer_use_20241022",
    "computer_use_20250429",
    "computer_use_20251124",
    "computer_toolset_20260801",
]
BetaFlag = Literal[
    "computer-use-2024-10-22",
    "computer-use-2025-01-24",
    "computer-use-2025-04-29",
    "computer-use-2025-11-24",
]


@dataclass(frozen=True, kw_only=True)
class ToolGroup:
    version: ToolVersion
    tools: list[type[BaseAnthropicTool]]
    beta_flag: BetaFlag | None = None


TOOL_GROUPS: list[ToolGroup] = [
    ToolGroup(
        version="computer_use_20241022",
        tools=[ComputerTool20241022, EditTool20250728, BashTool20241022],
        beta_flag="computer-use-2024-10-22",
    ),
    ToolGroup(
        version="computer_use_20250124",
        tools=[ComputerTool20250124, EditTool20250728, BashTool20250124],
        beta_flag="computer-use-2025-01-24",
    ),
    ToolGroup(
        version="computer_use_20250429",
        tools=[ComputerTool20250124, EditTool20250728, BashTool20250124],
        beta_flag="computer-use-2025-01-24",
    ),
    ToolGroup(
        version="computer_use_20251124",
        tools=[ComputerTool20251124, EditTool20250728, BashTool20250124],
        beta_flag="computer-use-2025-11-24",
    ),
    # The computer toolset ships GA: no beta header. The toolset replaces the
    # single computer tool entry; bash and edit stay ordinary client tools so
    # the model can fall back to shell or file operations.
    ToolGroup(
        version="computer_toolset_20260801",
        tools=[ComputerToolset20260801, EditTool20250728, BashTool20250124],
        beta_flag=None,
    ),
]

TOOL_GROUPS_BY_VERSION = {tool_group.version: tool_group for tool_group in TOOL_GROUPS}
