from unittest import mock

import pytest
from streamlit.testing.v1 import AppTest

from computer_use_demo.streamlit import Sender, TextBlock


@pytest.fixture
def streamlit_app():
    return AppTest.from_file("computer_use_demo/streamlit.py")


def test_streamlit(streamlit_app: AppTest):
    streamlit_app.run()
    streamlit_app.text_input[1].set_value("sk-ant-0000000000000").run()
    with mock.patch("computer_use_demo.loop.sampling_loop") as patch:
        streamlit_app.chat_input[0].set_value("Hello").run()
        assert patch.called
        assert patch.call_args.kwargs["messages"] == [
            {"role": Sender.USER, "content": [TextBlock(text="Hello", type="text")]}
        ]
        assert not streamlit_app.exception
