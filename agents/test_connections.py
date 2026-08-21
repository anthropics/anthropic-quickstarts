"""Tests for MCP connection setup."""

import unittest
from unittest.mock import patch

from .agent import Agent
from .utils.connections import (
    MCPConnectionStreamableHTTP,
    create_mcp_connection,
)


class MCPConnectionTests(unittest.IsolatedAsyncioTestCase):
    def test_agent_imports_with_mcp_tools(self):
        self.assertEqual(Agent.__name__, "Agent")

    def test_creates_streamable_http_connection(self):
        connection = create_mcp_connection(
            {
                "type": "streamable_http",
                "url": "https://docs.xquik.com/mcp",
            }
        )

        self.assertIsInstance(connection, MCPConnectionStreamableHTTP)

    def test_streamable_http_requires_url(self):
        with self.assertRaisesRegex(
            ValueError, "URL is required for Streamable HTTP connections"
        ):
            create_mcp_connection({"type": "streamable_http"})

    async def test_uses_streamable_http_client(self):
        context = object()

        with patch(
            "agents.utils.connections.streamable_http_client",
            return_value=context,
        ) as client:
            connection = MCPConnectionStreamableHTTP("https://docs.xquik.com/mcp")

            self.assertIs(await connection._create_rw_context(), context)
            client.assert_called_once_with(url="https://docs.xquik.com/mcp")


if __name__ == "__main__":
    unittest.main()
