export interface LLMBackend {
  complete(messages: Message[]): Promise<string>;
}

export type Message = {
  role: "system" | "user" | "assistant";
  content: string;
};

export function createBackend(): LLMBackend {
  const backend = process.env.PROXY_BACKEND ?? "codex";
  if (backend === "claude") {
    const { createClaudeBackend } = require("./claude");
    return createClaudeBackend();
  }
  const { createCodexBackend } = require("./codex");
  return createCodexBackend();
}
