"""Pytest configuration"""

import pytest
import sys
from unittest.mock import MagicMock

# Mock streamlit
mock_st = MagicMock()
sys.modules['streamlit'] = mock_st

def pytest_configure(config):
    """Configure pytest"""
    config.addinivalue_line(
        "markers",
        "asyncio: mark test as async"
    )

@pytest.fixture
def event_loop():
    """Create an instance of the default event loop for each test case."""
    import asyncio
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()