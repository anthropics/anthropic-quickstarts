"""
Entrypoint for streamlit, see https://docs.streamlit.io/
"""

import asyncio
import logging
import os
import platform
import subprocess
import uuid
from datetime import datetime
from enum import StrEnum

import streamlit as st
from langchain_anthropic import ChatAnthropic
from langchain_community.agent_toolkits import FileManagementToolkit
from langchain_community.tools.shell.tool import ShellTool
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langgraph.checkpoint.memory import MemorySaver
from langgraph.prebuilt import create_react_agent
from langgraph.prebuilt.chat_agent_executor import AgentState
from tools.adder import add_two_numbers

from computer_use_demo.tools.computer import computer
from computer_use_demo.tools.weather import LookupWeatherTool

logging.basicConfig(level=logging.INFO)

COMPUTER_USE_BETA_FLAG = "computer-use-2024-10-22"
max_tokens: int = 4096

toolkit = FileManagementToolkit(
    root_dir="./tmp"
)  # If you don't provide a root_dir, operations will default to the current working directory
file_mgmt_tools = toolkit.get_tools()

tools = [LookupWeatherTool(), add_two_numbers, ShellTool(), computer] + file_mgmt_tools

# This system prompt is optimized for the Docker environment in this repository and
# specific tool combinations enabled.
# We encourage modifying this system prompt to ensure the model has context for the
# environment it is running in, and to provide any additional information that may be
# helpful for the task at hand.
SYSTEM_PROMPT = f"""<SYSTEM_CAPABILITY>
* You are utilising an Ubuntu virtual machine using {platform.machine()} architecture with internet access.
* You can feel free to install Ubuntu applications with your bash tool. Use curl instead of wget.
* To open firefox, please just click on the firefox icon.  Note, firefox-esr is what is installed on your system.
* Using bash tool you can start GUI applications, but you need to set export DISPLAY=:1 and use a subshell. For example "(DISPLAY=:1 xterm &)". GUI apps run with bash tool will appear within your desktop environment, but they may take some time to appear. Take a screenshot to confirm it did. Before opening any GUI apps, make sure to take a screenshot first to see if it is already open.
* When using your bash tool with commands that are expected to output very large quantities of text, redirect into a tmp file and use str_replace_editor or `grep -n -B <lines before> -A <lines after> <query> <filename>` to confirm output.
* When viewing a page it can be helpful to zoom out so that you can see everything on the page.  Either that, or make sure you scroll down to see everything before deciding something isn't available.
* When using your computer function calls, they take a while to run and send back to you.  Where possible/feasible, try to chain multiple of these calls all into one function calls request.
* When navigating around the computer, you will want to perform an action, then take a screenshot to check if the action worked, then perform another action, then take a screenshot to check if that action worked, etc.
* The current date is {datetime.today().strftime('%A, %B %-d, %Y')}.
</SYSTEM_CAPABILITY>

<IMPORTANT>
* When using Firefox, if a startup wizard appears, IGNORE IT.  Do not even click "skip this step".  Instead, click on the address bar where it says "Search or enter address", and enter the appropriate search term or URL there.
* If the item you are looking at is a pdf, if after taking a single screenshot of the pdf it seems that you want to read the entire document instead of trying to continue to read the pdf from your screenshots + navigation, determine the URL, use curl to download the pdf, install and use pdftotext to convert it to a text file, and then read that text file directly with your StrReplaceEditTool.
</IMPORTANT>"""

STREAMLIT_STYLE = """
<style>
    /* Hide chat input while agent loop is running */
    .stApp[data-teststate=running] .stChatInput textarea,
    .stApp[data-test-script-state=running] .stChatInput textarea {
        display: none;
    }
     /* Hide the streamlit deploy button */
    .stAppDeployButton {
        visibility: hidden;
    }
</style>
"""

WARNING_TEXT = "⚠️ Security Alert: Never provide access to sensitive accounts or data, as malicious web content can hijack Claude's behavior"


class Sender(StrEnum):
    USER = "user"
    BOT = "assistant"
    TOOL = "tool"


@st.cache_resource
def get_memory_saver():
    return MemorySaver()


def setup_state():
    if "messages" not in st.session_state:
        st.session_state.messages = []
    if "responses" not in st.session_state:
        st.session_state.responses = {}
    if "tools" not in st.session_state:
        st.session_state.tools = {}
    if "session_key" not in st.session_state:
        st.session_state.session_key = str(uuid.uuid4())


async def build_sidebar():
    st.header("Settings")
    if st.button("Reset", type="primary"):
        with st.spinner("Resetting..."):
            st.session_state.clear()
            setup_state()

            subprocess.run("pkill Xvfb; pkill tint2", shell=True)  # noqa: ASYNC221
            await asyncio.sleep(1)
            subprocess.run("./start_all.sh", shell=True)  # noqa: ASYNC221


def _modify_state_messages(state: AgentState):
    # Keep the last N messages in the state as well as the system prompt
    N_MESSAGES = 30
    messages = [SystemMessage(content=SYSTEM_PROMPT)] + state["messages"][:N_MESSAGES]
    return messages


async def main():
    """Render loop for streamlit"""

    setup_state()
    st.markdown(STREAMLIT_STYLE, unsafe_allow_html=True)
    st.title("Claude Computer Use Demo")
    if not os.getenv("HIDE_WARNING", False):
        st.warning(WARNING_TEXT)

    with st.sidebar:
        await build_sidebar()

    user_input_message = st.chat_input(
        "Type a message to send to Claude to control the computer..."
    )

    # render past chats
    for message in st.session_state.messages:
        _render_message(message["role"], message["content"])

    # render past chats
    if user_input_message:
        st.session_state.messages.append(
            {
                "role": Sender.USER,
                "content": user_input_message,
            }
        )
        _render_message(Sender.USER, user_input_message)

    try:
        most_recent_message = st.session_state["messages"][-1]
    except IndexError:
        return

    if most_recent_message["role"] is not Sender.USER:
        # we don't have a user message to respond to, exit early
        return

    with st.spinner("Running Agent..."):
        try:
            model = ChatAnthropic(
                model="claude-3-5-sonnet-20241022",
                max_tokens=max_tokens,
                extra_headers={"anthropic-beta": f"{COMPUTER_USE_BETA_FLAG}"},
            )

            langgraph_agent_executor = create_react_agent(
                model,
                tools,
                state_modifier=_modify_state_messages,
                checkpointer=get_memory_saver(),
            )

            async for langgraph_messages in langgraph_agent_executor.astream(
                input={"messages": [HumanMessage(content=str(user_input_message))]},
                config={
                    "configurable": {"thread_id": st.session_state.session_key},
                },
                stream_mode="values",
            ):
                agent_executor_response_output = langgraph_messages["messages"][
                    -1
                ].content
                if (
                    agent_executor_response_output == user_input_message
                    or agent_executor_response_output == ""
                ):
                    continue
                if isinstance(agent_executor_response_output, list):
                    msg = None
                    for output in agent_executor_response_output:
                        if output["type"] == "text":
                            msg = {
                                "role": "assistant",
                                "content": output["text"],
                            }
                            _render_message(Sender.BOT, msg["content"])
                        elif output["type"] == "tool_use":
                            tool_use_message_content = {
                                "type": "tool_use",
                                "name": output["name"],
                                "input": output["input"],
                            }
                            msg = {
                                "role": Sender.TOOL,
                                "content": tool_use_message_content,
                            }
                            _render_message(Sender.TOOL, tool_use_message_content)
                        elif output["type"] == "image_url":
                            msg = {
                                "role": "assistant",
                                "content": output,
                            }
                            _render_message(Sender.BOT, msg["content"])
                        else:
                            _render_message(
                                Sender.BOT,
                                f"error processing output format: {output['type']}",
                            )
                elif isinstance(agent_executor_response_output, tuple):
                    msg = {
                        "role": "assistant",
                        "content": agent_executor_response_output[1],
                    }
                    _render_message(Sender.BOT, msg["content"])
                else:
                    msg = {
                        "role": "assistant",
                        "content": agent_executor_response_output,
                    }
                    _render_message(Sender.BOT, msg["content"])

                messages = st.session_state.messages
                messages.append(msg)
                st.session_state.messages = messages

        except Exception as e:
            logging.error(f"Error calling Anthropic API: {e}")
            return


def _render_dict_message(message: dict):
    if message["type"] == "text":
        st.write(message["text"])
    elif message["type"] == "tool_use":
        st.code(f'Tool Use: {message["name"]}\nInput: {message["input"]}')
    elif message["type"] == "image_url":
        st.image(message["image_url"]["url"])
    else:
        # only expected return types are text and tool_use
        raise Exception(f'Unexpected response type {message["type"]}')


def _render_str_message(message: str):
    st.markdown(message)


def _render_message(sender: Sender, message: str | dict):
    """Convert input from the user or output from the agent to a streamlit message."""
    # streamlit's hotreloading breaks isinstance checks, so we need to check for class names
    with st.chat_message(sender):
        if isinstance(message, dict):
            _render_dict_message(message)
        else:
            _render_str_message(message)


def format_messages_for_langchain(
    messages: list[dict],
) -> list[HumanMessage | AIMessage]:
    """Format messages for langchain"""
    formatted_messages = []
    for message in messages:
        if message["role"] == "user":
            formatted_messages.append(HumanMessage(content=message["content"]))
        else:
            if isinstance(message["content"], str):
                formatted_messages.append(AIMessage(content=message["content"]))
            else:
                formatted_messages.append(
                    AIMessage(
                        content=f"Tool Use: {message['content']['name']}\nInput: {message['content']['input']}"
                    )
                )
    return formatted_messages


if __name__ == "__main__":
    asyncio.run(main())


# TODO: make rendered messages accept the langchain message format
# TODO: do i need to take in an array of messages from the AgentExecutor response in order to represent tool calls?
# TODO: how do i represent tool results in langchain? is that a ToolMessage, or an AIMessage? Is a tool call an AIMessage or ToolMessage?
# TODO: how do i communicate the thoughts of the agent, like "I'm going to do XYZ"? Is that essentially a message from AgentExecutor?

# TODO: need to see all the messages available to me in the agent_executor and then print the ones that are relevant to the user
