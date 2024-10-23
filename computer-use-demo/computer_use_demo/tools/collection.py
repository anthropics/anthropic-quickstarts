"""Collection classes for managing multiple tools."""

import asyncio
from typing import Any

from anthropic.types.beta import BetaToolUnionParam

from .base import (
    BaseAnthropicTool,
    ToolError,
    ToolFailure,
    ToolResult,
)

class ToolCollection:
    """A collection of anthropic-defined tools."""

    def __init__(self, *tools: BaseAnthropicTool):
        self.tools = tools
        self.tool_map = {tool.to_params()["name"]: tool for tool in tools}

    def to_params(
        self,
    ) -> list[BetaToolUnionParam]:
        return [tool.to_params() for tool in self.tools]

    async def run(self, *, name: str, tool_input: dict[str, Any]) -> ToolResult:
        max_retries = 100  # Maximum number of retries
        initial_delay = 1.0  # Initial delay in seconds
        backoff_factor = 2.0  # Exponential backoff factor
        max_delay = 60.0  # Maximum delay in seconds

        retries = 0
        delay = initial_delay

        tool = self.tool_map.get(name)
        if not tool:
            return ToolFailure(error=f"Tool {name} is invalid")

        while retries < max_retries:
            try:
                return await tool(**tool_input)
            except ToolError as e:
                if e.status_code == 429:
                    retries += 1
                    if retries >= max_retries:
                        return ToolFailure(
                            error=f"Max retries reached for tool '{name}' due to rate limiting."
                        )
                    # Optionally, you can log the retry attempt
                    print(
                        f"Rate limit hit for tool '{name}'. Retrying in {delay} seconds... "
                        f"(Attempt {retries}/{max_retries})"
                    )
                    await asyncio.sleep(delay)
                    delay = min(delay * backoff_factor, max_delay)
                else:
                    return ToolFailure(error=e.message)

        return ToolFailure(
            error=f"Failed to execute tool '{name}' after {max_retries} retries due to rate limiting."
        )
