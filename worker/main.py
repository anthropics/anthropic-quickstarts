"""Entry point for the agent worker."""

from worker.api import create_app
from worker.config import WorkerConfig
from worker.runner import AgentWorker

app = create_app(
    lambda: AgentWorker(WorkerConfig.from_env()),
    title="Computer Use Agent Worker",
)
