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

function isAuthError(output: string): boolean {
  return (
    output.includes("not logged in") ||
    output.includes("authentication") ||
    output.includes("Login required") ||
    output.includes("ENOENT")
  );
}

export function createClaudeBackend(): LLMBackend {
  return {
    async complete(messages: Message[]): Promise<string> {
      const prompt = serializeMessages(messages);

      return new Promise<string>((resolve, reject) => {
        const child = spawn(
          "claude",
          ["--output-format", "json", "--prompt", prompt],
          { stdio: ["ignore", "pipe", "pipe"] },
        );

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
          const err = new Error(`Claude timed out after ${TIMEOUT_MS}ms`);
          (err as any).code = "TIMEOUT";
          reject(err);
        }, TIMEOUT_MS);

        child.on("close", () => {
          clearTimeout(timer);

          const combined = stdout + stderr;

          if (isAuthError(combined)) {
            const err = new Error("Claude is not authenticated");
            (err as any).code = "CODEX_NOT_AUTHENTICATED";
            return reject(err);
          }

          // Try JSON parse — look for result or content field
          try {
            const parsed = JSON.parse(stdout.trim());
            const text =
              parsed.result ??
              parsed.content ??
              (Array.isArray(parsed.content)
                ? parsed.content
                    .filter((c: any) => c.type === "text")
                    .map((c: any) => c.text)
                    .join("")
                : undefined);
            if (typeof text === "string" && text.trim()) {
              return resolve(text.trim());
            }
          } catch {
            // not JSON, fall through
          }

          // Try JSONL
          for (const line of stdout.split("\n").reverse()) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
              const obj = JSON.parse(trimmed);
              const text = obj.result ?? obj.content ?? obj.text;
              if (typeof text === "string" && text.trim()) {
                return resolve(text.trim());
              }
            } catch {
              // skip
            }
          }

          const raw = stdout.trim();
          if (raw) return resolve(raw);

          return reject(new Error(stderr.trim() || "Empty response from claude"));
        });

        child.on("error", (err: NodeJS.ErrnoException) => {
          clearTimeout(timer);
          if (err.code === "ENOENT") {
            const authErr = new Error(
              "claude binary not found (ENOENT). Install claude CLI or check PATH.",
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
