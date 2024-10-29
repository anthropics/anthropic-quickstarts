from fastapi import FastAPI, BackgroundTasks, HTTPException
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware  # Changed from fastapi.middleware.base
from starlette.requests import Request  # Add this for type hints
from starlette.responses import Response  # Add this for type hints
from pydantic import BaseModel
import asyncio
import uuid
import logging
import json
from typing import Dict, Optional
from datetime import datetime
import os
import sys
from contextlib import asynccontextmanager
import time

# Global task processing lock
task_lock = asyncio.Lock()
current_task_id: Optional[str] = None

async def acquire_task_lock(task_id: str) -> bool:
    """Try to acquire the task processing lock"""
    global current_task_id
    if task_lock.locked():
        logger.warning(f"Task {task_id} rejected: Another task {current_task_id} is currently being processed")
        return False

    async with task_lock:
        if current_task_id is not None:
            logger.warning(f"Task {task_id} rejected: Task {current_task_id} is currently being processed")
            return False
        current_task_id = task_id
        logger.info(f"Task {task_id} acquired processing lock")
        return True

async def release_task_lock(task_id: str):
    """Release the task processing lock"""
    global current_task_id
    if current_task_id == task_id:
        current_task_id = None
        logger.info(f"Task {task_id} released processing lock")
    else:
        logger.warning(f"Task {task_id} attempted to release lock owned by {current_task_id}")

# Add a lock for cleanup operations
cleanup_lock = asyncio.Lock()
is_cleaning = False

@asynccontextmanager
async def cleanup_guard():
    """Context manager to track cleanup status"""
    global is_cleaning
    async with cleanup_lock:
        is_cleaning = True
        try:
            yield
        finally:
            is_cleaning = False

async def check_instance_ready():
    """Check if this instance is ready to handle a new request"""
    if is_cleaning:
        # If we're cleaning, respond with a 503 so Cloud Run will try a different instance
        raise HTTPException(
            status_code=503,
            detail="Instance is currently being reset. Please retry the request."
        )

async def reset_desktop_environment():
    """Reset the desktop environment to a clean state"""
    start_time = time.time()
    async with cleanup_guard():
        try:
            logger.info("Resetting desktop environment...")

            async with asyncio.timeout(30):  # 30-second timeout for cleanup
                # First, kill user applications but NOT core services
                cleanup_commands = [
                    # Kill user applications
                    "pkill firefox-esr || true",
                    "pkill -f 'libreoffice' || true",
                    "pkill -f 'gedit' || true",

                    # Clean temporary files and caches
                    "rm -rf /tmp/tmp* || true",
                    "rm -rf /home/computeruse/.cache/mozilla/firefox/*.default-esr/* || true",
                    "rm -rf /home/computeruse/Downloads/* || true",

                    # Reset X server settings without killing it
                    "DISPLAY=:1 xset r on || true",  # Reset keyboard repeat
                    "DISPLAY=:1 xset s off || true",  # Disable screensaver
                    "DISPLAY=:1 xset -dpms || true",  # Disable DPMS (power management)

                    # Reset window manager without killing it
                    "DISPLAY=:1 wmctrl -c :ACTIVE: || true"  # Close all windows
                ]

                for cmd in cleanup_commands:
                    process = await asyncio.create_subprocess_shell(
                        cmd,
                        stdout=asyncio.subprocess.PIPE,
                        stderr=asyncio.subprocess.PIPE
                    )
                    stdout, stderr = await process.communicate()
                    if stdout:
                        logger.debug(f"Cleanup command output: {stdout.decode()}")
                    if stderr:
                        logger.debug(f"Cleanup command error: {stderr.decode()}")

                logger.info("Desktop environment reset complete")

        except asyncio.TimeoutError:
            logger.error("Desktop environment reset timed out after 30 seconds")
            # Use a gentler force cleanup that doesn't touch core services
            force_cleanup_commands = [
                "pkill -9 firefox-esr || true",
                "pkill -9 -f 'libreoffice' || true",
                "pkill -9 -f 'gedit' || true"
            ]
            for cmd in force_cleanup_commands:
                try:
                    process = await asyncio.create_subprocess_shell(cmd)
                    await process.communicate()
                except Exception as e:
                    logger.error(f"Force cleanup command failed: {e}")

            raise  # Re-raise the TimeoutError

        except Exception as e:
            logger.error(f"Error resetting desktop environment: {str(e)}", exc_info=True)
            raise

        finally:
            duration = time.time() - start_time
            logger.info(f"Desktop environment reset completed in {duration:.2f} seconds")

from computer_use_demo.loop import (
    sampling_loop, 
    APIProvider, 
    PROVIDER_TO_DEFAULT_MODEL_NAME
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger("batch_api")

# Configure the maximum timeout (slightly less than Cloud Run's 3600s timeout)
MAX_TIMEOUT_SECONDS = 3500  # 58.33 minutes

class TimeoutMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        if IS_CLOUD_RUN:
            try:
                # Use asyncio.wait_for to implement the timeout
                return await asyncio.wait_for(
                    call_next(request),
                    timeout=MAX_TIMEOUT_SECONDS
                )
            except asyncio.TimeoutError:
                logger.error(f"Request timed out after {MAX_TIMEOUT_SECONDS} seconds")
                raise HTTPException(
                    status_code=504,
                    detail=f"Request timed out after {MAX_TIMEOUT_SECONDS} seconds"
                )
        return await call_next(request)

# Add the middleware to the app
app = FastAPI()
app.add_middleware(TimeoutMiddleware)

# Add startup event to log timeout configuration
@app.on_event("startup")
async def startup_event():
    logger.info("🚀 Batch API server starting up")
    logger.info(f"Available models by provider: {json.dumps(PROVIDER_TO_DEFAULT_MODEL_NAME, indent=2)}")
    if IS_CLOUD_RUN:
        logger.info(f"Running in Cloud Run environment with {MAX_TIMEOUT_SECONDS}s timeout")
    else:
        logger.info("Running in non-Cloud Run environment (no request timeout)")

@app.on_event("shutdown")
async def shutdown_event():
    logger.info("👋 Batch API server shutting down")

# Add environment detection
IS_CLOUD_RUN = os.getenv('K_SERVICE') is not None  # Cloud Run sets this automatically

class TaskRequest(BaseModel):
    prompt: str
    provider: APIProvider = APIProvider.VERTEX  # Default to VERTEX since we're in Vertex environment
    model: Optional[str] = None  # Make model optional
    system_prompt_suffix: str = ""

    def get_model(self) -> str:
        """Get the model name, using the default if none specified"""
        if self.model is None:
            return PROVIDER_TO_DEFAULT_MODEL_NAME[self.provider]
        return self.model

class TaskStatus(BaseModel):
    task_id: str
    status: str
    created_at: datetime
    completed_at: Optional[datetime] = None
    messages: list = []
    error: Optional[str] = None

# Store for tasks (only used in non-Cloud Run environment)
tasks: Dict[str, dict] = {}

async def run_task(task_id: str, prompt: str, provider: APIProvider, model: str, system_prompt_suffix: str):
    if task_id not in tasks:
        logger.error(f"Task {task_id} not found in tasks dictionary")
        raise ValueError(f"Task {task_id} not found")

    try:
        logger.info(f"Starting task {task_id}")
        logger.info(f"Task details: provider={provider}, model={model}")

        tasks[task_id]["status"] = "running"

        messages = [{
            "role": "user",
            "content": [{"type": "text", "text": prompt}]
        }]

        def output_callback(content):
            logger.debug(f"Task {task_id}: Received assistant output")
            tasks[task_id]["messages"].append({"role": "assistant", "content": content})

        def tool_output_callback(result, tool_id):
            logger.info(f"Task {task_id}: Tool {tool_id} executed")
            tasks[task_id]["messages"].append({
                "role": "tool",
                "tool_id": tool_id,
                "result": {
                    "output": result.output if hasattr(result, "output") else None,
                    "error": result.error if hasattr(result, "error") else None,
                    "base64_image": result.base64_image if hasattr(result, "base64_image") else None
                }
            })

        def api_response_callback(request, response, error):
            if error:
                logger.error(f"Task {task_id}: API error occurred: {str(error)}")
                tasks[task_id]["error"] = str(error)
            else:
                logger.debug(f"Task {task_id}: API request completed successfully")

        logger.info(f"Task {task_id}: Starting sampling loop")
        final_messages = await sampling_loop(
            model=model,
            provider=provider,
            system_prompt_suffix=system_prompt_suffix,
            messages=messages,
            output_callback=output_callback,
            tool_output_callback=tool_output_callback,
            api_response_callback=api_response_callback,
            api_key=None
        )

        tasks[task_id]["messages"] = final_messages
        tasks[task_id]["status"] = "completed"
        tasks[task_id]["completed_at"] = datetime.now()
        logger.info(f"Task {task_id}: Completed successfully")

    except Exception as e:
        logger.error(f"Task {task_id}: Failed with error: {str(e)}", exc_info=True)
        tasks[task_id]["status"] = "failed"
        tasks[task_id]["error"] = str(e)
        tasks[task_id]["completed_at"] = datetime.now()

@app.post("/tasks", response_model=TaskStatus)
async def create_task(task_req: TaskRequest, background_tasks: BackgroundTasks):
    # First, check if this instance is ready
    await check_instance_ready()

    task_id = str(uuid.uuid4())
    logger.info(f"Received new task request - assigned ID: {task_id}")
    logger.info(f"Task prompt: {task_req.prompt[:100]}..." if len(task_req.prompt) > 100 else f"Task prompt: {task_req.prompt}")

    # Try to acquire the task lock
    if not await acquire_task_lock(task_id):
        logger.info(f"Task {task_id} redirecting to another instance - current instance busy")
        # Return 503 with Retry-After header to signal Cloud Run to try another instance
        raise HTTPException(
            status_code=503,  # Service Unavailable
            detail="Instance is busy processing another task. Request will be redirected to another instance.",
            headers={"Retry-After": "0"}  # Retry immediately
        )

    task_data = {
        "task_id": task_id,
        "status": "pending",
        "created_at": datetime.now(),
        "messages": [],
        "error": None
    }

    tasks[task_id] = task_data

    if IS_CLOUD_RUN:
        logger.info(f"Running in Cloud Run environment - executing task synchronously")
        try:
            # Reset desktop environment before starting new task
            await reset_desktop_environment()

            await run_task(
                task_id,
                task_req.prompt,
                task_req.provider,
                task_req.get_model(),
                task_req.system_prompt_suffix
            )

            # Get the final state before cleanup
            result = TaskStatus(**tasks[task_id])

            # Clean up task data
            del tasks[task_id]

            # Start the cleanup process but don't wait for it
            # This ensures the HTTP response goes out before cleanup starts
            background_tasks.add_task(reset_desktop_environment)

            return result

        except Exception as e:
            if task_id in tasks:
                del tasks[task_id]
            # Start cleanup in background even after error
            background_tasks.add_task(reset_desktop_environment)
            raise e
        finally:
            # Always release the lock
            await release_task_lock(task_id)
    else:
        try:
            # In non-Cloud Run environment, we can run asynchronously
            logger.info(f"Running in non-Cloud Run environment - executing task asynchronously")
            background_tasks.add_task(
                run_task,
                task_id,
                task_req.prompt,
                task_req.provider,
                task_req.get_model(),
                task_req.system_prompt_suffix
            )
            # Add task to release lock after completion
            background_tasks.add_task(release_task_lock, task_id)
            return TaskStatus(**task_data)
        except Exception as e:
            await release_task_lock(task_id)
            raise e

@app.get("/tasks/{task_id}", response_model=TaskStatus)
async def get_task_status(task_id: str):
    if IS_CLOUD_RUN:
        # In Cloud Run, we don't support task status checks
        raise HTTPException(
            status_code=400,
            detail="Task status checking is not supported in Cloud Run environment. Tasks are processed synchronously."
        )

    logger.info(f"Status check for task: {task_id}")
    if task_id not in tasks:
        logger.warning(f"Task not found: {task_id}")
        raise HTTPException(status_code=404, detail="Task not found")
    logger.info(f"Task {task_id} status: {tasks[task_id]['status']}")
    return TaskStatus(**tasks[task_id])

@app.get("/tasks", response_model=list[TaskStatus])
async def list_tasks():
    if IS_CLOUD_RUN:
        # In Cloud Run, we don't support task listing
        raise HTTPException(
            status_code=400,
            detail="Task listing is not supported in Cloud Run environment. Tasks are processed synchronously."
        )

    logger.info(f"Listing all tasks - current count: {len(tasks)}")
    return [TaskStatus(**task) for task in tasks.values()]

@app.get("/health")
async def health_check():
    """Health check endpoint for Cloud Run"""
    return JSONResponse(
        status_code=200,
        content={
            "status": "healthy",
            "timestamp": datetime.now().isoformat()
        }
    )

# Add middleware for request logging
@app.middleware("http")
async def log_requests(request, call_next):
    logger.info(f"Incoming {request.method} request to {request.url.path}")
    response = await call_next(request)
    logger.info(f"Completed {request.method} request to {request.url.path} - Status: {response.status_code}")
    return response
