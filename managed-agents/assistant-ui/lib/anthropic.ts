import Anthropic from "@anthropic-ai/sdk";

// The one Anthropic client for the whole server. `new Anthropic()` reads
// ANTHROPIC_API_KEY, and falls back to `ant auth login` CLI credentials when
// the variable is unset, so .env can carry no key at all.
export const client = new Anthropic();

// .env values that still hold their placeholder ("agent_...") count as unset,
// so a half-configured .env fails loudly instead of 404ing on a fake ID.
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.endsWith("...")) {
    throw new Error(`${name} is not set. Run \`npm run setup\` and paste the printed IDs into .env.`);
  }
  return value;
}

export const agentId = () => requireEnv("CLAUDE_AGENT_ID");
export const environmentId = () => requireEnv("CLAUDE_ENVIRONMENT_ID");

// Sessions this quickstart creates are tagged; the app never lists or
// touches anything else, even though the API key can see the whole org.
export const SESSION_METADATA = { quickstart: "assistant-ui" } as const;

export { Anthropic };
