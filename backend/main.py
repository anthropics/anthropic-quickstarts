"""Entry point for the Computer Use Agent Service backend."""

from fastapi import FastAPI

app = FastAPI(title="Computer Use Agent Service", version="0.1.0")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
