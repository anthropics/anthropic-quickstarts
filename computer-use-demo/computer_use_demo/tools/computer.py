import asyncio
import base64
import logging
import os
import shlex
import shutil
from .run import run
from enum import StrEnum
from pathlib import Path
from typing import Literal, TypedDict
from uuid import uuid4

from langchain.tools import tool

logging.basicConfig(level=logging.INFO)


OUTPUT_DIR = "/tmp/outputs"

TYPING_DELAY_MS = 12
TYPING_GROUP_SIZE = 50

Action = Literal[
    "key",
    "type",
    "mouse_move",
    "left_click",
    "left_click_drag",
    "right_click",
    "middle_click",
    "double_click",
    "screenshot",
    "cursor_position",
]


class Resolution(TypedDict):
    width: int
    height: int


# sizes above XGA/WXGA are not recommended (see README.md)
# scale down to one of these targets if ComputerTool._scaling_enabled is set
MAX_SCALING_TARGETS: dict[str, Resolution] = {
    "XGA": Resolution(width=1024, height=768),  # 4:3
    "WXGA": Resolution(width=1280, height=800),  # 16:10
    "FWXGA": Resolution(width=1366, height=768),  # ~16:9
}


class ScalingSource(StrEnum):
    COMPUTER = "computer"
    API = "api"


class ComputerToolOptions(TypedDict):
    display_height_px: int
    display_width_px: int
    display_number: int | None


def chunks(s: str, chunk_size: int) -> list[str]:
    return [s[i : i + chunk_size] for i in range(0, len(s), chunk_size)]


width = int(os.getenv("WIDTH") or 0)
height = int(os.getenv("HEIGHT") or 0)
assert width and height, "WIDTH, HEIGHT must be set"

_screenshot_delay = 2.0
_scaling_enabled = True

if (display_num := os.getenv("DISPLAY_NUM")) is not None:
    display_num = int(display_num)
    _display_prefix = f"DISPLAY=:{display_num} "
else:
    display_num = None
    _display_prefix = ""

xdotool = f"{_display_prefix}xdotool"


@tool
async def computer(
    *,
    action: Action,
    text: str | None = None,
    coordinate: tuple[int, int] | None = None,
    **kwargs,
) -> str:
    """
    A tool that allows the agent to interact with and manipulate the screen, keyboard and mouse of the current computer.
    """
    if action in ("mouse_move", "left_click_drag"):
        if coordinate is None:
            raise Exception(f"coordinate is required for {action}")
        if text is not None:
            raise Exception(f"text is not accepted for {action}")
        if not isinstance(coordinate, tuple) or len(coordinate) != 2:
            raise Exception(f"{coordinate} must be a tuple of length 2")
        if not all(isinstance(i, int) and i >= 0 for i in coordinate):
            raise Exception(f"{coordinate} must be a tuple of non-negative ints")

        x, y = _scale_coordinates(ScalingSource.API, coordinate[0], coordinate[1])

        if action == "mouse_move":
            return await _shell(f"{xdotool} mousemove --sync {x} {y}")
        elif action == "left_click_drag":
            return await _shell(
                f"{xdotool} mousedown 1 mousemove --sync {x} {y} mouseup 1"
            )

    if action in ("key", "type"):
        if text is None:
            raise Exception(f"text is required for {action}")
        if coordinate is not None:
            raise Exception(f"coordinate is not accepted for {action}")
        if not isinstance(text, str):
            raise Exception(output=f"{text} must be a string")

        if action == "key":
            return await _shell(f"{xdotool} key -- {text}")
        elif action == "type":
            results: list[list[dict]] = []
            for chunk in chunks(text, TYPING_GROUP_SIZE):
                cmd = (
                    f"{xdotool} type --delay {TYPING_DELAY_MS} -- {shlex.quote(chunk)}"
                )
                results.append(await _shell(cmd, take_screenshot=False))
            screenshot_msg = await _screenshot()
            return [
                {"type": "text", "text": result} for result in results
            ] + screenshot_msg

    if action in (
        "left_click",
        "right_click",
        "double_click",
        "middle_click",
        "screenshot",
        "cursor_position",
    ):
        if text is not None:
            raise Exception(f"text is not accepted for {action}")
        if coordinate is not None:
            return f"The {action} action does not take coordinates. If you are not at the given coordinates, you need to execute the mouse_move action first to get to those coordinates."

        if action == "screenshot":
            return await _screenshot()
        elif action == "cursor_position":
            result = await _shell(
                f"{xdotool} getmouselocation --shell",
                take_screenshot=False,
            )
            output = result or ""
            x, y = _scale_coordinates(
                ScalingSource.COMPUTER,
                int(output.split("X=")[1].split("\n")[0]),
                int(output.split("Y=")[1].split("\n")[0]),
            )
            return f"X={x},Y={y}"
        else:
            click_arg = {
                "left_click": "1",
                "right_click": "3",
                "middle_click": "2",
                "double_click": "--repeat 2 --delay 500 1",
            }[action]
            return await _shell(f"{xdotool} click {click_arg}")

    raise Exception(f"Invalid action: {action}")


async def _screenshot() -> list[dict]:
    """Take a screenshot of the current screen and return the base64 encoded image."""
    output_dir = Path(OUTPUT_DIR)
    output_dir.mkdir(parents=True, exist_ok=True)
    path = output_dir / f"screenshot_{uuid4().hex}.png"

    # Try gnome-screenshot first
    if shutil.which("gnome-screenshot"):
        screenshot_cmd = f"{_display_prefix}gnome-screenshot -f {path} -p"
    else:
        # Fall back to scrot if gnome-screenshot isn't available
        screenshot_cmd = f"{_display_prefix}scrot -p {path}"

    result = await _shell(screenshot_cmd, take_screenshot=False)
    if _scaling_enabled:
        x, y = _scale_coordinates(ScalingSource.COMPUTER, width, height)
        await _shell(f"convert {path} -resize {x}x{y}! {path}", take_screenshot=False)

    if path.exists():
        return [
            {"type": "text", "text": result},
            {
                "type": "image_url",
                "image_url": {
                    "url": f"data:image/png;base64,{base64.b64encode(path.read_bytes()).decode()}"
                },
            },
        ]
    raise Exception(f"Failed to take screenshot: {result}")


async def _shell(command: str, take_screenshot=False) -> str | list[dict]:
    # """Run a shell command and return the output, error, and optionally a screenshot."""
    """Run a shell command and return the output and error."""
    _, stdout, stderr = await run(command)

    if stderr:
        return stderr

    if not take_screenshot:
        return stdout

    # delay to let things settle before taking a screenshot
    await asyncio.sleep(_screenshot_delay)
    screenshot_output = await _screenshot()
    screenshot_output[0]["text"] = f"{stdout}. {screenshot_output[0]['text']}"
    return screenshot_output


def _scale_coordinates(source: ScalingSource, x: int, y: int):
    """Scale coordinates to a target maximum resolution."""
    if not _scaling_enabled:
        return x, y
    ratio = width / height
    target_dimension = None
    for dimension in MAX_SCALING_TARGETS.values():
        # allow some error in the aspect ratio - not ratios are exactly 16:9
        if abs(dimension["width"] / dimension["height"] - ratio) < 0.02:
            if dimension["width"] < width:
                target_dimension = dimension
            break
    if target_dimension is None:
        return x, y
    # should be less than 1
    x_scaling_factor = target_dimension["width"] / width
    y_scaling_factor = target_dimension["height"] / height

    if source == ScalingSource.API:
        if x > width or y > height:
            raise Exception(f"Coordinates {x}, {y} are out of bounds")
        # scale up
        return round(x / x_scaling_factor), round(y / y_scaling_factor)
    # scale down
    return round(x * x_scaling_factor), round(y * y_scaling_factor)
