from typing import Any, ClassVar

import pytest

from computer_use.tools.base import Tool
from computer_use.tools.result import ToolResult


def test_schema_signature_mismatch_raises():
    with pytest.raises(TypeError, match="does not accept"):

        class Bad(Tool):
            name = "bad"
            description = "x"
            input_schema: ClassVar[dict[str, Any]] = {
                "type": "object",
                "properties": {"a": {}, "b": {}},
            }

            def execute(self, *, a: str, **_: Any) -> ToolResult:  # missing b
                return ToolResult()


def test_required_with_default_raises():
    with pytest.raises(TypeError, match="required"):

        class Bad(Tool):
            name = "bad"
            description = "x"
            input_schema: ClassVar[dict[str, Any]] = {
                "type": "object",
                "properties": {"a": {}},
                "required": ["a"],
            }

            def execute(self, *, a: str = "x", **_: Any) -> ToolResult:
                return ToolResult()


def test_valid_tool_ok():
    class Good(Tool):
        name = "good"
        description = "x"
        input_schema: ClassVar[dict[str, Any]] = {
            "type": "object",
            "properties": {"a": {"type": "string"}},
            "required": ["a"],
        }

        def execute(self, *, a: str, **_: Any) -> ToolResult:
            return ToolResult(output=a)

    assert Good.to_param()["name"] == "good"


def test_delete_key_maps_to_backspace_on_mac():
    from computer_use.tools.computer import _translate_key

    assert _translate_key("delete") == "backspace"
    assert _translate_key("Delete") == "backspace"
    assert _translate_key("del") == "backspace"
    assert _translate_key("forward_delete") == "delete"
    assert _translate_key("backspace") == "backspace"


def test_unmapped_keys():
    from computer_use.tools.computer import _translate_key, _unmapped_keys

    assert _unmapped_keys(["command", "a"]) == []
    assert _unmapped_keys(["insert"]) == ["insert"]
    assert _unmapped_keys(["printscreen", "ctrl"]) == ["printscreen"]
    assert _unmapped_keys([_translate_key("win")]) == []


def test_browser_key_normalization():
    from computer_use.tools.browser import _to_playwright_chord

    assert _to_playwright_chord("ctrl+a") == "Control+a"
    assert _to_playwright_chord("cmd+shift+t") == "Meta+Shift+t"
    assert _to_playwright_chord("delete") == "Backspace"
    assert _to_playwright_chord("forward_delete") == "Delete"
    assert _to_playwright_chord("Enter") == "Enter"
    assert _to_playwright_chord("ctrl+ArrowLeft") == "Control+ArrowLeft"
    assert _to_playwright_chord("F5") == "F5"


def test_computer_tool_hosted_toolset_param_is_a_bare_type():
    from computer_use.tools.computer import ComputerTool
    from constants import HOSTED_COMPUTER_TOOLSET_TYPE

    # The toolset entry is nameless and takes no display size: the API rejects
    # both, and coordinates are in screenshot pixels regardless.
    assert ComputerTool().to_hosted_toolset_param() == {"type": HOSTED_COMPUTER_TOOLSET_TYPE}


def test_computer_tool_hosted_dated_param():
    from computer_use.tools.computer import ComputerTool
    from constants import HOSTED_COMPUTER_DATED_TYPE

    p = ComputerTool().to_hosted_dated_param()
    assert p["type"] == HOSTED_COMPUTER_DATED_TYPE
    assert p["name"] == "computer"
    assert isinstance(p["display_width_px"], int) and p["display_width_px"] > 0
    assert isinstance(p["display_height_px"], int) and p["display_height_px"] > 0


def test_tool_collection_hosted_computer_swap():
    from computer_use.tools.base import ToolCollection
    from computer_use.tools.computer import ComputerTool

    tc = ToolCollection(ComputerTool())
    explicit = tc.to_params()[0]
    toolset = tc.to_params(hosted_computer="toolset")[0]
    dated = tc.to_params(hosted_computer="dated")[0]
    assert "input_schema" in explicit
    assert toolset == {"type": "computer_toolset_20260801"}
    assert dated["type"] == "computer_20250124" and "input_schema" not in dated


def test_hosted_swap_leaves_other_tools_explicit():
    from computer_use.tools.base import ToolCollection
    from computer_use.tools.batch import ComputerBatchTool
    from computer_use.tools.computer import ComputerTool

    computer = ComputerTool()
    params = ToolCollection(computer, ComputerBatchTool(computer)).to_params(
        hosted_computer="toolset"
    )
    assert [p.get("name") for p in params] == [None, "computer_batch"]
    assert "input_schema" in params[1]


class _Recording(Tool):
    name = "computer"
    description = "records execute() kwargs"
    input_schema: ClassVar[dict[str, Any]] = {"type": "object", "properties": {}}
    validates_own_input = True

    def __init__(self) -> None:
        self.calls: list[dict[str, Any]] = []

    def execute(self, **kwargs: Any) -> ToolResult:
        self.calls.append(kwargs)
        return ToolResult(output="ok")


def test_run_routes_toolset_member_calls_by_family():
    """A member call names the action as the tool and the family in
    toolset_name; it must reach the family's tool with the action folded back
    into the input, i.e. exactly what an explicit call would have passed."""
    from computer_use.tools.base import ToolCollection

    tool = _Recording()
    tc = ToolCollection(tool)

    res = tc.run("left_click", {"coordinate": [1, 2]}, toolset_name="computer")
    assert not res.is_error
    assert tool.calls == [{"coordinate": [1, 2], "action": "left_click"}]

    tc.run("computer", {"action": "screenshot"})
    assert tool.calls[-1] == {"action": "screenshot"}


def test_run_unknown_toolset_or_tool_is_an_error_result():
    from computer_use.tools.base import ToolCollection

    tc = ToolCollection(_Recording())
    assert tc.run("navigate", {}, toolset_name="browser").error == "Unknown toolset: browser"
    assert tc.run("browser", {"action": "navigate"}).error == "Unknown tool: browser"
    assert "must be an object" in (tc.run("left_click", [], toolset_name="computer").error or "")
