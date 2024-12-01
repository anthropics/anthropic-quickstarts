from typing import Optional, Type

from langchain.callbacks.manager import (
    AsyncCallbackManagerForToolRun,
    CallbackManagerForToolRun,
)
from langchain_core.tools import BaseTool
from pydantic import BaseModel


class LookupWeatherInput(BaseModel):
    city: str


class LookupWeatherTool(BaseTool):
    name: str = "lookup_weather"
    description: str = "Tool that takes in a city name and returns the weather."
    args_schema: Type[BaseModel] = LookupWeatherInput
    return_direct: bool = True

    def _run(
        self, city: str, run_manager: Optional[CallbackManagerForToolRun] = None
    ) -> str:
        """Use the tool."""
        raise NotImplementedError("lookup_weather does not support sync")

    async def _arun(
        self, city: str, run_manager: Optional[AsyncCallbackManagerForToolRun] = None
    ) -> str:
        """Use the tool asynchronously."""
        return f"Very nice and hot in {city} at 87 degrees Fahrenheit."
