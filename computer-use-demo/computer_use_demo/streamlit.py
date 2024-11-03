import json
import os
import streamlit as st
import asyncio

from computer_use_demo.loop import sampling_loop
from computer_use_demo.tools import get_tools

def setup_state():
    if "messages" not in st.session_state:
        st.session_state.messages = []
    if "show_exchange_logs" not in st.session_state:
        st.session_state.show_exchange_logs = False

def main():
    st.title("Computer Use Demo")

    # Initialize session state
    setup_state()

    # Add toggle for exchange logs in sidebar
    with st.sidebar:
        st.session_state.show_exchange_logs = st.toggle(
            "Show HTTP Exchange Logs",
            value=st.session_state.show_exchange_logs,
            help="Toggle visibility of HTTP exchange logs"
        )

    # Chat interface
    for message in st.session_state.messages:
        if message["role"] == "user":
            st.chat_message("user").write(message["content"])
        elif message["role"] == "assistant":
            st.chat_message("assistant").write(message["content"])
        elif message["role"] == "tool" and st.session_state.show_exchange_logs:
            st.chat_message("tool").write(json.dumps(message["tool_outputs"], indent=2))

    # Chat input
    if prompt := st.chat_input():
        st.session_state.messages.append({"role": "user", "content": prompt})
        st.chat_message("user").write(prompt)

        with st.spinner("Running Agent..."):
            # run the agent sampling loop with the newest message
            st.session_state.messages = asyncio.run(
                sampling_loop(
                    messages=st.session_state.messages,
                    max_tokens=1024,
                    model="claude-3-opus-20240229",
                    system=None,
                    tool_collection=get_tools(),
                )
            )

if __name__ == "__main__":
    main()
