# Managed Agents quickstarts

Projects built on [Claude Managed Agents](https://platform.claude.com/docs/en/managed-agents/overview): agents Anthropic runs for you, with server-side sessions, sandboxed tools, and an event stream your app consumes. Each quickstart is a complete, runnable app that pairs Managed Agents with a real product surface.

## Quickstarts

- **[chat-sdk/](chat-sdk/)** puts a research analyst in a
  browser chat with Vercel's Chat SDK. Each conversation is one
  persistent session (the conversation ID is the session ID); the
  analyst researches with web search and streams the final brief
  token by token over the same held response (session `event_deltas`
  previews) while a live feed shows the tool calls. No third-party
  credentials, and the same handler moves to Slack, Teams, Discord,
  Telegram, or WhatsApp by swapping the adapter.

- **[copilot-kit-ag-ui/](copilot-kit-ag-ui/)** puts a personal
  finance assistant in a CopilotKit chat over the AG-UI protocol.
  The upstream [`@ag-ui/claude-managed-agents`](https://www.npmjs.com/package/@ag-ui/claude-managed-agents)
  adapter maps each chat thread to a managed session and streams
  replies token by token; when the agent wants to show numbers it
  calls custom tools that render as interactive charts (payoff
  timelines, growth projections, budgets) inline in the
  conversation, with sliders that recompute client-side.
