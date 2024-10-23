"""Collection classes for managing multiple tools."""

from typing import Any

from anthropic.types.beta import BetaCacheControlEphemeralParam, BetaToolUnionParam

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
        enable_prompt_caching: bool
    ) -> list[BetaToolUnionParam]:
        tools = [tool.to_params() for tool in self.tools]
        if enable_prompt_caching:
            tools[-1]["cache_control"] = BetaCacheControlEphemeralParam({"type": "ephemeral"})
        return tools

    async def run(self, *, name: str, tool_input: dict[str, Any]) -> ToolResult:
        tool = self.tool_map.get(name)
        if not tool:
            return ToolFailure(error=f"Tool {name} is invalid")
        try:
            return await tool(**tool_input)
        except ToolError as e:
            return ToolFailure(error=e.message)
