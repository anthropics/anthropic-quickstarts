"""Collection classes for managing multiple tools."""

from typing import Any, cast

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
        self.tool_map: dict[str, BaseAnthropicTool] = {}
        self.toolset_map: dict[str, BaseAnthropicTool] = {}
        for tool in tools:
            params = cast(dict[str, Any], tool.to_params())
            if "name" in params:
                self.tool_map[params["name"]] = tool
            else:
                # An Anthropic-defined toolset: a nameless tools[] entry that
                # declares a family of member tools. Member calls arrive as
                # tool_use blocks whose name is the member name and whose
                # toolset_name is the family, so they are routed by family.
                self.toolset_map[cast(Any, tool).toolset_name] = tool

    def to_params(
        self,
    ) -> list[BetaToolUnionParam]:
        return [tool.to_params() for tool in self.tools]

    async def run(
        self,
        *,
        name: str,
        tool_input: dict[str, Any],
        toolset_name: str | None = None,
    ) -> ToolResult:
        if toolset_name is not None:
            # A member tool call: (toolset_name, name) identifies the tool.
            # The member name is the trained action name, so it dispatches as
            # the action parameter of the family's tool implementation.
            toolset = self.toolset_map.get(toolset_name)
            if not toolset:
                return ToolFailure(error=f"Toolset {toolset_name} is invalid")
            try:
                return await toolset(action=name, **tool_input)
            except ToolError as e:
                return ToolFailure(error=e.message)
        tool = self.tool_map.get(name)
        if not tool:
            return ToolFailure(error=f"Tool {name} is invalid")
        try:
            return await tool(**tool_input)
        except ToolError as e:
            return ToolFailure(error=e.message)
