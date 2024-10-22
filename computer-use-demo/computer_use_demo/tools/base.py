from abc import ABCMeta, abstractmethod
from dataclasses import dataclass, fields, replace
from typing import Any, ClassVar, Literal, Optional, Required, TypedDict

APIToolType = Literal["computer_20241022", "text_editor_20241022", "bash_20241022"]
APIToolName = Literal["computer", "str_replace_editor", "bash"]


class AnthropicAPIToolParam(TypedDict):
    """API shape for Anthropic-defined tools."""

    name: Required[APIToolName]
    type: Required[APIToolType]


class ComputerToolOptions(TypedDict):
    display_height_px: Required[int]
    display_width_px: Required[int]
    display_number: Optional[int]


class BaseAnthropicTool(metaclass=ABCMeta):
    """Abstract base class for Anthropic-defined tools."""

    name: ClassVar[APIToolName]
    api_type: ClassVar[APIToolType]

    @property
    def options(self) -> ComputerToolOptions | None:
        return None

    @abstractmethod
    def __call__(self, **kwargs) -> Any:
        """Executes the tool with the given arguments."""
        ...

    def to_params(
        self,
    ) -> dict:  # -> AnthropicToolParam & Optional[ComputerToolOptions]
        """Creates the shape necessary to this tool to the Anthropic API."""
        return {
            "name": self.name,
            "type": self.api_type,
            **(self.options or {}),
        }


@dataclass(kw_only=True, frozen=True)
class ToolResult:
    """Represents the result of a tool execution."""

    output: str | None = None
    error: str | None = None
    base64_image: str | None = None
    system: str | None = None

    def __bool__(self):
        return any(getattr(self, field.name) for field in fields(self))

    def __add__(self, other: "ToolResult"):
        def combine_fields(
            field: str | None, other_field: str | None, concatenate: bool = True
        ):
            if field and other_field:
                if concatenate:
                    return field + other_field
                raise ValueError("Cannot combine tool results")
            return field or other_field

        return ToolResult(
            output=combine_fields(self.output, other.output),
            error=combine_fields(self.error, other.error),
            base64_image=combine_fields(self.base64_image, other.base64_image, False),
            system=combine_fields(self.system, other.system),
        )

    def replace(self, **kwargs):
        """Returns a new ToolResult with the given fields replaced."""
        return replace(self, **kwargs)


class CLIResult(ToolResult):
    """A ToolResult that can be rendered as a CLI output."""


class ToolFailure(ToolResult):
    """A ToolResult that represents a failure."""


class ToolError(Exception):
    """Raised when a tool encounters an error."""

    def __init__(self, message):
        self.message = message
