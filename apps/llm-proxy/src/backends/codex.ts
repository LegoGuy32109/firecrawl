import { spawn } from "child_process";
import type { LLMBackend, Message } from "./index";

const TIMEOUT_MS = parseInt(process.env.PROXY_TIMEOUT_MS ?? "30000", 10);

function serializeMessages(messages: Message[]): string {
  return messages
    .map(m => {
      if (m.role === "system") return `[System]\n${m.content}`;
      if (m.role === "user") return `[Human]\n${m.content}`;
      return `[Assistant]\n${m.content}`;
    })
    .join("\n\n");
}

function extractTextFromJsonl(lines: string[]): string | null {
  // Codex --json emits JSONL events. The assistant response is in:
  //   {"type":"item.completed","item":{"type":"agent_message","text":"..."}}
  // Collect all agent_message texts in order (last wins for multi-part).
  let found: string | null = null;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const obj = JSON.parse(trimmed);
      if (
        obj.type === "item.completed" &&
        obj.item?.type === "agent_message" &&
        typeof obj.item?.text === "string" &&
        obj.item.text.trim()
      ) {
        found = obj.item.text.trim();
      }
    } catch {
      // not JSON — skip
    }
  }
  return found;
}

function isAuthError(output: string): boolean {
  return (
    output.includes("401 Unauthorized") ||
    output.includes("Missing bearer or basic authentication") ||
    output.includes("Not logged in")
  );
}

export function createCodexBackend(): LLMBackend {
  return {
    async complete(messages: Message[]): Promise<string> {
      const prompt = serializeMessages(messages);

      return new Promise<string>((resolve, reject) => {
        const args = [
          "exec",
          "--json",
          "--skip-git-repo-check",
          "--ephemeral",
          "--ignore-rules",
          "--ignore-user-config",
          "-c",
          'model="gpt-5.5"',
          "-c",
          'model_reasoning_effort="low"',
          "--",
          prompt,
        ];

        const child = spawn("codex", args, { stdio: ["ignore", "pipe", "pipe"] });

        let stdout = "";
        let stderr = "";

        child.stdout.on("data", (chunk: Buffer) => {
          stdout += chunk.toString();
        });
        child.stderr.on("data", (chunk: Buffer) => {
          stderr += chunk.toString();
        });

        const timer = setTimeout(() => {
          child.kill();
          const err = new Error(`Codex timed out after ${TIMEOUT_MS}ms`);
          (err as any).code = "TIMEOUT";
          reject(err);
        }, TIMEOUT_MS);

        child.on("close", () => {
          clearTimeout(timer);

          const combined = stdout + stderr;

          if (isAuthError(combined)) {
            const err = new Error("Codex is not authenticated");
            (err as any).code = "CODEX_NOT_AUTHENTICATED";
            return reject(err);
          }

          const lines = stdout.split("\n");
          const extracted = extractTextFromJsonl(lines);

          if (extracted !== null) {
            return resolve(extracted);
          }

          // Fallback: raw stdout trimmed
          const raw = stdout.trim();
          if (raw) return resolve(raw);

          // Last resort: stderr
          const errMsg = stderr.trim() || "Empty response from codex";
          return reject(new Error(errMsg));
        });

        child.on("error", (err: NodeJS.ErrnoException) => {
          clearTimeout(timer);
          if (err.code === "ENOENT") {
            const authErr = new Error(
              "codex binary not found (ENOENT). Install codex or check PATH.",
            );
            (authErr as any).code = "CODEX_NOT_AUTHENTICATED";
            return reject(authErr);
          }
          reject(err);
        });
      });
    },
  };
}
