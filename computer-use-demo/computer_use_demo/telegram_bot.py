"""
Telegram bot implementation for computer use demo
"""

import os
import logging
import asyncio
from datetime import datetime
from telegram import Update
from telegram.ext import (
    Application,
    CommandHandler,
    ContextTypes,
    MessageHandler,
    filters,
)

from computer_use_demo.config import init_config, AccessControl
from computer_use_demo.loop import (
    PROVIDER_TO_DEFAULT_MODEL_NAME,
    APIProvider,
    sampling_loop,
)
from computer_use_demo.tools import ToolResult
from anthropic.types.beta import (
    BetaContentBlockParam,
    BetaTextBlockParam,
    BetaToolResultBlockParam,
)

# Configure logging
logging.basicConfig(
    format='%(asctime)s - %(name)s - %(levelname)s - [%(filename)s:%(lineno)d] - %(message)s',
    level=logging.INFO
)
logger = logging.getLogger(__name__)

# Initialize configuration
config = init_config()
access_control = AccessControl(config["owner_id"], config["allowed_users"])

class TelegramInterface:
    def __init__(self):
        logger.info("Initializing TelegramInterface")
        self.api_key = os.getenv("ANTHROPIC_API_KEY", "")
        self.provider = APIProvider.ANTHROPIC
        self.model = PROVIDER_TO_DEFAULT_MODEL_NAME[self.provider]
        self.only_n_most_recent_images = 3
        self.custom_system_prompt = """
        You are a helpful AI assistant that can control a computer. 
        Please communicate in the same language that the user uses.
        Always respond in the same language as the user's message.
        """
        logger.info(f"Using model: {self.model}")
        logger.info(f"Using provider: {self.provider}")
        
        # Initialize message history and other storage
        self.messages = []
        self.responses = {}
        self.tools = {}
        
        # Initialize counters
        self.message_count = 0
        self.error_count = 0

    async def _api_response_callback(self, request, response, error):
        """Handle API response"""
        request_id = datetime.now().isoformat()
        logger.info(f"API Request ID: {request_id}")
        logger.info(f"API Request URL: {request.url}")
        logger.info(f"API Request Method: {request.method}")
        
        if error:
            logger.error(f"API error: {error}", exc_info=True)
            self.error_count += 1
        else:
            logger.info(f"API Response Status: {getattr(response, 'status_code', 'N/A')}")
            
        self.responses[request_id] = (request, response)

    async def _send_message(self, update: Update, context: ContextTypes.DEFAULT_TYPE, message):
        """Send message to Telegram"""
        try:
            chat_id = update.effective_chat.id
            if isinstance(message, dict):
                if message["type"] == "text":
                    content = message['text']
                    logger.info(f"Sending text message to {chat_id}: {content[:100]}...")
                    await context.bot.send_message(
                        chat_id=chat_id,
                        text=content
                    )
                    logger.debug(f"Successfully sent text message to {chat_id}")
                    
                elif message["type"] == "tool_use":
                    tool_name = message["name"]
                    tool_input = message["input"]
                    logger.info(f"Sending tool use message to {chat_id}. Tool: {tool_name}")
                    logger.debug(f"Tool input: {tool_input}")
                    await context.bot.send_message(
                        chat_id=chat_id,
                        text=f'Tool Use: {tool_name}\nInput: {tool_input}'
                    )
            else:
                logger.info(f"Sending raw message to {chat_id}: {str(message)[:100]}...")
                await context.bot.send_message(
                    chat_id=chat_id,
                    text=str(message)
                )
        except Exception as e:
            self.error_count += 1
            logger.error(f"Error in _send_message: {str(e)}", exc_info=True)
            raise

    async def _handle_tool_output(self, update: Update, context: ContextTypes.DEFAULT_TYPE, tool_output: ToolResult, tool_id: str):
        """Handle tool output"""
        chat_id = update.effective_chat.id
        logger.info(f"Handling tool output for tool_id: {tool_id} in chat {chat_id}")
        
        self.tools[tool_id] = tool_output
        
        try:
            if hasattr(tool_output, 'base64_image') and tool_output.base64_image:
                logger.info(f"Processing screenshot for chat {chat_id}")
                try:
                    import io
                    import base64
                    from PIL import Image
                    
                    # Convert base64 to image
                    image_data = base64.b64decode(tool_output.base64_image)
                    image = Image.open(io.BytesIO(image_data))
                    
                    # Log image details
                    logger.info(f"Image size: {image.size}, format: {image.format}")
                    
                    # Save to bytes
                    img_byte_arr = io.BytesIO()
                    image.save(img_byte_arr, format=image.format if image.format else 'PNG')
                    img_byte_arr = img_byte_arr.getvalue()
                    
                    # Send to Telegram
                    logger.info(f"Sending screenshot to chat {chat_id}")
                    await context.bot.send_photo(
                        chat_id=chat_id,
                        photo=img_byte_arr
                    )
                    logger.info("Screenshot sent successfully")
                except Exception as img_error:
                    logger.error(f"Error processing image: {str(img_error)}", exc_info=True)
                    raise
            
            if tool_output.output:
                logger.info(f"Tool output for {chat_id}: {tool_output.output[:100]}...")
                await context.bot.send_message(
                    chat_id=chat_id,
                    text=tool_output.output
                )
                
            if tool_output.error:
                self.error_count += 1
                logger.error(f"Tool error for {chat_id}: {tool_output.error}")
                await context.bot.send_message(
                    chat_id=chat_id,
                    text=f"Error: {tool_output.error}"
                )
                
            return tool_output
            
        except Exception as e:
            self.error_count += 1
            logger.error(f"Error handling tool output: {str(e)}", exc_info=True)
            raise

    async def handle_message(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Handle incoming messages"""
        try:
            if not await access_control.check_access(update):
                await access_control.handle_unauthorized_access(update, context)
                return

            if not update.message or not update.message.text:
                logger.warning("Received empty message")
                return

            self.message_count += 1
            user = update.effective_user
            chat_id = update.effective_chat.id
            
            logger.info(
                f"Message #{self.message_count} from user {user.id} ({user.username}) "
                f"in chat {chat_id}: {update.message.text[:100]}..."
            )

            # Add user message to history
            self.messages.append({
                "role": "user",
                "content": [
                    BetaTextBlockParam(type="text", text=update.message.text)
                ]
            })

            await context.bot.send_chat_action(
                chat_id=chat_id, 
                action="typing"
            )

            # Create wrappers for async callbacks
            async def output_callback_wrapper(msg):
                await self._send_message(update, context, msg)
                
            async def tool_output_callback_wrapper(output, tool_id):
                await self._handle_tool_output(update, context, output, tool_id)
                
            async def api_response_callback_wrapper(request, response, error):
                await self._api_response_callback(request, response, error)
            
            # Create synchronous versions of callbacks
            def sync_output_callback(msg):
                asyncio.create_task(output_callback_wrapper(msg))
                
            def sync_tool_output_callback(output, tool_id):
                asyncio.create_task(tool_output_callback_wrapper(output, tool_id))
                
            def sync_api_response_callback(request, response, error):
                asyncio.create_task(api_response_callback_wrapper(request, response, error))

            self.messages = await sampling_loop(
                system_prompt_suffix=self.custom_system_prompt,
                model=self.model,
                provider=self.provider,
                messages=self.messages,
                output_callback=sync_output_callback,
                tool_output_callback=sync_tool_output_callback,
                api_response_callback=sync_api_response_callback,
                api_key=self.api_key,
                only_n_most_recent_images=self.only_n_most_recent_images,
            )

        except Exception as e:
            self.error_count += 1
            logger.error(f"Error in handle_message: {str(e)}", exc_info=True)
            await context.bot.send_message(
                chat_id=update.effective_chat.id,
                text=f"Error: {str(e)}"
            )

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Send welcome message when /start command is issued"""
    try:
        if not await access_control.check_access(update):
            await access_control.handle_unauthorized_access(update, context)
            return
            
        user = update.effective_user
        chat_id = update.effective_chat.id
        logger.info(f"New user started the bot: {user.id} ({user.username}) in chat {chat_id}")
        
        welcome_message = """
        🤖 Hello! I'm an AI assistant that can help you control the computer.
        
        You can write to me in any language, and I'll respond in the same language.
        
        How can I help you?
        """
        
        await context.bot.send_message(
            chat_id=chat_id,
            text=welcome_message
        )
        logger.info(f"Welcome message sent to chat {chat_id}")
    except Exception as e:
        logger.error(f"Error in start command: {str(e)}", exc_info=True)
        raise

async def clear_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Clear conversation context"""
    try:
        if not await access_control.check_access(update):
            await access_control.handle_unauthorized_access(update, context)
            return
            
        chat_id = update.effective_chat.id
        user = update.effective_user
        logger.info(f"Clearing context for user {user.id} ({user.username}) in chat {chat_id}")
        
        # Get interface from bot context
        interface = context.bot_data.get('interface')
        if interface:
            interface.messages = []  # Clear message history
            await context.bot.send_message(
                chat_id=chat_id,
                text="Context has been cleared."
            )
        else:
            logger.error("Interface not found in bot_data")
            await context.bot.send_message(
                chat_id=chat_id,
                text="❌ Error: Could not clear context."
            )
            
    except Exception as e:
        logger.error(f"Error in clear command: {str(e)}", exc_info=True)
        await context.bot.send_message(
            chat_id=update.effective_chat.id,
            text="❌ An error occurred while clearing context."
        )

async def error_handler(update: object, context: ContextTypes.DEFAULT_TYPE):
    """Handle errors in the telegram-python-bot"""
    logger.error("Exception while handling an update:", exc_info=context.error)
    
    try:
        if update and isinstance(update, Update) and update.effective_chat:
            await context.bot.send_message(
                chat_id=update.effective_chat.id,
                text="Sorry, an error occurred while processing your message."
            )
    except Exception as e:
        logger.error(f"Failed to send error message: {str(e)}", exc_info=True)

def main():
    """Start the Telegram bot"""
    try:
        logger.info("Starting Telegram bot")
        
        # Create interface instance
        interface = TelegramInterface()

        # Create application
        logger.info("Creating Telegram application")
        application = Application.builder().token(config["telegram_token"]).build()
        
        # Store interface in bot_data for access from commands
        application.bot_data['interface'] = interface

        # Add handlers
        logger.info("Adding command handlers")
        application.add_handler(CommandHandler("start", start))
        application.add_handler(CommandHandler("clear", clear_command))  # Add new handler
        application.add_handler(
            MessageHandler(filters.TEXT & ~filters.COMMAND, interface.handle_message)
        )
        application.add_error_handler(error_handler)

        # Send startup notification
        async def post_init(app: Application):
            await access_control.notify_owner(
                app,
                "🚀 Bot has been started!\n\n"
                f"Model: {interface.model}\n"
                f"Provider: {interface.provider}\n"
                f"Screen: {os.getenv('WIDTH')}x{os.getenv('HEIGHT')}"
            )

        # Start the bot
        logger.info("Starting bot polling")
        application.post_init = post_init
        application.run_polling(allowed_updates=Update.ALL_TYPES)
        logger.info("Bot stopped")
        
    except KeyboardInterrupt:
        logger.info("Bot stopped by user")
    except Exception as e:
        logger.error(f"Fatal error in main: {str(e)}", exc_info=True)
        raise

if __name__ == "__main__":
    main()