"""
Agentic sampling loop that calls the Anthropic API and local implementation of anthropic-defined computer use tools.
"""

import platform
import asyncio  # Added for delay logic
import os  # For environment variable check
from collections.abc import Callable
from datetime import datetime
from enum import StrEnum
from typing import Any, cast

from anthropic import Anthropic, AnthropicBedrock, AnthropicVertex, APIResponse
from anthropic.types import ToolResultBlockParam
from anthropic.types.beta import (
    BetaContentBlock,
    BetaContentBlockParam,
    BetaImageBlockParam,
    BetaMessage,
    BetaMessageParam,
    BetaTextBlockParam,
    BetaToolResultBlockParam,
)

from .tools import BashTool, ComputerTool, EditTool, ToolCollection, ToolResult

BETA_FLAG = "computer-use-2024-10-22"


class APIProvider(StrEnum):
    ANTHROPIC = "anthropic"
    BEDROCK = "bedrock"
    VERTEX = "vertex"


PROVIDER_TO_DEFAULT_MODEL_NAME: dict[APIProvider, str] = {
    APIProvider.ANTHROPIC: "claude-3-5-sonnet-20241022",
    APIProvider.BEDROCK: "anthropic.claude-3-5-sonnet-20241022-v2:0",
    APIProvider.VERTEX: "claude-3-5-sonnet-v2@20241022",
}

# This system prompt is optimized for the Docker environment in this repository and
# specific tool combinations enabled.
# We encourage modifying this system prompt to ensure the model has context for the
# environment it is running in, and to provide any additional information that may be
# helpful for the task at hand.
SYSTEM_PROMPT = f"""<SYSTEM_CAPABILITY>
* You are utilising an Ubuntu virtual machine using {platform.machine()} architecture with internet access.
* You can feel free to install Ubuntu applications with your bash tool. Use curl instead of wget.
* To open firefox, please just click on the firefox icon.  Note, firefox-esr is what is installed on your system.
* Using bash tool you can start GUI applications, but you need to set export DISPLAY=:1 and use a subshell. For example "(DISPLAY=:1 xterm &)". GUI apps run with bash tool will appear within your desktop environment, but they may take some time to appear. Take a screenshot to confirm it did.
* When using your bash tool with commands that are expected to output very large quantities of text, redirect into a tmp file and use str_replace_editor or `grep -n -B <lines before> -A <lines after> <query> <filename>` to confirm output.
* When viewing a page it can be helpful to zoom out so that you can see everything on the page.  Either that, or make sure you scroll down to see everything before deciding something isn't available.
* When using your computer function calls, they take a while to run and send back to you.  Where possible/feasible, try to chain multiple of these calls all into one function calls request.
* The current date is {datetime.today().strftime('%A, %B %-d, %Y')}.
</SYSTEM_CAPABILITY>

<IMPORTANT>
* When using Firefox, if a startup wizard appears, IGNORE IT.  Do not even click "skip this step".  Instead, click on the address bar where it says "Search or enter address", and enter the appropriate search term or URL there.
* If the item you are looking at is a pdf, if after taking a single screenshot of the pdf it seems that you want to read the entire document instead of trying to continue to read the pdf from your screenshots + navigation, determine the URL, use curl to download the pdf, install and use pdftotext to convert it to a text file, and then read that text file directly with your StrReplaceEditTool.
</IMPORTANT>"""


def debug_print(*args):
    """Print debug information only if DEBUG_MODE environment variable is set to 'true'."""
    if os.getenv("DEBUG_MODE", "false").lower() == "true":
        print(*args)


async def sampling_loop(
    *,
    model: str,
    provider: APIProvider,
    system_prompt_suffix: str,
    messages: list[BetaMessageParam],
    output_callback: Callable[[BetaContentBlock], None],
    tool_output_callback: Callable[[ToolResult, str], None],
    api_response_callback: Callable[[APIResponse[BetaMessage]], None],
    api_key: str,
    only_n_most_recent_images: int | None = None,
    max_tokens: int = 4096,
    region: str = "us-central1",  # Region required for Vertex API
):
    """
    Agentic sampling loop for the assistant/tool interaction of computer use.
    """
    debug_print("[DEBUG] Entering sampling_loop with parameters:")
    debug_print(f"model: {model}, provider: {provider}, system_prompt_suffix: {system_prompt_suffix}, "
                f"messages: {messages}, only_n_most_recent_images: {only_n_most_recent_images}, "
                f"max_tokens: {max_tokens}, region: {region}")

    tool_collection = ToolCollection(
        ComputerTool(),
        BashTool(),
        EditTool(),
    )
    system = f"{SYSTEM_PROMPT}{' ' + system_prompt_suffix if system_prompt_suffix else ''}"
    debug_print(f"[DEBUG] System prompt: {system}")

    retry_count = 0  # Initialize retry counter

    while True:
        if only_n_most_recent_images:
            debug_print("[DEBUG] Filtering images to keep the most recent ones.")
            _maybe_filter_to_n_most_recent_images(messages, only_n_most_recent_images)

        client = {
            APIProvider.ANTHROPIC: Anthropic(api_key=api_key),
            APIProvider.VERTEX: AnthropicVertex(region=region),
            APIProvider.BEDROCK: AnthropicBedrock(),
        }[provider]
        debug_print(f"[DEBUG] Using API client: {client}")

        try:
            # Call the API
            # we use raw_response to provide debug information to streamlit. Your
            # implementation may be able call the SDK directly with:
            # `response = client.messages.create(...)` instead.

            debug_print("[DEBUG] Calling the API with the following parameters:")
            debug_print(f"max_tokens: {max_tokens}, messages: {messages}, model: {model}, system: {system}, "
                        f"tools: {tool_collection.to_params()}, betas: ['computer-use-2024-10-22']")

            raw_response = client.beta.messages.with_raw_response.create(
                max_tokens=max_tokens,
                messages=messages,
                model=model,
                system=system,
                tools=tool_collection.to_params(),
                betas=["computer-use-2024-10-22"],
            )

            debug_print(f"[DEBUG] Raw API response received: {raw_response}")

            api_response_callback(cast(APIResponse[BetaMessage], raw_response))

            response = raw_response.parse()
            debug_print(f"[DEBUG] Parsed API response: {response}")

            messages.append(
                {
                    "role": "assistant",
                    "content": cast(list[BetaContentBlockParam], response.content),
                }
            )
            debug_print(f"[DEBUG] Updated messages: {messages}")

            tool_result_content: list[BetaToolResultBlockParam] = []
            for content_block in cast(list[BetaContentBlock], response.content):
                debug_print(f"[DEBUG] Processing content_block: {content_block}")
                output_callback(content_block)
                if content_block.type == "tool_use":
                    debug_print(f"[DEBUG] Tool use detected: {content_block.name} with input {content_block.input}")
                    result = await tool_collection.run(
                        name=content_block.name,
                        tool_input=cast(dict[str, Any], content_block.input),
                    )
                    debug_print(f"[DEBUG] Tool result: {result}")
                    tool_result_content.append(
                        _make_api_tool_result(result, content_block.id)
                    )
                    tool_output_callback(result, content_block.id)

            if not tool_result_content:
                debug_print("[DEBUG] No tool results to process. Exiting sampling loop.")
                return messages

            debug_print(f"[DEBUG] Appending tool results to messages: {tool_result_content}")
            messages.append({"content": tool_result_content, "role": "user"})
            retry_count = 0  # Reset retry count on success

        except Exception as e:
            debug_print(f"[DEBUG] Exception caught in sampling_loop: {e}")
            if "rate_limit_error" in str(e).lower():
                retry_count += 1
                delay = min(2**retry_count, 60)  # Exponential backoff with 60s cap

                # Debugging: Print retry details if enabled
                debug_print(
                    f"[DEBUG] Rate limit hit. Retry attempt: {retry_count}, "
                    f"Delaying for {delay} seconds."
                )

                await asyncio.sleep(delay)  # Introduce delay before retry
            else:
                debug_print("[DEBUG] Non-rate limit exception encountered. Reraising exception.")
                raise  # Reraise if it's not a rate limit error


def _maybe_filter_to_n_most_recent_images(
    messages: list[BetaMessageParam],
    images_to_keep: int,
    min_removal_threshold: int = 10,
):
    """
    With the assumption that images are screenshots that are of diminishing value as
    the conversation progresses, remove all but the final `images_to_keep` tool_result
    images in place, with a chunk of min_removal_threshold to reduce the amount we
    break the implicit prompt cache.
    """
    debug_print("[DEBUG] Entering _maybe_filter_to_n_most_recent_images")
    debug_print(f"messages: {messages}, images_to_keep: {images_to_keep}, min_removal_threshold: {min_removal_threshold}")

    if images_to_keep is None:
        debug_print("[DEBUG] images_to_keep is None. No filtering applied.")
        return messages

    tool_result_blocks = cast(
        list[ToolResultBlockParam],
        [
            item
            for message in messages
            for item in (
                message["content"] if isinstance(message["content"], list) else []
            )
            if isinstance(item, dict) and item.get("type") == "tool_result"
        ],
    )
    debug_print(f"[DEBUG] Found tool_result_blocks: {tool_result_blocks}")

    total_images = sum(
        1
        for tool_result in tool_result_blocks
        for content in tool_result.get("content", [])
        if isinstance(content, dict) and content.get("type") == "image"
    )
    debug_print(f"[DEBUG] Total images found: {total_images}")

    images_to_remove = total_images - images_to_keep
    debug_print(f"[DEBUG] Images to remove before thresholding: {images_to_remove}")

    # for better cache behavior, we want to remove in chunks
    images_to_remove -= images_to_remove % min_removal_threshold
    debug_print(f"[DEBUG] Images to remove after applying min_removal_threshold: {images_to_remove}")

    for tool_result in tool_result_blocks:
        if isinstance(tool_result.get("content"), list):
            new_content = []
            for content in tool_result.get("content", []):
                if isinstance(content, dict) and content.get("type") == "image":
                    if images_to_remove > 0:
                        images_to_remove -= 1
                        debug_print(f"[DEBUG] Removing image content: {content}")
                        continue
                new_content.append(content)
            tool_result["content"] = new_content
            debug_print(f"[DEBUG] Updated tool_result content: {tool_result['content']}")


def _make_api_tool_result(
    result: ToolResult, tool_use_id: str
) -> BetaToolResultBlockParam:
    """Convert an agent ToolResult to an API ToolResultBlockParam."""
    debug_print("[DEBUG] Entering _make_api_tool_result")
    debug_print(f"result: {result}, tool_use_id: {tool_use_id}")

    tool_result_content: list[BetaTextBlockParam | BetaImageBlockParam] | str = []
    is_error = False
    if result.error:
        is_error = True
        tool_result_content = _maybe_prepend_system_tool_result(result, result.error)
        debug_print(f"[DEBUG] Tool result has error: {result.error}")
    else:
        if result.output:
            text_content = _maybe_prepend_system_tool_result(result, result.output)
            tool_result_content.append(
                {"type": "text", "text": text_content}
            )
            debug_print(f"[DEBUG] Tool result output added: {text_content}")
        if result.base64_image:
            image_content = {
                "type": "image",
                "source": {"type": "base64", "media_type": "image/png", "data": result.base64_image},
            }
            tool_result_content.append(image_content)
            debug_print(f"[DEBUG] Tool result image added: {image_content}")

    api_tool_result = {
        "type": "tool_result",
        "content": tool_result_content,
        "tool_use_id": tool_use_id,
        "is_error": is_error,
    }
    debug_print(f"[DEBUG] Created API tool result: {api_tool_result}")
    return api_tool_result


def _maybe_prepend_system_tool_result(result: ToolResult, result_text: str):
    debug_print("[DEBUG] Entering _maybe_prepend_system_tool_result")
    debug_print(f"result: {result}, result_text: {result_text}")

    if result.system:
        result_text = f"<system>{result.system}</system>\n{result_text}"
        debug_print(f"[DEBUG] Prepended system text: {result_text}")
    else:
        debug_print("[DEBUG] No system text to prepend.")

    return result_text
