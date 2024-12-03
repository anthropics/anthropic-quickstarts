"""
Configuration and access control for the Telegram bot
"""

import os
import logging
from pathlib import Path
from dotenv import load_dotenv
from telegram import Update
from telegram.ext import Application

logger = logging.getLogger(__name__)

def load_environment():
    """Load environment variables from .env file"""
    env_path = Path(__file__).parent.parent / '.env'
    if env_path.exists():
        logger.info(f"Loading environment from {env_path}")
        load_dotenv(env_path)
    else:
        logger.warning(f"No .env file found at {env_path}")

def init_config():
    """Initialize configuration"""
    # Load environment variables
    load_environment()
    
    # Required settings
    telegram_token = os.getenv("TELEGRAM_BOT_TOKEN")
    if not telegram_token:
        raise ValueError("TELEGRAM_BOT_TOKEN environment variable not set")
        
    owner_id = int(os.getenv("TELEGRAM_OWNER_ID", "0"))
    if not owner_id:
        raise ValueError("TELEGRAM_OWNER_ID environment variable not set")
        
    # Optional settings with defaults
    allowed_users = set(map(int, os.getenv("TELEGRAM_ALLOWED_USERS", "").split(","))) if os.getenv("TELEGRAM_ALLOWED_USERS") else set()
    width = os.getenv("WIDTH", "1024")
    height = os.getenv("HEIGHT", "768")
    api_provider = os.getenv("API_PROVIDER", "anthropic")
    
    # Set screen dimensions
    os.environ["WIDTH"] = width
    os.environ["HEIGHT"] = height
    
    # Log configuration
    logger.info(f"Owner ID: {owner_id}")
    logger.info(f"Allowed users: {allowed_users if allowed_users else 'No restrictions'}")
    logger.info(f"Screen dimensions: {width}x{height}")
    logger.info(f"API Provider: {api_provider}")
    
    return {
        "telegram_token": telegram_token,
        "owner_id": owner_id,
        "allowed_users": allowed_users,
        "width": width,
        "height": height,
        "api_provider": api_provider
    }

class AccessControl:
    def __init__(self, owner_id: int, allowed_users: set[int]):
        self.owner_id = owner_id
        self.allowed_users = allowed_users
        
    async def check_access(self, update: Update) -> bool:
        """Check if user has access to the bot"""
        user_id = update.effective_user.id
        
        # Owner always has access
        if user_id == self.owner_id:
            return True
            
        # If no allowed users list - allow all
        if not self.allowed_users:
            return True
            
        # Check if user is in allowed list
        return user_id in self.allowed_users
        
    async def notify_owner(self, application: Application, message: str):
        """Send notification to the bot owner"""
        if self.owner_id:
            try:
                await application.bot.send_message(
                    chat_id=self.owner_id,
                    text=message
                )
                logger.info(f"Notification sent to owner: {message}")
            except Exception as e:
                logger.error(f"Failed to notify owner: {str(e)}", exc_info=True)
                
    async def handle_unauthorized_access(self, update: Update, context: Application):
        """Handle unauthorized access attempt"""
        user = update.effective_user
        chat_id = update.effective_chat.id
        logger.warning(f"Unauthorized access attempt from user {user.id} ({user.username}) in chat {chat_id}")
        
        # Notify owner
        await self.notify_owner(
            context.application,
            f"⚠️ Unauthorized access attempt!\nUser: {user.id} (@{user.username})\nChat: {chat_id}"
        )
        
        # Send message to user
        await context.bot.send_message(
            chat_id=chat_id,
            text="Sorry, you don't have permission to use this bot."
        ) 