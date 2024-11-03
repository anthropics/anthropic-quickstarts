import json
import os
from typing import List, Optional

import anthropic
from anthropic import HUMAN_PROMPT, AI_PROMPT
from termcolor import colored

from computer_use_demo.tools import ToolCollection


def sampling_loop(
    messages,
    max_tokens: int,
    model: str,
    system: Optional[str],
    tool_collection: Optional[ToolCollection] = None,
    betas: Optional[List[float]] = None,
) -> List[dict]:
    # Print which tools are available to help with debugging
    if tool_collection:
        print("Available tools:", tool_collection.to_params()["tools"])

    # Run the model
    client = anthropic.Client(api_key=os.environ["ANTHROPIC_API_KEY"])

    try:
        raw_response = client.beta.messages.with_raw_response.create(
            max_tokens=max_tokens,
            messages=messages,
            model=model,
            system=[system],
            tools=tool_collection.to_params() if tool_collection else None,
            betas=betas,
        )
    except Exception as e:
        print(colored(f"Error: {str(e)}", "red"))
        return messages

    response = raw_response.parsed
    result_message = response.content[0].text

    if response.usage:
        print(colored(f"Tokens Used: {response.usage.output_tokens}", "blue"))

    print()
    messages.append({"role": "assistant", "content": result_message})

    # Parse tools from the response
    for message in messages:
        if "tool_calls" in message:
            print("Tool calls:", json.dumps(message["tool_calls"], indent=2))
            tool_results = []
            for tool_call in message["tool_calls"]:
                tool_name = tool_call["function"]["name"]
                tool_params = json.loads(tool_call["function"]["arguments"])

                print(
                    colored(
                        f"\nExecuting {tool_name} with params: {json.dumps(tool_params, indent=2)}",
                        "yellow",
                    )
                )

                tool_result = execute_tool(tool_name, tool_params, tool_collection)
                print(colored(f"Result: {json.dumps(tool_result, indent=2)}", "green"))
                tool_results.append(
                    {
                        "tool_call_id": tool_call["id"],
                        "output": json.dumps(tool_result),
                    }
                )

            # Add tool outputs to messages
            if tool_results:
                messages.append({"role": "tool", "tool_outputs": tool_results})

    return messages
