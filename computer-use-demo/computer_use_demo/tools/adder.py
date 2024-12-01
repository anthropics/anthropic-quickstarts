from langchain.tools import tool


@tool
def add_two_numbers(a: int, b: int) -> int:
    """Tool that adds two numbers."""

    return a + b
