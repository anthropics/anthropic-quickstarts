# Chat SDK × Claude Managed Agents

A research analyst in a browser chat window. Vercel's [Chat SDK](https://chat-sdk.dev/) owns the chat surface. One persistent [Managed Agents](https://platform.claude.com/docs/en/managed-agents/overview) session per conversation owns the research, streaming its reply token by token while a live feed shows the tool calls it makes. Each turn's tool calls stay in the transcript as a collapsible trace.

The Chat SDK is a universal chat layer: one type-safe handler, 15+ adapters, from Slack and Teams to Discord and WhatsApp. This demo uses its web adapter, so there is no chat platform to register with: no Slack or WhatsApp app, no webhook to verify, no tunnel, and the only credential is Anthropic auth. Managed Agents is the agent behind it, all server-side: the tool loop, the sandboxed web research, session state, and optional memory stores.

The server stores nothing: the `useChat` conversation ID is a Managed Agents session ID. The sidebar is the sessions API. Transcripts replay from the session's event log. Compaction and prompt caching happen inside the session.

Swapping a few lines in `src/bot.ts` moves the analyst to another surface: set up the platform's app following the [adapter docs](https://chat-sdk.dev/adapters), then see the porting notes (`skill.md`, "Two held streams, no webhooks"). That port is already done for Slack as a deployable template ("The same analyst in Slack", below). Design notes live in [`CLAUDE.md`](./CLAUDE.md) and [`skill.md`](./skill.md).

## Quickstart

Needs Node 22.9 or later and Anthropic auth (an API key, or `ant auth login` once).

```bash
cd managed-agents/chat-sdk
claude "walk me through setting up the Chat SDK and Claude Managed Agents"
```

Claude reads [`skill.md`](./skill.md) and drives the whole setup. Or run the steps yourself:

```bash
npm install
cp .env.example .env      # add ANTHROPIC_API_KEY, or skip it after `ant auth login`
npm run setup             # one-time: creates the agent + environment; paste the printed IDs into .env
npm run dev               # open http://localhost:3000 and ask for a brief on any topic
```

Token previews (`event_deltas`) are gated per organization while the 2026-07-01 Managed Agents update rolls out. Without the gate, everything still works and replies arrive whole instead of streaming.

## Configuration

The npm scripts read every setting from `.env` (via `--env-file-if-exists`):

| Variable | Required | What it does |
|---|---|---|
| `ANTHROPIC_API_KEY` | no | API key from [platform.claude.com](https://platform.claude.com/). Skip it after `ant auth login`: the SDK discovers CLI credentials |
| `CLAUDE_AGENT_ID` | yes | The analyst agent, printed by `npm run setup` |
| `CLAUDE_ENVIRONMENT_ID` | yes | The agent's sandbox environment, printed by `npm run setup` |
| `PORT` | no | Where the server listens (default `3000`). The chat UI is served from the same port |
| `HOST` | no | Bind address (default `127.0.0.1`). Set `0.0.0.0` only after replacing the demo `getUser` |
| `QUICKSTART_MODEL` | no | Overrides the agent's model, applied by `npm run setup` and `npm run update-agent` |

| Command | What it does |
|---|---|
| `npm run setup` | One-time provisioning: creates the agent and its environment, prints their IDs |
| `npm run update-agent` | Pushes an edited `setup/agent-config.ts` onto the existing agent as a new version |
| `npm run dev` | Runs the server, restarting on change. Edits to `web/` apply on browser reload |
| `npm start` | Runs the server once, no watcher |

The agent's entire identity (name, model, and system prompt) lives in `setup/agent-config.ts`. After editing it, run `npm run update-agent`: re-running `npm run setup` would create a duplicate agent.

## Deployment

- The demo `getUser` in `src/bot.ts` trusts every caller, which is why the default bind is loopback. Replace it with your real session lookup before setting `HOST`, and keep platform-level access protection on any deploy that ships before it. See "getUser is the security boundary" in `skill.md`.
- `npm start` with `HOST=0.0.0.0`. One long-lived process, streams held as long as a turn needs.
- The `/api` routes are one platform-neutral [Hono](https://hono.dev/) app (`src/app.ts`), so this runs anywhere that can host a Hono app: mount `deployedApi()` and serve the page statically. The binding constraint is duration rather than runtime, since `/api/chat` stays open for the whole turn and serverless caps are often seconds. The [Vercel Services guide](https://vercel.com/kb/guide/claude-managed-agents-vercel-services) works that through end to end: the page and the API as two [services](https://vercel.com/docs/services) in one project, `vercel.json` rewrites for `/api/*`, the function max duration a held response needs, and the `server.ts` and Vite config this repo does not ship.

## The same analyst in Slack

[`vercel-labs/cma-chat-sdk`](https://github.com/vercel-labs/cma-chat-sdk) is this analyst on Slack.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.fyi/cma-and-chat-sdk-template)

The deploy flow helps you create a Slack app and Redis store, then asks for `ANTHROPIC_API_KEY`, `CLAUDE_AGENT_ID`, and `CLAUDE_ENVIRONMENT_ID`. Get them from the [Claude Console](https://platform.claude.com/) or run the template's setup script for the last two.

Clone the repository you created from the template, then ask Claude to help you customize it:

```bash
git clone https://github.com/<your-account>/claude-research-analyst
cd claude-research-analyst
claude "retune the analyst's model and system prompt, then publish the new version"
```

## Files

| | |
|---|---|
| `setup/agent-config.ts` | Model + system prompt: the agent's entire behavior |
| `setup/create-agent.ts` | One-time provisioning: the analyst agent and its environment |
| `setup/update-agent.ts` | Pushes the edited config onto the existing agent as a new version |
| `src/app.ts` | The platform-neutral API core: `/api/chat`, `/api/sessions`, `/api/history`, `/api/activity` |
| `src/main.ts` | The local Node host: the chat page plus the API core, served by one process |
| `src/bot.ts` | Chat SDK instance, web adapter, `getUser` (the auth boundary), message handler |
| `src/managed-agents.ts` | The bridge: the turn loop, token previews, the session ownership check |
| `src/sessions.ts` | The sidebar's data source: list, create, and replay sessions |
| `src/card.tsx` | The "brief ready" JSX card and its web fallback |
| `src/brief.ts` | Shared card and trace formats: what the server writes and the page renders |
| `src/activity.ts` | In-process fan-out of turn activity to live subscribers |
| `web/` | The chat page: React + `useChat`, the sidebar, the activity feed, bundled by esbuild |
| `skill.md` | Setup walkthrough, gotchas, debugging |

## Resources

- [Build Claude Managed Agents with Vercel Services guide](https://vercel.com/kb/guide/claude-managed-agents-vercel-services)
- [Build Claude Managed Agents with Chat SDK guide](https://vercel.com/kb/guide/claude-managed-agents-chat-sdk)
- [Claude Managed Agents documentation](https://platform.claude.com/docs/en/managed-agents/overview)
- [Chat SDK documentation](https://chat-sdk.dev/docs)
