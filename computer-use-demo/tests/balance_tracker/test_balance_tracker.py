"""
Comprehensive tests for balance tracking functionality
"""

import asyncio
import json
import pytest
import tempfile
import sys
from unittest.mock import MagicMock

# Mock streamlit
mock_st = MagicMock()
sys.modules['streamlit'] = mock_st

from datetime import datetime
from pathlib import Path
from unittest.mock import AsyncMock, Mock, patch
from bs4 import BeautifulSoup
from cryptography.fernet import Fernet

from computer_use_demo.display_config import DisplayConfig
from computer_use_demo.balance_tracker_v3 import (
    BalanceEntry,
    BalanceTracker,
    ConsoleCredentials,
    SecureStorage,
    background_balance_check,
    render_balance_settings,
    render_message_with_balance
)

@pytest.fixture
def temp_dir():
    """Create a temporary directory for test files"""
    with tempfile.TemporaryDirectory() as tmpdir:
        yield Path(tmpdir)

@pytest.fixture
def display_config():
    """Create a display config for testing"""
    return DisplayConfig(
        timestamp_format="%Y-%m-%d %H:%M:%S",
        show_balance=True,
        show_timestamps=True
    )

@pytest.fixture
def secure_storage(temp_dir):
    """Create a SecureStorage instance"""
    return SecureStorage(temp_dir)

@pytest.fixture
def balance_tracker(temp_dir, display_config):
    """Create a BalanceTracker instance"""
    return BalanceTracker(temp_dir, display_config)

class TestSecureStorage:
    """Test suite for SecureStorage class"""
    def test_key_creation(self, temp_dir):
        """Test encryption key creation and loading"""
        storage = SecureStorage(temp_dir)
        assert storage.key_file.exists()
        assert storage.key_file.stat().st_mode & 0o777 == 0o600
        # Key should be stable
        key1 = storage._fernet.encrypt(b"test")
        storage2 = SecureStorage(temp_dir)
        assert storage2._fernet.decrypt(key1) == b"test"

    def test_credential_storage(self, secure_storage):
        """Test saving and loading credentials"""
        creds = ConsoleCredentials("test@example.com", "password123")
        secure_storage.save_credentials(creds)

        # Verify file permissions
        assert secure_storage.creds_file.exists()
        assert secure_storage.creds_file.stat().st_mode & 0o777 == 0o600

        # Load and verify
        loaded = secure_storage.load_credentials()
        assert loaded.email == creds.email
        assert loaded.password == creds.password

    def test_invalid_credentials(self, secure_storage):
        """Test handling of corrupted credentials"""
        # Write invalid data
        secure_storage.creds_file.write_text("invalid data")
        assert secure_storage.load_credentials() is None

class TestBalanceTracker:
    """Test suite for BalanceTracker class"""
    def test_manual_entry(self, balance_tracker):
        """Test manual balance entry"""
        balance_tracker.add_entry(100.50, "manual", "Initial balance")
        assert len(balance_tracker.entries) == 1
        entry = balance_tracker.entries[0]
        assert entry.amount == 100.50
        assert entry.source == "manual"
        assert entry.note == "Initial balance"

        # Verify file storage
        assert balance_tracker.balance_file.exists()
        data = json.loads(balance_tracker.balance_file.read_text())
        assert len(data) == 1
        assert data[0]["amount"] == 100.50

    def test_multiple_entries(self, balance_tracker):
        """Test multiple balance entries"""
        amounts = [100.0, 95.5, 90.0]
        for amount in amounts:
            balance_tracker.add_entry(amount, "manual")

        assert len(balance_tracker.entries) == len(amounts)
        assert [e.amount for e in balance_tracker.entries] == amounts

        # Load in new instance
        new_tracker = BalanceTracker(
            balance_tracker.config_dir,
            balance_tracker.display_config
        )
        assert len(new_tracker.entries) == len(amounts)
        assert [e.amount for e in new_tracker.entries] == amounts

    @pytest.mark.asyncio
    async def test_console_balance_fetch(self, balance_tracker):
        """Test automatic balance fetching from console"""
        # Mock successful login and balance fetch
        mock_response = Mock()
        mock_response.text = """
            <html>
            <input name="csrf_token" value="test_token">
            <div>Remaining Balance</div>
            <div>$1,234.56</div>
            </html>
        """
        mock_client = AsyncMock()
        mock_client.get.return_value = mock_response
        mock_client.post.return_value = mock_response
        mock_client.__aenter__.return_value = mock_client
        mock_client.__aexit__.return_value = None

        with patch("httpx.AsyncClient", return_value=mock_client):
            # Set up credentials
            balance_tracker.secure_storage.save_credentials(
                ConsoleCredentials("test@example.com", "password123")
            )
            # Fetch balance
            balance = await balance_tracker.fetch_console_balance()
            assert balance == 1234.56
            # Verify API calls
            assert mock_client.get.call_count == 2 # Login page + billing page
            assert mock_client.post.call_count == 1 # Login submission

    @pytest.mark.asyncio
    async def test_console_balance_errors(self, balance_tracker):
        """Test error handling in console balance fetch"""
        # Test network error
        with patch("httpx.AsyncClient", side_effect=Exception("Network error")):
            balance = await balance_tracker.fetch_console_balance()
            assert balance is None

        # Test invalid HTML
        mock_response = Mock()
        mock_response.text = "<html>Invalid page</html>"
        mock_client = AsyncMock()
        mock_client.get.return_value = mock_response
        with patch("httpx.AsyncClient", return_value=mock_client):
            balance = await balance_tracker.fetch_console_balance()
            assert balance is None

    @pytest.mark.asyncio
    async def test_background_check(self, balance_tracker):
        """Test background balance checking"""
        # Set up credentials
        balance_tracker.secure_storage.save_credentials(
            ConsoleCredentials("test@example.com", "password123")
        )

        # Mock balance fetching
        fetch_counts = 0
        balances = [100.0, 95.0, 95.0, 90.0] # Note repeated value

        async def mock_fetch():
            nonlocal fetch_counts
            value = balances[fetch_counts]
            fetch_counts += 1
            return value

        balance_tracker.fetch_console_balance = mock_fetch

        # Run background check with reduced sleep
        with patch("asyncio.sleep", new_callable=AsyncMock) as mock_sleep:
            mock_sleep.side_effect = [None] * (len(balances) - 1) + [Exception("Stop")]
            try:
                await background_balance_check(balance_tracker)
            except Exception:
                pass

        # Should only have 3 entries (95.0 was repeated)
        assert len(balance_tracker.entries) == 3
        assert [e.amount for e in balance_tracker.entries] == [100.0, 95.0, 90.0]

class TestRendering:
    """Test suite for UI rendering functions"""
    def test_render_balance_settings(self, balance_tracker, monkeypatch):
        """Test balance settings UI rendering"""
        # Mock all streamlit functions
        mock_markdown = MagicMock()
        monkeypatch.setattr(mock_st.sidebar, "markdown", mock_markdown)
        monkeypatch.setattr(mock_st, "markdown", mock_markdown)

        mock_subheader = MagicMock()
        monkeypatch.setattr(mock_st.sidebar, "subheader", mock_subheader)

        mock_success = MagicMock()
        monkeypatch.setattr(mock_st.sidebar, "success", mock_success)

        mock_info = MagicMock()
        monkeypatch.setattr(mock_st.sidebar, "info", mock_info)

        mock_expander = MagicMock()
        mock_expander_ctx = MagicMock()
        mock_expander.return_value.__enter__ = mock_expander_ctx
        mock_expander.return_value.__exit__ = lambda *args: None
        monkeypatch.setattr(mock_st.sidebar, "expander", mock_expander)

        mock_button = MagicMock()
        mock_button.return_value = False
        monkeypatch.setattr(mock_st.sidebar, "button", mock_button)
        monkeypatch.setattr(mock_st, "button", mock_button)

        mock_text_input = MagicMock()
        mock_text_input.return_value = "test@example.com"
        monkeypatch.setattr(mock_st, "text_input", mock_text_input)

        mock_columns = MagicMock()
        mock_col1 = MagicMock()
        mock_col2 = MagicMock()
        mock_columns.return_value = [mock_col1, mock_col2]
        monkeypatch.setattr(mock_st.sidebar, "columns", mock_columns)

        mock_number_input = MagicMock()
        mock_number_input.return_value = 100.0
        monkeypatch.setattr(mock_st, "number_input", mock_number_input)

        # Test with no credentials
        render_balance_settings(balance_tracker)

        # Test with credentials
        balance_tracker.secure_storage.save_credentials(
            ConsoleCredentials("test@example.com", "password123")
        )
        render_balance_settings(balance_tracker)

        # Verify essential mock calls
        assert mock_markdown.called
        assert mock_subheader.called
        assert mock_button.called
        assert mock_info.called or mock_success.called

    def test_render_message_with_balance(self, balance_tracker):
        """Test message rendering with various formats"""
        # Test text message
        msg = {"content": "Hello World"}
        render_message_with_balance(msg, balance_tracker)

        # Test list message
        msg = {"content": [
            {"type": "text", "text": "Hello"},
            {"type": "tool_use", "name": "test", "input": "world"}
        ]}
        render_message_with_balance(msg, balance_tracker)

        # Test output message
        msg = {"output": "test output"}
        render_message_with_balance(msg, balance_tracker)

        # Test error message
        msg = {"error": "test error"}
        render_message_with_balance(msg, balance_tracker)

        # Test non-dict message
        msg = "plain text"
        render_message_with_balance(msg, balance_tracker)

class TestFileSystem:
    """Test suite for file system operations"""
    def test_file_system_errors(self, balance_tracker, monkeypatch):
        """Test handling of file system errors"""
        # Test save error
        def mock_write_text(*args, **kwargs):
            raise OSError("Mock write error")
        monkeypatch.setattr(Path, "write_text", mock_write_text)
        
        balance_tracker.add_entry(100.0, "manual")  # Should not raise
        assert len(balance_tracker.entries) == 1  # Entry still added to memory

        # Test load error
        def mock_exists(*args, **kwargs):
            return True
        def mock_read_text(*args, **kwargs):
            raise OSError("Mock read error")
        monkeypatch.setattr(Path, "exists", mock_exists)
        monkeypatch.setattr(Path, "read_text", mock_read_text)
        
        tracker = BalanceTracker(balance_tracker.config_dir, balance_tracker.display_config)
        assert len(tracker.entries) == 0  # Should start fresh on error

class TestIntegration:
    """Integration tests for the balance tracking system"""
    @pytest.mark.asyncio
    async def test_full_workflow(self, temp_dir, display_config):
        """Test complete workflow with both manual and automatic updates"""
        tracker = BalanceTracker(temp_dir, display_config)

        # 1. Add manual entries
        tracker.add_entry(100.0, "manual", "Initial balance")
        tracker.add_entry(90.0, "manual", "After usage")

        # 2. Set up automatic tracking
        tracker.secure_storage.save_credentials(
            ConsoleCredentials("test@example.com", "password123")
        )

        # 3. Mock console balance
        async def mock_fetch():
            return 85.0
        tracker.fetch_console_balance = mock_fetch

        # 4. Run background check once
        with patch("asyncio.sleep", side_effect=Exception("Stop")):
            try:
                await background_balance_check(tracker)
            except Exception:
                pass

        # Verify final state
        assert len(tracker.entries) == 3
        assert [e.amount for e in tracker.entries] == [100.0, 90.0, 85.0]
        assert [e.source for e in tracker.entries] == ["manual", "manual", "auto"]

        # 5. Load in new instance
        new_tracker = BalanceTracker(temp_dir, display_config)
        assert len(new_tracker.entries) == 3
        assert [e.amount for e in new_tracker.entries] == [100.0, 90.0, 85.0]

        # 6. Verify credentials persisted
        creds = new_tracker.secure_storage.load_credentials()
        assert creds.email == "test@example.com"