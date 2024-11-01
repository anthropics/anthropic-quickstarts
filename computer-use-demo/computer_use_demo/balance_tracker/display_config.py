"""Display configuration for the chat interface"""

from dataclasses import dataclass
from typing import Optional

@dataclass
class DisplayConfig:
    """Configuration for display settings"""
    timestamp_format: str = "%Y-%m-%d %H:%M:%S.%f"
    show_balance: bool = True
    show_timestamps: bool = True
    divider_position: int = 50 # Default 50% split