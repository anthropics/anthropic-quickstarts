import json
import os
import streamlit as st
import asyncio

from computer_use_demo.loop import sampling_loop
from computer_use_demo.tools import get_tools

def setup_state():
    if "messages" not in st.session_state:
        st.session_state.messages = []
    if "tools_disabled" not in st.session_state:
        st.session_state.tools_disabled = False

def main():
    st.title("Computer Use Demo")

    # Initialize session state
    setup_state()

    # Chat interface
    for message in st.session_state.messages:
        if message["role"] == "user":
            st.chat_message("user").write(message["content"])
        elif message["role"] == "assistant":
            st.chat_message("assistant").write(message["content"])
        elif message["role"] == "tool":
            st.chat_message("tool").write(json.dumps(message["tool_outputs"], indent=2))

    # Chat input
    if prompt := st.chat_input():
        st.session_state.tools_disabled = False  # Re-enable tools on new message
        st.session_state.messages.append({"role": "user", "content": prompt})
        st.chat_message("user").write(prompt)

        with st.spinner("Running Agent..."):
            try:
                # run the agent sampling loop with the newest message
                st.session_state.messages = asyncio.run(
                    sampling_loop(
                        messages=st.session_state.messages,
                        max_tokens=1024,
                        model="claude-3-opus-20240229",
                        system=None,
                        tool_collection=None if st.session_state.tools_disabled else get_tools(),
                    )
                )
            except st.runtime.scriptrunner.StopException:
                st.session_state.tools_disabled = True  # Disable tools on stop
                st.warning("Operation stopped. Tools disabled until next message.")
                raise

if __name__ == "__main__":
    main()
