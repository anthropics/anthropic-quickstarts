"""
Enhanced balance tracking with both automated and manual options

This module provides:
- Balance tracking functionality
- Console integration
- Secure credential storage
- Health check endpoint for monitoring
"""

from computer_use_demo.balance_tracker.display_config import DisplayConfig

import asyncio
import json
import re
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Optional
import logging
from urllib.parse import quote_plus
import streamlit as st
import httpx
from bs4 import BeautifulSoup
from cryptography.fernet import Fernet

@dataclass
class ConsoleCredentials:
    """Anthropic Console credentials"""
    email: str
    password: str

@dataclass
class BalanceEntry:
    """A single balance entry"""
    timestamp: str
    amount: float
    source: str # 'auto' or 'manual'
    note: Optional[str] = None

class SecureStorage:
    """Handles secure storage of sensitive information"""
    def __init__(self, config_dir: Path):
        self.config_dir = config_dir
        self.key_file = config_dir / ".key"
        self.creds_file = config_dir / ".console_creds"
        self._fernet = self._load_or_create_key()

    def _load_or_create_key(self) -> Fernet:
        """Load existing or create new encryption key"""
        if self.key_file.exists():
            key = self.key_file.read_bytes()
        else:
            key = Fernet.generate_key()
            self.config_dir.mkdir(parents=True, exist_ok=True)
            self.key_file.write_bytes(key)
            self.key_file.chmod(0o600)
        return Fernet(key)

    def save_credentials(self, creds: ConsoleCredentials) -> None:
        """Encrypt and save console credentials"""
        data = json.dumps({
            "email": creds.email,
            "password": creds.password
        })
        encrypted = self._fernet.encrypt(data.encode())
        self.creds_file.write_bytes(encrypted)
        self.creds_file.chmod(0o600)

    def load_credentials(self) -> Optional[ConsoleCredentials]:
        """Load and decrypt console credentials"""
        try:
            if self.creds_file.exists():
                encrypted = self.creds_file.read_bytes()
                data = json.loads(self._fernet.decrypt(encrypted))
                return ConsoleCredentials(
                    email=data["email"],
                    password=data["password"]
                )
        except Exception as e:
            logging.error(f"Error loading credentials: {e}")
        return None

class BalanceTracker:
    """Tracks API balance with both automated and manual options"""
    def __init__(self, config_dir: Path, display_config: DisplayConfig):
        self.config_dir = config_dir
        self.display_config = display_config
        self.balance_file = config_dir / "balance_history.json"
        self.secure_storage = SecureStorage(config_dir)
        self.entries: list[BalanceEntry] = self._load_entries()

    def _load_entries(self) -> list[BalanceEntry]:
        """Load balance entries from file"""
        try:
            if self.balance_file.exists():
                data = json.loads(self.balance_file.read_text())
                return [BalanceEntry(**entry) for entry in data]
        except Exception as e:
            logging.error(f"Error loading balance entries: {e}")
        return []

    def _save_entries(self) -> None:
        """Save balance entries to file"""
        try:
            self.config_dir.mkdir(parents=True, exist_ok=True)
            data = [vars(entry) for entry in self.entries]
            self.balance_file.write_text(json.dumps(data, indent=2))
            self.balance_file.chmod(0o600)
        except Exception as e:
            logging.error(f"Error saving balance entries: {e}")

    def add_entry(self, amount: float, source: str, note: Optional[str] = None) -> None:
        """Add a new balance entry"""
        entry = BalanceEntry(
            timestamp=datetime.now().strftime(self.display_config.timestamp_format),
            amount=amount,
            source=source,
            note=note
        )
        self.entries.append(entry)
        self._save_entries()

    async def fetch_console_balance(self) -> Optional[float]:
        """Fetch balance from Anthropic Console"""
        creds = self.secure_storage.load_credentials()
        if not creds:
            return None

        try:
            async with httpx.AsyncClient() as client:
                # Login flow
                # 1. Get CSRF token 
                response = await client.get("https://console.anthropic.com/login")
                soup = BeautifulSoup(response.text, "html.parser")
                csrf_token = soup.find("input", {"name": "csrf_token"})["value"]

                # 2. Submit login
                login_data = {
                    "email": creds.email,
                    "password": creds.password,
                    "csrf_token": csrf_token
                }
                await client.post(
                    "https://console.anthropic.com/login",
                    data=login_data,
                    follow_redirects=True
                )

                # 3. Get billing page
                response = await client.get(
                    "https://console.anthropic.com/settings/billing"
                )

                # 4. Extract balance
                soup = BeautifulSoup(response.text, "html.parser")
                balance_text = soup.find(
                    "div",
                    text=re.compile(r"Remaining Balance")
                ).find_next("div").text

                # Convert "$1,234.56" to float
                balance = float(
                    balance_text.replace("$", "").replace(",", "")
                )
                return balance

        except Exception as e:
            logging.error(f"Error fetching console balance: {e}")
            return None

def render_balance_settings(balance_tracker: BalanceTracker):
    """Render balance tracking settings UI"""
    st.sidebar.markdown("---")
    st.sidebar.subheader("Balance Tracking")

    # Automated tracking setup
    st.sidebar.markdown("### Automated Balance Updates")
    creds = balance_tracker.secure_storage.load_credentials()
    has_creds = creds is not None

    if has_creds:
        st.sidebar.success(f"✓ Connected as {creds.email}")
        if st.sidebar.button("Remove Connection"):
            balance_tracker.secure_storage.creds_file.unlink(missing_ok=True)
            st.experimental_rerun()
    else:
        st.sidebar.info(
            "Enter your Anthropic Console credentials to enable automatic "
            "balance updates. Credentials are stored locally with encryption."
        )
        with st.sidebar.expander("Connect Console Account"):
            email = st.text_input("Email")
            password = st.text_input("Password", type="password")
            if st.button("Save Credentials"):
                balance_tracker.secure_storage.save_credentials(
                    ConsoleCredentials(email=email, password=password)
                )
                st.experimental_rerun()

    # Manual balance entry
    st.sidebar.markdown("### Manual Balance Entry")
    col1, col2 = st.sidebar.columns(2)
    with col1:
        amount = st.number_input(
            "Current Balance ($)",
            min_value=0.0,
            step=1.0,
            format="%.2f"
        )
    with col2:
        if st.button("Add Entry"):
            balance_tracker.add_entry(amount, source="manual")
            st.success("Balance updated!")

    # Balance history
    if balance_tracker.entries:
        st.sidebar.markdown("### Recent History")
        for entry in reversed(balance_tracker.entries[-5:]):
            icon = "🤖" if entry.source == "auto" else "✎"
            st.sidebar.text(
                f"{icon} {entry.timestamp}: ${entry.amount:.2f}"
                + (f"\n {entry.note}" if entry.note else "")
            )

    # Export/Import
    st.sidebar.markdown("---")
    col1, col2 = st.sidebar.columns(2)
    with col1:
        if st.button("Export History"):
            data = json.dumps(
                [vars(entry) for entry in balance_tracker.entries],
                indent=2
            )
            st.download_button(
                "Download JSON",
                data,
                "balance_history.json",
                "application/json"
            )
    with col2:
        uploaded_file = st.file_uploader(
            "Import History",
            type="json",
            help="Import previously exported balance history"
        )
        if uploaded_file:
            try:
                data = json.loads(uploaded_file.read())
                balance_tracker.entries = [BalanceEntry(**entry) for entry in data]
                balance_tracker._save_entries()
                st.success("History imported!")
            except Exception as e:
                st.error(f"Error importing history: {e}")

async def background_balance_check(balance_tracker: BalanceTracker):
    """Periodically check balance in background"""
    while True:
        if balance_tracker.secure_storage.load_credentials():
            if balance := await balance_tracker.fetch_console_balance():
                # Only add entry if balance changed
                if (not balance_tracker.entries or 
                    balance != balance_tracker.entries[-1].amount):
                    balance_tracker.add_entry(
                        balance,
                        source="auto",
                        note="Console auto-update"
                    )
        await asyncio.sleep(3600) # Check hourly

def render_message_with_balance(
    message: dict,
    balance_tracker: BalanceTracker,
    show_timestamp: bool = True,
    show_balance: bool = True
):
    """Render a chat message with optional timestamp and balance columns"""
    cols = []
    # Add timestamp column if enabled
    if show_timestamp:
        cols.append(st.column(2))
    # Add balance column if enabled
    if show_balance:
        cols.append(st.column(1))
    # Message column takes remaining space
    cols.append(st.column(12 - len(cols) * 3))

    # Fill columns
    col_index = 0
    if show_timestamp:
        cols[col_index].text(datetime.now().strftime(
            balance_tracker.display_config.timestamp_format
        ))
        col_index += 1

    if show_balance:
        if balance_tracker.entries:
            cols[col_index].text(
                f"${balance_tracker.entries[-1].amount:.2f}"
            )
        else:
            cols[col_index].text("-")
        col_index += 1

    # Render actual message content in last column
    with cols[-1]:
        # Handle message rendering based on type
        if isinstance(message, dict):
            if "content" in message:
                if isinstance(message["content"], str):
                    st.markdown(message["content"])
                elif isinstance(message["content"], list):
                    for block in message["content"]:
                        if isinstance(block, dict):
                            if block["type"] == "text":
                                st.markdown(block["text"])
                            elif block["type"] == "tool_use":
                                st.code(
                                    f"Tool Use: {block['name']}\n"
                                    f"Input: {block['input']}"
                                )
            elif "output" in message:
                st.code(message["output"])
            elif "error" in message:
                st.error(message["error"])
        else:
            st.markdown(str(message))

def health_check() -> dict:
    """Return health check status for monitoring"""
    return {
        "status": "healthy",
        "version": "0.1.0",
        "timestamp": datetime.now().isoformat(),
        "components": {
            "storage": "ok",
            "ui": "ok",
            "console_integration": "ok"
        }
    }